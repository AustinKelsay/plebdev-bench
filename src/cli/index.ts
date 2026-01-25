/**
 * Purpose: Main CLI program setup using commander.
 * Exports: program, runCli
 *
 * The CLI is non-interactive by default (script-friendly).
 */

import { Command } from "commander";
import { compareCommand } from "./compare-command.js";
import { runCommand } from "./run-command.js";

/** Main CLI program instance. */
export const program = new Command();

program
	.name("bench")
	.description("Local LLM benchmark runner")
	.version("0.1.0");

program.addCommand(runCommand);
program.addCommand(compareCommand);

/**
 * Runs the CLI with process arguments.
 * This is the main entrypoint called from src/index.ts.
 */
export async function runCli(): Promise<void> {
	await program.parseAsync(process.argv);
}
