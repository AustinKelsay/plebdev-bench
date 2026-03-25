/**
 * Purpose: Linux-specific accelerator probing and parsing.
 * Exports: parseNvidiaAccelerators, parseRocmAccelerators, parseLspciAccelerators, collectLinuxAccelerators
 *
 * Invariants:
 * - Successful probes prefer vendor-specific tools before generic PCI fallback
 * - Deduped outputs preserve repeated-device counts
 */

import type { HardwareProfile, ObservedAccelerator } from "../../schemas/index.js";
import {
	BYTES_PER_MIB,
	dedupeAccelerators,
	parsePositiveInt,
	runProbe,
} from "./probe-utils.js";

/**
 * Extracts accelerator entries from `nvidia-smi` CSV output.
 *
 * @param stdout - Raw `nvidia-smi` stdout
 * @returns Observed accelerator list
 */
export function parseNvidiaAccelerators(stdout: string): ObservedAccelerator[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const [modelRaw, memoryMiB] = line.split(",").map((part) => part.trim());
			const memoryValue = parsePositiveInt(memoryMiB);
			const memoryBytes =
				memoryValue !== undefined ? memoryValue * BYTES_PER_MIB : undefined;
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
export function parseRocmAccelerators(stdout: string): ObservedAccelerator[] {
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
export function parseLspciAccelerators(stdout: string): ObservedAccelerator[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /(vga|3d|display)/i.test(line))
		.map((line) => ({
			modelRaw: line.replace(/^[0-9a-fA-F:.]+\s+[^:]+:\s*/, ""),
			kind: "unknown" as const,
		}));
}

/**
 * Collects accelerators on Linux using available vendor utilities.
 *
 * @returns Accelerator data plus detection status
 */
export async function collectLinuxAccelerators(): Promise<{
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

	const lspci = await runProbe("lspci", []);
	if (lspci) {
		probeCount++;
		accelerators.push(...parseLspciAccelerators(lspci));
	}

	const dedupedAccelerators = dedupeAccelerators(accelerators);
	const hasCorroboratedAccelerators = accelerators.some(
		(accelerator) =>
			accelerator.backend !== undefined || accelerator.vendor !== undefined,
	);

	if (dedupedAccelerators.length > 0 && hasCorroboratedAccelerators) {
		return {
			accelerators: dedupedAccelerators,
			status: { status: "detected" },
		};
	}
	if (dedupedAccelerators.length > 0) {
		return {
			accelerators: [],
			status: { status: "none_detected" },
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
