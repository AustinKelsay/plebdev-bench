/**
 * Purpose: Resolve stable machine instance identity plus canonical machine profile.
 * Exports: collectMachineProfile, MACHINE_* env constants
 *
 * Invariants:
 * - Instance identity is never derived from hardware
 * - Profile keys are deterministic and derived from normalized hardware only
 */

import type { HardwareProfile, MachineProfile } from "../schemas/index.js";
import {
	MACHINE_INSTANCE_ID_ENV_VAR,
	LEGACY_MACHINE_ID_ENV_VAR,
	resolveMachineInstanceId,
} from "./machine-profile/instance-id.js";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "./machine-profile/normalization.js";
import { collectObservedHardwareProfile } from "./machine-profile/probe.js";

/** New environment variable name for machine display labels. */
export const MACHINE_DISPLAY_LABEL_ENV_VAR = "BENCH_MACHINE_DISPLAY_LABEL";

/** Deprecated legacy environment variable name for machine display labels. */
export const LEGACY_MACHINE_LABEL_ENV_VAR = "BENCH_MACHINE_LABEL";

/** Backward-compatible export for the deprecated machine ID env var. */
export const MACHINE_ID_ENV_VAR = LEGACY_MACHINE_ID_ENV_VAR;

/** Backward-compatible export for the deprecated machine label env var. */
export const MACHINE_LABEL_ENV_VAR = LEGACY_MACHINE_LABEL_ENV_VAR;

/** Public export for the new machine instance ID env var. */
export { MACHINE_INSTANCE_ID_ENV_VAR };

/** Options for resolving machine profile metadata. */
export interface MachineProfileOptions {
	machineInstanceId?: string;
	machineDisplayLabel?: string;
	machineProfileId?: string;
	machineLabel?: string;
	env?: NodeJS.ProcessEnv;
	observedHardware?: HardwareProfile;
	hardwareProfile?: HardwareProfile;
	instanceIdFilePath?: string;
}

/** Resolved machine profile metadata plus identity resolution details. */
export interface ResolvedMachineProfile {
	machine: MachineProfile;
	isAnonymous: boolean;
	identitySource: MachineProfile["instanceIdSource"];
}

/**
 * Trims an optional string and returns `undefined` when empty.
 *
 * @param value - Optional raw string
 * @returns Trimmed value or undefined
 */
function readNonEmpty(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Collects observed hardware metadata from the current host.
 *
 * @returns Observed hardware metadata
 */
export async function collectHardwareProfile(): Promise<HardwareProfile> {
	return collectObservedHardwareProfile();
}

/**
 * Resolves machine profile metadata from config/env/local state with canonical profiling.
 *
 * Resolution precedence:
 * 1. Explicit config `machineInstanceId` / `machineDisplayLabel`
 * 2. Deprecated config aliases `machineProfileId` / `machineLabel`
 * 3. Environment (`BENCH_MACHINE_INSTANCE_ID` / `BENCH_MACHINE_DISPLAY_LABEL`)
 * 4. Generated local machine instance ID persisted on disk
 *
 * @param options - Optional config/env overrides
 * @returns Resolved machine profile and identity source
 */
export async function collectMachineProfile(
	options: MachineProfileOptions = {},
): Promise<ResolvedMachineProfile> {
	const env = options.env ?? process.env;
	const observedHardware =
		options.observedHardware ??
		options.hardwareProfile ??
		(await collectObservedHardwareProfile());
	const normalizedProfile = normalizeMachineProfile(observedHardware);
	const profileKey = buildMachineProfileKey(normalizedProfile);
	const profileLabel = buildMachineProfileLabel(
		observedHardware,
		normalizedProfile,
	);

	const resolvedInstance = resolveMachineInstanceId({
		configuredInstanceId: options.machineInstanceId,
		legacyConfiguredInstanceId: options.machineProfileId,
		env,
		instanceIdFilePath: options.instanceIdFilePath,
	});

	const displayLabel =
		readNonEmpty(options.machineDisplayLabel) ??
		readNonEmpty(options.machineLabel) ??
		readNonEmpty(env[MACHINE_DISPLAY_LABEL_ENV_VAR]) ??
		readNonEmpty(env[LEGACY_MACHINE_LABEL_ENV_VAR]);

	return {
		machine: {
			instanceId: resolvedInstance.instanceId,
			instanceIdSource: resolvedInstance.instanceIdSource,
			...(displayLabel ? { displayLabel } : {}),
			profileKey,
			profileLabel,
			normalizedProfile,
			observedHardware,
		},
		isAnonymous: resolvedInstance.instanceIdSource === "generated",
		identitySource: resolvedInstance.instanceIdSource,
	};
}
