/**
 * Purpose: Scoring specification for ttl-cache benchmark test.
 * Exports: spec
 *
 * Tests deterministic TTL expiration, overwrite behavior, and cache mutations.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "ttl-cache",

	expectedExports: [{ name: "createTtlCache", type: "function" }],

	factoryFn: "createTtlCache",

	testCases: [
		{ fn: "size", args: [0], expected: 0, description: "empty cache starts at size 0" },
		{ fn: "set", args: ["a", "one", 0, 500], expected: undefined, description: "set succeeds" },
		{ fn: "has", args: ["a", 0], expected: true, description: "entry exists right after set" },
		{ fn: "get", args: ["a", 499], expected: "one", description: "entry readable before expiry" },
		{ fn: "has", args: ["a", 500], expected: false, description: "entry expires exactly at boundary" },
		{ fn: "size", args: [500], expected: 0, description: "expired entries not counted in size" },
		{ fn: "set", args: ["a", "two", 600], expected: undefined, description: "set uses default ttl when omitted" },
		{ fn: "has", args: ["a", 1599], expected: true, description: "default ttl keeps entry alive before boundary" },
		{ fn: "has", args: ["a", 1600], expected: false, description: "default ttl expires at exact boundary" },
		{ fn: "set", args: ["a", "three", 1700, 100], expected: undefined, description: "overwrite refreshes value and ttl" },
		{ fn: "get", args: ["a", 1799], expected: "three", description: "overwritten value returned before short ttl expiry" },
		{ fn: "has", args: ["a", 1800], expected: false, description: "short ttl entry expires at boundary" },
		{ fn: "set", args: ["b", { ok: true }, 2000, 300], expected: undefined, description: "set supports object values" },
		{ fn: "get", args: ["b", 2200], expected: { ok: true }, description: "object value retrievable before expiry" },
		{ fn: "delete", args: ["b"], expected: true, description: "delete returns true when key existed" },
		{ fn: "delete", args: ["b"], expected: false, description: "delete returns false when key no longer exists" },
		{ fn: "set", args: ["x", "x", 2500, 1000], expected: undefined, description: "set x entry" },
		{ fn: "set", args: ["y", "y", 2500, 1000], expected: undefined, description: "set y entry" },
		{ fn: "size", args: [2500], expected: 2, description: "size counts multiple live entries" },
		{ fn: "clear", args: [], expected: undefined, description: "clear succeeds" },
		{ fn: "size", args: [2500], expected: 0, description: "clear removes all entries" },
		{ fn: "set", args: ["z", 42, 2600, 0], expected: undefined, description: "set with ttl 0 succeeds" },
		{ fn: "has", args: ["z", 2600], expected: false, description: "ttl 0 entry expires immediately" },
		{ fn: "set", args: ["u", undefined, 2700, 100], expected: undefined, description: "set supports undefined values" },
		{ fn: "has", args: ["u", 2700], expected: true, description: "undefined value can still be present" },
		{ fn: "get", args: ["u", 2700], expected: undefined, description: "get returns stored undefined value" },
		{ fn: "has", args: ["u", 2800], expected: false, description: "undefined value entry still expires at boundary" },
		{ fn: "set", args: ["m1", "short", 3000, 50], expected: undefined, description: "set mixed ttl entry short" },
		{ fn: "set", args: ["m2", "long", 3000, 500], expected: undefined, description: "set mixed ttl entry long" },
		{ fn: "size", args: [3050], expected: 1, description: "size excludes boundary-expired entries but keeps live ones" },
	],
};
