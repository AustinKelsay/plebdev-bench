/**
 * Purpose: Centralized tooltip content strings for the dashboard.
 * Organized by component/section for easy maintenance.
 */

/** Summary card explanations */
export const summary = {
	items:
		"Total matrix items in the run. An item = one model + harness + test + pass type combination.",
	passRate:
		"Percentage of automated tests passed across all items. Green >= 80%, yellow >= 50%, red < 50%.",
	frontierEval:
		"Average score from frontier AI evaluation (0-10 scale). A frontier model grades code quality.",
	environment:
		"System environment where the benchmark ran (platform, Bun version).",
} as const;

/** Matrix table column explanations */
export const matrix = {
	status:
		"Item completion state: completed (ran successfully), failed (generation or scoring error).",
	runtime: "Inference backend used for this item (for example ollama or vllm).",
	model: "The LLM model that generated the code for this item.",
	harness:
		"Execution adapter used: direct (API calls), goose (CLI agent), opencode (CLI agent).",
	test: "The benchmark test being evaluated (e.g., calculator-basic, todo-app).",
	pass: "Prompt type: blind (no hints) or informed (includes guidance and examples).",
	tests:
		"Automated test results: passed/total. Shows how many spec tests the generated code passed.",
	eval: "Frontier evaluation score (0-10). A frontier model grades the generated code for correctness and quality.",
	time: "Generation duration - how long the model took to produce the output.",
} as const;

/** Scoring breakdown explanations */
export const scoring = {
	title:
		"Pass rates grouped by dimension. Helps identify which models, harnesses, or tests perform best.",
	byModel: "Pass rate for each model across all tests and harnesses.",
	byHarness: "Pass rate for each harness adapter across all models and tests.",
	byTest: "Pass rate for each test across all models and harnesses.",
	passRate: "Percentage of tests passed. Calculated as passed / total tests.",
} as const;

/** Tooling breakdown explanations */
export const tooling = {
	title: "Compares tool usage success with test pass rates to find outliers.",
	toolSuccess:
		"Percentage of items where the model correctly used required tools.",
	toolMissing: "Number of items where required tools were not used.",
	score: "Test pass rate for non-tool-smoke tests.",
	highScoreToolIssues:
		"Models with high test scores but poor tool usage - may have good code but skip tools.",
	toolOkLowScore:
		"Models using tools correctly but failing tests - may have tool proficiency but weak code generation.",
} as const;

/** Timing stats explanations */
export const timing = {
	title: "Generation duration statistics across all items.",
	average: "Mean generation time across all items.",
	median: "Middle value (p50) - half of items completed faster, half slower.",
	min: "Fastest generation time.",
	max: "Slowest generation time.",
	p90: "90th percentile - 90% of items completed within this time.",
	items: "Number of items with timing data.",
} as const;

/** Failure breakdown explanations */
export const failures = {
	title: "Breakdown of failure types by category.",
	generation: "Failures during code generation phase.",
	scoring: "Failures during test scoring phase.",
	// Generation failure types
	timeout: "Generation took too long and was terminated.",
	api_error: "API request to the model failed.",
	tool_missing: "Model did not use required tools.",
	harness_error: "Harness adapter encountered an error.",
	prompt_not_found: "Prompt file was not found.",
	// Scoring failure types
	no_spec: "No test specification file found for this test.",
	extraction: "Could not extract code from the model output.",
	spec_load: "Could not load the test specification.",
	import: "Code import/require errors when loading generated code.",
	export_validation: "Generated code missing required exports.",
	test_execution: "Test runtime error during execution.",
} as const;

/** Composite score chart explanations */
export const composite = {
	title: "Multi-metric bar chart ranking models, harnesses, and tests.",
	description:
		"Effective score ranks overall performance. Formula: 40% pass rate + 30% completion + 30% tool success.",
	effectiveScore:
		"Weighted composite score for ranking. Balances pass rate, completion, and tool usage.",
	passRate: "Percentage of tests passed.",
	toolSuccess: "Percentage of items with correct tool usage.",
	frontier: "Frontier evaluation score (scaled to 100% for comparison).",
} as const;

/** Blind vs Informed chart explanations */
export const blindInformed = {
	title: "Compares pass rates between blind and informed prompts.",
	description:
		"Blind prompts have no hints; informed prompts include guidance and examples.",
	blind: "Pass rate with blind prompts (no hints or examples).",
	informed: "Pass rate with informed prompts (includes guidance and examples).",
	delta:
		"Difference between informed and blind. Positive = hints helped, negative = hints hurt.",
	avgDelta: "Average improvement from informed prompts across all groups.",
	improved: "Number of groups where informed > blind.",
	degraded: "Number of groups where informed < blind.",
	unchanged: "Number of groups with equal pass rates.",
} as const;

/** Timing distribution explanations */
export const timingDistribution = {
	title: "Histogram showing distribution of generation times.",
	p50: "Median (50th percentile) - half of items completed faster.",
	p90: "90th percentile - 90% of items completed within this time. Outliers are slower.",
	items: "Total items with timing data.",
} as const;

/** Frontier eval scatter plot explanations */
export const scatter = {
	title:
		"Relationship between automated test results and frontier AI evaluation.",
	xAxis: "Automated Pass Rate - percentage of tests passed by generated code.",
	yAxis: "Frontier Score - quality grade from frontier AI (0-10).",
	correlation:
		"Points show correlation. Ideal: high pass rate + high frontier score (upper right).",
} as const;

/** Item detail dialog explanations */
export const itemDetail = {
	generation: "Details about the code generation phase.",
	duration: "Time taken to generate the code.",
	promptTokens: "Number of tokens in the input prompt sent to the model.",
	completionTokens: "Number of tokens in the model's response.",
	automatedTests:
		"Results from running the test specification against generated code.",
	frontierEval:
		"Evaluation by a frontier AI model scoring code quality and correctness.",
	failures:
		"Any errors that occurred during generation, scoring, or evaluation.",
} as const;

/** Dimension detail dialog explanations */
export const dimensionDetail = {
	effective:
		"Weighted composite: 40% pass rate + 30% completion + 30% tool success.",
	completion: "Items that completed without errors / total items.",
	passRate: "Tests passed / total tests across completed items.",
	toolSuccess: "Items with correct tool usage / total tool-expected items.",
} as const;

/** Compare page explanations */
export const compare = {
	matchedItems:
		"Items present in both runs (same runtime + model + harness + test + pass type).",
	onlyInA: "Items that exist only in run A (not in run B).",
	onlyInB: "Items that exist only in run B (not in run A).",
	improved: "Items that failed in run A but completed in run B.",
	regressed: "Items that completed in run A but failed in run B.",
	passRateDelta: "Change in overall pass rate from run A to run B.",
	frontierDelta:
		"Change in average frontier evaluation score from run A to run B.",
	statusChanges: "How item completion status changed between runs.",
} as const;
