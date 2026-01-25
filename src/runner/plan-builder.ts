/**
 * Purpose: Build RunPlan from config by discovering models/tests/harnesses and expanding the matrix.
 * Exports: buildRunPlan
 *
 * Discovery:
 * - Models: fetch from Ollama API (shared across all harnesses)
 * - Tests: scan src/tests/ directory for subdirectories
 * - Harnesses: detect available CLIs and Ollama endpoint
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { BenchConfig, MatrixItem, RunPlan } from "../schemas/index.js";
import { createHarness, discoverHarnesses, type HarnessName } from "../harnesses/index.js";
import { generateRunId } from "../lib/run-id.js";
import { logger } from "../lib/logger.js";

/**
 * Discovers available models from Ollama.
 * All harnesses use Ollama as the backend, so models are shared.
 *
 * @param ollamaBaseUrl - Ollama API base URL
 * @param timeoutMs - Request timeout
 * @returns Array of model names
 */
async function discoverModels(
	ollamaBaseUrl: string,
	timeoutMs: number,
): Promise<string[]> {
	const harness = createHarness("ollama", {
		ollamaBaseUrl,
		defaultTimeoutMs: timeoutMs,
	});

	// Check if Ollama is available
	const available = await harness.ping();
	if (!available) {
		throw new Error(
			`Ollama is not reachable at ${ollamaBaseUrl}. Is it running? Try: ollama serve`,
		);
	}

	const models = await harness.listModels();
	if (models.length === 0) {
		throw new Error(
			"No models found in Ollama. Pull a model first: ollama pull llama3.2:3b",
		);
	}

	return models;
}

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
 * @throws {Error} If Ollama is unavailable or no models/tests found
 */
export async function buildRunPlan(config: BenchConfig): Promise<RunPlan> {
	const runId = generateRunId();
	const log = logger.child({ runId });

	log.info("Building run plan...");

	// Discover models if not specified (from Ollama, shared by all harnesses)
	let models = config.models;
	if (models.length === 0) {
		log.info("Auto-discovering models from Ollama...");
		models = await discoverModels(config.ollamaBaseUrl, config.generateTimeoutMs);
		log.info({ models }, `Found ${models.length} model(s)`);
	}

	// Discover tests if not specified
	let tests = config.tests;
	if (tests.length === 0) {
		log.info("Auto-discovering tests from src/tests/...");
		tests = discoverTests();
		log.info({ tests }, `Found ${tests.length} test(s)`);
	}

	// Discover available harnesses
	const availableHarnesses = await discoverHarnesses({
		ollamaBaseUrl: config.ollamaBaseUrl,
		timeoutMs: config.generateTimeoutMs,
	});

	// Auto-discover all harnesses if not specified, otherwise validate requested ones
	let harnesses = config.harnesses;
	if (harnesses.length === 0) {
		log.info("Auto-discovering harnesses...");
		harnesses = availableHarnesses;
		log.info({ harnesses }, `Found ${harnesses.length} harness(es)`);
	} else {
		// Validate that requested harnesses are available
		const unavailable = harnesses.filter(
			(h) => !availableHarnesses.includes(h as HarnessName),
		);
		if (unavailable.length > 0) {
			throw new Error(
				`Harnesses not available: ${unavailable.join(", ")}. ` +
					`Available: ${availableHarnesses.join(", ")}`,
			);
		}
		log.info({ harnesses }, `Using ${harnesses.length} harness(es)`);
	}

	// Build matrix items
	const items: MatrixItem[] = [];
	let itemIndex = 0;

	for (const model of models) {
		for (const harness of harnesses) {
			for (const test of tests) {
				for (const passType of config.passTypes) {
					itemIndex++;
					items.push({
						id: String(itemIndex).padStart(2, "0"),
						model,
						harness,
						test,
						passType,
					});
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
		schemaVersion: "0.1.0",
		runId,
		createdAt: new Date().toISOString(),
		environment: {
			platform: os.platform(),
			bunVersion: getBunVersion(),
			hostname: os.hostname(),
		},
		config: {
			ollamaBaseUrl: config.ollamaBaseUrl,
			generateTimeoutMs: config.generateTimeoutMs,
			passTypes: config.passTypes,
		},
		items,
		summary: {
			totalItems: items.length,
			models: models.length,
			harnesses: harnesses.length,
			tests: tests.length,
		},
	};

	return plan;
}
