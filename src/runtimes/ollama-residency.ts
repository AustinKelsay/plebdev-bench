/**
 * Purpose: Enforce Ollama model residency invariants around benchmark execution.
 * Exports: LoadedOllamaModel, OllamaResidencyReport,
 *          listRunningOllamaModels, unloadOllamaModel,
 *          ensureOnlyOllamaModelLoaded
 *
 * Invariants:
 * - `/api/ps` responses are validated at the boundary.
 * - Unloads use the exact model name reported by Ollama.
 * - `model` and `model:latest` are treated as equivalent residency targets.
 */

import { z } from "zod";

const RESIDENCY_REQUEST_TIMEOUT_MS = 30_000;
const RESIDENCY_SETTLE_TIMEOUT_MS = 120_000;
const RESIDENCY_POLL_INTERVAL_MS = 500;
const LATEST_TAG_SUFFIX = ":latest";

const LoadedOllamaModelSchema = z
	.object({
		name: z.string().min(1),
	})
	.passthrough();

const RunningOllamaModelsResponseSchema = z
	.object({
		models: z.array(LoadedOllamaModelSchema),
	})
	.passthrough();

const UnloadOllamaModelResponseSchema = z
	.object({
		done: z.literal(true),
		done_reason: z.string().optional(),
	})
	.passthrough();

/** Loaded Ollama model record parsed from `/api/ps`. */
export type LoadedOllamaModel = z.infer<typeof LoadedOllamaModelSchema>;

/** Result summary from enforcing Ollama residency. */
export interface OllamaResidencyReport {
	/** Model allowed to remain loaded, or undefined when no models may remain. */
	allowedModel?: string;
	/** Final loaded model names reported by Ollama after enforcement. */
	loadedModels: string[];
	/** Model names that the guard requested Ollama to unload. */
	unloadedModels: string[];
}

/** Shared configuration for Ollama residency HTTP calls. */
export interface OllamaResidencyBaseConfig {
	/** Ollama API base URL. */
	baseUrl: string;
	/** Per-request timeout in milliseconds. */
	requestTimeoutMs?: number;
}

/** Configuration for unloading a single Ollama model. */
export interface UnloadOllamaModelConfig extends OllamaResidencyBaseConfig {
	/** Exact Ollama model name to unload. */
	model: string;
}

/** Configuration for enforcing the Ollama residency invariant. */
export interface EnsureOnlyOllamaModelLoadedConfig
	extends OllamaResidencyBaseConfig {
	/** Model allowed to remain loaded, or undefined to unload every model. */
	allowedModel?: string;
	/** Total time to wait for `/api/ps` to settle after unload requests. */
	settleTimeoutMs?: number;
	/** Delay between `/api/ps` checks while waiting for residency to settle. */
	pollIntervalMs?: number;
}

async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	try {
		return await fetch(url, {
			...options,
			signal: controller.signal,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (timedOut || errorMessage.toLowerCase().includes("timed out")) {
			throw new Error(
				`Ollama residency request timed out after ${Math.round(timeoutMs / 1000)}s`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function parseJsonResponse(
	response: Response,
	endpoint: string,
): Promise<unknown> {
	try {
		return await response.json();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON from ${endpoint}: ${errorMessage}`);
	}
}

async function fetchJson(
	endpoint: string,
	options: RequestInit,
	timeoutMs: number,
): Promise<unknown> {
	const response = await fetchWithTimeout(endpoint, options, timeoutMs);
	if (!response.ok) {
		const text = await response.text();
		const detail = text.trim().length > 0 ? `: ${text.trim()}` : "";
		throw new Error(
			`Ollama residency request failed: ${response.status} ${response.statusText}${detail}`,
		);
	}
	return parseJsonResponse(response, endpoint);
}

function normalizeOllamaModelName(model: string): string {
	return model.endsWith(LATEST_TAG_SUFFIX)
		? model.slice(0, -LATEST_TAG_SUFFIX.length)
		: model;
}

function isSameOllamaModel(first: string, second: string): boolean {
	return normalizeOllamaModelName(first) === normalizeOllamaModelName(second);
}

function isAllowedLoadedModel(
	model: LoadedOllamaModel,
	allowedModel: string | undefined,
): boolean {
	return (
		allowedModel !== undefined && isSameOllamaModel(model.name, allowedModel)
	);
}

function getForeignModels(
	models: LoadedOllamaModel[],
	allowedModel: string | undefined,
): LoadedOllamaModel[] {
	return models.filter((model) => !isAllowedLoadedModel(model, allowedModel));
}

function formatAllowedModel(allowedModel: string | undefined): string {
	return allowedModel ?? "none";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim();
	if (trimmed.length === 0) {
		throw new Error("Ollama residency baseUrl must not be empty");
	}
	return trimmed.replace(/\/+$/, "");
}

function normalizeRequiredModelName(model: string): string {
	const trimmed = model.trim();
	if (trimmed.length === 0) {
		throw new Error("Ollama residency model must not be empty");
	}
	return trimmed;
}

function normalizeAllowedModel(
	allowedModel: string | undefined,
): string | undefined {
	if (allowedModel === undefined) return undefined;
	const trimmed = allowedModel.trim();
	if (trimmed.length === 0) {
		throw new Error("Ollama residency allowedModel must not be empty");
	}
	return trimmed;
}

function validateRequestTimeoutMs(requestTimeoutMs: number | undefined): void {
	if (
		requestTimeoutMs !== undefined &&
		(!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0)
	) {
		throw new RangeError("requestTimeoutMs must be > 0");
	}
}

function validatePollIntervalMs(pollIntervalMs: number | undefined): void {
	if (
		pollIntervalMs !== undefined &&
		(!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0)
	) {
		throw new RangeError("pollIntervalMs must be >= 0");
	}
}

function validateSettleTimeoutMs(settleTimeoutMs: number | undefined): void {
	if (
		settleTimeoutMs !== undefined &&
		(!Number.isFinite(settleTimeoutMs) || settleTimeoutMs <= 0)
	) {
		throw new RangeError("settleTimeoutMs must be > 0");
	}
}

/**
 * Lists models currently loaded in Ollama memory.
 *
 * @param config - Ollama base URL and optional request timeout
 * @returns Validated loaded model records from `/api/ps`
 * @throws {Error} On HTTP failures, request timeouts, invalid JSON, or schema failures
 */
export async function listRunningOllamaModels(
	config: OllamaResidencyBaseConfig,
): Promise<LoadedOllamaModel[]> {
	validateRequestTimeoutMs(config.requestTimeoutMs);
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	const timeoutMs = config.requestTimeoutMs ?? RESIDENCY_REQUEST_TIMEOUT_MS;
	const endpoint = `${baseUrl}/api/ps`;
	const json = await fetchJson(endpoint, { method: "GET" }, timeoutMs);
	const parsed = RunningOllamaModelsResponseSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`Invalid response from ${endpoint}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
		);
	}
	return parsed.data.models;
}

/**
 * Requests immediate unload for one Ollama model.
 *
 * @param config - Ollama base URL, exact model name, and optional request timeout
 * @returns Resolves when Ollama accepts the unload request
 * @throws {Error} On HTTP failures, request timeouts, invalid JSON, or schema failures
 */
export async function unloadOllamaModel(
	config: UnloadOllamaModelConfig,
): Promise<void> {
	validateRequestTimeoutMs(config.requestTimeoutMs);
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	const model = normalizeRequiredModelName(config.model);
	const timeoutMs = config.requestTimeoutMs ?? RESIDENCY_REQUEST_TIMEOUT_MS;
	const endpoint = `${baseUrl}/api/generate`;
	const json = await fetchJson(
		endpoint,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt: "",
				stream: false,
				keep_alive: 0,
			}),
		},
		timeoutMs,
	);
	const parsed = UnloadOllamaModelResponseSchema.safeParse(json);
	if (!parsed.success) {
		throw new Error(
			`Invalid response from ${endpoint}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
		);
	}
}

/**
 * Ensures Ollama has only the allowed model loaded, or no loaded models.
 *
 * @param config - Ollama base URL, allowed model, and optional timing controls
 * @returns Residency report with final loaded models and unload requests made
 * @throws {Error} If unloading fails or `/api/ps` does not settle before timeout
 */
export async function ensureOnlyOllamaModelLoaded(
	config: EnsureOnlyOllamaModelLoadedConfig,
): Promise<OllamaResidencyReport> {
	validateRequestTimeoutMs(config.requestTimeoutMs);
	validatePollIntervalMs(config.pollIntervalMs);
	validateSettleTimeoutMs(config.settleTimeoutMs);
	const settleTimeoutMs = config.settleTimeoutMs ?? RESIDENCY_SETTLE_TIMEOUT_MS;
	const pollIntervalMs = config.pollIntervalMs ?? RESIDENCY_POLL_INTERVAL_MS;
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	const allowedModel = normalizeAllowedModel(config.allowedModel);
	let deadline: number | undefined;
	const unloadedModels: string[] = [];
	const requestedUnloadModels = new Set<string>();
	let loadedModels = await listRunningOllamaModels({
		baseUrl,
		requestTimeoutMs: config.requestTimeoutMs,
	});

	while (true) {
		const foreignModels = getForeignModels(loadedModels, allowedModel);
		if (foreignModels.length === 0) {
			return {
				...(allowedModel !== undefined ? { allowedModel } : {}),
				loadedModels: loadedModels.map((model) => model.name),
				unloadedModels,
			};
		}

		for (const model of foreignModels) {
			if (requestedUnloadModels.has(model.name)) continue;
			await unloadOllamaModel({
				baseUrl,
				model: model.name,
				requestTimeoutMs: config.requestTimeoutMs,
			});
			requestedUnloadModels.add(model.name);
			unloadedModels.push(model.name);
			deadline ??= performance.now() + settleTimeoutMs;
		}

		if (deadline !== undefined && performance.now() >= deadline) {
			throw new Error(
				`Timed out waiting for Ollama model residency; allowed=${formatAllowedModel(allowedModel)} stillLoaded=${foreignModels.map((model) => model.name).join(",") || "none"}`,
			);
		}

		const sleepMs =
			deadline === undefined
				? pollIntervalMs
				: Math.max(0, Math.min(pollIntervalMs, deadline - performance.now()));
		await sleep(sleepMs);
		loadedModels = await listRunningOllamaModels({
			baseUrl,
			requestTimeoutMs: config.requestTimeoutMs,
		});
	}
}
