/**
 * Purpose: Migrate legacy run/plan machine payloads to the current schema shape.
 * Exports: migrateLegacyMachineProfile, migrateLegacyPlanPayload, migrateLegacyRunPayload,
 *          normalizeKnownPlanPayload, normalizeKnownRunPayload,
 *          parseKnownPlanPayload, parseKnownRunPayload
 *
 * Invariants:
 * - Legacy machine artifacts remain readable indefinitely
 * - Migration is pure and safe to reuse from CLI and dashboard code
 */

import type {
	HardwareProfile,
	LegacyMachineProfile,
	MachineProfile,
	RunPlan,
	RunResult,
} from "../../schemas/index.js";
import {
	LegacyMachineProfileSchema,
	MachineProfileSchema,
	RunPlanSchema,
	RunResultSchema,
	SCHEMA_VERSION,
} from "../../schemas/index.js";
import {
	buildMachineProfileKey,
	buildMachineProfileLabel,
	normalizeMachineProfile,
} from "./normalization.js";

const LEGACY_ARTIFACT_SCHEMA_VERSIONS = new Set([
	"0.2.2",
	"0.3.0",
	"0.4.0",
	"0.5.0",
]);

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
 * Reads a schemaVersion string from an arbitrary payload.
 *
 * @param raw - Arbitrary artifact payload
 * @returns Explicit schema version when present
 */
function readArtifactSchemaVersion(raw: unknown): string | undefined {
	if (!isRecord(raw) || typeof raw.schemaVersion !== "string") {
		return undefined;
	}
	return raw.schemaVersion;
}

/**
 * Returns whether an arbitrary machine payload matches the legacy shape.
 *
 * @param rawMachine - Arbitrary machine payload
 * @returns True when the payload resembles the pre-0.5.0 machine schema
 */
function hasLegacyMachineProfileShape(rawMachine: unknown): boolean {
	return (
		isRecord(rawMachine) &&
		typeof rawMachine.profileId === "string" &&
		isRecord(rawMachine.hardware)
	);
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
 * Produces a non-colliding instance ID for legacy profile-only machine payloads.
 *
 * @param legacyProfileId - Legacy profile slug used as the old machine identifier
 * @returns Namespaced legacy instance identifier
 */
function buildLegacyInstanceId(legacyProfileId: string): string {
	return legacyProfileId.startsWith("legacy_profile:")
		? legacyProfileId
		: `legacy_profile:${legacyProfileId}`;
}

/**
 * Normalizes a current-schema machine payload for backward-compatible rewrites.
 *
 * @param machine - Valid current-schema machine payload
 * @returns Normalized current-schema machine payload
 */
function normalizeCurrentMachineProfile(
	machine: MachineProfile,
): MachineProfile {
	const normalizedProfile = normalizeMachineProfile(machine.observedHardware);
	return {
		...machine,
		profileKey: buildMachineProfileKey(normalizedProfile),
		profileLabel: buildMachineProfileLabel(
			machine.observedHardware,
			normalizedProfile,
		),
		normalizedProfile,
		...(machine.instanceIdSource === "legacy_profile_id"
			? { instanceId: buildLegacyInstanceId(machine.instanceId) }
			: {}),
	};
}

/**
 * Migrates a legacy machine payload to the current standardized shape.
 *
 * @param rawMachine - Legacy or current machine payload
 * @returns Migrated machine payload when recognized
 * @throws {Error} None
 */
export function migrateLegacyMachineProfile(
	rawMachine: unknown,
): MachineProfile | undefined {
	if (!isRecord(rawMachine)) {
		return undefined;
	}

	const parsedMachine = MachineProfileSchema.safeParse(rawMachine);
	if (parsedMachine.success) {
		return normalizeCurrentMachineProfile(parsedMachine.data);
	}

	const parsedLegacyMachine = LegacyMachineProfileSchema.safeParse(rawMachine);
	if (!parsedLegacyMachine.success) {
		return undefined;
	}

	const legacyMachine = parsedLegacyMachine.data;
	const observedHardware = migrateLegacyObservedHardware(legacyMachine);
	const normalizedProfile = normalizeMachineProfile(observedHardware);
	return {
		instanceId: buildLegacyInstanceId(legacyMachine.profileId),
		instanceIdSource: "legacy_profile_id",
		...(typeof legacyMachine.label === "string" &&
		legacyMachine.label.length > 0
			? { displayLabel: legacyMachine.label }
			: {}),
		profileKey: buildMachineProfileKey(normalizedProfile),
		profileLabel: buildMachineProfileLabel(observedHardware, normalizedProfile),
		normalizedProfile,
		observedHardware,
	};
}

/**
 * Determines whether a plan payload should be migrated before validation.
 *
 * @param raw - Arbitrary artifact payload
 * @returns True when the payload matches a known legacy plan shape
 */
function hasLegacyPlanShape(raw: unknown): boolean {
	return (
		isRecord(raw) &&
		(hasLegacyMachineProfileShape(raw.machine) || isRecord(raw.environment))
	);
}

/**
 * Determines whether a run payload should be migrated before validation.
 *
 * @param raw - Arbitrary artifact payload
 * @returns True when the payload matches a known legacy run shape
 */
function hasLegacyRunShape(raw: unknown): boolean {
	return isRecord(raw) && hasLegacyMachineProfileShape(raw.machine);
}

/**
 * Returns whether a record has an own `machine` field.
 *
 * @param raw - Parsed artifact record
 * @returns True when `machine` is explicitly present on the artifact
 */
function hasOwnMachineField(raw: Record<string, unknown>): boolean {
	return Object.prototype.hasOwnProperty.call(raw, "machine");
}

/**
 * Builds a short artifact-context suffix for migration error messages.
 *
 * @param raw - Parsed artifact record
 * @returns Human-readable context suffix
 */
function describeArtifactContext(raw: Record<string, unknown>): string {
	const parts = [
		typeof raw.schemaVersion === "string"
			? `schemaVersion=${raw.schemaVersion}`
			: undefined,
		typeof raw.runId === "string" ? `runId=${raw.runId}` : undefined,
	]
		.filter((part): part is string => part !== undefined)
		.join(", ");
	return parts.length > 0 ? ` (${parts})` : "";
}

/**
 * Migrates a present machine payload or throws when the machine field cannot be understood.
 *
 * @param raw - Parsed artifact record
 * @param artifactKind - Artifact kind for error messages
 * @returns Migrated machine payload, or undefined when no machine field exists
 * @throws {Error} When a present machine field cannot be migrated
 */
function migrateArtifactMachineOrThrow(
	raw: Record<string, unknown>,
	artifactKind: "plan" | "run",
): MachineProfile | undefined {
	if (!hasOwnMachineField(raw)) {
		return undefined;
	}
	const machine = migrateLegacyMachineProfile(raw.machine);
	if (machine === undefined) {
		throw new Error(
			`Unable to migrate ${artifactKind} machine payload${describeArtifactContext(raw)}`,
		);
	}
	return machine;
}

/**
 * Normalizes a run or plan payload while rejecting unsupported schema versions.
 *
 * @param raw - Arbitrary artifact payload
 * @param artifactKind - Human-readable artifact kind for error messages
 * @param hasLegacyShape - Legacy-shape detector
 * @param migrateLegacyPayload - Legacy migration function
 * @returns Current-schema payload without stripping additive fields
 */
function normalizeKnownArtifactPayload(
	raw: unknown,
	artifactKind: "plan" | "run",
	hasLegacyShape: (raw: unknown) => boolean,
	migrateLegacyPayload: (raw: unknown) => unknown,
): unknown {
	const schemaVersion = readArtifactSchemaVersion(raw);
	if (schemaVersion === SCHEMA_VERSION) {
		if (!isRecord(raw) || !hasOwnMachineField(raw)) {
			return raw;
		}
		const machine = migrateArtifactMachineOrThrow(raw, artifactKind);
		return machine ? { ...raw, machine } : raw;
	}
	if (typeof schemaVersion === "string") {
		if (LEGACY_ARTIFACT_SCHEMA_VERSIONS.has(schemaVersion)) {
			return migrateLegacyPayload(raw);
		}
		throw new Error(
			`Unsupported ${artifactKind} artifact schemaVersion: ${schemaVersion}`,
		);
	}
	if (hasLegacyShape(raw)) {
		return migrateLegacyPayload(raw);
	}
	throw new Error(
		`Unsupported ${artifactKind} artifact: missing recognized schemaVersion`,
	);
}

/**
 * Migrates a legacy plan payload to the current schema shape.
 *
 * @param raw - Parsed JSON payload
 * @returns Migrated payload
 * @throws {Error} When a present machine payload cannot be migrated
 */
export function migrateLegacyPlanPayload(raw: unknown): unknown {
	if (!isRecord(raw)) {
		return raw;
	}

	const machine = migrateArtifactMachineOrThrow(raw, "plan");
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
 * Normalizes a known run-plan payload to the current schema without dropping additive fields.
 *
 * @param raw - Arbitrary artifact payload
 * @returns Current-schema run-plan payload
 * @throws {Error} When the payload uses an unsupported schema version or shape
 */
export function normalizeKnownPlanPayload(raw: unknown): unknown {
	return normalizeKnownArtifactPayload(
		raw,
		"plan",
		hasLegacyPlanShape,
		migrateLegacyPlanPayload,
	);
}

/**
 * Migrates a legacy run payload to the current schema shape.
 *
 * @param raw - Parsed JSON payload
 * @returns Migrated payload
 * @throws {Error} When a present machine payload cannot be migrated
 */
export function migrateLegacyRunPayload(raw: unknown): unknown {
	if (!isRecord(raw)) {
		return raw;
	}

	const machine = migrateArtifactMachineOrThrow(raw, "run");
	return {
		...raw,
		schemaVersion: SCHEMA_VERSION,
		...(machine ? { machine } : {}),
	};
}

/**
 * Normalizes a known run-result payload to the current schema without dropping additive fields.
 *
 * @param raw - Arbitrary artifact payload
 * @returns Current-schema run-result payload
 * @throws {Error} When the payload uses an unsupported schema version or shape
 */
export function normalizeKnownRunPayload(raw: unknown): unknown {
	return normalizeKnownArtifactPayload(
		raw,
		"run",
		hasLegacyRunShape,
		migrateLegacyRunPayload,
	);
}

/**
 * Parses a run-plan payload after applying supported legacy migration rules.
 *
 * @param raw - Arbitrary artifact payload
 * @returns Parsed current-schema run plan
 * @throws {Error} When migration fails or the normalized payload is invalid
 */
export function parseKnownPlanPayload(raw: unknown): RunPlan {
	return RunPlanSchema.parse(normalizeKnownPlanPayload(raw));
}

/**
 * Parses a run-result payload after applying supported legacy migration rules.
 *
 * @param raw - Arbitrary artifact payload
 * @returns Parsed current-schema run result
 * @throws {Error} When migration fails or the normalized payload is invalid
 */
export function parseKnownRunPayload(raw: unknown): RunResult {
	return RunResultSchema.parse(normalizeKnownRunPayload(raw));
}
