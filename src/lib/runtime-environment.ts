/**
 * Purpose: Collect Runtime Environment software provenance for run artifacts.
 * Exports: collectRuntimeEnvironment
 *
 * Invariants:
 * - Tool versions are provenance, not Harness or Machine Profile identity.
 * - Missing optional tool probes are represented explicitly.
 */

import type { RuntimeEnvironment } from "../schemas/index.js";
import { runExecFile } from "./exec.js";

/** Inputs for Runtime Environment collection. */
export interface RuntimeEnvironmentCollectionOptions {
	platform: string;
	bunVersion: string;
	toolNames?: string[];
}

function parseVersion(output: string): string | undefined {
	const match = output.match(/\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?/);
	return match?.[0];
}

/**
 * Collects concrete runtime/tool version provenance for a Benchmark Run.
 *
 * @param options - Platform, Bun version, and optional tool names to probe
 * @returns Runtime Environment metadata suitable for run artifacts
 * @throws {never} Unavailable tool probes are captured as explicit provenance records
 */
export async function collectRuntimeEnvironment(
	options: RuntimeEnvironmentCollectionOptions,
): Promise<RuntimeEnvironment> {
	const toolVersions: NonNullable<RuntimeEnvironment["toolVersions"]> = {};

	for (const toolName of options.toolNames ?? []) {
		const result = await runExecFile(toolName, ["--version"]).catch(
			(error) => ({
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
				exitCode: 127,
			}),
		);
		if (result.exitCode === 0) {
			toolVersions[toolName] = {
				status: "detected",
				version:
					parseVersion(`${result.stdout}\n${result.stderr}`) ?? "unknown",
			};
			continue;
		}
		toolVersions[toolName] = {
			status: "unavailable",
			detail:
				result.stderr.trim() ||
				result.stdout.trim() ||
				`${toolName} --version exited ${result.exitCode}`,
		};
	}

	return {
		platform: options.platform,
		bunVersion: options.bunVersion,
		...(Object.keys(toolVersions).length > 0 ? { toolVersions } : {}),
	};
}
