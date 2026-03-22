/**
 * Purpose: Validate machine profile resolution and anonymous ID behavior.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { collectMachineProfile } from "../src/lib/hardware-profile.js";
import type { HardwareProfile } from "../src/schemas/index.js";

const MACHINE_DISPLAY_LABEL_ENV_VAR = "BENCH_MACHINE_DISPLAY_LABEL";
const MACHINE_INSTANCE_ID_ENV_VAR = "BENCH_MACHINE_INSTANCE_ID";

const TEST_HARDWARE: HardwareProfile = {
	platform: "darwin",
	arch: "arm64",
	osRelease: "24.3.0",
	cpuModelRaw: "Apple M4 Pro",
	logicalCores: 14,
	totalMemoryBytes: 68_719_476_736,
	accelerators: [
		{
			vendor: "Apple",
			modelRaw: "Apple M4 Pro GPU",
			kind: "integrated",
			backend: "metal",
		},
	],
	acceleratorDetection: {
		status: "detected",
	},
};

describe("hardware profile resolution", () => {
	it("uses explicit config machine ID and label when provided", async () => {
		const resolved = await collectMachineProfile({
			machineInstanceId: "machine-inst-a",
			machineDisplayLabel: "Mac Mini Lab",
			observedHardware: TEST_HARDWARE,
			env: {},
		});

		expect(resolved.machine.instanceId).toBe("machine-inst-a");
		expect(resolved.machine.displayLabel).toBe("Mac Mini Lab");
		expect(resolved.machine.profileKey).toContain("apple");
		expect(resolved.identitySource).toBe("config");
		expect(resolved.isAnonymous).toBe(false);
	});

	it("falls back to environment machine ID when config is absent", async () => {
		const resolved = await collectMachineProfile({
			observedHardware: TEST_HARDWARE,
			env: {
				[MACHINE_INSTANCE_ID_ENV_VAR]: "env-machine",
				[MACHINE_DISPLAY_LABEL_ENV_VAR]: "Env Machine",
			},
		});

		expect(resolved.machine.instanceId).toBe("env-machine");
		expect(resolved.machine.displayLabel).toBe("Env Machine");
		expect(resolved.identitySource).toBe("env");
		expect(resolved.isAnonymous).toBe(false);
	});

	it("generates stable local instance IDs when explicit IDs are missing", async () => {
		const instanceIdFilePath = path.join(
			os.tmpdir(),
			`plebdev-bench-machine-instance-id-${randomUUID()}.test`,
		);
		try {
			const first = await collectMachineProfile({
				observedHardware: TEST_HARDWARE,
				instanceIdFilePath,
				env: {},
			});
			const second = await collectMachineProfile({
				observedHardware: TEST_HARDWARE,
				instanceIdFilePath,
				env: {},
			});

			expect(first.machine.instanceId).toMatch(/^inst_[a-f0-9]{32}$/);
			expect(first.machine.instanceId).toBe(second.machine.instanceId);
			expect(first.identitySource).toBe("generated");
			expect(first.isAnonymous).toBe(true);
		} finally {
			fs.rmSync(instanceIdFilePath, { force: true });
		}
	});
});
