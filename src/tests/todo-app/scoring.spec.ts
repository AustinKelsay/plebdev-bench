/**
 * Purpose: Scoring specification for todo-app benchmark test.
 * Exports: spec
 *
 * Tests todo list CRUD operations and filtering.
 * Uses a single instance to validate stateful behavior.
 */

import type { ScoringSpec } from "../../schemas/index.js";

export const spec: ScoringSpec = {
	testSlug: "todo-app",

	expectedExports: [{ name: "createTodoApp", type: "function" }],

	factoryFn: "createTodoApp",

	testCases: [
		// Initial state
		{
			fn: "listTodos",
			args: [],
			expected: [],
			description: "initial list is empty",
		},

		// Add two todos
		{
			fn: "addTodo",
			args: ["Todo A"],
			expected: { id: 1, text: "Todo A", completed: false },
			description: "addTodo returns todo with id 1",
		},
		{
			fn: "addTodo",
			args: ["Todo B"],
			expected: { id: 2, text: "Todo B", completed: false },
			description: "addTodo returns todo with id 2",
		},

		// Toggle one to completed
		{
			fn: "toggleTodo",
			args: [1],
			expected: undefined,
			description: "toggleTodo flips completion",
		},
		{
			fn: "listCompleted",
			args: [],
			expected: [{ id: 1, text: "Todo A", completed: true }],
			description: "listCompleted returns only completed",
		},
		{
			fn: "listPending",
			args: [],
			expected: [{ id: 2, text: "Todo B", completed: false }],
			description: "listPending returns only pending",
		},

		// Clear completed removes only completed
		{
			fn: "clearCompleted",
			args: [],
			expected: undefined,
			description: "clearCompleted removes completed",
		},
		{
			fn: "getTodo",
			args: [1],
			expected: undefined,
			description: "completed todo removed after clearCompleted",
		},
		{
			fn: "getTodo",
			args: [2],
			expected: { id: 2, text: "Todo B", completed: false },
			description: "pending todo remains after clearCompleted",
		},

		// Delete and ID reuse edge case
		{
			fn: "deleteTodo",
			args: [2],
			expected: true,
			description: "deleteTodo returns true when deleted",
		},
		{
			fn: "deleteTodo",
			args: [2],
			expected: false,
			description: "deleteTodo returns false when already deleted",
		},
		{
			fn: "addTodo",
			args: ["Todo C"],
			expected: { id: 3, text: "Todo C", completed: false },
			description: "ids are not reused after deletion",
		},

		// Non-existent operations should not throw
		{
			fn: "getTodo",
			args: [999],
			expected: undefined,
			description: "getTodo returns undefined for non-existent",
		},
		{
			fn: "toggleTodo",
			args: [999],
			expected: undefined,
			description: "toggleTodo on non-existent id",
		},
	],
};
