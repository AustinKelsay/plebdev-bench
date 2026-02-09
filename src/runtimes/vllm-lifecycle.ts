/**
 * Purpose: Managed vLLM (and optional OrbStack) lifecycle helpers for a single benchmark run.
 * Exports: startManagedVllm, stopManagedVllm, ensureOrbStackRunning
 *
 * This module is an imperative shell boundary: it starts/stops local services.
 *
 * Invariants:
 * - Only used when BenchConfig.managedVllm.enabled is true
 * - Throws on orchestration failures (considered crash/setup errors)
 */

import { execa } from "execa";
import { logger } from "../lib/logger.js";
import type { ManagedVllmConfig } from "../schemas/index.js";

/** Poll interval for readiness checks. */
const READY_POLL_MS = 2000;

/**
 * Ensures OrbStack is running (best-effort).
 *
 * @param orbctlPath - orbctl executable name/path
 * @throws Error when OrbStack cannot be started or docker remains unavailable.
 */
export async function ensureOrbStackRunning(orbctlPath: string): Promise<void> {
	const log = logger.child({ module: "vllm-lifecycle", orbctlPath });

	// Try docker first; if it works, no-op.
	try {
		await execa("docker", ["info"], { timeout: 10_000 });
		return;
	} catch {
		// continue
	}

	log.info("Docker not available; attempting to start OrbStack...");
	const start = await execa(orbctlPath, ["start"], { reject: false, timeout: 20_000 });
	if (start.exitCode !== 0) {
		throw new Error(
			`Failed to start OrbStack via "${orbctlPath} start" (exit ${start.exitCode}).`,
		);
	}

	// Wait for docker to come up.
	const startTime = Date.now();
	while (Date.now() - startTime < 60_000) {
		try {
			await execa("docker", ["info"], { timeout: 10_000 });
			return;
		} catch {
			await new Promise((r) => setTimeout(r, READY_POLL_MS));
		}
	}

	throw new Error("OrbStack start succeeded but docker did not become available within 60s.");
}

/**
 * Starts vLLM via docker compose and waits for OpenAI-compatible readiness.
 *
 * @param managed - Managed vLLM config (validated by schema)
 * @param vllmBaseUrl - vLLM base URL (e.g. http://localhost:8000)
 * @throws Error when compose up fails or readiness times out.
 */
export async function startManagedVllm(
	managed: ManagedVllmConfig,
	vllmBaseUrl: string,
): Promise<void> {
	const log = logger.child({ module: "vllm-lifecycle", vllmBaseUrl });

	if (managed.manageOrbStack) {
		await ensureOrbStackRunning(managed.orbctlPath);
	}

	log.info(
		{ composeFile: managed.composeFile, model: managed.model },
		"Starting vLLM via docker compose",
	);

	const up = await execa(
		"docker",
		["compose", "-f", managed.composeFile, "up", "-d", "--force-recreate"],
		{
			env: { ...process.env, VLLM_MODEL: managed.model },
			timeout: 10 * 60_000,
		},
	);
	if (up.exitCode !== 0) {
		throw new Error(`docker compose up failed with exit ${up.exitCode}`);
	}

	// Poll /v1/models until ready (or timeout).
	const deadline = Date.now() + managed.startupTimeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${vllmBaseUrl}/v1/models`, { method: "GET" });
			if (!res.ok) {
				await new Promise((r) => setTimeout(r, READY_POLL_MS));
				continue;
			}
			const json = (await res.json()) as { data?: Array<{ id?: string }> };
			const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
			if (ids.includes(managed.model)) {
				log.info({ models: ids }, "vLLM ready");
				return;
			}
			log.warn({ models: ids, expected: managed.model }, "vLLM responded but expected model not present yet");
		} catch (error) {
			log.debug({ err: error }, "vLLM readiness check failed");
		}
		await new Promise((r) => setTimeout(r, READY_POLL_MS));
	}

	throw new Error(
		`vLLM did not become ready within ${Math.round(managed.startupTimeoutMs / 1000)}s.`,
	);
}

/**
 * Stops vLLM via docker compose down and optionally stops OrbStack.
 *
 * @param managed - Managed vLLM config (validated by schema)
 * @throws Error when compose down fails.
 */
export async function stopManagedVllm(managed: ManagedVllmConfig): Promise<void> {
	const log = logger.child({ module: "vllm-lifecycle", composeFile: managed.composeFile });
	log.info("Stopping vLLM via docker compose down...");

	const down = await execa("docker", ["compose", "-f", managed.composeFile, "down"], {
		timeout: 5 * 60_000,
	});
	if (down.exitCode !== 0) {
		throw new Error(`docker compose down failed with exit ${down.exitCode}`);
	}

	if (managed.manageOrbStack) {
		log.info("Stopping OrbStack...");
		const stop = await execa(managed.orbctlPath, ["stop"], { reject: false, timeout: 20_000 });
		if (stop.exitCode !== 0) {
			throw new Error(
				`Failed to stop OrbStack via "${managed.orbctlPath} stop" (exit ${stop.exitCode}).`,
			);
		}
	}
}

