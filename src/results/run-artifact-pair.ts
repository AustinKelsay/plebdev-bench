/**
 * Purpose: Compute tamper-evidence metadata for canonical Run Artifact Pairs.
 * Exports: RunArtifactPairHash, computeRunArtifactPairHash
 *
 * Invariants:
 * - The Run Artifact Pair is exactly one Run Plan plus one Run Result.
 * - Hashing is deterministic for equivalent JSON-compatible artifact content.
 * - Plan and result run IDs must match before trust metadata is computed.
 */

import { createHash } from "node:crypto";
import {
	RunPlanSchema,
	RunResultSchema,
	type RunPlan,
	type RunProvenance,
	type RunResult,
} from "../schemas/index.js";

const RUN_ARTIFACT_PAIR_HASH_ALGORITHM = "sha256v1";

/** Tamper-evidence hash metadata for one Run Artifact Pair. */
export interface RunArtifactPairHash {
	algorithm: typeof RUN_ARTIFACT_PAIR_HASH_ALGORITHM;
	planHash: string;
	resultHash: string;
	pairHash: string;
}

/** Run Artifact Pair input for tamper-evidence hashing. */
export interface RunArtifactPairInput {
	plan: RunPlan;
	result: RunResult;
}

/** Redaction input for preparing Published Runs. */
export interface PublishedRunRedaction {
	pathTokens: Record<string, string>;
}

/** Input for preparing a Published Run artifact pair. */
export interface PreparePublishedRunInput extends RunArtifactPairInput {
	redaction: PublishedRunRedaction;
}

/** Prepared Published Run artifacts and their tamper-evidence metadata. */
export interface PreparedPublishedRun {
	plan: RunPlan;
	result: RunResult;
	tamperEvidence: RunArtifactPairHash;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Produces a SHA-256 hex digest for a string payload.
 *
 * @param value - Canonical string payload to hash
 * @returns Lowercase SHA-256 hex digest
 */
function hashString(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

/**
 * Converts a JSON-compatible value into a deterministic object-key order.
 *
 * @param value - JSON-compatible value
 * @returns Canonically ordered value
 */
function sortJsonValue(value: JsonValue): JsonValue {
	if (Array.isArray(value)) {
		return value.map((entry) => sortJsonValue(entry));
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, sortJsonValue(entry)]),
		);
	}
	return value;
}

/**
 * Serializes JSON-compatible artifact content in deterministic key order.
 *
 * @param value - Artifact content to serialize
 * @returns Canonical JSON string
 */
function canonicalizeJson(value: JsonValue): string {
	return JSON.stringify(sortJsonValue(value));
}

/**
 * Clones JSON-compatible artifact content.
 *
 * @param value - Artifact content
 * @returns Deep-cloned artifact content
 */
function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Removes self-referential tamper-evidence fields before hashing artifacts.
 *
 * @param value - Plan or result artifact
 * @returns Artifact copy without embedded tamper evidence
 */
function stripTamperEvidence<T extends RunPlan | RunResult>(value: T): T {
	const cloned = cloneJson(value);
	if (cloned.provenance) {
		delete (cloned.provenance as RunProvenance).tamperEvidence;
	}
	return cloned;
}

/**
 * Applies tamper-evidence metadata while preserving other provenance fields.
 *
 * @param provenance - Existing provenance metadata
 * @param tamperEvidence - Tamper-evidence metadata to attach
 * @returns Provenance metadata with tamper evidence
 */
function withTamperEvidence(
	provenance: RunProvenance | undefined,
	tamperEvidence: RunArtifactPairHash,
): RunProvenance {
	return {
		verificationStatus: provenance?.verificationStatus ?? "self_reported",
		source: provenance?.source ?? "local_cli",
		...(provenance?.submittedBy ? { submittedBy: provenance.submittedBy } : {}),
		...(provenance?.submittedAt ? { submittedAt: provenance.submittedAt } : {}),
		...(provenance?.notes ? { notes: provenance.notes } : {}),
		tamperEvidence,
	};
}

/**
 * Computes deterministic tamper-evidence hash metadata for a Run Artifact Pair.
 *
 * @param input - One Run Plan and one Run Result for the same Benchmark Run
 * @returns Hash metadata for the plan, result, and pair
 * @throws {Error} If the plan/result schemas are invalid or run IDs differ
 */
export function computeRunArtifactPairHash(
	input: RunArtifactPairInput,
): RunArtifactPairHash {
	const plan = RunPlanSchema.parse(input.plan);
	const result = RunResultSchema.parse(input.result);
	if (plan.runId !== result.runId) {
		throw new Error(
			`Run Artifact Pair runId mismatch: plan=${plan.runId} result=${result.runId}`,
		);
	}

	const hashablePlan = stripTamperEvidence(plan);
	const hashableResult = stripTamperEvidence(result);
	const planHash = hashString(
		canonicalizeJson(hashablePlan as unknown as JsonValue),
	);
	const resultHash = hashString(
		canonicalizeJson(hashableResult as unknown as JsonValue),
	);
	const pairHash = hashString(
		canonicalizeJson({
			algorithm: RUN_ARTIFACT_PAIR_HASH_ALGORITHM,
			planHash,
			resultHash,
			runId: plan.runId,
		}),
	);

	return {
		algorithm: RUN_ARTIFACT_PAIR_HASH_ALGORITHM,
		planHash,
		resultHash,
		pairHash,
	};
}

/**
 * Replaces local code file paths with redaction-safe source path tokens.
 *
 * @param result - Run Result to redact
 * @param redaction - Explicit path-token mapping
 * @returns Redacted Run Result
 * @throws {Error} If a generated code file path has no redaction token
 */
function redactResultPaths(
	result: RunResult,
	redaction: PublishedRunRedaction,
): RunResult {
	const redacted = cloneJson(result);
	for (const item of redacted.items) {
		const generation = item.generation;
		const codeFilePath = generation?.codeFilePath;
		if (!codeFilePath) {
			continue;
		}
		const sourcePathToken = redaction.pathTokens[codeFilePath];
		if (!sourcePathToken) {
			throw new Error(`Missing redaction token for codeFilePath: ${codeFilePath}`);
		}
		delete generation.codeFilePath;
		generation.sourcePathToken = sourcePathToken;
	}
	return redacted;
}

/**
 * Prepares a redacted Published Run artifact pair without changing verification.
 *
 * @param input - Run Artifact Pair and explicit redaction mapping
 * @returns Redacted plan/result artifacts plus tamper evidence
 * @throws {Error} If artifacts are invalid, mismatched, or cannot be redacted
 */
export function preparePublishedRun(
	input: PreparePublishedRunInput,
): PreparedPublishedRun {
	const plan = RunPlanSchema.parse(input.plan);
	const result = redactResultPaths(
		RunResultSchema.parse(input.result),
		input.redaction,
	);
	const tamperEvidence = computeRunArtifactPairHash({ plan, result });
	const publishedPlan = RunPlanSchema.parse({
		...cloneJson(plan),
		provenance: withTamperEvidence(plan.provenance, tamperEvidence),
	});
	const publishedResult = RunResultSchema.parse({
		...result,
		provenance: withTamperEvidence(result.provenance, tamperEvidence),
	});

	return {
		plan: publishedPlan,
		result: publishedResult,
		tamperEvidence,
	};
}
