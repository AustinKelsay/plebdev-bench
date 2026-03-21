/**
 * Purpose: Normalize observed hardware into canonical machine-profile fields.
 * Exports: normalizeMachineProfile, buildMachineProfileKey, buildMachineProfileLabel
 *
 * Invariants:
 * - Profile keys are deterministic and omit exact OS patch versions
 * - Normalization is pure and safe to share with dashboard/runtime code
 */

import type {
	HardwareProfile,
	NormalizedMachineProfile,
	ObservedAccelerator,
} from "../../schemas/index.js";

const BYTES_PER_GIB = 1024 ** 3;

/**
 * Returns a lowercase slug suitable for stable profile keys.
 *
 * @param value - Raw input string
 * @returns Stable lowercase slug
 */
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

/**
 * Resolves a canonical platform family from the runtime platform.
 *
 * @param platform - Raw runtime platform
 * @returns Canonical platform family
 */
function normalizePlatformFamily(
	platform: string,
): NormalizedMachineProfile["platformFamily"] {
	switch (platform) {
		case "darwin":
			return "macos";
		case "linux":
			return "linux";
		case "win32":
			return "windows";
		default:
			return "unknown";
	}
}

/**
 * Infers a canonical CPU vendor from raw CPU metadata.
 *
 * @param cpuModelRaw - Raw CPU model string
 * @param explicitVendor - Optional detected vendor
 * @returns Canonical vendor slug
 */
function normalizeCpuVendor(
	cpuModelRaw: string,
	explicitVendor?: string,
): string {
	const candidate = `${explicitVendor ?? ""} ${cpuModelRaw}`.toLowerCase();
	if (candidate.includes("apple")) return "apple";
	if (candidate.includes("intel")) return "intel";
	if (candidate.includes("amd")) return "amd";
	if (candidate.includes("qualcomm")) return "qualcomm";
	return explicitVendor ? slugify(explicitVendor) : "unknown";
}

/**
 * Removes common vendor prefixes before slugifying a CPU model.
 *
 * @param cpuModelRaw - Raw CPU model string
 * @param cpuVendor - Canonical CPU vendor
 * @returns Canonical CPU model slug
 */
function normalizeCpuModelKey(cpuModelRaw: string, cpuVendor: string): string {
	const vendorPatterns: Record<string, RegExp[]> = {
		apple: [/^apple\s+/i],
		intel: [/^intel(?:\(r\))?\s+/i, /\bcore\(tm\)\b/gi, /\bcpu\b/gi],
		amd: [/^amd\s+/i, /\bprocessor\b/gi],
		qualcomm: [/^qualcomm\s+/i],
		unknown: [],
	};
	const patterns = vendorPatterns[cpuVendor] ?? [];
	let normalized = cpuModelRaw.trim();
	for (const pattern of patterns) {
		normalized = normalized.replace(pattern, " ");
	}
	return slugify(normalized) || slugify(cpuModelRaw) || "unknown";
}

/**
 * Infers a canonical vendor for an observed accelerator.
 *
 * @param accelerator - Observed accelerator metadata
 * @returns Canonical vendor slug
 */
function normalizeAcceleratorVendor(accelerator: ObservedAccelerator): string {
	const candidate = `${accelerator.vendor ?? ""} ${accelerator.modelRaw}`.toLowerCase();
	if (candidate.includes("apple")) return "apple";
	if (candidate.includes("nvidia")) return "nvidia";
	if (candidate.includes("amd") || candidate.includes("radeon")) return "amd";
	if (candidate.includes("intel")) return "intel";
	return accelerator.vendor ? slugify(accelerator.vendor) : "unknown";
}

/**
 * Produces a stable accelerator key from observed accelerator metadata.
 *
 * @param accelerator - Observed accelerator metadata
 * @returns Canonical accelerator key
 */
function normalizeAcceleratorKey(accelerator: ObservedAccelerator): string {
	const vendor = normalizeAcceleratorVendor(accelerator);
	const model = slugify(
		accelerator.modelRaw
			.replace(/^nvidia\s+/i, "")
			.replace(/^apple\s+/i, "")
			.replace(/^amd\s+/i, "")
			.replace(/^intel\s+/i, ""),
	);
	return `${vendor}/${model || "unknown"}`;
}

/**
 * Selects the most representative accelerator for profile classification.
 *
 * @param accelerators - Observed accelerators
 * @returns Primary accelerator candidate
 */
function selectPrimaryAccelerator(
	accelerators: ObservedAccelerator[],
): ObservedAccelerator | undefined {
	return [...accelerators].sort((left, right) => {
		const memoryDelta = (right.memoryBytes ?? -1) - (left.memoryBytes ?? -1);
		if (memoryDelta !== 0) return memoryDelta;
		return left.modelRaw.localeCompare(right.modelRaw);
	})[0];
}

/**
 * Rounds a byte count to a stable GiB class.
 *
 * @param bytes - Byte count
 * @returns Whole-GiB classification
 */
function toRoundedGiB(bytes: number): number {
	return Math.max(1, Math.round(bytes / BYTES_PER_GIB));
}

/**
 * Normalizes observed machine hardware into canonical profile fields.
 *
 * @param observedHardware - Observed machine hardware
 * @returns Normalized canonical machine profile
 */
export function normalizeMachineProfile(
	observedHardware: HardwareProfile,
): NormalizedMachineProfile {
	const cpuVendor = normalizeCpuVendor(
		observedHardware.cpuModelRaw,
		observedHardware.cpuVendor,
	);
	const primaryAccelerator = selectPrimaryAccelerator(
		observedHardware.accelerators,
	);
	const acceleratorKey =
		primaryAccelerator !== undefined
			? normalizeAcceleratorKey(primaryAccelerator)
			: observedHardware.acceleratorDetection.status === "none_detected"
				? "none"
				: "unknown";

	return {
		platformFamily: normalizePlatformFamily(observedHardware.platform),
		arch: slugify(observedHardware.arch) || "unknown",
		cpuVendor,
		cpuModelKey: normalizeCpuModelKey(
			observedHardware.cpuModelRaw,
			cpuVendor,
		),
		...(observedHardware.physicalCores
			? { physicalCores: observedHardware.physicalCores }
			: {}),
		logicalCores: observedHardware.logicalCores,
		memoryGiB: toRoundedGiB(observedHardware.totalMemoryBytes),
		acceleratorKey,
		...(primaryAccelerator?.memoryBytes
			? { acceleratorMemoryGiB: toRoundedGiB(primaryAccelerator.memoryBytes) }
			: {}),
		acceleratorCount: observedHardware.accelerators.length,
	};
}

/**
 * Builds the canonical profile key used by aggregation and filtering.
 *
 * @param normalizedProfile - Normalized machine profile
 * @returns Stable machine profile key
 */
export function buildMachineProfileKey(
	normalizedProfile: NormalizedMachineProfile,
): string {
	const cpuCoreCount =
		normalizedProfile.physicalCores ?? normalizedProfile.logicalCores;
	const acceleratorKey = normalizedProfile.acceleratorKey.replace(/\//g, "-");
	const acceleratorMemory =
		normalizedProfile.acceleratorMemoryGiB === undefined
			? "na"
			: `${normalizedProfile.acceleratorMemoryGiB}gb`;
	return [
		normalizedProfile.platformFamily,
		normalizedProfile.arch,
		`${normalizedProfile.cpuVendor}-${normalizedProfile.cpuModelKey}`,
		`${cpuCoreCount}c`,
		`${normalizedProfile.memoryGiB}gb`,
		acceleratorKey,
		acceleratorMemory,
		`x${normalizedProfile.acceleratorCount}`,
	].join("_");
}

/**
 * Builds a human-readable profile label for dashboard display.
 *
 * @param observedHardware - Observed hardware metadata
 * @param normalizedProfile - Normalized machine profile
 * @returns Stable human-readable machine profile label
 */
export function buildMachineProfileLabel(
	observedHardware: HardwareProfile,
	normalizedProfile: NormalizedMachineProfile,
): string {
	const accelerator = selectPrimaryAccelerator(observedHardware.accelerators);
	const acceleratorLabel =
		accelerator?.modelRaw ??
		(normalizedProfile.acceleratorKey === "none"
			? "CPU only"
			: "Accelerator unknown");
	return `${observedHardware.cpuModelRaw} / ${normalizedProfile.memoryGiB}GB / ${acceleratorLabel}`;
}
