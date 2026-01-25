/**
 * Purpose: `bench compare` stub command.
 * Exports: compareCommand
 *
 * This is a placeholder for the MVP. Actual comparison logic
 * will be implemented in a later phase.
 */

import { Command } from "commander";

/** CLI compare command (stub). */
export const compareCommand = new Command("compare")
	.description("Compare two benchmark runs")
	.argument("<run-a>", "First run ID or path")
	.argument("<run-b>", "Second run ID or path")
	.action(async (runA: string, runB: string) => {
		console.log("compare: not implemented yet");
		console.log(`  run-a: ${runA}`);
		console.log(`  run-b: ${runB}`);
	});
