/**
 * Purpose: Static content model for the dashboard about page.
 * Exports: aboutFacts, benchmarkDimensions, workflowSteps, scoringSystems, artifactRows, checkpointNotes, testCatalog
 *
 * Invariants:
 * - Copy reflects current local benchmark behavior and dashboard semantics.
 * - Keep content structured so the page can render small reusable sections.
 */

/** Quick-reference fact. */
export interface AboutFact {
	label: string;
	value: string;
	detail: string;
}

/** Matrix dimension description. */
export interface BenchmarkDimension {
	name: string;
	description: string;
}

/** Benchmark workflow stage description. */
export interface WorkflowStep {
	step: string;
	description: string;
	detail: string;
}

/** Scoring system explanation row. */
export interface ScoringSystem {
	name: string;
	scale: string;
	description: string;
}

/** Artifact explanation row. */
export interface ArtifactRow {
	path: string;
	purpose: string;
}

/** Test catalog entry. */
export interface AboutTestDefinition {
	slug: string;
	description: string;
	contract: string;
	scoring: string;
	tags: string[];
}

/** Top-level benchmark facts. */
export const aboutFacts: AboutFact[] = [
	{
		label: "Matrix",
		value: "Runtime x Harness x Runtime Model x Benchmark Test x Pass Type",
		detail: "Reproducible Matrix so Run Results are comparable.",
	},
	{
		label: "Artifacts",
		value: "Run Plan + Run Result per Benchmark Run",
		detail:
			"Resolved Run Plan + fact-only Run Result. Crash-safe Partial Run Result in flight.",
	},
	{
		label: "Automated Score",
		value: "passed / total automated tests",
		detail:
			"Deterministic local evidence from imports, export checks, and scoring specs.",
	},
	{
		label: "Failures",
		value: "Recorded, never fatal",
		detail:
			"Generation Failure, Scoring Failure, and Frontier Eval Failure are saved per Matrix Item. CLI exits 0 unless the process crashes.",
	},
];

/** Benchmark matrix dimensions. */
export const benchmarkDimensions: BenchmarkDimension[] = [
	{
		name: "Runtime",
		description:
			"Inference backend that makes Runtime Models available for execution.",
	},
	{
		name: "Harness",
		description:
			"Interface used to ask a Runtime Model to perform a Benchmark Test.",
	},
	{
		name: "Runtime Model",
		description:
			"Exact executable model identifier exposed by a Runtime; Model Profiles group equivalent variants.",
	},
	{
		name: "Benchmark Test",
		description:
			"Packaged benchmark definition with prompts, scoring expectations, fixtures, metadata, and optional rubric.",
	},
	{
		name: "Pass Type",
		description:
			"`blind` or `informed` prompt-context variant for a Matrix Item.",
	},
];

/** Run pipeline stages. */
export const workflowSteps: WorkflowStep[] = [
	{
		step: "Plan",
		description:
			"Discover Runtimes, Runtime Models, Benchmark Tests, compute Benchmark Checkpoint, expand Matrix.",
		detail:
			"Writes the Run Plan with config, Machine Profile metadata, Machine Instance provenance, and every Matrix Item.",
	},
	{
		step: "Generate",
		description:
			"Each Harness loads the prompt, calls the Runtime Model, records output + timing.",
		detail:
			"Generation Failures are classified as timeout, api_error, tool_missing, or harness_error.",
	},
	{
		step: "Score",
		description:
			"Extract code, import it, validate exports, run `scoring.spec.ts` tests.",
		detail:
			"Automated Score = export checks + test assertions. Import/export failures reduce score.",
	},
	{
		step: "Retry",
		description:
			"Goose/OpenCode: one retry with compiler feedback on import failures.",
		detail:
			"Only promoted if it improves score or fixes imports without regression.",
	},
	{
		step: "Frontier Eval",
		description: "Optional rubric grading via OpenRouter if API key is set.",
		detail:
			"Best-effort: auth/timeout/rate-limit Frontier Eval Failures are recorded without crashing.",
	},
	{
		step: "Persist",
		description:
			"Write the Run Result with all Matrix Item results, scores, and failures.",
		detail:
			"Append-only evidence. Dashboard reads artifacts; never mutates past runs.",
	},
];

/** Scoring systems surfaced in the dashboard. */
export const scoringSystems: ScoringSystem[] = [
	{
		name: "Automated Score",
		scale: "passed/total",
		description: "Export checks + test-case assertions from `scoring.spec.ts`.",
	},
	{
		name: "Pass rate",
		scale: "0-100%",
		description: "Sum of passed / sum of total across selected items.",
	},
	{
		name: "Frontier Eval",
		scale: "1-10",
		description:
			"Optional rubric grading via OpenRouter. Separate from Automated Score.",
	},
	{
		name: "Effective score",
		scale: "0-100%",
		description:
			"Ranking metric: 40% pass rate + 30% completion + 30% tool success.",
	},
];

/** Key artifacts on disk. */
export const artifactRows: ArtifactRow[] = [
	{
		path: "results/<run-id>/plan.json",
		purpose:
			"Run Plan with resolved Matrix, Benchmark Checkpoint, Machine Profile, Machine Instance, and config.",
	},
	{
		path: "results/<run-id>/run.json",
		purpose:
			"Run Result with Matrix Item results, scores, failures, summary counters.",
	},
	{
		path: "results/<run-id>/run.partial.json",
		purpose: "Partial Run Result. Removed after final Run Result write.",
	},
	{
		path: "public/results/index.json",
		purpose: "Dashboard run index built by `bun dashboard:index`.",
	},
	{
		path: "public/results/aggregates/<checkpoint>.json",
		purpose:
			"Leaderboard aggregate for Run Comparison within a Benchmark Checkpoint.",
	},
];

/** Checkpoint fairness notes. */
export const checkpointNotes: string[] = [
	"A new Benchmark Checkpoint starts when benchmark-defining assets change: prompts, specs, rubrics, or harness code.",
	"The leaderboard defaults to the latest Benchmark Checkpoint so Model Profiles are compared against the same benchmark definition.",
	"Aggregates prefer the strongest result per Machine Profile + Matrix key; recency is a tiebreaker.",
	"tool-smoke is a preflight: if a Harness lacks required Harness Capabilities, remaining items in that slice are skipped rather than scored as Runtime Model failures.",
];

/** Current test catalog. */
export const testCatalog: AboutTestDefinition[] = [
	{
		slug: "smoke",
		description: "Sanity check — export `add(a, b)`.",
		contract: "Top-level TypeScript function.",
		scoring: "Correct export, arithmetic, clean import.",
		tags: ["baseline"],
	},
	{
		slug: "tool-smoke",
		description: "Tool-calling preflight.",
		contract: "Same `add(a, b)` but as tool-call test.",
		scoring:
			"Detects tool_missing early so later items aren't misread as model failures.",
		tags: ["preflight"],
	},
	{
		slug: "calculator-basic",
		description: "Stateless `add`, `subtract`, `multiply`, `divide`.",
		contract: "Four top-level exported functions.",
		scoring:
			"Numeric correctness, zero/negative handling, division edge cases.",
		tags: ["math", "stateless"],
	},
	{
		slug: "calculator-stateful",
		description: "Chainable calculator with memory.",
		contract: "`createCalculator()` → chainable ops, clear, memory.",
		scoring: "State transitions, chaining, memory isolation, factory API.",
		tags: ["stateful"],
	},
	{
		slug: "todo-app",
		description: "CRUD todo manager.",
		contract: "`createTodoApp()` → add, remove, list, filter, clear.",
		scoring: "Unique IDs, instance isolation, CRUD correctness, filtering.",
		tags: ["crud", "stateful"],
	},
	{
		slug: "rate-limiter",
		description: "Per-key fixed-window rate limiter.",
		contract:
			"`createRateLimiter()` → `allow`, `remaining`, `reset` with `nowMs`.",
		scoring: "Window boundaries, per-key isolation, quota accounting, reset.",
		tags: ["stateful"],
	},
	{
		slug: "ttl-cache",
		description: "In-memory TTL cache.",
		contract:
			"`createTtlCache()` → `set`, `get`, `has`, `delete`, `size`, `clear`.",
		scoring:
			"Expiry boundaries, overwrite, undefined-value support, size accuracy.",
		tags: ["stateful", "cache"],
	},
	{
		slug: "event-emitter",
		description: "Event emitter with listener lifecycle.",
		contract:
			"`createEventEmitter()` → `on`, `once`, `off`, `emit`, `listenerCount`.",
		scoring:
			"Registration order, duplicates, once semantics, per-event isolation.",
		tags: ["stateful", "events"],
	},
];
