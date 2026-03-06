/**
 * Purpose: Collect sanitized hardware metadata and resolve machine profile identity.
 * Exports: collectMachineProfile, collectHardwareProfile
 *
 * Invariants:
 * - Hardware metadata excludes hostname, serials, usernames, and raw device IDs
 * - Anonymous profile IDs are deterministic for a given sanitized hardware fingerprint
 */

import { createHash } from "node:crypto";
import * as os from "node:os";
import type { HardwareProfile, MachineProfile } from "../schemas/index.js";

/** Environment variable name for machine profile IDs. */
export const MACHINE_ID_ENV_VAR = "BENCH_MACHINE_ID";

/** Environment variable name for machine labels. */
export const MACHINE_LABEL_ENV_VAR = "BENCH_MACHINE_LABEL";

/** Options for resolving machine profile metadata. */
export interface MachineProfileOptions {
	machineProfileId?: string;
	machineLabel?: string;
	env?: NodeJS.ProcessEnv;
	hardwareProfile?: HardwareProfile;
}

/** Resolved machine profile metadata plus identity resolution details. */
export interface ResolvedMachineProfile {
	machine: MachineProfile;
	isAnonymous: boolean;
	identitySource: "config" | "env" | "anonymous";
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
 * Creates a deterministic anonymous machine profile ID from hardware metadata.
 *
 * @param hardware - Sanitized hardware profile
 * @returns Anonymous machine profile ID
 */
function buildAnonymousProfileId(hardware: HardwareProfile): string {
	const fingerprint = [
		hardware.platform,
		hardware.arch,
		hardware.osRelease,
		hardware.cpuModel,
		String(hardware.logicalCores),
		String(hardware.totalMemoryBytes),
	].join("|");
	const hash = createHash("sha256").update(fingerprint).digest("hex");
	return `anon_${hash.slice(0, 12)}`;
}

/**
 * Collects sanitized hardware metadata from the current host.
 *
 * @returns Sanitized hardware profile
 * @throws {Error} If CPU metadata is unavailable
 */
export function collectHardwareProfile(): HardwareProfile {
	const cpus = os.cpus();
	if (cpus.length === 0) {
		throw new Error(
			"Unable to collect hardware profile: os.cpus() returned empty",
		);
	}

	return {
		platform: os.platform(),
		arch: os.arch(),
		osRelease: os.release(),
		cpuModel: cpus[0].model,
		logicalCores: cpus.length,
		totalMemoryBytes: os.totalmem(),
	};
}

/**
 * Resolves machine profile metadata from config/env with deterministic anonymous fallback.
 *
 * Resolution precedence:
 * 1. Explicit config `machineProfileId` / `machineLabel`
 * 2. Environment (`BENCH_MACHINE_ID` / `BENCH_MACHINE_LABEL`)
 * 3. Anonymous deterministic ID from hardware fingerprint
 *
 * @param options - Optional config/env overrides
 * @returns Resolved machine profile and identity source
 */
export function collectMachineProfile(
	options: MachineProfileOptions = {},
): ResolvedMachineProfile {
	const env = options.env ?? process.env;
	const hardware = options.hardwareProfile ?? collectHardwareProfile();

	const configId = readNonEmpty(options.machineProfileId);
	const envId = readNonEmpty(env[MACHINE_ID_ENV_VAR]);
	const profileId = configId ?? envId ?? buildAnonymousProfileId(hardware);

	const configLabel = readNonEmpty(options.machineLabel);
	const envLabel = readNonEmpty(env[MACHINE_LABEL_ENV_VAR]);
	const label = configLabel ?? envLabel;

	const identitySource =
		configId !== undefined
			? "config"
			: envId !== undefined
				? "env"
				: "anonymous";

	return {
		machine: {
			profileId,
			...(label ? { label } : {}),
			hardware,
		},
		isAnonymous: identitySource === "anonymous",
		identitySource,
	};
}
