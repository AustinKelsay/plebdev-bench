/**
 * Purpose: Shared child-process execution helpers for non-harness probes.
 * Exports: runExecFile
 *
 * Invariants:
 * - Callers receive stdout/stderr plus exit code without shell interpolation.
 * - Command failures return structured output when `reject` is false.
 */

import { execa } from "execa";

/** Result from running one executable without a shell. */
export interface ExecFileResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Runs an executable directly through the shared process abstraction.
 *
 * @param command - Executable name or path
 * @param args - Command arguments
 * @returns Captured process output and exit code
 * @throws {Error} If spawning fails or the command rejects unexpectedly
 */
export async function runExecFile(
	command: string,
	args: string[],
): Promise<ExecFileResult> {
	const result = await execa(command, args, { reject: false });
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode ?? 0,
	};
}
