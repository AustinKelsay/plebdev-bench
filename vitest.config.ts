/**
 * Purpose: Vitest configuration for plebdev-bench.
 * Separates runner tests from benchmark scoring tests.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["test/**/*.test.ts"],
		exclude: ["src/tests/**/*.test.ts", "node_modules"],
		coverage: {
			reporter: ["text", "json"],
			exclude: ["node_modules", "test", "dist"],
		},
	},
});
