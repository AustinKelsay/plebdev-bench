/**
 * Purpose: Shared primitives and constants for the benchmark domain.
 * Exports: schema version, domain literal lists, Zod schemas, and inferred types.
 *
 * Invariants:
 * - Domain literals are shared by Run Plan, Run Result, and config schemas.
 * - Boundary schemas preserve compatibility with historical persisted files.
 */

import { z } from "zod";
export {
	ArtifactRuntimeNameSchema,
	ExecutableArtifactRuntimeNameSchema,
	SupportedRuntimeNameSchema,
	artifactRuntimeNames,
	migrateLegacySupportedRuntimeNames,
	supportedRuntimeNames,
} from "./runtime-name.schema.js";
export type {
	ArtifactRuntimeName,
	ExecutableArtifactRuntimeName,
	SupportedRuntimeName,
} from "./runtime-name.schema.js";

/** Current Schema Version for all Run Plan and Run Result files. */
export const SCHEMA_VERSION = "0.5.3";

/** Valid pass types for benchmark runs. */
export const passTypes = ["blind", "informed"] as const;

/** Zod schema for pass types. */
export const PassTypeSchema = z.enum(passTypes);

/** Pass type: 'blind' (no hints) or 'informed' (with context). */
export type PassType = z.infer<typeof PassTypeSchema>;

/** Valid benchmark test categories. */
export const testCategories = ["coding", "computer-use"] as const;

/** Zod schema for benchmark test categories. */
export const TestCategorySchema = z.enum(testCategories);

/** Benchmark test category. */
export type TestCategory = z.infer<typeof TestCategorySchema>;

/** Valid scoring modes for benchmark tests. */
export const testScoringModes = ["code-module", "workspace"] as const;

/** Zod schema for benchmark test scoring modes. */
export const TestScoringModeSchema = z.enum(testScoringModes);

/** Benchmark test scoring mode. */
export type TestScoringMode = z.infer<typeof TestScoringModeSchema>;

/** Valid harness capability requirements for benchmark tests. */
export const harnessCapabilities = [
	"workspace-read",
	"workspace-write",
	"workspace-mkdir",
	"workspace-search",
	"workspace-delete",
] as const;

/** Zod schema for harness capability requirements. */
export const HarnessCapabilitySchema = z.enum(harnessCapabilities);

/** Harness capability requirement type. */
export type HarnessCapability = z.infer<typeof HarnessCapabilitySchema>;

/** Valid statuses for matrix items. */
export const itemStatusTypes = [
	"pending",
	"running",
	"completed",
	"failed",
] as const;

/** Zod schema for item status. */
export const ItemStatusSchema = z.enum(itemStatusTypes);

/** Status of a matrix item during/after execution. */
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

/** Valid generation failure types. */
export const generationFailureTypes = [
	"timeout",
	"api_error",
	"tool_missing",
	"harness_error",
	"prompt_not_found",
	"unknown",
] as const;

/** Zod schema for generation failure types. */
export const GenerationFailureTypeSchema = z.enum(generationFailureTypes);

/** Generation failure type. */
export type GenerationFailureType = z.infer<typeof GenerationFailureTypeSchema>;

/** Valid scoring failure types. */
export const scoringFailureTypes = [
	"extraction",
	"import",
	"missing_export",
	"factory_init_failed",
	"export_validation",
	"test_execution",
	"spec_load",
	"no_spec",
	"unknown",
] as const;

/** Zod schema for scoring failure types. */
export const ScoringFailureTypeSchema = z.enum(scoringFailureTypes);

/** Scoring failure type. */
export type ScoringFailureType = z.infer<typeof ScoringFailureTypeSchema>;

/** Valid frontier eval failure types. */
export const frontierEvalFailureTypes = [
	"timeout",
	"auth_error",
	"rate_limited",
	"http_error",
	"invalid_response",
	"parse_error",
	"truncated",
	"unknown",
] as const;

/** Zod schema for frontier eval failure types. */
export const FrontierEvalFailureTypeSchema = z.enum(frontierEvalFailureTypes);

/** Frontier eval failure type. */
export type FrontierEvalFailureType = z.infer<
	typeof FrontierEvalFailureTypeSchema
>;

/** Valid signal assessment classifications. */
export const signalAssessmentClassifications = [
	"trustworthy",
	"tainted",
] as const;

/** Zod schema for signal assessment classification. */
export const SignalAssessmentClassificationSchema = z.enum(
	signalAssessmentClassifications,
);

/** Signal assessment classification type. */
export type SignalAssessmentClassification = z.infer<
	typeof SignalAssessmentClassificationSchema
>;

/** Stable reason codes for tainted benchmark rows. */
export const signalAssessmentReasonTypes = [
	"output_contract_violation",
	"mixed_prose_salvaged",
	"tool_permission_denied",
	"tool_call_not_executed",
	"confirmation_without_artifact",
	"internal_tool_transcript",
	"agent_requested_input",
] as const;

/** Zod schema for signal assessment reasons. */
export const SignalAssessmentReasonSchema = z.enum(signalAssessmentReasonTypes);

/** Signal assessment reason type. */
export type SignalAssessmentReason = z.infer<
	typeof SignalAssessmentReasonSchema
>;

/** Zod schema for per-item benchmark signal assessment. */
export const SignalAssessmentSchema = z
	.object({
		/** High-level signal quality classification for the row. */
		classification: SignalAssessmentClassificationSchema,

		/** Stable reason codes explaining why the row is tainted. */
		reasons: z.array(SignalAssessmentReasonSchema).default([]),
	})
	.superRefine((value, ctx) => {
		if (value.classification === "tainted" && value.reasons.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reasons"],
				message: "tainted signal assessments must include at least one reason",
			});
		}
		if (value.classification === "trustworthy" && value.reasons.length > 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["reasons"],
				message:
					"trustworthy signal assessments must not include taint reasons",
			});
		}
	});

/** Per-item benchmark signal assessment. */
export type SignalAssessment = z.infer<typeof SignalAssessmentSchema>;

/** Valid verification status values for externally shared runs. */
export const verificationStatusTypes = [
	"self_reported",
	"verified",
	"rejected",
] as const;

/** Zod schema for verification status values. */
export const VerificationStatusSchema = z.enum(verificationStatusTypes);

/** Verification status for run provenance. */
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** Zod schema for benchmark checkpoint identity metadata. */
export const BenchmarkCheckpointSchema = z.object({
	/** Stable checkpoint identifier (derived from manifest hash). */
	checkpointId: z.string().min(1),

	/** Checkpoint hashing algorithm descriptor. */
	algorithm: z.string().min(1),

	/** SHA-256 hash of the benchmark asset manifest. */
	manifestHash: z.string().min(1),

	/** Number of benchmark-defining assets in the manifest. */
	assetCount: z.number().int().nonnegative(),

	/** ISO 8601 timestamp when checkpoint was computed. */
	computedAt: z.string().datetime(),
});

/** Benchmark checkpoint identity metadata. */
export type BenchmarkCheckpoint = z.infer<typeof BenchmarkCheckpointSchema>;

/** Zod schema for runtime environment metadata. */
export const RuntimeEnvironmentSchema = z.object({
	/** Runtime platform name (e.g., darwin, linux). */
	platform: z.string().min(1),

	/** Bun version used by the runner. */
	bunVersion: z.string().min(1),
});

/** Runtime environment metadata. */
export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

/** Host platform families for standardized machine profiles. */
export const machinePlatformFamilies = [
	"macos",
	"linux",
	"windows",
	"unknown",
] as const;

/** Zod schema for machine platform families. */
export const MachinePlatformFamilySchema = z.enum(machinePlatformFamilies);

/** Machine platform family type. */
export type MachinePlatformFamily = z.infer<typeof MachinePlatformFamilySchema>;

/** Valid sources for machine instance identity resolution. */
export const machineInstanceIdSources = [
	"config",
	"env",
	"generated",
	"legacy_profile_id",
] as const;

/** Zod schema for machine instance identity resolution sources. */
export const MachineInstanceIdSourceSchema = z.enum(machineInstanceIdSources);

/** Machine instance identity resolution source type. */
export type MachineInstanceIdSource = z.infer<
	typeof MachineInstanceIdSourceSchema
>;

/** Valid accelerator detection outcomes for observed hardware. */
export const acceleratorDetectionStatuses = [
	"detected",
	"none_detected",
	"unavailable",
] as const;

/** Zod schema for accelerator detection outcomes. */
export const AcceleratorDetectionStatusSchema = z.enum(
	acceleratorDetectionStatuses,
);

/** Accelerator detection status type. */
export type AcceleratorDetectionStatus = z.infer<
	typeof AcceleratorDetectionStatusSchema
>;

/** Valid observed accelerator kinds. */
export const observedAcceleratorKinds = [
	"integrated",
	"discrete",
	"unknown",
] as const;

/** Zod schema for observed accelerator kinds. */
export const ObservedAcceleratorKindSchema = z.enum(observedAcceleratorKinds);

/** Observed accelerator kind type. */
export type ObservedAcceleratorKind = z.infer<
	typeof ObservedAcceleratorKindSchema
>;

/** Legacy hardware schema retained for artifact migration. */
export const LegacyHardwareProfileSchema = z.object({
	platform: z.string().min(1),
	arch: z.string().min(1),
	osRelease: z.string().min(1),
	cpuModel: z.string().min(1),
	logicalCores: z.number().int().positive(),
	totalMemoryBytes: z.number().int().positive(),
});

/** Legacy hardware profile type. */
export type LegacyHardwareProfile = z.infer<typeof LegacyHardwareProfileSchema>;

/** Observed accelerator details captured from a host probe. */
export const ObservedAcceleratorSchema = z.object({
	vendor: z.string().min(1).optional(),
	modelRaw: z.string().min(1),
	memoryBytes: z.number().int().positive().optional(),
	backend: z.string().min(1).optional(),
	count: z.number().int().positive().optional(),
	kind: ObservedAcceleratorKindSchema.default("unknown"),
});

/** Observed accelerator metadata. */
export type ObservedAccelerator = z.infer<typeof ObservedAcceleratorSchema>;

/** Accelerator probe status with explicit non-silent detection semantics. */
export const AcceleratorDetectionSchema = z
	.object({
		status: AcceleratorDetectionStatusSchema,
		detail: z.string().min(1).optional(),
	})
	.superRefine((value, context) => {
		if (
			value.status === "unavailable" &&
			(value.detail === undefined || value.detail.trim().length === 0)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["detail"],
				message:
					'AcceleratorDetectionSchema requires detail when status is "unavailable"',
			});
		}
	});

/** Accelerator probe status type. */
export type AcceleratorDetection = z.infer<typeof AcceleratorDetectionSchema>;

/** Zod schema for observed machine hardware metadata. */
export const HardwareProfileSchema = z
	.object({
		platform: z.string().min(1),
		arch: z.string().min(1),
		osRelease: z.string().min(1),
		cpuModelRaw: z.string().min(1),
		cpuVendor: z.string().min(1).optional(),
		physicalCores: z.number().int().positive().optional(),
		logicalCores: z.number().int().positive(),
		totalMemoryBytes: z.number().int().positive(),
		accelerators: z.array(ObservedAcceleratorSchema).default([]),
		acceleratorDetection: AcceleratorDetectionSchema,
	})
	.superRefine((hardware, context) => {
		if (
			hardware.acceleratorDetection.status === "detected" &&
			hardware.accelerators.length === 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must contain at least one accelerator when acceleratorDetection.status is "detected"',
			});
		}

		if (
			hardware.acceleratorDetection.status === "none_detected" &&
			hardware.accelerators.length > 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must be empty when acceleratorDetection.status is "none_detected"',
			});
		}

		if (
			hardware.acceleratorDetection.status === "unavailable" &&
			hardware.accelerators.length > 0
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["accelerators"],
				message:
					'accelerators must be empty when acceleratorDetection.status is "unavailable"',
			});
		}
	});

/** Observed machine hardware metadata. */
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;

/** Canonical normalized machine profile used for aggregation. */
export const NormalizedMachineProfileSchema = z.object({
	platformFamily: MachinePlatformFamilySchema,
	arch: z.string().min(1),
	cpuVendor: z.string().min(1),
	cpuModelKey: z.string().min(1),
	physicalCores: z.number().int().positive().optional(),
	logicalCores: z.number().int().positive(),
	memoryGiB: z.number().int().positive(),
	acceleratorKey: z.string().min(1),
	acceleratorSummary: z.array(z.string().min(1)).optional(),
	acceleratorMemoryGiB: z.number().int().positive().optional(),
	acceleratorCount: z.number().int().nonnegative().optional(),
});

/** Canonical normalized machine profile type. */
export type NormalizedMachineProfile = z.infer<
	typeof NormalizedMachineProfileSchema
>;

/** Legacy machine profile schema retained for migration. */
export const LegacyMachineProfileSchema = z.object({
	profileId: z.string().min(1),
	label: z.string().min(1).optional(),
	hardware: LegacyHardwareProfileSchema,
});

/** Legacy machine profile type. */
export type LegacyMachineProfile = z.infer<typeof LegacyMachineProfileSchema>;

/** Zod schema for standardized machine profile metadata. */
export const MachineProfileSchema = z.object({
	instanceId: z.string().min(1),
	instanceIdSource: MachineInstanceIdSourceSchema,
	displayLabel: z.string().min(1).optional(),
	profileKey: z.string().min(1),
	profileLabel: z.string().min(1),
	normalizedProfile: NormalizedMachineProfileSchema,
	observedHardware: HardwareProfileSchema,
});

/** Standardized machine profile metadata used for aggregation and filtering. */
export type MachineProfile = z.infer<typeof MachineProfileSchema>;

/** Zod schema for run provenance metadata. */
export const RunProvenanceSchema = z.object({
	/** Verification status for this run submission. */
	verificationStatus: VerificationStatusSchema.default("self_reported"),

	/** Source that produced the run artifact. */
	source: z.string().min(1).default("local_cli"),

	/** Optional submitter identity string (future use). */
	submittedBy: z.string().min(1).optional(),

	/** Optional submit timestamp (future use). */
	submittedAt: z.string().datetime().optional(),

	/** Optional free-form provenance notes. */
	notes: z.string().min(1).optional(),
});

/** Run provenance metadata. */
export type RunProvenance = z.infer<typeof RunProvenanceSchema>;
