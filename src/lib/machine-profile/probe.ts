/**
 * Purpose: Collect observed hardware metadata across supported platforms.
 * Exports: collectObservedHardwareProfile
 *
 * Invariants:
 * - Core CPU/memory facts come from stable runtime APIs when possible
 * - Optional accelerator probes never silently masquerade as "none detected"
 */

import { execa } from "execa";
import * as os from "node:os";
import type { HardwareProfile, ObservedAccelerator } from "../../schemas/index.js";

const PROBE_TIMEOUT_MS = 8_000;
const BYTES_PER_MIB = 1024 ** 2;
const BYTES_PER_GIB = 1024 ** 3;

/**
 * Attempts to execute a command and returns trimmed stdout on success.
 *
 * @param command - Command name
 * @param args - Command arguments
 * @returns Stdout text when the command succeeds
 */
async function runProbe(
	command: string,
	args: string[],
): Promise<string | undefined> {
	try {
		const result = await execa(command, args, {
			timeout: PROBE_TIMEOUT_MS,
			reject: false,
		});
		if (result.exitCode !== 0) {
			return undefined;
		}
		const stdout = result.stdout.trim();
		return stdout.length > 0 ? stdout : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Parses a numeric CPU-core probe result.
 *
 * @param value - Raw probe stdout
 * @returns Positive integer when valid
 */
function parsePositiveInt(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value.trim(), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Parses a memory string such as `8 GB` or `8192 MB`.
 *
 * @param value - Raw memory string
 * @returns Memory in bytes when parsable
 */
function parseMemoryBytes(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const normalized = value.trim().replace(/,/g, "");
	const match = normalized.match(/(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|b)?/i);
	if (!match) return undefined;
	const amount = Number.parseFloat(match[1]);
	const unit = (match[2] ?? "b").toLowerCase();
	if (!Number.isFinite(amount) || amount <= 0) return undefined;
	switch (unit) {
		case "tb":
			return Math.round(amount * 1024 * BYTES_PER_GIB);
		case "gb":
			return Math.round(amount * BYTES_PER_GIB);
		case "mb":
			return Math.round(amount * BYTES_PER_MIB);
		case "kb":
			return Math.round(amount * 1024);
		default:
			return Math.round(amount);
	}
}

/**
 * Extracts GPU entries from a `system_profiler` display payload.
 *
 * @param rawJson - Raw JSON output
 * @returns Observed accelerator list
 */
function parseMacosAccelerators(rawJson: string): ObservedAccelerator[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return [];
	}
	if (!Array.isArray((parsed as { SPDisplaysDataType?: unknown }).SPDisplaysDataType)) {
		return [];
	}
	const displays = (parsed as { SPDisplaysDataType: Array<Record<string, unknown>> })
		.SPDisplaysDataType;
	return displays
		.flatMap((entry): ObservedAccelerator[] => {
			const modelRaw =
				(typeof entry.sppci_model === "string" && entry.sppci_model) ||
				(typeof entry._name === "string" && entry._name) ||
				(typeof entry.spdisplays_vendor === "string" &&
				typeof entry.spdisplays_ndrvs === "string"
					? `${entry.spdisplays_vendor} ${entry.spdisplays_ndrvs}`
					: undefined);
			if (!modelRaw) return [];
			const memoryBytes =
				parseMemoryBytes(
					typeof entry.spdisplays_vram === "string"
						? entry.spdisplays_vram
						: undefined,
				) ??
				parseMemoryBytes(
					typeof entry.spdisplays_vram_shared === "string"
						? entry.spdisplays_vram_shared
						: undefined,
				);
			const hasPciMetadata =
				typeof entry.sppci_bus === "string" ||
				typeof entry.spdisplays_pcie_lane_width === "string";
			const vendor =
				typeof entry.spdisplays_vendor === "string"
					? entry.spdisplays_vendor
					: undefined;
			const kind =
				hasPciMetadata
					? ("discrete" as const)
					: vendor?.toLowerCase().includes("apple") ||
							modelRaw.toLowerCase().includes("apple")
						? ("integrated" as const)
						: ("unknown" as const);
			return [
				{
					modelRaw,
					...(vendor ? { vendor } : {}),
					...(memoryBytes ? { memoryBytes } : {}),
					kind,
					backend: "metal",
				},
			];
		});
}

/**
 * Extracts accelerator entries from `nvidia-smi` CSV output.
 *
 * @param stdout - Raw `nvidia-smi` stdout
 * @returns Observed accelerator list
 */
function parseNvidiaAccelerators(stdout: string): ObservedAccelerator[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const [modelRaw, memoryMiB] = line.split(",").map((part) => part.trim());
			const memoryBytes = parsePositiveInt(memoryMiB)
				? Number.parseInt(memoryMiB, 10) * BYTES_PER_MIB
				: undefined;
			return {
				vendor: "NVIDIA",
				modelRaw,
				...(memoryBytes ? { memoryBytes } : {}),
				kind: "discrete" as const,
				backend: "cuda",
			};
		});
}

/**
 * Extracts accelerator entries from `rocm-smi` output.
 *
 * @param stdout - Raw `rocm-smi` output
 * @returns Observed accelerator list
 */
function parseRocmAccelerators(stdout: string): ObservedAccelerator[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /product\s*name/i.test(line))
		.map((line) => ({
			vendor: "AMD",
			modelRaw: line.replace(/^[^:]+:\s*/, ""),
			kind: "discrete" as const,
			backend: "rocm",
		}));
}

/**
 * Extracts accelerator entries from `lspci` output.
 *
 * @param stdout - Raw `lspci` stdout
 * @returns Observed accelerator list
 */
function parseLspciAccelerators(stdout: string): ObservedAccelerator[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /(vga|3d|display)/i.test(line))
		.map((line) => ({
			modelRaw: line.replace(
				/^[0-9a-fA-F:.]+\s+[^:]+:\s*/,
				"",
			),
			kind: "unknown" as const,
		}));
}

/**
 * Extracts accelerator entries from Windows PowerShell JSON.
 *
 * @param rawJson - Raw PowerShell JSON
 * @returns Observed accelerator list
 */
function parseWindowsAccelerators(rawJson: string): ObservedAccelerator[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return [];
	}
	const entries = Array.isArray(parsed) ? parsed : [parsed];
	return entries
		.flatMap((entry): ObservedAccelerator[] => {
			if (
				typeof (entry as { Name?: unknown }).Name !== "string" ||
				(entry as { Name: string }).Name.trim().length === 0
			) {
				return [];
			}
			const name = (entry as { Name: string }).Name.trim();
			const adapterRam = (entry as { AdapterRAM?: unknown }).AdapterRAM;
			const memoryBytes =
				typeof adapterRam === "number" && adapterRam > 0 ? adapterRam : undefined;
			return [
				{
					modelRaw: name,
					...(memoryBytes ? { memoryBytes } : {}),
					kind: "unknown" as const,
				},
			];
		});
}

/**
 * Collects accelerators on macOS.
 *
 * @returns Accelerator data plus detection status
 */
async function collectMacosAccelerators(): Promise<{
	accelerators: ObservedAccelerator[];
	status: HardwareProfile["acceleratorDetection"];
}> {
	const displaysJson = await runProbe("system_profiler", [
		"SPDisplaysDataType",
		"-json",
	]);
	if (!displaysJson) {
		return {
			accelerators: [],
			status: {
				status: "unavailable",
				detail: "system_profiler SPDisplaysDataType probe unavailable",
			},
		};
	}
	const accelerators = parseMacosAccelerators(displaysJson);
	return {
		accelerators,
		status: {
			status: accelerators.length > 0 ? "detected" : "none_detected",
		},
	};
}

/**
 * Collects accelerators on Linux using available vendor utilities.
 *
 * @returns Accelerator data plus detection status
 */
async function collectLinuxAccelerators(): Promise<{
	accelerators: ObservedAccelerator[];
	status: HardwareProfile["acceleratorDetection"];
}> {
	const accelerators: ObservedAccelerator[] = [];
	let probeCount = 0;

	const nvidia = await runProbe("nvidia-smi", [
		"--query-gpu=name,memory.total",
		"--format=csv,noheader,nounits",
	]);
	if (nvidia) {
		probeCount++;
		accelerators.push(...parseNvidiaAccelerators(nvidia));
	}

	const rocm = await runProbe("rocm-smi", ["--showproductname"]);
	if (rocm) {
		probeCount++;
		accelerators.push(...parseRocmAccelerators(rocm));
	}

	if (accelerators.length === 0) {
		const lspci = await runProbe("lspci", []);
		if (lspci) {
			probeCount++;
			accelerators.push(...parseLspciAccelerators(lspci));
		}
	}

	if (accelerators.length > 0) {
		return {
			accelerators,
			status: { status: "detected" },
		};
	}
	if (probeCount === 0) {
		return {
			accelerators: [],
			status: {
				status: "unavailable",
				detail: "no Linux accelerator probe command was available",
			},
		};
	}
	return {
		accelerators: [],
		status: { status: "none_detected" },
	};
}

/**
 * Collects accelerators on Windows via PowerShell CIM queries.
 *
 * @returns Accelerator data plus detection status
 */
async function collectWindowsAccelerators(): Promise<{
	accelerators: ObservedAccelerator[];
	status: HardwareProfile["acceleratorDetection"];
}> {
	const json = await runProbe("powershell", [
		"-NoProfile",
		"-Command",
		"Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
	]);
	if (!json) {
		return {
			accelerators: [],
			status: {
				status: "unavailable",
				detail: "Windows video-controller probe unavailable",
			},
		};
	}
	const accelerators = parseWindowsAccelerators(json);
	return {
		accelerators,
		status: {
			status: accelerators.length > 0 ? "detected" : "none_detected",
		},
	};
}

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
