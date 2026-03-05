/**
 * Purpose: Validate deterministic benchmark checkpoint computation.
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
	fs.writeFileSync(path.join(libRoot, "scorer.ts"), "export const scorer = 1;");
	fs.writeFileSync(
		path.join(libRoot, "scorer-core.ts"),
		"export const scorerCore = 1;",
	);
	fs.writeFileSync(
		path.join(libRoot, "scorer-worker.ts"),
		"export const scorerWorker = 1;",
	);
	fs.writeFileSync(
		path.join(libRoot, "scoring-spec.ts"),
		"export const spec = 1;",
	);
	fs.writeFileSync(
		path.join(libRoot, "code-extractor.ts"),
		"export const code = 1;",
	);

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

	it("collects a deterministic sorted asset list", () => {
		const root = createBenchmarkRoot();
		const assets = collectBenchmarkAssetPaths(root);
		expect(assets).toEqual([...assets].sort((a, b) => a.localeCompare(b)));
		expect(assets).toContain("src/lib/scorer.ts");
		expect(assets).toContain("src/tests/smoke/prompt.blind.md");
	});
});
