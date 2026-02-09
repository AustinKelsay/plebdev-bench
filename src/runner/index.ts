/**
 * Purpose: Main runner orchestration - coordinates plan building, execution, and result writing.
 * Exports: runBenchmark
 *
 * Flow:
 * 1. Build plan from config
 * 2. Fetch model info for dynamic timeouts
 * 3. Write plan.json
 * 4. Execute each item with progress counter (dynamic timeout per model/harness)
 * 5. Write run.json
 * 6. Print summary
 */

import type { HarnessName } from "../harnesses/harness.js";
import { TOOL_CALLING_HARNESS_NAMES } from "../harnesses/harness.js";
import { logger } from "../lib/logger.js";
import { hasOpenRouterKey } from "../lib/openrouter-client.js";
import { calculateRunStats, formatRunStats } from "../lib/stats.js";
import { calculateTimeout, formatTimeout } from "../lib/timeout.js";
import { TOOL_SMOKE_TEST_SLUG, isToolSmokeTest } from "../lib/tool-smoke.js";
import { writePlan, writeResult } from "../results/writer.js";
import {
	type ModelInfo,
	type RuntimeName,
	createRuntime,
} from "../runtimes/index.js";
import {
	startManagedVllm,
	stopManagedVllm,
} from "../runtimes/vllm-lifecycle.js";
import type {
	BenchConfig,
	MatrixItemResult,
	RunResult,
} from "../schemas/index.js";
import { SCHEMA_VERSION } from "../schemas/index.js";
import { executeItem } from "./item-executor.js";
import { buildRunPlan } from "./plan-builder.js";

/** Warn if run.json exceeds this size (bytes). */
const RUN_JSON_WARN_BYTES = 5 * 1024 * 1024;

/**
 * Runs the complete benchmark workflow.
 *
 * @param config - Benchmark configuration
 *
 * @throws {Error} Only on setup/write failures (crashes).
 *                 Item execution failures are recorded, not thrown.
 */
export async function runBenchmark(config: BenchConfig): Promise<void> {
	const startedAt = new Date().toISOString();
	const startTime = performance.now();
	const managedVllm =
		config.managedVllm?.enabled === true ? config.managedVllm : undefined;
	let managedVllmStarted = false;

	// Build plan
	const plan = await buildRunPlan(config);
	const log = logger.child({ runId: plan.runId });

	// Check frontier eval availability
	const frontierEvalEnabled = hasOpenRouterKey();

	// Print plan summary
	console.log("");
	console.log(`Run: ${plan.runId}`);
	console.log(
		`Items: ${plan.summary.totalItems} (runtimes: ${plan.summary.runtimes}, models: ${plan.summary.models}, harnesses: ${plan.summary.harnesses}, tests: ${plan.summary.tests})`,
	);
	console.log(
		`Frontier eval: ${frontierEvalEnabled ? "enabled" : "disabled (no OPENROUTER_API_KEY)"}`,
	);
	console.log("");

	// Fetch model info for dynamic timeouts (per-runtime)
	const modelInfoCache = new Map<string, ModelInfo>();

	// Build runtime -> models map from plan items
	const runtimeModelSet = new Map<RuntimeName, Set<string>>();
	for (const item of plan.items) {
		const rt = item.runtime as RuntimeName;
		if (!runtimeModelSet.has(rt)) runtimeModelSet.set(rt, new Set());
		runtimeModelSet.get(rt)!.add(item.model);
	}

	// Fetch model info from correct runtime
	log.info("Fetching model info for dynamic timeouts...");
	for (const [runtimeName, models] of runtimeModelSet) {
		const runtime = createRuntime(runtimeName, {
			ollamaBaseUrl: config.ollamaBaseUrl,
			vllmBaseUrl: config.vllmBaseUrl,
			defaultTimeoutMs: config.generateTimeoutMs,
		});

		// Fetch model info in parallel per runtime
		const modelInfoResults = await Promise.all(
			[...models].map(async (model) => {
				try {
					const info = await runtime.getModelInfo(model);
					log.debug(
						{
							runtime: runtimeName,
							model,
							parametersBillions: info.parametersBillions.toFixed(1),
						},
						"Model info fetched",
					);
					return { model, info };
				} catch (error) {
					// Default to 7B if we can't get model info
					log.warn(
						{ runtime: runtimeName, model, error },
						"Failed to get model info, using default 7B",
					);
					return {
						model,
						info: {
							name: model,
							sizeBytes: 0,
							parametersBillions: 7,
						} as ModelInfo,
					};
				}
			}),
		);

		// Build cache from results (keyed by runtime:model to avoid collisions)
		for (const { model, info } of modelInfoResults) {
			modelInfoCache.set(`${runtimeName}:${model}`, info);
		}
	}

	// Write plan.json
	log.info("Writing plan.json...");
	await writePlan(config.outputDir, plan);

	// Execute items
	const results: MatrixItemResult[] = [];
	const total = plan.items.length;
	const toolCallingHarnesses = new Set(TOOL_CALLING_HARNESS_NAMES);
	const toolSmokeStatus = new Map<
		string,
		{ status: "passed" | "failed"; skip: boolean; message?: string }
	>();

	if (!plan.items.some((item) => item.test === TOOL_SMOKE_TEST_SLUG)) {
		log.warn("tool-smoke test not present in plan; tool preflight is disabled");
	}

	try {
		for (let i = 0; i < plan.items.length; i++) {
			const item = plan.items[i];
			const itemNum = String(i + 1).padStart(2, "0");
			const runtimeName = item.runtime as RuntimeName;
			const nextItem = plan.items[i + 1];
			const isLastForRuntime =
				!nextItem || (nextItem.runtime as RuntimeName) !== runtimeName;

			if (managedVllm && runtimeName === "vllm" && !managedVllmStarted) {
				log.info("Managed vLLM enabled; starting vLLM for vLLM segment...");
				await startManagedVllm(managedVllm, config.vllmBaseUrl);
				managedVllmStarted = true;
			}

			// Calculate dynamic timeout based on model size and harness
			const modelInfo = modelInfoCache.get(`${item.runtime}:${item.model}`);
			const paramsBillions = modelInfo?.parametersBillions ?? 7;
			const dynamicTimeout = calculateTimeout(
				paramsBillions,
				item.harness as HarnessName,
				config.generateTimeoutMs,
				item.model,
			);

			// Progress counter (terminal-native UX)
			console.log(
				`item ${itemNum}/${String(total).padStart(2, "0")}: runtime=${item.runtime} harness=${item.harness} model=${item.model} test=${item.test} pass=${item.passType} timeout=${formatTimeout(dynamicTimeout)}`,
			);

			const toolSmokeKey = `${item.runtime}::${item.harness}::${item.model}`;
			const isToolHarness = toolCallingHarnesses.has(
				item.harness as (typeof TOOL_CALLING_HARNESS_NAMES)[number],
			);
			const isToolSmoke = isToolSmokeTest(item.test);

			if (isToolHarness && !isToolSmoke) {
				const status = toolSmokeStatus.get(toolSmokeKey);
				if (status?.skip) {
					const now = new Date().toISOString();
					const message =
						status.message ??
						"tool-smoke failed; skipping remaining items for this harness/model";
					log.warn(
						{ harness: item.harness, model: item.model, test: item.test },
						"Skipping item due to tool-smoke failure",
					);
					results.push({
						id: item.id,
						runtime: item.runtime,
						model: item.model,
						harness: item.harness,
						test: item.test,
						passType: item.passType,
						status: "failed",
						startedAt: now,
						completedAt: now,
						generation: {
							success: false,
							error: `Skipped: ${message}`,
							failureType: "tool_missing",
							durationMs: 0,
						},
						generationFailure: {
							type: "tool_missing",
							message: `Skipped: ${message}`,
						},
					});
					continue;
				}
			}

			// Unload model only when switching to a different model/runtime (or last item)
			// Must check both: same model name on different runtimes should trigger unload
			const isLastForModel =
				!nextItem ||
				nextItem.model !== item.model ||
				nextItem.runtime !== item.runtime;

			const result = await executeItem(
				item,
				{
					ollamaBaseUrl: config.ollamaBaseUrl,
					vllmBaseUrl: config.vllmBaseUrl,
				},
				dynamicTimeout,
				isLastForModel,
			);
			results.push(result);

			if (isToolHarness && isToolSmoke) {
				const failureMessage =
					result.generation?.error ?? result.generationFailure?.message;
				const passed = result.generation?.success === true;
				const shouldSkip =
					result.generation?.success === false &&
					result.generation?.failureType === "tool_missing";
				toolSmokeStatus.set(toolSmokeKey, {
					status: passed ? "passed" : "failed",
					skip: shouldSkip,
					message: failureMessage,
				});
			}

			if (
				isToolHarness &&
				!isToolSmoke &&
				result.generation?.success === false &&
				result.generation?.failureType === "tool_missing"
			) {
				toolSmokeStatus.set(toolSmokeKey, {
					status: "failed",
					skip: true,
					message:
						result.generation?.error ??
						result.generationFailure?.message ??
						"tool_missing detected; skipping remaining items",
				});
				log.warn(
					{ harness: item.harness, model: item.model },
					"tool_missing detected; skipping remaining items for this harness/model",
				);
			}

			if (
				managedVllm &&
				runtimeName === "vllm" &&
				isLastForRuntime &&
				managedVllm.stopAfterRun
			) {
				log.info("Managed vLLM enabled; stopping vLLM after vLLM segment...");
				await stopManagedVllm(managedVllm);
				managedVllmStarted = false;
			}
		}
	} finally {
		if (managedVllm && managedVllmStarted && managedVllm.stopAfterRun) {
			log.warn(
				"Benchmark ended while managed vLLM was running; stopping vLLM in finally...",
			);
			await stopManagedVllm(managedVllm);
		}
	}

	// Calculate summary
	const completed = results.filter((r) => r.status === "completed").length;
	const failed = results.filter((r) => r.status === "failed").length;
	const pending = results.filter((r) => r.status === "pending").length;

	const completedAt = new Date().toISOString();
	const durationMs = Math.round(performance.now() - startTime);

	// Build run result
	const runResult: RunResult = {
		schemaVersion: SCHEMA_VERSION,
		runId: plan.runId,
		startedAt,
		completedAt,
		durationMs,
		summary: {
			total,
			completed,
			failed,
			pending,
		},
		items: results,
	};

	// Warn on very large run.json payloads (runaway output)
	try {
		const estimatedBytes = Buffer.byteLength(JSON.stringify(runResult));
		if (estimatedBytes > RUN_JSON_WARN_BYTES) {
			log.warn(
				{ runId: plan.runId, sizeBytes: estimatedBytes },
				"run.json is large; consider moving large outputs to artifacts in future runs",
			);
		}
	} catch {
		// Ignore estimation errors
	}

	// Write run.json
	log.info("Writing run.json...");
	await writeResult(config.outputDir, runResult);

	// Calculate and print detailed stats
	const stats = calculateRunStats(results);
	console.log(
		formatRunStats(
			stats,
			plan.runId,
			completed,
			failed,
			total,
			durationMs,
			config.outputDir,
		),
	);
}
