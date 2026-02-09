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
import { SCHEMA_VERSION } from "../schemas/index.js";
import { discoverHarnesses, normalizeHarnessName, isValidHarnessName, isHarnessCompatibleWithRuntime, type HarnessName } from "../harnesses/index.js";
import { discoverRuntimes, createRuntime, type RuntimeName, RUNTIME_NAMES } from "../runtimes/index.js";
import { generateRunId } from "../lib/run-id.js";
import { logger } from "../lib/logger.js";
import {
	TOOL_SMOKE_TEST_SLUG,
	isToolSmokeTest,
	selectToolSmokePassType,
} from "../lib/tool-smoke.js";
import {
	isAlias,
	resolveModelForRuntime,
} from "../lib/model-aliases.js";

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
			vllmBaseUrl: config.vllmBaseUrl,
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

	// Discover models per runtime
	const runtimeModels = new Map<RuntimeName, string[]>();
	// Track canonical name -> runtime model name for alias resolution
	const modelCanonicalMap = new Map<string, string>();
	const aliases = config.modelAliases;
	const hasAliases = Object.keys(aliases).length > 0;

	if (hasAliases) {
		log.info({ aliases: Object.keys(aliases) }, "Using model aliases");
	}

	for (const runtimeName of runtimes) {
		const runtime = createRuntime(runtimeName, {
			ollamaBaseUrl: config.ollamaBaseUrl,
			vllmBaseUrl: config.vllmBaseUrl,
			defaultTimeoutMs: config.generateTimeoutMs,
		});

		const available = await runtime.ping();
		if (!available) {
			log.warn({ runtime: runtimeName }, "Runtime not reachable, skipping");
			runtimeModels.set(runtimeName, []);
			continue;
		}

		const discovered = await runtime.listModels();

		// Apply --models filter if provided (with alias resolution)
		let filtered: string[];
		if (config.models.length > 0) {
			filtered = [];
			for (const modelSpec of config.models) {
				// Check if this is an alias
				if (isAlias(modelSpec, aliases)) {
					const resolved = resolveModelForRuntime(modelSpec, runtimeName, aliases);
					if (resolved && discovered.includes(resolved)) {
						filtered.push(resolved);
						modelCanonicalMap.set(resolved, modelSpec);
						log.debug(
							{ alias: modelSpec, runtime: runtimeName, resolved },
							"Resolved model alias",
						);
					}
				} else {
					// Direct model name - check if available
					if (discovered.includes(modelSpec)) {
						filtered.push(modelSpec);
					}
				}
			}
		} else {
			filtered = discovered;
		}

		runtimeModels.set(runtimeName, filtered);
		log.info({ runtime: runtimeName, count: filtered.length }, "Models discovered");
	}

	// Validate at least one model exists
	const allModels = [...runtimeModels.values()].flat();
	if (allModels.length === 0) {
		// Provide helpful error message
		if (config.models.length > 0) {
			// User specified models but none matched - show what's available
			const availableByRuntime: string[] = [];
			for (const runtimeName of runtimes) {
				const runtime = createRuntime(runtimeName, {
					ollamaBaseUrl: config.ollamaBaseUrl,
					vllmBaseUrl: config.vllmBaseUrl,
					defaultTimeoutMs: config.generateTimeoutMs,
				});
				const available = await runtime.listModels();
				if (available.length > 0) {
					availableByRuntime.push(`${runtimeName}: ${available.slice(0, 5).join(", ")}${available.length > 5 ? ` (+${available.length - 5} more)` : ""}`);
				}
			}
			throw new Error(
				`No models matched filter: ${config.models.join(", ")}\n` +
				`Available models:\n  ${availableByRuntime.join("\n  ") || "None found"}`,
			);
		}
		throw new Error(
			"No models found in any runtime. Pull a model first: ollama pull llama3.2:3b",
		);
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

	// Build matrix items: runtimes × harnesses (filtered by compatibility) × models (per-runtime) × tests × passTypes
	const items: MatrixItem[] = [];
	let itemIndex = 0;

	for (const runtime of runtimes) {
		const modelsForRuntime = runtimeModels.get(runtime) ?? [];
		if (modelsForRuntime.length === 0) continue;

		// Filter harnesses to only those compatible with this runtime
		const compatibleHarnesses = harnesses.filter((h) =>
			isHarnessCompatibleWithRuntime(h, runtime),
		);

		if (compatibleHarnesses.length === 0) {
			log.warn(
				{ runtime, requestedHarnesses: harnesses },
				"No compatible harnesses for runtime, skipping",
			);
			continue;
		}

		if (compatibleHarnesses.length < harnesses.length) {
			const skipped = harnesses.filter((h) => !compatibleHarnesses.includes(h));
			log.info(
				{ runtime, skipped },
				"Some harnesses not compatible with runtime",
			);
		}

		for (const harness of compatibleHarnesses) {
			for (const model of modelsForRuntime) {
				// Look up canonical alias if this model was resolved from one
				const modelAlias = modelCanonicalMap.get(model);

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
							...(modelAlias ? { modelAlias } : {}),
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

	// Calculate unique models across all runtimes for summary
	const uniqueModels = new Set([...runtimeModels.values()].flat());

	// Build the plan
	const plan: RunPlan = {
		schemaVersion: SCHEMA_VERSION,
		runId,
		createdAt: new Date().toISOString(),
		environment: {
			platform: os.platform(),
			bunVersion: getBunVersion(),
		},
		config: {
			ollamaBaseUrl: config.ollamaBaseUrl,
			vllmBaseUrl: config.vllmBaseUrl,
			generateTimeoutMs: config.generateTimeoutMs,
			passTypes: config.passTypes,
		},
		items,
		summary: {
			totalItems: items.length,
			runtimes: runtimes.length,
			models: uniqueModels.size,
			harnesses: harnesses.length,
			tests: tests.length,
		},
	};

	return plan;
}
