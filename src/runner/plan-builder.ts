/**
 * Purpose: Build RunPlan from config by discovering runtimes/models/tests/harnesses and expanding the matrix.
 * Exports: buildRunPlan
 *
 * Discovery:
 * - Runtimes: check available inference backends (Ollama, etc.)
 * - Models: fetch from runtime API
 * - Tests: scan src/tests/ directory for subdirectories
 * - Harnesses: detect available CLIs
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { BenchConfig, MatrixItem, RunPlan } from "../schemas/index.js";
import { discoverHarnesses, normalizeHarnessName, isValidHarnessName, type HarnessName } from "../harnesses/index.js";
import { discoverRuntimes, createRuntime, type RuntimeName, RUNTIME_NAMES } from "../runtimes/index.js";
import { generateRunId } from "../lib/run-id.js";
import { logger } from "../lib/logger.js";
import {
	TOOL_SMOKE_TEST_SLUG,
	isToolSmokeTest,
	selectToolSmokePassType,
} from "../lib/tool-smoke.js";

/**
 * Discovers available tests by scanning src/tests/ directory.
 *
 * @returns Array of test slugs (directory names)
 */
function discoverTests(): string[] {
	const testsDir = path.join(process.cwd(), "src", "tests");

	if (!fs.existsSync(testsDir)) {
		throw new Error(`Tests directory not found: ${testsDir}`);
	}

	const entries = fs.readdirSync(testsDir, { withFileTypes: true });
	const tests = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	if (tests.length === 0) {
		throw new Error(`No tests found in ${testsDir}`);
	}

	return tests;
}

/**
 * Ensures tool-smoke runs first if present.
 *
 * @param tests - Discovered or configured test list
 * @returns Ordered test list
 */
function orderTests(tests: string[]): string[] {
	if (!tests.includes(TOOL_SMOKE_TEST_SLUG)) {
		return tests;
	}
	return [
		TOOL_SMOKE_TEST_SLUG,
		...tests.filter((test) => test !== TOOL_SMOKE_TEST_SLUG),
	];
}

/**
 * Gets the current Bun version.
 */
function getBunVersion(): string {
	// Bun exposes version info
	return typeof Bun !== "undefined" ? Bun.version : "unknown";
}

/**
 * Builds a RunPlan from the given configuration.
 *
 * @param config - Benchmark configuration
 * @returns The complete run plan ready for execution
 *
 * @throws {Error} If no runtimes available or no models/tests found
 */
export async function buildRunPlan(config: BenchConfig): Promise<RunPlan> {
	const runId = generateRunId();
	const log = logger.child({ runId });

	log.info("Building run plan...");

	// Discover runtimes if not specified
	let runtimes: RuntimeName[];
	if (config.runtimes.length === 0) {
		log.info("Auto-discovering runtimes...");
		runtimes = await discoverRuntimes({
			ollamaBaseUrl: config.ollamaBaseUrl,
			timeoutMs: config.generateTimeoutMs,
		});
		if (runtimes.length === 0) {
			throw new Error(
				`No runtimes available. Is Ollama running at ${config.ollamaBaseUrl}? Try: ollama serve`,
			);
		}
		log.info({ runtimes }, `Found ${runtimes.length} runtime(s)`);
	} else {
		// Validate requested runtimes
		const invalid = config.runtimes.filter(
			(r) => !RUNTIME_NAMES.includes(r as RuntimeName),
		);
		if (invalid.length > 0) {
			throw new Error(
				`Unknown runtimes: ${invalid.join(", ")}. Available: ${RUNTIME_NAMES.join(", ")}`,
			);
		}
		runtimes = config.runtimes as RuntimeName[];
		log.info({ runtimes }, `Using ${runtimes.length} runtime(s)`);
	}

	// Discover models from the first available runtime
	// For now, all models come from the first runtime (Ollama)
	// In future, we could discover models per-runtime
	let models = config.models;
	if (models.length === 0) {
		const primaryRuntime = createRuntime(runtimes[0], {
			ollamaBaseUrl: config.ollamaBaseUrl,
			defaultTimeoutMs: config.generateTimeoutMs,
		});

		log.info({ runtime: runtimes[0] }, "Auto-discovering models from runtime...");
		const available = await primaryRuntime.ping();
		if (!available) {
			throw new Error(
				`Runtime ${runtimes[0]} is not reachable at ${config.ollamaBaseUrl}. Is it running?`,
			);
		}

		models = await primaryRuntime.listModels();
		if (models.length === 0) {
			throw new Error(
				"No models found in runtime. Pull a model first: ollama pull llama3.2:3b",
			);
		}
		log.info({ models }, `Found ${models.length} model(s)`);
	}

	// Discover tests if not specified
	let tests = config.tests;
	if (tests.length === 0) {
		log.info("Auto-discovering tests from src/tests/...");
		tests = discoverTests();
		tests = orderTests(tests);
		log.info({ tests }, `Found ${tests.length} test(s)`);
	} else {
		tests = orderTests(tests);
	}

	// Discover available harnesses
	const availableHarnesses = await discoverHarnesses();

	// Auto-discover all harnesses if not specified, otherwise validate requested ones
	let harnesses: HarnessName[];
	if (config.harnesses.length === 0) {
		log.info("Auto-discovering harnesses...");
		harnesses = availableHarnesses;
		log.info({ harnesses }, `Found ${harnesses.length} harness(es)`);
	} else {
		// Normalize and validate requested harnesses
		const normalized = config.harnesses.map((h) => {
			if (!isValidHarnessName(h)) {
				throw new Error(
					`Unknown harness: ${h}. Available: ${availableHarnesses.join(", ")}`,
				);
			}
			return normalizeHarnessName(h);
		});

		// Check availability
		const unavailable = normalized.filter(
			(h) => !availableHarnesses.includes(h),
		);
		if (unavailable.length > 0) {
			throw new Error(
				`Harnesses not available: ${unavailable.join(", ")}. ` +
					`Available: ${availableHarnesses.join(", ")}`,
			);
		}
		harnesses = normalized;
		log.info({ harnesses }, `Using ${harnesses.length} harness(es)`);
	}

	// Build matrix items: runtimes × harnesses × models × tests × passTypes
	const items: MatrixItem[] = [];
	let itemIndex = 0;

	for (const runtime of runtimes) {
		for (const harness of harnesses) {
			for (const model of models) {
				for (const test of tests) {
					const passTypes = isToolSmokeTest(test)
						? [selectToolSmokePassType(config.passTypes)]
						: config.passTypes;

					for (const passType of passTypes) {
						itemIndex++;
						items.push({
							id: String(itemIndex).padStart(2, "0"),
							runtime,
							harness,
							model,
							test,
							passType,
						});
					}
				}
			}
		}
	}

	log.info(
		{ totalItems: items.length },
		`Matrix expanded to ${items.length} item(s)`,
	);

	// Build the plan
	const plan: RunPlan = {
		schemaVersion: "0.2.0",
		runId,
		createdAt: new Date().toISOString(),
		environment: {
			platform: os.platform(),
			bunVersion: getBunVersion(),
		},
		config: {
			ollamaBaseUrl: config.ollamaBaseUrl,
			generateTimeoutMs: config.generateTimeoutMs,
			passTypes: config.passTypes,
		},
		items,
		summary: {
			totalItems: items.length,
			runtimes: runtimes.length,
			models: models.length,
			harnesses: harnesses.length,
			tests: tests.length,
		},
	};

	return plan;
}
