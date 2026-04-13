/**
 * Purpose: Compute deterministic benchmark checkpoint metadata from benchmark-defining assets.
 * Exports: computeBenchmarkCheckpoint, collectBenchmarkAssetPaths, buildBenchmarkManifest
 *
 * Invariants:
 * - Asset list is deterministic (sorted by normalized relative path)
 * - Missing required benchmark assets are treated as configuration/programmer errors
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BenchmarkCheckpoint } from "../schemas/index.js";

/** Checkpoint algorithm identifier. */
const CHECKPOINT_ALGORITHM = "sha256v1";

/** Required benchmark asset filenames under each test directory. */
const REQUIRED_TEST_ASSETS = [
	"test.meta.json",
	"prompt.blind.md",
	"prompt.informed.md",
] as const;

/** Optional benchmark asset filenames under each test directory. */
const OPTIONAL_TEST_ASSETS = ["rubric.md", "scoring.spec.ts"] as const;

/** Benchmark-core library assets that affect execution, scoring, or evaluation semantics. */
const CORE_BENCHMARK_LIB_ASSETS = [
	"src/lib/benchmark-checkpoint.ts",
	"src/lib/scorer.ts",
	"src/lib/scorer-core.ts",
	"src/lib/code-module-scorer.ts",
	"src/lib/scorer-worker.ts",
	"src/lib/scoring-spec.ts",
	"src/lib/workspace-scorer.ts",
	"src/lib/workspace-manifest.ts",
	"src/lib/test-workspace.ts",
	"src/lib/signal-assessment.ts",
	"src/lib/code-extractor.ts",
	"src/lib/stdout-suppressor.ts",
	"src/lib/test-catalog.ts",
	"src/lib/timeout.ts",
	"src/lib/tool-smoke.ts",
	"src/lib/failure-classifier.ts",
	"src/lib/model-aliases.ts",
	"src/lib/ollama-client.ts",
	"src/lib/openrouter-client.ts",
] as const;

/** Benchmark-core source directories whose implementation changes should roll the checkpoint. */
const CORE_BENCHMARK_SOURCE_DIRS = [
	"src/harnesses",
	"src/runtimes",
	"src/runner",
] as const;

/** Manifest entry for one benchmark-defining file. */
export interface BenchmarkManifestEntry {
	path: string;
	contentHash: string;
}

/** Manifest payload used to derive the checkpoint hash. */
export interface BenchmarkManifest {
	entries: BenchmarkManifestEntry[];
	manifestHash: string;
}

/**
 * Computes SHA-256 hash for a buffer.
 *
 * @param value - Buffer to hash
 * @returns Lowercase hex digest
 */
function hashBuffer(value: Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

/**
 * Computes SHA-256 hash for a string.
 *
 * @param value - String to hash
 * @returns Lowercase hex digest
 */
function hashString(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

/**
 * Normalizes a relative path to POSIX separators for deterministic hashing.
 *
 * @param relPath - Relative path to normalize
 * @returns Normalized path string
 */
function normalizeRelativePath(relPath: string): string {
	return relPath.split(path.sep).join("/");
}

/**
 * Recursively collects file paths beneath a benchmark-core source directory.
 *
 * @param rootDir - Project root
 * @param relDir - Relative directory path under the project root
 * @returns Sorted relative file paths under the directory
 * @throws {Error} If the source directory is missing
 */
function collectFilesUnderDirectory(rootDir: string, relDir: string): string[] {
	const absoluteDir = path.join(rootDir, relDir);
	if (!fs.existsSync(absoluteDir)) {
		throw new Error(`Required benchmark source directory missing: ${absoluteDir}`);
	}

	const collected: string[] = [];
	const stack = [absoluteDir];
	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) continue;
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			collected.push(
				normalizeRelativePath(path.relative(rootDir, absolutePath)),
			);
		}
	}

	collected.sort((a, b) => a.localeCompare(b));
	return collected;
}

/**
 * Lists benchmark-defining asset paths relative to the project root.
 *
 * @param rootDir - Project root containing `src/tests`
 * @returns Sorted relative file paths
 * @throws {Error} If required benchmark assets are missing
 */
export function collectBenchmarkAssetPaths(
	rootDir: string = process.cwd(),
): string[] {
	const testsRoot = path.join(rootDir, "src", "tests");
	if (!fs.existsSync(testsRoot)) {
		throw new Error(`Tests directory not found: ${testsRoot}`);
	}

	const assets: string[] = [];
	const testDirs = fs
		.readdirSync(testsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	for (const testDir of testDirs) {
		const testRoot = path.join(testsRoot, testDir);

		for (const filename of REQUIRED_TEST_ASSETS) {
			const absolutePath = path.join(testRoot, filename);
			if (!fs.existsSync(absolutePath)) {
				throw new Error(
					`Required benchmark asset missing for test "${testDir}": ${absolutePath}`,
				);
			}
			assets.push(normalizeRelativePath(path.relative(rootDir, absolutePath)));
		}

		for (const filename of OPTIONAL_TEST_ASSETS) {
			const absolutePath = path.join(testRoot, filename);
			if (fs.existsSync(absolutePath)) {
				assets.push(
					normalizeRelativePath(path.relative(rootDir, absolutePath)),
				);
			}
		}
	}

	for (const relPath of CORE_BENCHMARK_LIB_ASSETS) {
		const absolutePath = path.join(rootDir, relPath);
		if (!fs.existsSync(absolutePath)) {
			throw new Error(
				`Required benchmark pipeline asset missing: ${absolutePath}`,
			);
		}
		assets.push(normalizeRelativePath(relPath));
	}

	for (const relDir of CORE_BENCHMARK_SOURCE_DIRS) {
		assets.push(...collectFilesUnderDirectory(rootDir, relDir));
	}

	assets.sort((a, b) => a.localeCompare(b));

	if (assets.length === 0) {
		throw new Error("No benchmark-defining assets were discovered");
	}

	return assets;
}

/**
 * Builds a benchmark asset manifest and returns its hash.
 *
 * @param rootDir - Project root containing benchmark assets
 * @returns Manifest entries and manifest hash
 * @throws {Error} If any asset cannot be read
 */
export function buildBenchmarkManifest(
	rootDir: string = process.cwd(),
): BenchmarkManifest {
	const relativePaths = collectBenchmarkAssetPaths(rootDir);
	const entries: BenchmarkManifestEntry[] = relativePaths.map((relPath) => {
		const absolutePath = path.join(rootDir, relPath);
		const content = fs.readFileSync(absolutePath);
		return {
			path: normalizeRelativePath(relPath),
			contentHash: hashBuffer(content),
		};
	});

	const manifestPayload = entries
		.map((entry) => `${entry.path}:${entry.contentHash}`)
		.join("\n");
	const manifestHash = hashString(manifestPayload);
	return { entries, manifestHash };
}

/**
 * Computes benchmark checkpoint metadata for the current benchmark definition.
 *
 * @param rootDir - Project root containing benchmark assets
 * @returns Checkpoint metadata object
 * @throws {Error} If required benchmark assets are missing
 */
export function computeBenchmarkCheckpoint(
	rootDir: string = process.cwd(),
): BenchmarkCheckpoint {
	const manifest = buildBenchmarkManifest(rootDir);
	return {
		checkpointId: `chk_${CHECKPOINT_ALGORITHM}_${manifest.manifestHash.slice(0, 12)}`,
		algorithm: CHECKPOINT_ALGORITHM,
		manifestHash: manifest.manifestHash,
		assetCount: manifest.entries.length,
		computedAt: new Date().toISOString(),
	};
}
