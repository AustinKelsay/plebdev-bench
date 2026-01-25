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

import type { BenchConfig, RunResult, MatrixItemResult } from "../schemas/index.js";
import { SCHEMA_VERSION } from "../schemas/index.js";
import type { HarnessName, ModelInfo } from "../harnesses/harness.js";
import { buildRunPlan } from "./plan-builder.js";
import { executeItem } from "./item-executor.js";
import { writePlan, writeResult } from "../results/writer.js";
import { logger } from "../lib/logger.js";
import { createHarness } from "../harnesses/index.js";
import { calculateTimeout, formatTimeout } from "../lib/timeout.js";
import { ensureServerRunning, stopServer as stopOpenCodeServer } from "../harnesses/opencode-server.js";
import { hasOpenRouterKey } from "../lib/openrouter-client.js";
import { calculateRunStats, formatRunStats } from "../lib/stats.js";

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

	// Build plan
	const plan = await buildRunPlan(config);
	const log = logger.child({ runId: plan.runId });

	// Pre-warm OpenCode server if it will be used (B.5 optimization)
	// Start in background while we do other setup tasks
	const hasOpenCode = plan.items.some((item) => item.harness === "opencode");
	let serverWarmPromise: Promise<string> | null = null;
	if (hasOpenCode) {
		log.info("Pre-warming OpenCode server...");
		serverWarmPromise = ensureServerRunning().catch((err) => {
			log.warn({ error: err }, "OpenCode server pre-warm failed (will retry on first use)");
			return "";
		});
	}

	// Check frontier eval availability
	const frontierEvalEnabled = hasOpenRouterKey();

	// Print plan summary
	console.log("");
	console.log(`Run: ${plan.runId}`);
	console.log(
		`Items: ${plan.summary.totalItems} (models: ${plan.summary.models}, harnesses: ${plan.summary.harnesses}, tests: ${plan.summary.tests})`,
	);
	console.log(`Frontier eval: ${frontierEvalEnabled ? "enabled" : "disabled (no OPENROUTER_API_KEY)"}`);
	console.log("");

	// Fetch model info for dynamic timeouts
	const modelInfoCache = new Map<string, ModelInfo>();
	const uniqueModels = [...new Set(plan.items.map((item) => item.model))];
	const ollamaHarness = createHarness("ollama", {
		ollamaBaseUrl: config.ollamaBaseUrl,
		defaultTimeoutMs: config.generateTimeoutMs,
	});

	// Fetch model info in parallel (B.5 optimization)
	log.info("Fetching model info for dynamic timeouts...");
	const modelInfoResults = await Promise.all(
		uniqueModels.map(async (model) => {
			try {
				const info = await ollamaHarness.getModelInfo(model);
				log.debug({ model, parametersBillions: info.parametersBillions.toFixed(1) }, "Model info fetched");
				return { model, info };
			} catch (error) {
				// Default to 7B if we can't get model info
				log.warn({ model, error }, "Failed to get model info, using default 7B");
				return { model, info: { name: model, sizeBytes: 0, parametersBillions: 7 } as ModelInfo };
			}
		}),
	);

	// Build cache from results
	for (const { model, info } of modelInfoResults) {
		modelInfoCache.set(model, info);
	}

	// Write plan.json
	log.info("Writing plan.json...");
	await writePlan(config.outputDir, plan);

	// Execute items
	const results: MatrixItemResult[] = [];
	const total = plan.items.length;

	// Ensure server is ready before starting items (if pre-warming)
	if (serverWarmPromise) {
		await serverWarmPromise;
	}

	for (let i = 0; i < plan.items.length; i++) {
		const item = plan.items[i];
		const itemNum = String(i + 1).padStart(2, "0");

		// Calculate dynamic timeout based on model size and harness
		const modelInfo = modelInfoCache.get(item.model);
		const paramsBillions = modelInfo?.parametersBillions ?? 7;
		const dynamicTimeout = calculateTimeout(
			paramsBillions,
			item.harness as HarnessName,
			config.generateTimeoutMs,
			item.model,
		);

		// Progress counter (terminal-native UX)
		console.log(
			`item ${itemNum}/${String(total).padStart(2, "0")}: harness=${item.harness} model=${item.model} test=${item.test} pass=${item.passType} timeout=${formatTimeout(dynamicTimeout)}`,
		);

		// Unload model only when switching to a different model (or last item)
		const nextItem = plan.items[i + 1];
		const isLastForModel = !nextItem || nextItem.model !== item.model;

		const result = await executeItem(
			item,
			config.ollamaBaseUrl,
			dynamicTimeout,
			isLastForModel,
		);
		results.push(result);
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

	// Cleanup: stop OpenCode server if it was started
	await stopOpenCodeServer();

	// Calculate and print detailed stats
	const stats = calculateRunStats(results);
	console.log(formatRunStats(stats, plan.runId, completed, failed, total, durationMs, config.outputDir));
}
