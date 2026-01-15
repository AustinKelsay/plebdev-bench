/**
 * Purpose: Scoring specification for todo-app benchmark test.
 * Exports: spec
 *
 * Tests todo list CRUD operations and filtering.
 * Uses factoryFn with freshInstancePerTest.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "todo-app",

	expectedExports: [{ name: "createTodoApp", type: "function" }],

	factoryFn: "createTodoApp",
	freshInstancePerTest: true,

	testCases: [
		// Initial state
		{
			fn: "listTodos",
			args: [],
			expected: [],
			description: "initial list is empty",
		},

		// Add todo returns correct shape
		{
			fn: "addTodo",
			args: ["Test todo"],
			expected: { id: 1, text: "Test todo", completed: false },
			description: "addTodo returns todo with id, text, completed",
		},

		// List after add (fresh instance, so empty)
		{
			fn: "listTodos",
			args: [],
			expected: [],
			description: "fresh instance has empty list",
		},

		// List completed (empty)
		{
			fn: "listCompleted",
			args: [],
			expected: [],
			description: "listCompleted on empty list",
		},

		// List pending (empty)
		{
			fn: "listPending",
			args: [],
			expected: [],
			description: "listPending on empty list",
		},

		// Delete non-existent
		{
			fn: "deleteTodo",
			args: [999],
			expected: false,
			description: "deleteTodo returns false for non-existent",
		},

		// Get non-existent
		{
			fn: "getTodo",
			args: [999],
			expected: undefined,
			description: "getTodo returns undefined for non-existent",
		},

		// clearCompleted on empty list (should not error)
		{
			fn: "clearCompleted",
			args: [],
			expected: undefined,
			description: "clearCompleted on empty list",
		},

		// Toggle non-existent (should not error)
		{
			fn: "toggleTodo",
			args: [999],
			expected: undefined,
			description: "toggleTodo on non-existent id",
		},
	],
};
