/**
 * Purpose: Collect observed hardware metadata across supported platforms.
 * Exports: collectObservedHardwareProfile
 *
 * Invariants:
 * - Core CPU/memory facts come from stable runtime APIs when possible
 * - Optional accelerator probes never silently masquerade as "none detected"
 */

import * as os from "node:os";
import type { HardwareProfile } from "../../schemas/index.js";
import { collectLinuxAccelerators } from "./probe-linux.js";
import { collectMacosAccelerators } from "./probe-macos.js";
import { parsePositiveInt, runProbe } from "./probe-utils.js";
import { collectWindowsAccelerators } from "./probe-windows.js";

/**
 * Collects observed hardware for the current machine.
 *
 * @returns Observed hardware profile
 * @throws {Error} If CPU metadata is unavailable
 */
export async function collectObservedHardwareProfile(): Promise<HardwareProfile> {
	const cpus = os.cpus();
	if (cpus.length === 0) {
		throw new Error(
			"Unable to collect hardware profile: os.cpus() returned empty",
		);
	}

	const platform = os.platform();
	const baseProfile = {
		platform,
		arch: os.arch(),
		osRelease: os.release(),
		cpuModelRaw: cpus[0].model,
		logicalCores: cpus.length,
		totalMemoryBytes: os.totalmem(),
	};

	if (platform === "darwin") {
		const physicalCores = parsePositiveInt(
			await runProbe("sysctl", ["-n", "hw.physicalcpu"]),
		);
		const acceleratorProbe = await collectMacosAccelerators();
		return {
			...baseProfile,
			...(physicalCores ? { physicalCores } : {}),
			accelerators: acceleratorProbe.accelerators,
			acceleratorDetection: acceleratorProbe.status,
		};
	}

	if (platform === "linux") {
		const lscpuJson = await runProbe("lscpu", ["-J"]);
		let physicalCores: number | undefined;
		if (lscpuJson) {
			try {
				const parsed = JSON.parse(lscpuJson) as {
					lscpu?: Array<{ field?: string; data?: string }>;
				};
				const coresPerSocket = parsed.lscpu?.find((entry) =>
					entry.field?.startsWith("Core(s) per socket"),
				)?.data;
				const sockets = parsed.lscpu?.find((entry) =>
					entry.field?.startsWith("Socket(s)"),
				)?.data;
				const cores = parsePositiveInt(coresPerSocket);
				const socketCount = parsePositiveInt(sockets);
				if (cores && socketCount) {
					physicalCores = cores * socketCount;
				}
			} catch {
				physicalCores = undefined;
			}
		}
		const acceleratorProbe = await collectLinuxAccelerators();
		return {
			...baseProfile,
			...(physicalCores ? { physicalCores } : {}),
			accelerators: acceleratorProbe.accelerators,
			acceleratorDetection: acceleratorProbe.status,
		};
	}

	if (platform === "win32") {
		const systemJson = await runProbe("powershell", [
			"-NoProfile",
			"-Command",
			"Get-CimInstance Win32_Processor | Select-Object NumberOfCores | ConvertTo-Json -Compress",
		]);
		let physicalCores: number | undefined;
		if (systemJson) {
			try {
				const parsed = JSON.parse(systemJson) as
					| { NumberOfCores?: number }
					| Array<{ NumberOfCores?: number }>;
				const entries = Array.isArray(parsed) ? parsed : [parsed];
				const total = entries.reduce((sum, entry) => {
					const cores = entry?.NumberOfCores;
					return sum + (typeof cores === "number" && cores > 0 ? cores : 0);
				}, 0);
				if (total > 0) {
					physicalCores = total;
				}
			} catch {
				physicalCores = undefined;
			}
		}
		const acceleratorProbe = await collectWindowsAccelerators();
		return {
			...baseProfile,
			...(physicalCores ? { physicalCores } : {}),
			accelerators: acceleratorProbe.accelerators,
			acceleratorDetection: acceleratorProbe.status,
		};
	}

	return {
		...baseProfile,
		accelerators: [],
		acceleratorDetection: {
			status: "unavailable",
			detail: `unsupported platform ${platform}`,
		},
	};
}
