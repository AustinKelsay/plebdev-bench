/**
 * Purpose: Validate machine-instance path resolution from injected environments.
 * Exports: none
 *
 * Invariants:
 * - Injected environment paths take precedence over host home-directory defaults
 * - Platform-specific state directories remain deterministic for the same env inputs
 */

import { describe, expect, it } from "vitest";
import { resolveDefaultInstanceIdPath } from "../src/lib/machine-profile/instance-id.js";

describe("resolveDefaultInstanceIdPath", () => {
	it("prefers injected HOME on darwin", () => {
		expect(
			resolveDefaultInstanceIdPath("darwin", {
				HOME: "/tmp/test-home",
			}),
		).toBe(
			"/tmp/test-home/Library/Application Support/plebdev-bench/machine-instance-id",
		);
	});

	it("prefers injected LOCALAPPDATA on win32", () => {
		expect(
			resolveDefaultInstanceIdPath("win32", {
				LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
				USERPROFILE: "C:\\Users\\tester",
			}),
		).toContain("AppData");
	});

	it("prefers injected XDG_STATE_HOME on linux", () => {
		expect(
			resolveDefaultInstanceIdPath("linux", {
				HOME: "/tmp/test-home",
				XDG_STATE_HOME: "/tmp/state-home",
			}),
		).toBe("/tmp/state-home/plebdev-bench/machine-instance-id");
	});
});
