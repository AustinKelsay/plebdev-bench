/**
 * Purpose: Validate machine-probe helper behavior.
 */

import { describe, expect, it } from "vitest";
import { dedupeAccelerators } from "../src/lib/machine-profile/probe-utils.js";

describe("dedupeAccelerators", () => {
	it("preserves repeated device counts while merging missing fields", () => {
		const deduped = dedupeAccelerators([
			{
				vendor: "NVIDIA",
				modelRaw: "RTX 4090",
				kind: "discrete",
				backend: "cuda",
				memoryBytes: 25_769_803_776,
			},
			{
				vendor: "NVIDIA",
				modelRaw: "RTX 4090",
				kind: "unknown",
			},
		]);

		expect(deduped).toHaveLength(1);
		expect(deduped[0]?.count).toBe(2);
		expect(deduped[0]?.backend).toBe("cuda");
		expect(deduped[0]?.memoryBytes).toBe(25_769_803_776);
		expect(deduped[0]?.kind).toBe("discrete");
	});
});
