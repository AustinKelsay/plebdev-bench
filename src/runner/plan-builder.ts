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
	doesHarnessSupportCapabilities,
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
import {
	buildResolvedModelProfile,
	getModelIdentityKey,
	resolveModelSelection,
} from "../lib/model-profiles.js";
import { generateRunId } from "../lib/run-id.js";
import { discoverTestCatalog, selectTests } from "../lib/test-catalog.js";
import { isPreflightTest, selectPreflightPassType } from "../lib/tool-smoke.js";
import {
	RUNTIME_NAMES,
	type RuntimeName,
	createRuntime,
} from "../runtimes/index.js";
import type { BenchConfig, MatrixItem, RunPlan } from "../schemas/index.js";
import { SCHEMA_VERSION } from "../schemas/index.js";
import { listAvailableModelsByRuntime } from "./model-availability.js";
import { filterGenerativeModels } from "./model-eligibility.js";

/**
 * Gets the current Bun version.
 */
function getBunVersion(): string {
	return typeof Bun !== "undefined" ? Bun.version : "unknown";
}

/**
 * Builds a RunPlan from the given configuration.
 *
 * @param config - Benchmark configuration
 * @returns The complete run plan ready for execution
 *
 * @throws {Error} If Ollama is unreachable, no models/tests are found, requested model selectors are missing, requested harnesses are unavailable, discovered models are all excluded, or matrix expansion yields zero items
 */
export async function buildRunPlan(config: BenchConfig): Promise<RunPlan> {
	const runId = generateRunId();
	const log = logger.child({ runId });

	log.info("Building run plan...");
	const benchmarkCheckpoint = computeBenchmarkCheckpoint();
	const resolvedMachine: ResolvedMachineProfile = await collectMachineProfile({
		machineInstanceId: config.machineInstanceId,
		machineDisplayLabel: config.machineDisplayLabel,
	});

	if (resolvedMachine.isAnonymous) {
		log.warn(
			{
				machineInstanceId: resolvedMachine.machine.instanceId,
				machineProfileKey: resolvedMachine.machine.profileKey,
			},
			"Machine instance ID not provided; using generated local machine ID",
		);
	} else {
		log.info(
			{
				machineInstanceId: resolvedMachine.machine.instanceId,
				machineProfileKey: resolvedMachine.machine.profileKey,
				identitySource: resolvedMachine.identitySource,
			},
			"Using explicit machine instance identity",
		);
	}
	log.info(
		{
			checkpointId: benchmarkCheckpoint.checkpointId,
			assetCount: benchmarkCheckpoint.assetCount,
		},
		"Computed benchmark checkpoint",
	);

	const runtimes =
		config.runtimes.length > 0 ? config.runtimes : [...RUNTIME_NAMES];
	log.info({ runtimes }, `Using ${runtimes.length} runtime(s)`);

	// Discover models per runtime
	const runtimeModels = new Map<RuntimeName, string[]>();
	const resolvedModelProfiles = new Map<
		string,
		{
			modelAlias?: string;
			modelProfile: MatrixItem["modelProfile"];
		}
	>();
	const modelProfiles = config.modelProfiles;
	const hasModelProfiles = Object.keys(modelProfiles).length > 0;
	const matchedModelSelectors = new Set<string>();
	const modelExclusions: NonNullable<RunPlan["modelExclusions"]> = [];
	let discoveredModelCount = 0;
	if (hasModelProfiles) {
		log.info(
			{ profiles: Object.keys(modelProfiles) },
			"Using configured model profiles",
		);
	}

	for (const runtimeName of runtimes) {
		const runtime = createRuntime(runtimeName, {
			ollamaBaseUrl: config.ollamaBaseUrl,
			defaultTimeoutMs: config.generateTimeoutMs,
		});

		const available = await runtime.ping();
		if (!available) {
			throw new Error(
				`Ollama is not reachable at ${config.ollamaBaseUrl}. Try: ollama serve`,
			);
		}

		const discovered = await runtime.listModels();
		discoveredModelCount += discovered.length;

		// Apply --models filter if provided (with alias resolution)
		let filtered: string[];
		if (config.models.length > 0) {
			filtered = [];
			const filteredSet = new Set<string>();
			for (const modelSpec of config.models) {
				const configuredProfile = modelProfiles[modelSpec];
				const resolvedSelection = resolveModelSelection(
					modelSpec,
					runtimeName,
					modelProfiles,
				);
				if (configuredProfile && resolvedSelection === undefined) {
					throw new Error(
						`Configured model profile "${modelSpec}" does not define a variant for runtime "${runtimeName}"`,
					);
				}
				if (
					resolvedSelection !== undefined &&
					discovered.includes(resolvedSelection.runtimeModelName)
				) {
					matchedModelSelectors.add(modelSpec);
					if (!filteredSet.has(resolvedSelection.runtimeModelName)) {
						filtered.push(resolvedSelection.runtimeModelName);
						filteredSet.add(resolvedSelection.runtimeModelName);
						resolvedModelProfiles.set(
							`${runtimeName}::${resolvedSelection.runtimeModelName}`,
							{
								...(resolvedSelection.modelAlias
									? { modelAlias: resolvedSelection.modelAlias }
									: {}),
								modelProfile: resolvedSelection.modelProfile,
							},
						);
						log.debug(
							{
								requestedModel: modelSpec,
								runtime: runtimeName,
								resolved: resolvedSelection.runtimeModelName,
								profileKey: resolvedSelection.modelProfile.canonical.profileKey,
							},
							"Resolved model selector",
						);
					}
				}
			}
			const eligibility = await filterGenerativeModels({
				runtimeName,
				runtime,
				models: filtered,
				mode: "throw",
				log,
			});
			filtered = eligibility.models;
		} else {
			const eligibility = await filterGenerativeModels({
				runtimeName,
				runtime,
				models: discovered,
				mode: "record",
				log,
			});
			filtered = eligibility.models;
			modelExclusions.push(...eligibility.exclusions);
			for (const discoveredModel of filtered) {
				const modelProfile = buildResolvedModelProfile(
					runtimeName,
					discoveredModel,
					modelProfiles,
				);
				resolvedModelProfiles.set(`${runtimeName}::${discoveredModel}`, {
					modelProfile,
					...(modelProfile.resolutionSource !== "runtime_name"
						? { modelAlias: modelProfile.canonical.profileKey }
						: {}),
				});
			}
		}

		// Ensure direct raw model selections still get profile metadata even when no config mapping exists.
		if (config.models.length > 0) {
			for (const runtimeModelName of filtered) {
				const key = `${runtimeName}::${runtimeModelName}`;
				if (resolvedModelProfiles.has(key)) {
					continue;
				}
				const modelProfile = buildResolvedModelProfile(
					runtimeName,
					runtimeModelName,
					modelProfiles,
				);
				resolvedModelProfiles.set(key, {
					modelProfile,
					...(modelProfile.resolutionSource !== "runtime_name"
						? { modelAlias: modelProfile.canonical.profileKey }
						: {}),
				});
			}
		}

		runtimeModels.set(runtimeName, filtered);
		log.info(
			{ runtime: runtimeName, count: filtered.length },
			"Models discovered",
		);
	}

	if (config.models.length > 0) {
		const unresolvedSelectors = config.models.filter(
			(modelSpec) => !matchedModelSelectors.has(modelSpec),
		);
		if (unresolvedSelectors.length > 0) {
			const availableByRuntime = await listAvailableModelsByRuntime(
				runtimes,
				config,
			);
			throw new Error(
				`Requested model selectors not found: ${unresolvedSelectors.join(", ")}\n` +
					`Available models:\n  ${availableByRuntime.join("\n  ") || "None found"}`,
			);
		}
	}

	// Validate at least one model exists
	const allModels = [...runtimeModels.values()].flat();
	if (allModels.length === 0) {
		if (discoveredModelCount > 0 && modelExclusions.length > 0) {
			const exclusionSummary = modelExclusions
				.map(
					(exclusion) =>
						`${exclusion.runtime}:${exclusion.model} (${exclusion.reason})`,
				)
				.join(", ");
			throw new Error(
				`Models were discovered but all were excluded by filterGenerativeModels() before matrix expansion. Excluded models: ${exclusionSummary}. modelExclusions=${JSON.stringify(modelExclusions)}. Remove exclusions or choose text-generation-capable models for text-generation benchmarks, or run an embeddings benchmark if you only want embedding-capable models.`,
			);
		}
		// Provide helpful error message
		if (config.models.length > 0) {
			// User specified models but none matched - show what's available
			const availableByRuntime = await listAvailableModelsByRuntime(
				runtimes,
				config,
			);
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
				const resolvedModel = resolvedModelProfiles.get(`${runtime}::${model}`);

				for (const test of selectedTests) {
					if (
						test.requiresTools &&
						!TOOL_CALLING_HARNESS_NAMES.includes(
							harness as (typeof TOOL_CALLING_HARNESS_NAMES)[number],
						)
					) {
						continue;
					}

					if (
						test.requiredHarnessCapabilities.length > 0 &&
						!doesHarnessSupportCapabilities(
							harness,
							test.requiredHarnessCapabilities,
						)
					) {
						continue;
					}

					const passTypes = isPreflightTest(test.tags)
						? [selectPreflightPassType(config.passTypes)]
						: config.passTypes;

					for (const passType of passTypes) {
						itemIndex++;
						items.push({
							id: String(itemIndex).padStart(2, "0"),
							runtime,
							harness,
							model,
							...(resolvedModel?.modelAlias
								? { modelAlias: resolvedModel.modelAlias }
								: {}),
							...(resolvedModel?.modelProfile
								? { modelProfile: resolvedModel.modelProfile }
								: {}),
							test: test.slug,
							category: test.category,
							scoringMode: test.scoringMode,
							requiresTools: test.requiresTools,
							requiredHarnessCapabilities: test.requiredHarnessCapabilities,
							tags: test.tags,
							timeoutMultiplier: test.timeoutMultiplier,
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
			`No matrix items generated. Check selected tests, runtimes, harnesses, and categories. filters: runtimes=${config.runtimes.join(",") || "all"} harnesses=${config.harnesses.join(",") || "all"} tests=${config.tests.join(",") || "all"} categories=${config.categories.join(",") || "all"}`,
		);
	}

	// Derive summary from actual expanded matrix items, not requested/discovered sets.
	const summaryRuntimes = new Set(items.map((item) => item.runtime));
	const summaryModels = new Set(
		items.map((item) =>
			getModelIdentityKey(item.model, item.modelProfile, item.modelAlias),
		),
	);
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
			generateTimeoutMs: config.generateTimeoutMs,
			gooseMaxTurns: config.gooseMaxTurns,
			gooseRetryMaxTurns: config.gooseRetryMaxTurns,
			gooseWorkspaceMaxTurns: config.gooseWorkspaceMaxTurns,
			gooseWorkspaceRetryMaxTurns: config.gooseWorkspaceRetryMaxTurns,
			passTypes: config.passTypes,
			categories: config.categories,
		},
		items,
		...(modelExclusions.length > 0 ? { modelExclusions } : {}),
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
