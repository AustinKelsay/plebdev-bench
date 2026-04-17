/**
 * Purpose: macOS-specific accelerator probing and parsing.
 * Exports: parseMacosAccelerators, collectMacosAccelerators
 *
 * Invariants:
 * - Successful probes use `system_profiler`
 * - Probe failures return explicit unavailable status details
 */

import type {
	HardwareProfile,
	ObservedAccelerator,
} from "../../schemas/index.js";
import { parseMemoryBytes, runProbe } from "./probe-utils.js";

/**
 * Extracts GPU entries from a `system_profiler` display payload.
 *
 * @param rawJson - Raw JSON output
 * @returns Observed accelerator list
 * @throws {Error} When the probe JSON is malformed
 */
export function parseMacosAccelerators(rawJson: string): ObservedAccelerator[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch (error) {
		throw new Error(
			`malformed macOS accelerator probe JSON: ${(error as Error).message}`,
		);
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!Array.isArray(
			(parsed as { SPDisplaysDataType?: unknown }).SPDisplaysDataType,
		)
	) {
		throw new Error(
			"malformed macOS accelerator probe JSON: missing SPDisplaysDataType array",
		);
	}
	const displays = (parsed as { SPDisplaysDataType: unknown[] })
		.SPDisplaysDataType;
	return displays.flatMap((entry): ObservedAccelerator[] => {
		if (typeof entry !== "object" || entry === null) {
			return [];
		}
		const display = entry as Record<string, unknown>;
		const modelRaw =
			(typeof display.sppci_model === "string" && display.sppci_model) ||
			(typeof display._name === "string" && display._name) ||
			(typeof display.spdisplays_vendor === "string" &&
			typeof display.spdisplays_ndrvs === "string"
				? `${display.spdisplays_vendor} ${display.spdisplays_ndrvs}`
				: undefined);
		if (!modelRaw) return [];
		const memoryBytes =
			parseMemoryBytes(
				typeof display.spdisplays_vram === "string"
					? display.spdisplays_vram
					: undefined,
			) ??
			parseMemoryBytes(
				typeof display.spdisplays_vram_shared === "string"
					? display.spdisplays_vram_shared
					: undefined,
			);
		const hasPciMetadata =
			typeof display.sppci_bus === "string" ||
			typeof display.spdisplays_pcie_lane_width === "string";
		const vendor =
			typeof display.spdisplays_vendor === "string"
				? display.spdisplays_vendor
				: undefined;
		const kind = hasPciMetadata
			? ("discrete" as const)
			: vendor?.toLowerCase().includes("apple") ||
					modelRaw.toLowerCase().includes("apple")
				? ("integrated" as const)
				: ("unknown" as const);
		return [
			{
				modelRaw,
				...(vendor ? { vendor } : {}),
				...(memoryBytes !== undefined ? { memoryBytes } : {}),
				kind,
				backend: "metal",
			},
		];
	});
}

/**
 * Collects accelerators on macOS.
 *
 * @returns Accelerator data plus detection status
 */
export async function collectMacosAccelerators(): Promise<{
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
	try {
		const accelerators = parseMacosAccelerators(displaysJson);
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
