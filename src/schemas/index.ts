/**
 * Purpose: Re-export all schemas and types from the schemas module.
 * This is the public API for importing schemas.
 */

export {
	SCHEMA_VERSION,
	passTypes,
	PassTypeSchema,
	type PassType,
	itemStatusTypes,
	ItemStatusSchema,
	type ItemStatus,
	generationFailureTypes,
	GenerationFailureTypeSchema,
	type GenerationFailureType,
	scoringFailureTypes,
	ScoringFailureTypeSchema,
	type ScoringFailureType,
} from "./common.schema.js";

export {
	BenchConfigSchema,
	type BenchConfig,
	defaultConfig,
} from "./config.schema.js";

export {
	MatrixItemSchema,
	type MatrixItem,
	EnvironmentSchema,
	type Environment,
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
	ScoringSpecSchema,
	type ScoringSpec,
	TestCaseResultSchema,
	type TestCaseResult,
	ScoringResultSchema,
	type ScoringResult,
} from "./scoring.schema.js";
