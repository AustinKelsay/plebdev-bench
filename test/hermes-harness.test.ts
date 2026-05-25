/**
 * Purpose: Behavior tests for Hermes harness registration and discovery.
 * Exports: none
 *
 * Invariants:
 * - Hermes can be selected explicitly and discovered when its CLI probe passes.
 * - Tests exercise public harness APIs rather than adapter internals.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const execaMock = vi.hoisted(() => vi.fn());

vi.mock("execa", () => ({
	execa: execaMock,
}));

describe("Hermes harness registration", () => {
	beforeEach(() => {
		execaMock.mockReset();
		vi.resetModules();
	});

	it("creates a Hermes harness through the public factory", async () => {
		const { createHarness } = await import("../src/harnesses/index.js");

		const harness = createHarness("hermes");

		expect(harness.name).toBe("hermes");
	});

	it("uses the Hermes feature probe for explicit availability", async () => {
		execaMock.mockImplementation(async (command: string) => {
			if (command === "hermes") {
				return {
					stdout:
						"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
					stderr: "",
					exitCode: 0,
				};
			}
			throw Object.assign(new Error(`Unexpected command: ${command}`), {
				code: "ENOENT",
			});
		});
		const { isHarnessAvailable } = await import("../src/harnesses/index.js");

		await expect(isHarnessAvailable("hermes")).resolves.toBe(true);
	});

	it("includes compatible Hermes installs in default discovery", async () => {
		execaMock.mockImplementation(async (command: string, args: string[]) => {
			if (command === "which") {
				return { stdout: args[0], stderr: "", exitCode: 0 };
			}
			if (command === "opencode") {
				return {
					stdout: "--model --format --dir --log-level --pure",
					stderr: "",
					exitCode: 0,
				};
			}
			if (command === "hermes") {
				return {
					stdout:
						"--query --model --provider --toolsets --quiet --yolo --accept-hooks --max-turns",
					stderr: "",
					exitCode: 0,
				};
			}
			return { stdout: "", stderr: "", exitCode: 0 };
		});
		const { discoverHarnesses } = await import("../src/harnesses/index.js");

		const harnesses = await discoverHarnesses();

		expect(harnesses).toContain("direct");
		expect(harnesses).toContain("goose");
		expect(harnesses).toContain("hermes");
		expect(harnesses).toContain("opencode");
	});
});
