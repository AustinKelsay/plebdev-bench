/**
 * Purpose: Hydrate Published Run code evidence from local codeFilePath artifacts.
 * Exports: hydratePublishedCodeArtifactOutputs
 *
 * Invariants:
 * - Missing code files keep historical artifacts publishable.
 * - Readable code files become the published generation output before redaction.
 */

import { readFile, stat } from "node:fs/promises";
import type { RunResult } from "../../../src/schemas/index.js";

function isMissingFileError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

async function readOptionalCodeArtifact(
	codeFilePath: string,
): Promise<string | undefined> {
	try {
		const fileStats = await stat(codeFilePath);
		if (!fileStats.isFile()) {
			throw new Error(`Code artifact is not a file: ${codeFilePath}`);
		}
		const content = await readFile(codeFilePath, "utf-8");
		return content.trim().length > 0 ? content : undefined;
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}

/**
 * Copies local tool-written code artifacts into the generation output used for publication.
 *
 * @param run - Parsed Run Result before Published Redaction
 * @returns Run Result with readable codeFilePath contents copied into generation.output
 * @throws {Error} If a codeFilePath exists but is not a file or cannot be read
 */
export async function hydratePublishedCodeArtifactOutputs(
	run: RunResult,
): Promise<RunResult> {
	const items = await Promise.all(
		run.items.map(async (item) => {
			const generation = item.generation;
			const codeFilePath = generation?.codeFilePath;
			if (!codeFilePath) {
				return item;
			}

			const code = await readOptionalCodeArtifact(codeFilePath);
			if (code === undefined) {
				return item;
			}

			return {
				...item,
				generation: {
					...generation,
					output: code,
				},
			};
		}),
	);

	return { ...run, items };
}
