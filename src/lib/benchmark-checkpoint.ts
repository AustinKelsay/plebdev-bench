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

/** Shared scoring pipeline assets that affect benchmark behavior. */
const SCORING_PIPELINE_ASSETS = [
	"src/lib/scorer.ts",
	"src/lib/scorer-core.ts",
	"src/lib/scorer-worker.ts",
	"src/lib/scoring-spec.ts",
	"src/lib/code-extractor.ts",
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

	for (const relPath of SCORING_PIPELINE_ASSETS) {
		const absolutePath = path.join(rootDir, relPath);
		if (!fs.existsSync(absolutePath)) {
			throw new Error(
				`Required benchmark pipeline asset missing: ${absolutePath}`,
			);
		}
		assets.push(normalizeRelativePath(relPath));
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
