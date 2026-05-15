/**
 * Purpose: Windows-specific accelerator probing and parsing.
 * Exports: parseWindowsAccelerators, collectWindowsAccelerators
 *
 * Invariants:
 * - Successful probes use PowerShell CIM queries
 * - Probe failures return explicit unavailable status details
 */

import type {
	HardwareProfile,
	ObservedAccelerator,
} from "../../schemas/index.js";
import { runProbe } from "./probe-utils.js";

/**
 * Extracts accelerator entries from Windows PowerShell JSON.
 *
 * @param rawJson - Raw PowerShell JSON
 * @returns Observed accelerator list
 * @throws {Error} When the probe JSON is malformed
 */
export function parseWindowsAccelerators(
	rawJson: string,
): ObservedAccelerator[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch (error) {
		throw new Error(
			`malformed Windows accelerator probe JSON: ${(error as Error).message}`,
		);
	}
	const entries = Array.isArray(parsed) ? parsed : [parsed];
	if (!entries.every((entry) => typeof entry === "object" && entry !== null)) {
		throw new Error(
			"malformed Windows accelerator probe JSON: expected object or object array",
		);
	}
	return entries.flatMap((entry): ObservedAccelerator[] => {
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
 * Collects accelerators on Windows via PowerShell CIM queries.
 *
 * @returns Accelerator data plus detection status
 */
export async function collectWindowsAccelerators(): Promise<{
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
	try {
		const accelerators = parseWindowsAccelerators(json);
		return {
			accelerators,
			status: {
				status: accelerators.length > 0 ? "detected" : "none_detected",
			},
		};
	} catch (error) {
		return {
			accelerators: [],
			status: {
				status: "unavailable",
				detail: (error as Error).message,
			},
		};
	}
}
