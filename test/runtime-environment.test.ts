/**
 * Purpose: Validate Runtime Environment tool-version provenance.
 * Exports: none
 *
 * Invariants:
 * - Tool versions belong to Runtime Environment, not Harness identity or Machine Profile.
 * - Missing optional tool probes are explicit unavailable records.
 */

import { describe, expect, it, vi } from "vitest";
import { collectRuntimeEnvironment } from "../src/lib/runtime-environment.js";
import {
	RunPlanSchema,
	RunResultSchema,
	RuntimeToolVersionSchema,
	SCHEMA_VERSION,
} from "../src/schemas/index.js";

const runExecFileMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/exec.js", () => ({
	runExecFile: runExecFileMock,
}));

describe("Runtime Environment tool versions", () => {
	it("records available and unavailable tool probes in run-plan metadata", async () => {
		runExecFileMock.mockImplementation(async (command: string) => {
			if (command === "ollama") {
				return { stdout: "ollama version is 0.9.1", stderr: "", exitCode: 0 };
			}
			if (command === "hermes") {
				return { stdout: "hermes 1.2.3", stderr: "", exitCode: 0 };
			}
			return { stdout: "", stderr: "not found", exitCode: 127 };
		});

		const runtimeEnvironment = await collectRuntimeEnvironment({
			platform: "darwin",
			bunVersion: "1.3.3",
			toolNames: ["ollama", "goose", "hermes"],
		});

		expect(runtimeEnvironment.toolVersions).toEqual({
			ollama: { status: "detected", version: "0.9.1" },
			goose: { status: "unavailable", detail: "not found" },
			hermes: { status: "detected", version: "1.2.3" },
		});
		expect(
			RunPlanSchema.parse({
				schemaVersion: SCHEMA_VERSION,
				runId: "run-123",
				createdAt: "2026-05-19T10:00:00.000Z",
				runtimeEnvironment,
				config: {
					ollamaBaseUrl: "http://localhost:11434",
					generateTimeoutMs: 120_000,
					passTypes: ["blind"],
				},
				items: [],
				summary: {
					totalItems: 0,
					runtimes: 0,
					models: 0,
					harnesses: 0,
					tests: 0,
				},
			}).runtimeEnvironment?.toolVersions?.ollama?.version,
		).toBe("0.9.1");
		expect(
			RunResultSchema.parse({
				schemaVersion: SCHEMA_VERSION,
				runId: "run-123",
				runtimeEnvironment,
				startedAt: "2026-05-19T10:00:00.000Z",
				completedAt: "2026-05-19T10:01:00.000Z",
				durationMs: 60_000,
				summary: { total: 0, completed: 0, failed: 0, pending: 0 },
				items: [],
			}).runtimeEnvironment?.toolVersions?.goose?.status,
		).toBe("unavailable");
	});

	it("rejects tool-version records without status-specific evidence", () => {
		expect(() =>
			RuntimeToolVersionSchema.parse({ status: "detected" }),
		).toThrow();
		expect(() =>
			RuntimeToolVersionSchema.parse({ status: "unavailable" }),
		).toThrow();
	});
});
