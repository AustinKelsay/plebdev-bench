/**
 * Purpose: Validate deterministic benchmark checkpoint computation.
 * Exports: none
 *
 * Invariants:
 * - Temporary benchmark roots include the full required checkpoint asset surface
 * - Tests remain deterministic and isolated via per-test temp directories
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	collectBenchmarkAssetPaths,
	computeBenchmarkCheckpoint,
} from "../src/lib/benchmark-checkpoint.js";

const tempRoots: string[] = [];
const REQUIRED_LIB_ASSETS = [
	"benchmark-checkpoint.ts",
	"scorer.ts",
	"scorer-core.ts",
	"scorer-worker.ts",
	"scoring-spec.ts",
	"code-extractor.ts",
	"stdout-suppressor.ts",
	"test-catalog.ts",
	"timeout.ts",
	"tool-smoke.ts",
	"failure-classifier.ts",
	"model-aliases.ts",
	"ollama-client.ts",
	"openai-compat-client.ts",
	"openrouter-client.ts",
] as const;

const REQUIRED_SOURCE_DIR_FIXTURES = [
	["src/harnesses", "direct-adapter.ts", "export const directAdapter = 1;\n"],
	["src/runtimes", "ollama-runtime.ts", "export const ollamaRuntime = 1;\n"],
	["src/runner", "index.ts", "export const runnerIndex = 1;\n"],
] as const;

/**
 * Creates a temporary benchmark root with minimal required benchmark assets.
 *
 * @returns Temporary root path
 */
function createBenchmarkRoot(): string {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "plebdev-bench-checkpoint-"),
	);
	tempRoots.push(root);

	const testRoot = path.join(root, "src", "tests", "smoke");
	fs.mkdirSync(testRoot, { recursive: true });
	fs.writeFileSync(
		path.join(testRoot, "test.meta.json"),
		JSON.stringify({ schemaVersion: 1, category: "coding" }, null, 2),
	);
	fs.writeFileSync(path.join(testRoot, "prompt.blind.md"), "blind prompt");
	fs.writeFileSync(
		path.join(testRoot, "prompt.informed.md"),
		"informed prompt",
	);
	fs.writeFileSync(path.join(testRoot, "rubric.md"), "rubric");
	fs.writeFileSync(
		path.join(testRoot, "scoring.spec.ts"),
		"export const spec = {};",
	);

	const libRoot = path.join(root, "src", "lib");
	fs.mkdirSync(libRoot, { recursive: true });
	for (const filename of REQUIRED_LIB_ASSETS) {
		const exportName = filename.replaceAll(/[^a-zA-Z0-9]+/g, "_");
		fs.writeFileSync(
			path.join(libRoot, filename),
			`export const ${exportName} = ${JSON.stringify(filename)};\n`,
		);
	}

	for (const [dirPath, filename, content] of REQUIRED_SOURCE_DIR_FIXTURES) {
		const absoluteDir = path.join(root, dirPath);
		fs.mkdirSync(absoluteDir, { recursive: true });
		fs.writeFileSync(path.join(absoluteDir, filename), content);
	}

	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe("benchmark checkpoint", () => {
	it("computes deterministic checkpoint identifiers for unchanged assets", () => {
		const root = createBenchmarkRoot();
		const first = computeBenchmarkCheckpoint(root);
		const second = computeBenchmarkCheckpoint(root);

		expect(first.checkpointId).toBe(second.checkpointId);
		expect(first.manifestHash).toBe(second.manifestHash);
		expect(first.assetCount).toBe(second.assetCount);
		expect(first.assetCount).toBeGreaterThan(0);
	});

	it("changes manifest hash when benchmark-defining assets change", () => {
		const root = createBenchmarkRoot();
		const before = computeBenchmarkCheckpoint(root);

		const blindPromptPath = path.join(
			root,
			"src",
			"tests",
			"smoke",
			"prompt.blind.md",
		);
		fs.writeFileSync(blindPromptPath, "blind prompt updated");

		const after = computeBenchmarkCheckpoint(root);
		expect(after.manifestHash).not.toBe(before.manifestHash);
		expect(after.checkpointId).not.toBe(before.checkpointId);
	});

	it("changes manifest hash when harness implementation changes", () => {
		const root = createBenchmarkRoot();
		const before = computeBenchmarkCheckpoint(root);

		const harnessPath = path.join(
			root,
			"src",
			"harnesses",
			"direct-adapter.ts",
		);
		fs.writeFileSync(harnessPath, "export const directAdapter = 2;\n");

		const after = computeBenchmarkCheckpoint(root);
		expect(after.manifestHash).not.toBe(before.manifestHash);
		expect(after.checkpointId).not.toBe(before.checkpointId);
	});

	it("collects a deterministic sorted asset list", () => {
		const root = createBenchmarkRoot();
		const assets = collectBenchmarkAssetPaths(root);
		expect(assets).toEqual([...assets].sort((a, b) => a.localeCompare(b)));
		expect(assets).toContain("src/harnesses/direct-adapter.ts");
		expect(assets).toContain("src/lib/scorer.ts");
		expect(assets).toContain("src/tests/smoke/prompt.blind.md");
	});
});
