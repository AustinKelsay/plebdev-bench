/**
 * Purpose: Scoring specification for rate-limiter benchmark test.
 * Exports: spec
 *
 * Tests stateful per-key fixed-window rate limiting with deterministic timestamps.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "rate-limiter",
	mode: "code-module",

	expectedExports: [{ name: "createRateLimiter", type: "function" }],

	factoryFn: "createRateLimiter",

	testCases: [
		{
			fn: "remaining",
			args: ["alpha", 0],
			expected: 3,
			description: "new key starts with full quota",
		},
		{
			fn: "allow",
			args: ["alpha", 0],
			expected: true,
			description: "first request allowed",
		},
		{
			fn: "allow",
			args: ["alpha", 10],
			expected: true,
			description: "second request allowed",
		},
		{
			fn: "allow",
			args: ["alpha", 20],
			expected: true,
			description: "third request allowed",
		},
		{
			fn: "allow",
			args: ["alpha", 30],
			expected: false,
			description: "fourth request denied in same window",
		},
		{
			fn: "remaining",
			args: ["alpha", 30],
			expected: 0,
			description: "remaining never below zero after denial",
		},
		{
			fn: "allow",
			args: ["beta", 30],
			expected: true,
			description: "different key has independent quota",
		},
		{
			fn: "remaining",
			args: ["beta", 30],
			expected: 2,
			description: "beta quota tracked independently",
		},
		{
			fn: "allow",
			args: ["beta", 31],
			expected: true,
			description: "beta second request allowed in same window",
		},
		{
			fn: "allow",
			args: ["beta", 32],
			expected: true,
			description: "beta third request allowed in same window",
		},
		{
			fn: "allow",
			args: ["beta", 33],
			expected: false,
			description: "beta fourth request denied in same window",
		},
		{
			fn: "allow",
			args: ["beta", 1030],
			expected: true,
			description: "beta resets on exact boundary after exhaustion",
		},
		{
			fn: "remaining",
			args: ["beta", 1030],
			expected: 2,
			description: "beta boundary reset restores quota accounting",
		},
		{
			fn: "allow",
			args: ["alpha", 999],
			expected: false,
			description: "still denied before boundary",
		},
		{
			fn: "allow",
			args: ["alpha", 1000],
			expected: true,
			description: "exact boundary opens fresh window",
		},
		{
			fn: "remaining",
			args: ["alpha", 1000],
			expected: 2,
			description: "fresh window resets quota accounting",
		},
		{
			fn: "reset",
			args: ["alpha"],
			expected: undefined,
			description: "reset succeeds without throw",
		},
		{
			fn: "remaining",
			args: ["alpha", 1000],
			expected: 3,
			description: "reset restores full quota",
		},
		{
			fn: "allow",
			args: ["alpha", 1001],
			expected: true,
			description: "requests allowed after reset",
		},
		{
			fn: "remaining",
			args: ["beta", 1030],
			expected: 2,
			description: "reset on alpha does not change beta state",
		},
	],
};
