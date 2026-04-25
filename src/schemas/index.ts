/**
 * Purpose: Re-export all schemas and types from the schemas module.
 * This is the public API for importing schemas.
 */

export {
	SCHEMA_VERSION,
	supportedRuntimeNames,
	SupportedRuntimeNameSchema,
	type SupportedRuntimeName,
	migrateLegacySupportedRuntimeNames,
	artifactRuntimeNames,
	ArtifactRuntimeNameSchema,
	type ArtifactRuntimeName,
	ExecutableArtifactRuntimeNameSchema,
	type ExecutableArtifactRuntimeName,
	passTypes,
	PassTypeSchema,
	type PassType,
	testCategories,
	TestCategorySchema,
	type TestCategory,
	testScoringModes,
	TestScoringModeSchema,
	type TestScoringMode,
	harnessCapabilities,
	HarnessCapabilitySchema,
	type HarnessCapability,
	itemStatusTypes,
	ItemStatusSchema,
	type ItemStatus,
	generationFailureTypes,
	GenerationFailureTypeSchema,
	type GenerationFailureType,
	scoringFailureTypes,
	ScoringFailureTypeSchema,
	type ScoringFailureType,
	frontierEvalFailureTypes,
	FrontierEvalFailureTypeSchema,
	type FrontierEvalFailureType,
	signalAssessmentClassifications,
	SignalAssessmentClassificationSchema,
	type SignalAssessmentClassification,
	signalAssessmentReasonTypes,
	SignalAssessmentReasonSchema,
	type SignalAssessmentReason,
	SignalAssessmentSchema,
	type SignalAssessment,
	verificationStatusTypes,
	VerificationStatusSchema,
	type VerificationStatus,
	BenchmarkCheckpointSchema,
	type BenchmarkCheckpoint,
	RuntimeEnvironmentSchema,
	type RuntimeEnvironment,
	machinePlatformFamilies,
	MachinePlatformFamilySchema,
	type MachinePlatformFamily,
	machineInstanceIdSources,
	MachineInstanceIdSourceSchema,
	type MachineInstanceIdSource,
	acceleratorDetectionStatuses,
	AcceleratorDetectionStatusSchema,
	type AcceleratorDetectionStatus,
	observedAcceleratorKinds,
	ObservedAcceleratorKindSchema,
	type ObservedAcceleratorKind,
	LegacyHardwareProfileSchema,
	type LegacyHardwareProfile,
	ObservedAcceleratorSchema,
	type ObservedAccelerator,
	AcceleratorDetectionSchema,
	type AcceleratorDetection,
	HardwareProfileSchema,
	type HardwareProfile,
	NormalizedMachineProfileSchema,
	type NormalizedMachineProfile,
	LegacyMachineProfileSchema,
	type LegacyMachineProfile,
	MachineProfileSchema,
	type MachineProfile,
	RunProvenanceSchema,
	type RunProvenance,
} from "./common.schema.js";

/**
 * @deprecated Use `artifactRuntimeNames` for persisted artifacts or
 * `supportedRuntimeNames` for active execution config. Migration: import the
 * explicit runtime set you need. Remove after the next release.
 */
export { supportedRuntimeNames as runtimeNames } from "./common.schema.js";

/**
 * @deprecated Use `ArtifactRuntimeNameSchema` for persisted artifacts or
 * `SupportedRuntimeNameSchema` for active execution config. Migration: import
 * the explicit schema you need. Remove after the next release.
 */
export { SupportedRuntimeNameSchema as RuntimeNameSchema } from "./common.schema.js";

/**
 * @deprecated Use `ArtifactRuntimeName` for persisted artifacts or
 * `SupportedRuntimeName` for active execution config. Migration: import the
 * explicit type you need. Remove after the next release.
 */
export type { SupportedRuntimeName as RuntimeName } from "./common.schema.js";

export {
	BenchConfigSchema,
	type BenchConfig,
	defaultConfig,
} from "./config.schema.js";

export {
	MatrixItemSchema,
	type MatrixItem,
	ModelExclusionSchema,
	type ModelExclusion,
	RunPlanSchema,
	type RunPlan,
} from "./plan.schema.js";

export {
	GenerationResultSchema,
	type GenerationResult,
	AutomatedScoreSchema,
	type AutomatedScore,
	ScoringMetricsSchema,
	type ScoringMetrics,
	FrontierEvalSchema,
	type FrontierEval,
	GenerationFailureSchema,
	type GenerationFailure,
	ScoringFailureSchema,
	type ScoringFailure,
	FrontierEvalFailureSchema,
	type FrontierEvalFailure,
	MatrixItemResultSchema,
	type MatrixItemResult,
	RunResultSchema,
	type RunResult,
} from "./result.schema.js";

export {
	ExpectedExportSchema,
	type ExpectedExport,
	TestCaseSchema,
	type TestCase,
	WorkspaceFileAssertionSchema,
	type WorkspaceFileAssertion,
	WorkspaceJsonAssertionSchema,
	type WorkspaceJsonAssertion,
	WorkspaceMutationSetSchema,
	type WorkspaceMutationSet,
	WorkspaceAssertionsSchema,
	type WorkspaceAssertions,
	ScoringSpecSchema,
	type ScoringSpec,
	TestCaseResultSchema,
	type TestCaseResult,
	ScoringResultSchema,
	type ScoringResult,
} from "./scoring.schema.js";

export {
	ModelAliasEntrySchema,
	type ModelAliasEntry,
	ModelAliasMapSchema,
	type ModelAliasMap,
} from "./model-alias.schema.js";

export {
	modelProfileResolutionSources,
	ModelProfileResolutionSourceSchema,
	type ModelProfileResolutionSource,
	CanonicalModelProfileSchema,
	type CanonicalModelProfile,
	ModelVariantSchema,
	type ModelVariant,
	ModelProfileSchema,
	type ModelProfile,
	ConfiguredModelVariantSchema,
	type ConfiguredModelVariant,
	ConfiguredModelVariantValueSchema,
	type ConfiguredModelVariantValue,
	ConfiguredModelProfileSchema,
	type ConfiguredModelProfile,
	ArtifactConfiguredModelProfileSchema,
	type ArtifactConfiguredModelProfile,
	ModelProfileRegistrySchema,
	type ModelProfileRegistry,
	ArtifactModelProfileRegistrySchema,
	type ArtifactModelProfileRegistry,
	ModelProfileFileSchema,
	type ModelProfileFile,
} from "./model-profile.schema.js";

export {
	TestMetadataSchema,
	type TestMetadata,
	TestDefinitionSchema,
	type TestDefinition,
} from "./test-catalog.schema.js";
