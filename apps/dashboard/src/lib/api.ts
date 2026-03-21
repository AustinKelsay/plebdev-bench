/**
 * Purpose: Fetch run data from static JSON files.
 * Exports: fetchRuns, fetchRun, fetchPlan, fetchRunWithPlan, fetchDashboardIndex, fetchLatestAggregate
 *
 * Data is loaded from the results directory via Vite's dev server.
 * All fetched JSON is validated with Zod schemas at this boundary.
 */
import {
	DashboardIndexLegacyOrV2Schema,
	LeaderboardAggregateSchema,
	RunPlanSchema,
	RunResultSchema,
} from "./schemas";
import {
	migrateLegacyPlanPayload,
	migrateLegacyRunPayload,
} from "../../../../src/lib/machine-profile/legacy.js";
import type {
	DashboardIndex,
	LeaderboardAggregate,
	RunListItem,
	RunPlan,
	RunResult,
} from "./types";

/**
 * Base path for published results.
 *
 * Note: Use BASE_URL so static deployments under a sub-path still work.
 * Example: BASE_URL="/bench/" -> "/bench/results"
 */
const RESULTS_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/results`;

/** Optional fetch request options for cancellation support. */
interface FetchRequestOptions {
	signal?: AbortSignal;
}

/**
 * Normalizes legacy and v2 index payloads to a stable v2 shape.
 *
 * @param raw - Parsed and validated index payload
 * @returns Normalized dashboard index object
 */
function normalizeDashboardIndex(
	raw: ReturnType<typeof DashboardIndexLegacyOrV2Schema.parse>,
): DashboardIndex {
	if (Array.isArray(raw)) {
		return {
			schemaVersion: 2,
			generatedAt: new Date(0).toISOString(),
			latestCheckpointId: null,
			runs: raw,
			checkpoints: [],
		};
	}
	return raw;
}

/**
 * Creates an empty aggregate payload when no aggregate artifact exists yet.
 *
 * @param checkpointId - Checkpoint ID from dashboard index metadata
 * @returns Empty aggregate payload
 */
function createEmptyAggregate(
	checkpointId: string | null,
): LeaderboardAggregate {
	return {
		schemaVersion: 2,
		generatedAt: new Date(0).toISOString(),
		checkpointId: checkpointId ?? "unknown",
		summary: {
			runsConsidered: 0,
			runsMatched: 0,
			rawItems: 0,
			dedupedItems: 0,
			machines: 0,
			instances: 0,
			automatedScoreItems: 0,
			frontierEvalItems: 0,
		},
		machines: [],
		items: [],
	};
}

/**
 * Fetches and normalizes dashboard index metadata.
 *
 * Supports legacy array-based `index.json` and v2 object format.
 *
 * @param options - Optional fetch options
 * @returns Promise resolving to normalized dashboard index metadata
 * @throws {Error} When index fetch fails (except 404 fallback) or schema validation fails
 */
export async function fetchDashboardIndex(
	options?: FetchRequestOptions,
): Promise<DashboardIndex> {
	const response = await fetch(`${RESULTS_BASE}/index.json`, {
		signal: options?.signal,
	});
	if (!response.ok) {
		if (response.status === 404) {
			console.warn(
				"No runs index found. Run `bun dashboard:index` to generate apps/dashboard/public/results/index.json.",
			);
			const fallbackIndex = {
				schemaVersion: 2,
				generatedAt: new Date(0).toISOString(),
				latestCheckpointId: null,
				runs: [],
				checkpoints: [],
			};
			const fallbackParse =
				DashboardIndexLegacyOrV2Schema.safeParse(fallbackIndex);
			if (!fallbackParse.success) {
				throw new Error(
					`Invalid dashboard index fallback payload: ${fallbackParse.error.message}`,
				);
			}
			return normalizeDashboardIndex(fallbackParse.data);
		}
		throw new Error(`Failed to fetch runs index: ${response.status}`);
	}
	const data = await response.json();
	const parsed = DashboardIndexLegacyOrV2Schema.parse(data);
	return normalizeDashboardIndex(parsed);
}

/**
 * Fetches the list of all available runs from index.json.
 *
 * @param options - Optional fetch options
 * @returns Promise resolving to list of run summary items
 * @throws {Error} When index fetch/validation fails
 */
export async function fetchRuns(
	options?: FetchRequestOptions,
): Promise<RunListItem[]> {
	const index = await fetchDashboardIndex(options);
	return index.runs;
}

/**
 * Fetches a single run result artifact.
 *
 * @param runId - Run identifier (directory name in `results/`)
 * @param options - Optional fetch options
 * @returns Promise resolving to parsed run result payload
 * @throws {Error} When fetch fails or schema validation fails
 */
export async function fetchRun(
	runId: string,
	options?: FetchRequestOptions,
): Promise<RunResult> {
	const safeRunId = encodeURIComponent(runId);
	const response = await fetch(`${RESULTS_BASE}/${safeRunId}/run.json`, {
		signal: options?.signal,
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch run ${runId}: ${response.status}`);
	}
	const data = await response.json();
	return RunResultSchema.parse(migrateLegacyRunPayload(data));
}

/**
 * Fetches a single run plan artifact.
 *
 * @param runId - Run identifier (directory name in `results/`)
 * @param options - Optional fetch options
 * @returns Promise resolving to parsed run plan payload
 * @throws {Error} When fetch fails or schema validation fails
 */
export async function fetchPlan(
	runId: string,
	options?: FetchRequestOptions,
): Promise<RunPlan> {
	const safeRunId = encodeURIComponent(runId);
	const response = await fetch(`${RESULTS_BASE}/${safeRunId}/plan.json`, {
		signal: options?.signal,
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch plan ${runId}: ${response.status}`);
	}
	const data = await response.json();
	return RunPlanSchema.parse(migrateLegacyPlanPayload(data));
}

/**
 * Fetches both run and plan artifacts for a run.
 *
 * @param runId - Run identifier (directory name in `results/`)
 * @param options - Optional fetch options
 * @returns Promise resolving to paired run + plan payloads
 * @throws {Error} When either fetch fails or schema validation fails
 */
export async function fetchRunWithPlan(
	runId: string,
	options?: FetchRequestOptions,
): Promise<{ run: RunResult; plan: RunPlan }> {
	const [run, plan] = await Promise.all([
		fetchRun(runId, options),
		fetchPlan(runId, options),
	]);
	return { run, plan };
}

/**
 * Fetches the latest checkpoint aggregate payload used by leaderboard view.
 *
 * @param options - Optional fetch options
 * @returns Promise resolving to latest aggregate payload
 * @throws {Error} When aggregate artifacts are missing for existing runs, fetch fails, or validation fails
 */
export async function fetchLatestAggregate(
	options?: FetchRequestOptions,
): Promise<LeaderboardAggregate> {
	const response = await fetch(`${RESULTS_BASE}/aggregates/latest.json`, {
		signal: options?.signal,
	});
	if (response.status === 404) {
		const index = await fetchDashboardIndex(options);
		if (index.runs.length > 0) {
			throw new Error(
				`Missing aggregates/latest.json for indexed runs (runs=${index.runs.length}, latestCheckpointId=${index.latestCheckpointId ?? "null"}). Rebuild dashboard artifacts with \`bun dashboard:index\`.`,
			);
		}
		const emptyAggregate = createEmptyAggregate(index.latestCheckpointId);
		const fallbackParse = LeaderboardAggregateSchema.safeParse(emptyAggregate);
		if (!fallbackParse.success) {
			throw new Error(
				`Invalid latest aggregate fallback payload: ${fallbackParse.error.message}`,
			);
		}
		return fallbackParse.data;
	}
	if (!response.ok) {
		throw new Error(`Failed to fetch latest aggregate: ${response.status}`);
	}
	const data = await response.json();
	return LeaderboardAggregateSchema.parse(data);
}
