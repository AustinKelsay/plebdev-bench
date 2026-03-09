/**
 * Purpose: Build tool-first prompts for tool-calling harnesses.
 * Exports: ToolPromptConfig, buildToolPrompt, buildWorkspaceToolPrompt
 *
 * Invariants:
 * - Tool instructions wrap the task prompt to override "output only code" prompts.
 * - The prompt always references the exact tool name(s) and target filename.
 */

/** Configuration for tool-first prompt construction. */
export interface ToolPromptConfig {
	/** Tool names to instruct the model to use (e.g., ["text_editor"] or ["edit", "write"]). */
	toolNames: string[];
	/** Output filename expected from the tool in code-output mode. */
	solutionFilename?: string;
	/** Task prompt content from the benchmark test. */
	taskPrompt: string;
	/** Optional hint about tool arguments (kept minimal to avoid over-coaching). */
	toolUsageHint?: string;
}

/**
 * Formats tool names for human-readable instructions.
 *
 * @param toolNames - Tool name list
 * @returns Display string for tools
 */
function formatToolNames(toolNames: string[]): string {
	if (toolNames.length === 1) return toolNames[0];
	if (toolNames.length === 2) return `${toolNames[0]} or ${toolNames[1]}`;
	const head = toolNames.slice(0, -1).join(", ");
	const tail = toolNames[toolNames.length - 1];
	return `${head}, or ${tail}`;
}

/**
 * Builds a tool-first prompt that enforces tool usage.
 *
 * @param config - Prompt configuration
 * @returns Combined prompt with tool instructions and task content
 *
 * @throws {Error} If toolNames is empty
 */
export function buildToolPrompt(config: ToolPromptConfig): string {
	const { toolNames, solutionFilename, taskPrompt, toolUsageHint } = config;
	if (!Array.isArray(toolNames) || toolNames.length === 0) {
		throw new Error("toolNames must include at least one tool name");
	}
	if (
		typeof solutionFilename !== "string" ||
		solutionFilename.trim().length === 0
	) {
		throw new Error(
			"solutionFilename must be provided for code-output prompts",
		);
	}

	const toolLabel = formatToolNames(toolNames);
	const trimmedTask = taskPrompt.trim();

	const preambleLines = [
		"IMPORTANT: Tool-only mode.",
		`- You MUST use the ${toolLabel} tool to write a complete TypeScript module to "${solutionFilename}" in the current directory.`,
		"- Invoke the tool directly (do not print a JSON/XML tool call).",
		`- Example (do not output): use ${toolLabel} to write "${solutionFilename}" with your code.`,
		"- Do NOT output code in chat. Plain text is ignored and will be treated as failure.",
		'- If the task says "Output only TypeScript code", treat that as the contents of the file you write with the tool.',
		"- After writing the file, you may respond with a short confirmation like DONE.",
	];
	if (toolUsageHint && toolUsageHint.trim().length > 0) {
		preambleLines.push(`- Tool hint: ${toolUsageHint.trim()}`);
	}
	const preamble = preambleLines.join("\n");

	const reminder = `REMINDER: Use the ${toolLabel} tool to write "${solutionFilename}".`;

	return `${preamble}\n\nTASK:\n${trimmedTask}\n\n${reminder}`;
}

/**
 * Builds a workspace-scoped tool prompt for filesystem tasks.
 *
 * @param config - Prompt configuration
 * @returns Combined prompt with workspace safety instructions
 *
 * @throws {Error} If toolNames is empty
 */
export function buildWorkspaceToolPrompt(config: ToolPromptConfig): string {
	const { toolNames, taskPrompt } = config;
	if (!Array.isArray(toolNames) || toolNames.length === 0) {
		throw new Error("toolNames must include at least one tool name");
	}

	const toolLabel = formatToolNames(toolNames);
	return [
		"IMPORTANT: Workspace benchmark mode.",
		`- You are already inside the isolated benchmark workspace. Use the ${toolLabel} tool for file operations.`,
		"- Operate only on files inside the current directory.",
		"- Do not ask for confirmation, approval, or more context.",
		"- Do not print file contents or patches in chat.",
		"- After finishing the task, reply with a short confirmation like DONE.",
		"",
		"TASK:",
		taskPrompt.trim(),
	].join("\n");
}
