/**
 * Purpose: Build RunPlan from config by discovering runtimes/models/tests/harnesses and expanding the matrix.
 * Exports: buildRunPlan
 *
 * Discovery:
 * - Runtimes: check available inference backends (Ollama, etc.)
 * - Models: fetch from runtime API
 * - Tests: scan src/tests/ directory and load metadata from test.meta.json
 * - Harnesses: detect available CLIs
 */

import * as os from "node:os";
import {
	type HarnessName,
	TOOL_CALLING_HARNESS_NAMES,
	discoverHarnesses,
	isHarnessCompatibleWithRuntime,
	isValidHarnessName,
	normalizeHarnessName,
} from "../harnesses/index.js";
import { computeBenchmarkCheckpoint } from "../lib/benchmark-checkpoint.js";
import {
	type ResolvedMachineProfile,
	collectMachineProfile,
} from "../lib/hardware-profile.js";
import { logger } from "../lib/logger.js";
import { isAlias, resolveModelForRuntime } from "../lib/model-aliases.js";
import { generateRunId } from "../lib/run-id.js";
import { discoverTestCatalog, selectTests } from "../lib/test-catalog.js";
import { isToolSmokeTest, selectToolSmokePassType } from "../lib/tool-smoke.js";
import {
	RUNTIME_NAMES,
	type RuntimeName,
	createRuntime,
	discoverRuntimes,
} from "../runtimes/index.js";
import type { BenchConfig, MatrixItem, RunPlan } from "../schemas/index.js";
import { SCHEMA_VERSION } from "../schemas/index.js";

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
	const managedVllm =
		config.managedVllm?.enabled === true ? config.managedVllm : undefined;
	const benchmarkCheckpoint = computeBenchmarkCheckpoint();
	const resolvedMachine: ResolvedMachineProfile = collectMachineProfile({
		machineProfileId: config.machineProfileId,
		machineLabel: config.machineLabel,
	});

	if (resolvedMachine.isAnonymous) {
		log.warn(
			{ machineProfileId: resolvedMachine.machine.profileId },
			"Machine profile ID not provided; using deterministic anonymous machine ID",
		);
	} else {
		log.info(
			{
				machineProfileId: resolvedMachine.machine.profileId,
				identitySource: resolvedMachine.identitySource,
			},
			"Using explicit machine profile identity",
		);
	}
	log.info(
		{
			checkpointId: benchmarkCheckpoint.checkpointId,
			assetCount: benchmarkCheckpoint.assetCount,
		},
		"Computed benchmark checkpoint",
	);

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

	// Ensure managed vLLM is included even if it's not currently reachable.
	if (managedVllm) {
		const hasVllm = runtimes.includes("vllm");
		if (!hasVllm) {
			runtimes = [...runtimes, "vllm"];
			log.info(
				{ runtimes },
				"Managed vLLM enabled; including vLLM runtime even if not currently reachable",
			);
		}
	}

	// Discover models per runtime
	const runtimeModels = new Map<RuntimeName, string[]>();
	// Track runtime-scoped resolved model name -> canonical alias name (avoid collisions across runtimes)
	const modelCanonicalMap = new Map<string, string>();
	const aliases = config.modelAliases;
	const hasAliases = Object.keys(aliases).length > 0;

	if (hasAliases) {
		log.info({ aliases: Object.keys(aliases) }, "Using model aliases");
	}

	for (const runtimeName of runtimes) {
		if (runtimeName === "vllm" && managedVllm) {
			// Defer reachability/model discovery; use configured model(s) for reproducibility.
			const modelsForVllm: string[] = [];

			if (config.models.length > 0) {
				for (const modelSpec of config.models) {
					if (isAlias(modelSpec, aliases)) {
						const resolved = resolveModelForRuntime(
							modelSpec,
							runtimeName,
							aliases,
						);
						if (resolved) {
							modelsForVllm.push(resolved);
							modelCanonicalMap.set(`${runtimeName}::${resolved}`, modelSpec);
							log.debug(
								{ alias: modelSpec, runtime: runtimeName, resolved },
								"Resolved model alias (managed vLLM)",
							);
						}
					} else {
						modelsForVllm.push(modelSpec);
					}
				}
			} else {
				modelsForVllm.push(managedVllm.model);
			}

			runtimeModels.set(runtimeName, modelsForVllm);
			log.info(
				{ runtime: runtimeName, count: modelsForVllm.length },
				"Models discovered (managed vLLM)",
			);
			continue;
		}

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
					const resolved = resolveModelForRuntime(
						modelSpec,
						runtimeName,
						aliases,
					);
					if (resolved && discovered.includes(resolved)) {
						filtered.push(resolved);
						modelCanonicalMap.set(`${runtimeName}::${resolved}`, modelSpec);
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
		log.info(
			{ runtime: runtimeName, count: filtered.length },
			"Models discovered",
		);
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
					availableByRuntime.push(
						`${runtimeName}: ${available.slice(0, 5).join(", ")}${available.length > 5 ? ` (+${available.length - 5} more)` : ""}`,
					);
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

	// Load and select tests from catalog
	log.info("Loading test catalog from src/tests/...");
	const testCatalog = discoverTestCatalog();
	const selectedTests = selectTests(
		testCatalog,
		config.tests,
		config.categories,
	);
	const selectedTestSlugs = selectedTests.map((test) => test.slug);
	const selectedTestCategories = [
		...new Set(selectedTests.map((t) => t.category)),
	];
	log.info(
		{ tests: selectedTestSlugs, categories: selectedTestCategories },
		`Using ${selectedTests.length} test(s) across ${selectedTestCategories.length} categor${selectedTestCategories.length === 1 ? "y" : "ies"}`,
	);

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
				const modelAlias = modelCanonicalMap.get(`${runtime}::${model}`);

				for (const test of selectedTests) {
					if (
						test.requiresTools &&
						!TOOL_CALLING_HARNESS_NAMES.includes(
							harness as (typeof TOOL_CALLING_HARNESS_NAMES)[number],
						)
					) {
						continue;
					}

					const passTypes = isToolSmokeTest(test.slug)
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
							test: test.slug,
							category: test.category,
							scoringMode: test.scoringMode,
							requiresTools: test.requiresTools,
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

	if (items.length === 0) {
		throw new Error(
			"No matrix items generated. Selected tests may require tool-calling harnesses that are not available.",
		);
	}

	// Derive summary from actual expanded matrix items, not requested/discovered sets.
	const summaryRuntimes = new Set(items.map((item) => item.runtime));
	const summaryModels = new Set(items.map((item) => item.model));
	const summaryHarnesses = new Set(items.map((item) => item.harness));
	const summaryTests = new Set(items.map((item) => item.test));
	const summaryCategories = new Set(
		items
			.map((item) => item.category)
			.filter(
				(category): category is NonNullable<MatrixItem["category"]> =>
					category !== undefined,
			),
	);

	// Build the plan
	const plan: RunPlan = {
		schemaVersion: SCHEMA_VERSION,
		runId,
		createdAt: new Date().toISOString(),
		runtimeEnvironment: {
			platform: os.platform(),
			bunVersion: getBunVersion(),
		},
		machine: resolvedMachine.machine,
		benchmarkCheckpoint,
		provenance: {
			verificationStatus: "self_reported",
			source: "local_cli",
		},
		config: {
			ollamaBaseUrl: config.ollamaBaseUrl,
			vllmBaseUrl: config.vllmBaseUrl,
			generateTimeoutMs: config.generateTimeoutMs,
			gooseMaxTurns: config.gooseMaxTurns,
			gooseRetryMaxTurns: config.gooseRetryMaxTurns,
			passTypes: config.passTypes,
			categories: config.categories,
			...(managedVllm ? { managedVllm } : {}),
		},
		items,
		summary: {
			totalItems: items.length,
			runtimes: summaryRuntimes.size,
			models: summaryModels.size,
			harnesses: summaryHarnesses.size,
			tests: summaryTests.size,
			categories: summaryCategories.size,
		},
	};

	return plan;
}
