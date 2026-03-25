/**
 * Purpose: Validate machine-probe helper behavior.
 */

import { describe, expect, it } from "vitest";
import { parseMacosAccelerators } from "../src/lib/machine-profile/probe-macos.js";
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

describe("parseMacosAccelerators", () => {
	it("rejects non-object JSON payloads with a deterministic probe error", () => {
		expect(() => parseMacosAccelerators("null")).toThrow(
			"malformed macOS accelerator probe JSON: missing SPDisplaysDataType array",
		);
		expect(() => parseMacosAccelerators("1")).toThrow(
			"malformed macOS accelerator probe JSON: missing SPDisplaysDataType array",
		);
	});

	it("ignores malformed display entries without throwing", () => {
		expect(
			parseMacosAccelerators(
				JSON.stringify({
					SPDisplaysDataType: [null, { _name: "Apple M4 Pro GPU" }],
				}),
			),
		).toEqual([
			{
				modelRaw: "Apple M4 Pro GPU",
				kind: "integrated",
				backend: "metal",
			},
		]);
	});
});
