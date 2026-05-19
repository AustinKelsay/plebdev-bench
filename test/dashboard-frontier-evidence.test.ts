/**
 * Purpose: Guard dashboard wording for Frontier Eval as optional evidence.
 * Exports: none
 *
 * Invariants:
 * - Composite Score copy describes local ranking inputs only.
 * - Frontier Eval copy names judge-model provenance and avoids ranking language.
 */

import { describe, expect, it } from "vitest";
import {
	composite,
	itemDetail,
	matrix,
} from "../apps/dashboard/src/lib/tooltip-content.js";

describe("dashboard Frontier Eval evidence copy", () => {
	it("keeps Composite Score local-only while preserving Frontier Eval provenance", () => {
		const compositeText = [
			composite.description,
			composite.effectiveScore,
		].join(" ");
		const frontierText = [
			composite.frontier,
			matrix.eval,
			itemDetail.frontierEval,
		]
			.join(" ")
			.toLowerCase();

		expect(compositeText).toContain("pass rate");
		expect(compositeText).toContain("completion");
		expect(compositeText).toContain("tool success");
		expect(compositeText.toLowerCase()).not.toContain("frontier");
		expect(frontierText).toContain("optional");
		expect(frontierText).toContain("evidence");
		expect(frontierText).toContain("frontier eval model");
		expect(frontierText).toContain("not used for default ranking");
	});
});
