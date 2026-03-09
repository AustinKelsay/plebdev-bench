/**
 * Purpose: Scoring specification for event-emitter benchmark test.
 * Exports: spec
 *
 * Tests listener ordering, duplicate registrations, once semantics, and event isolation.
 */

import type { ScoringSpec } from "../../schemas/index.js";

function listenerA(payload: unknown): string {
	return `A:${String(payload)}`;
}

function listenerB(payload: unknown): string {
	return `B:${String(payload)}`;
}

function buildListener(payload: unknown): string {
	return `BUILD:${String(payload)}`;
}

export const spec: ScoringSpec = {
	testSlug: "event-emitter",
	mode: "code-module",

	expectedExports: [{ name: "createEventEmitter", type: "function" }],

	factoryFn: "createEventEmitter",

	testCases: [
		{
			fn: "listenerCount",
			args: ["deploy"],
			expected: 0,
			description: "new event starts with zero listeners",
		},
		{
			fn: "off",
			args: ["deploy", listenerA],
			expected: false,
			description: "off returns false for missing listener",
		},
		{
			fn: "on",
			args: ["deploy", listenerA],
			expected: 1,
			description: "on adds first listener",
		},
		{
			fn: "on",
			args: ["deploy", listenerA],
			expected: 2,
			description: "duplicate listener registration is allowed",
		},
		{
			fn: "emit",
			args: ["deploy", "a"],
			expected: ["A:a", "A:a"],
			description: "emit preserves registration order with duplicates",
		},
		{
			fn: "off",
			args: ["deploy", listenerA],
			expected: true,
			description: "off removes one matching listener",
		},
		{
			fn: "emit",
			args: ["deploy", "b"],
			expected: ["A:b"],
			description: "one duplicate remains after single off",
		},
		{
			fn: "once",
			args: ["deploy", listenerB],
			expected: 2,
			description: "once registers one-time listener",
		},
		{
			fn: "listenerCount",
			args: ["deploy"],
			expected: 2,
			description: "listenerCount includes one-time listeners before emit",
		},
		{
			fn: "emit",
			args: ["deploy", "c"],
			expected: ["A:c", "B:c"],
			description: "once listener fires on first emit",
		},
		{
			fn: "listenerCount",
			args: ["deploy"],
			expected: 1,
			description: "once listener removed after first emit",
		},
		{
			fn: "once",
			args: ["deploy", listenerB],
			expected: 2,
			description: "once can be registered again after consumption",
		},
		{
			fn: "once",
			args: ["deploy", listenerB],
			expected: 3,
			description: "duplicate once registration is supported",
		},
		{
			fn: "emit",
			args: ["deploy", "d"],
			expected: ["A:d", "B:d", "B:d"],
			description: "emit includes all current listeners in order",
		},
		{
			fn: "emit",
			args: ["deploy", "e"],
			expected: ["A:e"],
			description: "all once listeners removed before next emit",
		},
		{
			fn: "off",
			args: ["deploy", listenerB],
			expected: false,
			description: "off returns false after once listener consumed",
		},
		{
			fn: "on",
			args: ["build", buildListener],
			expected: 1,
			description: "separate event maintains isolated listeners",
		},
		{
			fn: "emit",
			args: ["build", "x"],
			expected: ["BUILD:x"],
			description: "build event emits only its listener",
		},
		{
			fn: "emit",
			args: ["deploy", "f"],
			expected: ["A:f"],
			description: "deploy event unaffected by build listeners",
		},
		{
			fn: "listenerCount",
			args: ["deploy"],
			expected: 1,
			description: "listenerCount reflects final deploy state",
		},
		{
			fn: "emit",
			args: ["unknown", "z"],
			expected: [],
			description: "emit on unknown event returns empty array",
		},
	],
};
