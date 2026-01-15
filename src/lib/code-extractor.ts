/**
 * Purpose: Extract executable code from LLM output.
 * Exports: extractCode, ExtractedCode
 *
 * LLM outputs typically contain markdown code blocks mixed with explanations.
 * This module extracts the actual code for scoring.
 *
 * Strategy (in order):
 * 1. Extract ```typescript or ```ts blocks
 * 2. Fall back to any ``` code blocks
 * 3. Heuristic detection of code patterns
 * 4. Return raw output (will likely fail scoring)
 */

/** Result of code extraction. */
export interface ExtractedCode {
	/** The extracted code. */
	code: string;
	/** Method used for extraction. */
	method: "markdown-ts" | "markdown-any" | "heuristic" | "raw";
}

/**
 * Regex to match markdown code blocks.
 * Captures: language (optional) and content.
 */
const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Goose tool-use prefixes to strip.
 * These appear when Goose uses its text_editor tool.
 */
const GOOSE_PREFIXES = [
	/---\s*text_editor\s*\|\s*developer\s*---\n?/g,
	/---\s*\w+\s*\|\s*\w+\s*---\n?/g,
];

/**
 * Heuristic patterns that indicate code content.
 * Used when no markdown blocks are found.
 */
const CODE_PATTERNS = [
	/^(export\s+)?(function|const|let|var|class|interface|type)\s+\w+/m,
	/^(export\s+)?default\s+(function|class)/m,
	/^\s*\/\*\*[\s\S]*?\*\//m, // JSDoc
];

/**
 * Strips known harness-specific prefixes from output.
 *
 * @param output - Raw LLM output
 * @returns Cleaned output
 */
function stripHarnessPrefixes(output: string): string {
	let cleaned = output;
	for (const prefix of GOOSE_PREFIXES) {
		cleaned = cleaned.replace(prefix, "");
	}
	return cleaned.trim();
}

/**
 * Extracts code blocks from markdown with optional language filter.
 *
 * @param content - Markdown content
 * @param languages - Languages to match (empty = any)
 * @returns Array of code block contents
 */
function extractMarkdownBlocks(
	content: string,
	languages: string[],
): string[] {
	const blocks: string[] = [];
	const regex = new RegExp(CODE_BLOCK_REGEX.source, "g");

	let match: RegExpExecArray | null;
	while ((match = regex.exec(content)) !== null) {
		const lang = match[1]?.toLowerCase() || "";
		const code = match[2];

		if (languages.length === 0 || languages.includes(lang)) {
			blocks.push(code.trim());
		}
	}

	return blocks;
}

/**
 * Attempts to extract code using heuristic pattern matching.
 * Looks for function/const/class declarations.
 *
 * @param content - Raw content
 * @returns Extracted code or null
 */
function extractByHeuristic(content: string): string | null {
	// Check if content looks like code
	const looksLikeCode = CODE_PATTERNS.some((pattern) => pattern.test(content));

	if (!looksLikeCode) {
		return null;
	}

	// Try to find the start of code (skip leading prose)
	const lines = content.split("\n");
	let codeStartIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip empty lines and lines that look like prose
		if (
			line.trim() === "" ||
			(line.match(/^[A-Z]/) && line.includes(" ") && !line.includes("("))
		) {
			continue;
		}
		// Found potential code start
		if (CODE_PATTERNS.some((pattern) => pattern.test(line))) {
			codeStartIndex = i;
			break;
		}
	}

	return lines.slice(codeStartIndex).join("\n").trim();
}

/**
 * Extracts executable code from LLM output.
 *
 * @param rawOutput - Raw output from LLM generation
 * @returns Extracted code with method indicator
 *
 * @example
 * ```typescript
 * const { code, method } = extractCode(llmOutput);
 * console.log(`Extracted via ${method}: ${code.length} chars`);
 * ```
 */
export function extractCode(rawOutput: string): ExtractedCode {
	// Clean harness-specific noise
	const cleaned = stripHarnessPrefixes(rawOutput);

	// 1. Try typescript/ts code blocks
	const tsBlocks = extractMarkdownBlocks(cleaned, ["typescript", "ts"]);
	if (tsBlocks.length > 0) {
		return { code: tsBlocks.join("\n\n"), method: "markdown-ts" };
	}

	// 2. Try JavaScript blocks (common fallback)
	const jsBlocks = extractMarkdownBlocks(cleaned, ["javascript", "js"]);
	if (jsBlocks.length > 0) {
		return { code: jsBlocks.join("\n\n"), method: "markdown-any" };
	}

	// 3. Try any code block
	const anyBlocks = extractMarkdownBlocks(cleaned, []);
	if (anyBlocks.length > 0) {
		return { code: anyBlocks.join("\n\n"), method: "markdown-any" };
	}

	// 4. Heuristic: find code patterns
	const heuristic = extractByHeuristic(cleaned);
	if (heuristic) {
		return { code: heuristic, method: "heuristic" };
	}

	// 5. Return raw (will likely fail scoring)
	return { code: cleaned, method: "raw" };
}
