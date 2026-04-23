/**
 * Purpose: Regression tests for OpenCode CLI feature parsing and argv building.
 * Exports: OpenCode CLI helper test suite
 *
 * Invariants:
 * - Argv ordering is deterministic with flags before the positional prompt.
 * - Tests do not spawn OpenCode or mutate filesystem state.
 */

import { describe, expect, it } from "vitest";
import {
	buildOpenCodeRunArgs,
	isOpenCodeRunCompatible,
	parseOpenCodeRunFeatures,
} from "../src/harnesses/opencode-cli.js";

describe("OpenCode CLI helpers", () => {
	it("parses required and optional run flags from help text", () => {
		const features = parseOpenCodeRunFeatures(
			"--model model\n--format json\n--dir path\n--pure",
		);

		expect(isOpenCodeRunCompatible(features)).toBe(true);
		expect(features.supportsPure).toBe(true);
	});

	it("omits optional --pure when the installed CLI does not advertise it", () => {
		const args = buildOpenCodeRunArgs({
			prompt: "Do the task.",
			modelArg: "ollama/gpt-oss:20b",
			executionWorkspaceDir: "/tmp/workspace",
			features: {
				supportsModel: true,
				supportsFormat: true,
				supportsDir: true,
				supportsPure: false,
			},
		});

		expect(args).not.toContain("--pure");
		expect(args).toEqual([
			"run",
			"--model",
			"ollama/gpt-oss:20b",
			"--format",
			"json",
			"--log-level",
			"ERROR",
			"--dir",
			"/tmp/workspace",
			"Do the task.",
		]);
	});

	it("includes --pure when the installed CLI advertises it", () => {
		const args = buildOpenCodeRunArgs({
			prompt: "Do the task.",
			modelArg: "ollama/gpt-oss:20b",
			executionWorkspaceDir: "/tmp/workspace",
			features: {
				supportsModel: true,
				supportsFormat: true,
				supportsDir: true,
				supportsPure: true,
			},
		});

		expect(args).toContain("--pure");
		expect(args).toEqual([
			"run",
			"--model",
			"ollama/gpt-oss:20b",
			"--format",
			"json",
			"--log-level",
			"ERROR",
			"--pure",
			"--dir",
			"/tmp/workspace",
			"Do the task.",
		]);
	});
});
