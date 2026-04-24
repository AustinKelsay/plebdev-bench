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
		value: "runtime x harness x model x test x prompt mode",
		detail: "Reproducible Cartesian product so results are comparable.",
	},
	{
		label: "Artifacts",
		value: "plan.json + run.json per run",
		detail:
			"Resolved plan + fact-only results. Crash-safe partial snapshots in flight.",
	},
	{
		label: "Score",
		value: "passed / total automated tests",
		detail: "Code is imported, export-checked, and run against a scoring spec.",
	},
	{
		label: "Failures",
		value: "Recorded, never fatal",
		detail:
			"Generation, scoring, and frontier failures are saved per item. CLI exits 0.",
	},
];

/** Benchmark matrix dimensions. */
export const benchmarkDimensions: BenchmarkDimension[] = [
	{
		name: "runtime",
		description: "Inference backend (currently Ollama; vLLM is historical).",
	},
	{
		name: "harness",
		description: "Adapter that calls the model (direct HTTP, Goose, OpenCode).",
	},
	{
		name: "model",
		description:
			"Concrete model name. Aliases map logical names to runtime-specific IDs.",
	},
	{
		name: "test",
		description:
			"Task under `src/tests/<slug>` with prompts, scoring spec, and optional rubric.",
	},
	{
		name: "prompt mode",
		description:
			"`blind` (task contract only) or `informed` (includes benchmark framing).",
	},
];

/** Run pipeline stages. */
export const workflowSteps: WorkflowStep[] = [
	{
		step: "Plan",
		description:
			"Discover runtimes/models/tests, compute checkpoint hash, expand matrix.",
		detail:
			"Writes `plan.json` with config, machine metadata, and every matrix item.",
	},
	{
		step: "Generate",
		description:
			"Each harness loads the prompt, calls the model, records output + timing.",
		detail:
			"Failures classified as timeout, api_error, tool_missing, or harness_error.",
	},
	{
		step: "Score",
		description:
			"Extract code, import it, validate exports, run `scoring.spec.ts` tests.",
		detail:
			"Score = export checks + test assertions. Import/export failures reduce score.",
	},
	{
		step: "Retry",
		description:
			"Goose/OpenCode: one retry with compiler feedback on import failures.",
		detail:
			"Only promoted if it improves score or fixes imports without regression.",
	},
	{
		step: "Frontier eval",
		description: "Optional rubric grading via OpenRouter if API key is set.",
		detail:
			"Best-effort: auth/timeout/rate-limit failures recorded without crashing.",
	},
	{
		step: "Persist",
		description:
			"Write `run.json` with all item results, scores, and failures.",
		detail:
			"Append-only evidence. Dashboard reads artifacts; never mutates past runs.",
	},
];

/** Scoring systems surfaced in the dashboard. */
export const scoringSystems: ScoringSystem[] = [
	{
		name: "Automated",
		scale: "passed/total",
		description: "Export checks + test-case assertions from `scoring.spec.ts`.",
	},
	{
		name: "Pass rate",
		scale: "0-100%",
		description: "Sum of passed / sum of total across selected items.",
	},
	{
		name: "Frontier eval",
		scale: "1-10",
		description:
			"Optional rubric grading via OpenRouter. Separate from automated score.",
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
		purpose: "Resolved matrix, checkpoint, machine metadata, config.",
	},
	{
		path: "results/<run-id>/run.json",
		purpose: "Per-item results, scores, failures, summary counters.",
	},
	{
		path: "results/<run-id>/run.partial.json",
		purpose: "In-flight checkpoint. Removed after final write.",
	},
	{
		path: "public/results/index.json",
		purpose: "Dashboard run index built by `bun dashboard:index`.",
	},
	{
		path: "public/results/aggregates/<checkpoint>.json",
		purpose: "Leaderboard aggregate for cross-run comparison.",
	},
];

/** Checkpoint fairness notes. */
export const checkpointNotes: string[] = [
	"A new season starts when benchmark-defining assets change (prompts, specs, rubrics, harness code). Every season is pinned to a checkpoint hash.",
	"The leaderboard defaults to the latest season so models are compared against the same definition.",
	"Aggregates prefer the strongest result per machine + matrix key; recency is a tiebreaker.",
	"tool-smoke is a preflight: if a harness can't call tools, the remaining items in that slice are skipped rather than scored as model failures.",
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
