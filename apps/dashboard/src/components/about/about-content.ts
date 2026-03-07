/**
 * Purpose: Static content model for the dashboard about page.
 * Exports: aboutSummaryCards, benchmarkDimensions, passTypeDetails, workflowSteps, scoringSystems, artifactRows, checkpointNotes, testCatalog
 *
 * Invariants:
 * - Copy reflects current local benchmark behavior and dashboard semantics.
 * - Keep content structured so the page can render small reusable sections.
 */

/** Summary card copy shown at the top of the about page. */
export interface AboutSummaryCard {
	label: string;
	value: string;
	description: string;
}

/** Matrix dimension description. */
export interface BenchmarkDimension {
	name: string;
	meaning: string;
	details: string;
}

/** Pass type explanation row. */
export interface PassTypeDetail {
	name: string;
	description: string;
}

/** Benchmark workflow stage description. */
export interface WorkflowStep {
	title: string;
	description: string;
	evidence: string;
}

/** Scoring system explanation row. */
export interface ScoringSystem {
	name: string;
	scale: string;
	howItWorks: string;
}

/** Artifact explanation row. */
export interface ArtifactRow {
	path: string;
	purpose: string;
}

/** Test catalog entry for about-page rendering. */
export interface AboutTestDefinition {
	slug: string;
	category: string;
	description: string;
	contract: string;
	scoringFocus: string;
	tags: string[];
}

/** Top-level benchmark facts. */
export const aboutSummaryCards: AboutSummaryCard[] = [
	{
		label: "Execution matrix",
		value: "runtime x harness x model x test x passType",
		description:
			"Every run expands into a reproducible matrix so results are comparable across model and harness combinations.",
	},
	{
		label: "Artifacts",
		value: "plan.json + run.json",
		description:
			"Each run writes a resolved plan and a fact-only result bundle, plus a crash-safe partial snapshot while work is in flight.",
	},
	{
		label: "Primary score",
		value: "automated pass / total",
		description:
			"Generated code is imported, export-checked, and executed against a per-test scoring spec before any optional frontier grading happens.",
	},
	{
		label: "Failure policy",
		value: "continue per item",
		description:
			"Timeouts, model errors, and eval failures are recorded on the item and the matrix continues. The CLI exits non-zero only on crashes.",
	},
];

/** Benchmark matrix dimension descriptions. */
export const benchmarkDimensions: BenchmarkDimension[] = [
	{
		name: "runtime",
		meaning: "Inference backend that serves the model.",
		details: "Today that is primarily Ollama and vLLM.",
	},
	{
		name: "harness",
		meaning: "Adapter that talks to the model and captures the output.",
		details: "Examples: direct HTTP, Goose, and OpenCode.",
	},
	{
		name: "model",
		meaning: "The concrete model name resolved for a runtime.",
		details: "Aliases can map one logical model name to different runtime-specific model IDs.",
	},
	{
		name: "test",
		meaning: "A benchmark task under `src/tests/<slug>`.",
		details:
			"Each test owns prompts, metadata, scoring spec, and an optional rubric for frontier evaluation.",
	},
	{
		name: "passType",
		meaning: "Prompt mode used for the task.",
		details:
			"`blind` hides the benchmark framing. `informed` exposes more explicit task/test context to measure prompt sensitivity.",
	},
];

/** Prompt-mode details. */
export const passTypeDetails: PassTypeDetail[] = [
	{
		name: "blind",
		description:
			"Measures how a model performs from the task contract alone, without benchmark-name hints.",
	},
	{
		name: "informed",
		description:
			"Measures how performance changes when the prompt includes the benchmark framing and more explicit expectations.",
	},
];

/** Run workflow stages. */
export const workflowSteps: WorkflowStep[] = [
	{
		title: "1. Plan the run",
		description:
			"The runner resolves config, discovers runtimes/models/tests/harnesses, computes a benchmark checkpoint hash, and expands the full matrix.",
		evidence:
			"`plan.json` stores the resolved config, machine metadata, checkpoint metadata, and every matrix item.",
	},
	{
		title: "2. Generate code",
		description:
			"For each matrix item, the selected harness loads `prompt.<passType>.md`, calls the selected runtime/model, and records generation output, timing, and any token counters that are available.",
		evidence:
			"Generation failures are classified as structured types such as timeout, API error, tool missing, or harness error.",
	},
	{
		title: "3. Score automatically",
		description:
			"When generation succeeds, the scorer extracts code, writes a temp module, imports it, validates required exports, then runs the per-test cases defined in `scoring.spec.ts`.",
		evidence:
			"Automated totals include both export checks and test-case checks, not just the function assertions.",
	},
	{
		title: "4. Retry compile failures once",
		description:
			"For Goose and OpenCode, compile/import failures can trigger one retry with compiler feedback appended to the original prompt.",
		evidence:
			"The retry is only promoted if it improves the automated result or fixes an import failure without making the score worse.",
	},
	{
		title: "5. Optionally frontier-grade",
		description:
			"If `OPENROUTER_API_KEY` is present and a test has `rubric.md`, the generated code is sent to a frontier evaluator through OpenRouter for a rubric score and reasoning.",
		evidence:
			"Frontier eval is best-effort: auth, timeout, parse, and rate-limit failures are recorded without crashing the run.",
	},
	{
		title: "6. Persist facts",
		description:
			"Each item result records status, generation data, automated score, optional frontier eval, and any failures. Aggregation and comparison happen after the run from those saved facts.",
		evidence:
			"`run.json` is append-only evidence. The dashboard and CLI compare commands read from saved artifacts rather than mutating past runs.",
	},
];

/** Scoring systems surfaced in the dashboard and CLI. */
export const scoringSystems: ScoringSystem[] = [
	{
		name: "Automated score",
		scale: "`passed / total`",
		howItWorks:
			"For each item, the scorer counts required export checks plus all declared test cases in `scoring.spec.ts`. Missing exports, import errors, and failing assertions all reduce the score.",
	},
	{
		name: "Overall pass rate",
		scale: "0-100%",
		howItWorks:
			"The dashboard sums `automatedScore.passed` and `automatedScore.total` across the selected items, then divides passed by total. Items without automated scores are excluded from that denominator.",
	},
	{
		name: "Frontier eval",
		scale: "1-10",
		howItWorks:
			"Optional rubric grading via OpenRouter. It is a separate signal from automated pass rate and includes the evaluator model plus free-form reasoning in the saved result.",
	},
	{
		name: "Effective score",
		scale: "0-100%",
		howItWorks:
			"Dashboard leaderboard ranking metric: `0.4 * passRate + 0.3 * completionRate + 0.3 * toolSuccessRate`. It complements raw pass rate rather than replacing it.",
	},
];

/** Key run and dashboard artifacts. */
export const artifactRows: ArtifactRow[] = [
	{
		path: "results/<run-id>/plan.json",
		purpose:
			"Resolved run plan: expanded matrix, benchmark checkpoint, machine metadata, and config snapshot for reproducibility.",
	},
	{
		path: "results/<run-id>/run.json",
		purpose:
			"Final run output: per-item results, durations, scores, failures, and run-level summary counters.",
	},
	{
		path: "results/<run-id>/run.partial.json",
		purpose:
			"Periodic in-flight checkpoint written during long runs. Removed after a successful final write.",
	},
	{
		path: "apps/dashboard/public/results/index.json",
		purpose:
			"Dashboard run index built by `bun dashboard:index`, including checkpoint and machine metadata for navigation.",
	},
	{
		path: "apps/dashboard/public/results/aggregates/<checkpoint>.json",
		purpose:
			"Checkpoint aggregate payload used by the leaderboard for deduped comparison across runs on the same benchmark definition.",
	},
];

/** Checkpoint and leaderboard fairness notes. */
export const checkpointNotes: string[] = [
	"Benchmark checkpoints roll whenever benchmark-defining assets change: prompts, metadata, scoring specs, rubrics, harness/runtime code, or core scoring pipeline code.",
	"The leaderboard reads the latest checkpoint aggregate by default so models are compared against the same benchmark definition.",
	"Checkpoint aggregates dedupe by machine profile plus runtime/model/harness/test/passType and keep the latest item for that exact key.",
	"`tool-smoke` is a special preflight test. It can mark a tool harness as missing required tool support before the rest of that model/harness slice runs.",
];

/** Current test catalog with short contract and scoring focus. */
export const testCatalog: AboutTestDefinition[] = [
	{
		slug: "smoke",
		category: "coding",
		description: "Basic add function sanity check.",
		contract: "Export a top-level `add(a, b)` TypeScript function.",
		scoringFocus:
			"Pipeline sanity: correct export shape, simple arithmetic behavior, and clean code extraction/import.",
		tags: ["baseline", "stateless"],
	},
	{
		slug: "tool-smoke",
		category: "coding",
		description: "Tool-calling preflight before the main benchmark suite.",
		contract: "Still implements a top-level `add(a, b)`, but exercises tool-writing harness behavior first.",
		scoringFocus:
			"Detects tool-missing harness failures early so later tool-dependent items are not misread as model regressions.",
		tags: ["preflight", "tooling"],
	},
	{
		slug: "calculator-basic",
		category: "coding",
		description: "Stateless arithmetic function implementation.",
		contract:
			"Export four top-level functions: `add`, `subtract`, `multiply`, and `divide`.",
		scoringFocus:
			"Export coverage, numeric correctness, zero and negative-number behavior, and division edge cases.",
		tags: ["math", "stateless"],
	},
	{
		slug: "calculator-stateful",
		category: "coding",
		description: "Chainable calculator with state and memory behavior.",
		contract:
			"Export `createCalculator()` returning a chainable calculator with core ops, clear, and memory methods.",
		scoringFocus:
			"State transitions, chaining semantics, memory isolation, and factory-based API design.",
		tags: ["stateful", "api-design"],
	},
	{
		slug: "todo-app",
		category: "coding",
		description: "Stateful CRUD todo manager implementation.",
		contract:
			"Export `createTodoApp()` returning CRUD, list, filtering, and clear-completed methods.",
		scoringFocus:
			"Unique IDs, instance-local state, CRUD correctness, deletion semantics, and filtering behavior.",
		tags: ["crud", "stateful"],
	},
	{
		slug: "rate-limiter",
		category: "coding",
		description: "Per-key fixed-window rate limiter semantics.",
		contract:
			"Export `createRateLimiter()` with `allow`, `remaining`, and `reset` methods using deterministic `nowMs` inputs.",
		scoringFocus:
			"Window-boundary correctness, per-key isolation, quota accounting, and reset semantics.",
		tags: ["stateful", "time-window"],
	},
	{
		slug: "ttl-cache",
		category: "coding",
		description: "Deterministic in-memory TTL cache semantics.",
		contract:
			"Export `createTtlCache()` with `set`, `get`, `has`, `delete`, `size`, and `clear` methods.",
		scoringFocus:
			"Expiry boundaries, overwrite semantics, support for `undefined` values, and non-expired size accounting.",
		tags: ["stateful", "cache", "expiration"],
	},
	{
		slug: "event-emitter",
		category: "coding",
		description: "Event emitter listener lifecycle semantics.",
		contract:
			"Export `createEventEmitter()` with `on`, `once`, `off`, `emit`, and `listenerCount`.",
		scoringFocus:
			"Registration order, duplicate listeners, once semantics, per-event isolation, and correct return values.",
		tags: ["stateful", "events"],
	},
];
