/**
 * Purpose: Regression tests for domain documentation contracts.
 * Exports: none
 *
 * Invariants:
 * - Tests verify durable documentation behavior, not prose formatting details.
 * - Domain docs must keep glossary navigation and ADR guardrails intact.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readRepoFile(path: string): string {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("domain documentation", () => {
	it("keeps the Plebdev Bench Context navigable by concept cluster", () => {
		const context = readRepoFile("CONTEXT.md");

		expect(context).toContain("### Run Identity And Artifacts");
		expect(context).toContain("### Benchmark Content");
		expect(context).toContain("### Execution And Model Identity");
		expect(context).toContain("### Scoring And Evidence");
		expect(context).toContain("### Comparison And Publishing");
		expect(context).toContain("### Machine And Provenance");
		expect(context.length).toBeGreaterThan(0);
	});

	it("keeps critical glossary terms and deprecated aliases explicit", () => {
		const context = readRepoFile("CONTEXT.md");
		const requiredTerms = [
			"**Benchmark Evidence**",
			"**Output Contract**",
			"**Compatible Run Results**",
			"**Published Redaction**",
			"**Schema Version**",
			"**Model Exclusion**",
		];

		for (const term of requiredTerms) {
			expect(context).toContain(term);
		}
		expect(context).toContain('"modelAlias" is deprecated');
		expect(context).toContain('"machineProfileId" and "machineLabel"');
	});

	it("keeps project-facing docs aligned with publishing and compatibility terms", () => {
		const docs = [
			readRepoFile("README.md"),
			readRepoFile("docs/domain-glossary-adoption.md"),
		].join("\n");
		const plainDocs = docs.replaceAll("**", "");

		const requiredTerms = [
			"Benchmark Evidence",
			"Output Contract",
			"Compatible Run Results",
			"Published Run",
			"Published Redaction",
			"Schema Version",
		];

		for (const term of requiredTerms) {
			expect(docs).toContain(term);
		}
		expect(plainDocs).toContain(
			"Benchmark Checkpoint identity changes when benchmark meaning changes",
		);
		expect(plainDocs).toContain(
			"execution/scoring semantics such as harnesses, runtimes, runner behavior, extraction, workspace scoring, retry behavior, and signal assessment",
		);
		expect(docs).toContain("does not define a permanent redaction policy");
		expect(docs).not.toMatch(/\bcheckpoint hash\b/i);
	});

	it("keeps schema comments tied to glossary terms while retaining persisted fields", () => {
		const schemaComments = [
			readRepoFile("src/schemas/common.schema.ts"),
			readRepoFile("src/schemas/plan.schema.ts"),
			readRepoFile("src/schemas/result.schema.ts"),
		].join("\n");

		const requiredTerms = [
			"Schema Version",
			"Runtime Model",
			"Benchmark Test",
			"Benchmark Evidence",
			"Output Contract",
			"Generated Output",
			"Published Redaction",
			"Model Exclusion",
		];

		for (const term of requiredTerms) {
			expect(schemaComments).toContain(term);
		}
		expect(schemaComments).toContain("Resolved Run Config snapshot");
		expect(schemaComments).toContain(
			"Runtime Environment metadata snapshot, distinct from Machine Profile.",
		);
		expect(schemaComments).toContain(
			"Benchmark Checkpoint metadata, distinct from Schema Version.",
		);
		expect(schemaComments).toContain("modelAlias");
		expect(schemaComments).toContain("model: z.string()");
		expect(schemaComments).toContain("test: z.string()");
	});

	it("keeps ADR numbering sequential for domain decisions", () => {
		const adrNames = readdirSync(join(repoRoot, "docs/adr"))
			.filter((name) => /^\d{4}-.*\.md$/.test(name))
			.sort();

		adrNames.forEach((name, index) => {
			const expectedPrefix = String(index + 1).padStart(4, "0");
			expect(name.startsWith(`${expectedPrefix}-`)).toBe(true);
		});
		expect(adrNames).toContain(
			"0013-keep-deprecated-artifact-aliases-readable.md",
		);
	});
});
