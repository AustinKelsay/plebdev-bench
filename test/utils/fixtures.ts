/**
 * Purpose: Shared deterministic fixtures for benchmark runner tests.
 * Exports: fallbackCollectMachineProfile, createWorkspaceCapabilityCatalog
 *
 * Invariants:
 * - Fixtures avoid network and host-dependent hardware probing.
 * - Machine identities are stable unless explicitly overridden by options.
 */

import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "../../src/lib/machine-profile/normalization.js";

interface FallbackMachineProfileOptions {
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	machineProfileId?: string;
	machineLabel?: string;
	env?: NodeJS.ProcessEnv;
	hardwareProfile?: {
		platform: string;
		arch: string;
		osRelease: string;
		cpuModelRaw: string;
		logicalCores: number;
		totalMemoryBytes: number;
		accelerators: Array<{
			modelRaw: string;
			kind: "integrated" | "discrete" | "unknown";
			vendor?: string;
			backend?: string;
		}>;
		acceleratorDetection: {
			status: "detected" | "none_detected" | "unavailable";
		};
	};
}

function readNonEmpty(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Builds a deterministic machine profile result for plan-builder tests.
 *
 * @param options - Optional machine identity, environment, and hardware overrides.
 * @returns Machine profile payload shaped like collectMachineProfile output.
 * @throws Never throws.
 */
export function fallbackCollectMachineProfile(
	options: FallbackMachineProfileOptions = {},
) {
	const env = options.env ?? {};
	const hardware = options.hardwareProfile ?? {
		platform: "darwin",
		arch: "arm64",
		osRelease: "unknown",
		cpuModelRaw: "unknown",
		logicalCores: 1,
		totalMemoryBytes: 1,
		accelerators: [],
		acceleratorDetection: {
			status: "unavailable" as const,
		},
	};
	const instanceId =
		readNonEmpty(options.machineInstanceId) ??
		readNonEmpty(options.machineProfileId) ??
		readNonEmpty(env.BENCH_MACHINE_INSTANCE_ID) ??
		readNonEmpty(env.BENCH_MACHINE_ID) ??
		"inst_0123456789abcdef0123456789abcdef";
	const displayLabel =
		readNonEmpty(options.machineDisplayLabel) ??
		readNonEmpty(options.machineLabel) ??
		readNonEmpty(env.BENCH_MACHINE_DISPLAY_LABEL) ??
		readNonEmpty(env.BENCH_MACHINE_LABEL);
	const identitySource =
		readNonEmpty(options.machineInstanceId) !== undefined ||
		readNonEmpty(options.machineProfileId) !== undefined
			? "config"
			: readNonEmpty(env.BENCH_MACHINE_ID) !== undefined ||
					readNonEmpty(env.BENCH_MACHINE_INSTANCE_ID) !== undefined
				? "env"
				: "generated";
	const normalizedProfile = normalizeMachineProfile(hardware);
	const profileKey = buildMachineProfileKey(normalizedProfile);
	const profileLabel = buildMachineProfileLabel(hardware, normalizedProfile);

	return {
		machine: {
			instanceId,
			instanceIdSource: identitySource,
			...(displayLabel ? { displayLabel } : {}),
			profileKey,
			profileLabel,
			normalizedProfile,
			observedHardware: hardware,
		},
		isAnonymous: identitySource === "generated",
		identitySource,
	};
}

/**
 * Builds the mixed capability catalog used by plan expansion tests.
 *
 * @returns Test catalog entries covering preflight and workspace capability cases.
 * @throws Never throws.
 */
export function createWorkspaceCapabilityCatalog() {
	return [
		{
			slug: "tool-smoke",
			category: "coding",
			description: "code preflight",
			tags: ["preflight"],
			scoringMode: "code-module",
			requiresTools: false,
			requiredHarnessCapabilities: [],
			timeoutMultiplier: 1,
			schemaVersion: 1,
		},
		{
			slug: "workspace-tool-smoke",
			category: "computer-use",
			description: "workspace preflight",
			tags: ["preflight", "workspace"],
			scoringMode: "workspace",
			requiresTools: true,
			requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
			timeoutMultiplier: 1,
			schemaVersion: 1,
		},
		{
			slug: "file-search-smoke",
			category: "computer-use",
			description: "search preflight",
			tags: ["preflight", "workspace", "search"],
			scoringMode: "workspace",
			requiresTools: true,
			requiredHarnessCapabilities: [
				"workspace-read",
				"workspace-write",
				"workspace-mkdir",
				"workspace-search",
			],
			timeoutMultiplier: 1,
			schemaVersion: 1,
		},
		{
			slug: "file-delete-smoke",
			category: "computer-use",
			description: "delete preflight",
			tags: ["preflight", "workspace", "delete"],
			scoringMode: "workspace",
			requiresTools: true,
			requiredHarnessCapabilities: [
				"workspace-read",
				"workspace-write",
				"workspace-mkdir",
				"workspace-delete",
			],
			timeoutMultiplier: 1,
			schemaVersion: 1,
		},
		{
			slug: "targeted-edit",
			category: "computer-use",
			description: "single file edit",
			tags: ["workspace", "edit"],
			scoringMode: "workspace",
			requiresTools: true,
			requiredHarnessCapabilities: ["workspace-read", "workspace-write"],
			timeoutMultiplier: 1.2,
			schemaVersion: 1,
		},
		{
			slug: "safe-cleanup",
			category: "computer-use",
			description: "delete files safely",
			tags: ["workspace", "delete"],
			scoringMode: "workspace",
			requiresTools: true,
			requiredHarnessCapabilities: [
				"workspace-read",
				"workspace-write",
				"workspace-mkdir",
				"workspace-delete",
			],
			timeoutMultiplier: 1.15,
			schemaVersion: 1,
		},
	];
}
