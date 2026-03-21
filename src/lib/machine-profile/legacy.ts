/**
 * Purpose: Migrate legacy run/plan machine payloads to the current schema shape.
 * Exports: migrateLegacyMachineProfile, migrateLegacyPlanPayload, migrateLegacyRunPayload
 *
 * Invariants:
 * - Legacy machine artifacts remain readable indefinitely
 * - Migration is pure and safe to reuse from CLI and dashboard code
 */

import type {
	HardwareProfile,
	LegacyMachineProfile,
	MachineProfile,
} from "../../schemas/index.js";
import { SCHEMA_VERSION } from "../../schemas/index.js";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "./normalization.js";

/**
 * Type guard for plain object records.
 *
 * @param value - Unknown candidate
 * @returns True when value is a record-like object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts a legacy hardware payload into the current observed-hardware shape.
 *
 * @param legacyMachine - Legacy machine payload
 * @returns Observed hardware payload
 */
function migrateLegacyObservedHardware(
	legacyMachine: LegacyMachineProfile,
): HardwareProfile {
	return {
		platform: legacyMachine.hardware.platform,
		arch: legacyMachine.hardware.arch,
		osRelease: legacyMachine.hardware.osRelease,
		cpuModelRaw: legacyMachine.hardware.cpuModel,
		logicalCores: legacyMachine.hardware.logicalCores,
		totalMemoryBytes: legacyMachine.hardware.totalMemoryBytes,
		accelerators: [],
		acceleratorDetection: {
			status: "unavailable",
			detail: "legacy artifact did not record accelerator metadata",
		},
	};
}

/**
 * Migrates a legacy machine payload to the current standardized shape.
 *
 * @param rawMachine - Legacy or current machine payload
 * @returns Migrated machine payload when recognized
 */
export function migrateLegacyMachineProfile(
	rawMachine: unknown,
): MachineProfile | undefined {
	if (!isRecord(rawMachine)) {
		return undefined;
	}

	if (
		typeof rawMachine.instanceId === "string" &&
		typeof rawMachine.profileKey === "string" &&
		isRecord(rawMachine.normalizedProfile) &&
		isRecord(rawMachine.observedHardware)
	) {
		return rawMachine as unknown as MachineProfile;
	}

	if (
		typeof rawMachine.profileId !== "string" ||
		!isRecord(rawMachine.hardware) ||
		typeof rawMachine.hardware.platform !== "string" ||
		typeof rawMachine.hardware.arch !== "string" ||
		typeof rawMachine.hardware.osRelease !== "string" ||
		typeof rawMachine.hardware.cpuModel !== "string" ||
		typeof rawMachine.hardware.logicalCores !== "number" ||
		typeof rawMachine.hardware.totalMemoryBytes !== "number"
	) {
		return undefined;
	}

	const legacyMachine = rawMachine as unknown as LegacyMachineProfile;
	const observedHardware = migrateLegacyObservedHardware(legacyMachine);
	const normalizedProfile = normalizeMachineProfile(observedHardware);
	return {
		instanceId: legacyMachine.profileId,
		instanceIdSource: "legacy_profile_id",
		...(legacyMachine.label ? { displayLabel: legacyMachine.label } : {}),
		profileKey: buildMachineProfileKey(normalizedProfile),
		profileLabel: buildMachineProfileLabel(
			observedHardware,
			normalizedProfile,
		),
		normalizedProfile,
		observedHardware,
	};
}

/**
 * Migrates a legacy plan payload to the current schema shape.
 *
 * @param raw - Parsed JSON payload
 * @returns Migrated payload
 */
export function migrateLegacyPlanPayload(raw: unknown): unknown {
	if (!isRecord(raw)) {
		return raw;
	}

	const machine = migrateLegacyMachineProfile(raw.machine);
	const runtimeEnvironment =
		raw.runtimeEnvironment ??
		(isRecord(raw.environment) ? raw.environment : undefined);

	return {
		...raw,
		schemaVersion: SCHEMA_VERSION,
		...(runtimeEnvironment ? { runtimeEnvironment } : {}),
		...(machine ? { machine } : {}),
	};
}

/**
 * Migrates a legacy run payload to the current schema shape.
 *
 * @param raw - Parsed JSON payload
 * @returns Migrated payload
 */
export function migrateLegacyRunPayload(raw: unknown): unknown {
	if (!isRecord(raw)) {
		return raw;
	}

	const machine = migrateLegacyMachineProfile(raw.machine);
	return {
		...raw,
		schemaVersion: SCHEMA_VERSION,
		...(machine ? { machine } : {}),
	};
}
