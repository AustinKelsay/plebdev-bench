/**
 * Purpose: Validate machine profile resolution and anonymous ID behavior.
 */

import { describe, expect, it } from "vitest";
import {
	MACHINE_ID_ENV_VAR,
	MACHINE_LABEL_ENV_VAR,
	collectMachineProfile,
} from "../src/lib/hardware-profile.js";
import type { HardwareProfile } from "../src/schemas/index.js";

const TEST_HARDWARE: HardwareProfile = {
	platform: "darwin",
	arch: "arm64",
	osRelease: "24.3.0",
	cpuModel: "Apple M4 Pro",
	logicalCores: 14,
	totalMemoryBytes: 68_719_476_736,
};

describe("hardware profile resolution", () => {
	it("uses explicit config machine ID and label when provided", () => {
		const resolved = collectMachineProfile({
			machineProfileId: "mac-mini-lab",
			machineLabel: "Mac Mini Lab",
			hardwareProfile: TEST_HARDWARE,
			env: {},
		});

		expect(resolved.machine.profileId).toBe("mac-mini-lab");
		expect(resolved.machine.label).toBe("Mac Mini Lab");
		expect(resolved.identitySource).toBe("config");
		expect(resolved.isAnonymous).toBe(false);
	});

	it("falls back to environment machine ID when config is absent", () => {
		const resolved = collectMachineProfile({
			hardwareProfile: TEST_HARDWARE,
			env: {
				[MACHINE_ID_ENV_VAR]: "env-machine",
				[MACHINE_LABEL_ENV_VAR]: "Env Machine",
			},
		});

		expect(resolved.machine.profileId).toBe("env-machine");
		expect(resolved.machine.label).toBe("Env Machine");
		expect(resolved.identitySource).toBe("env");
		expect(resolved.isAnonymous).toBe(false);
	});

	it("generates deterministic anonymous IDs when explicit IDs are missing", () => {
		const first = collectMachineProfile({
			hardwareProfile: TEST_HARDWARE,
			env: {},
		});
		const second = collectMachineProfile({
			hardwareProfile: TEST_HARDWARE,
			env: {},
		});

		expect(first.machine.profileId).toMatch(/^anon_[a-f0-9]{12}$/);
		expect(first.machine.profileId).toBe(second.machine.profileId);
		expect(first.identitySource).toBe("anonymous");
		expect(first.isAnonymous).toBe(true);
	});
});
