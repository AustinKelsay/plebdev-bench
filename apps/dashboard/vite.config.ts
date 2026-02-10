import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
/**
 * Purpose: Vite configuration for plebdev-bench dashboard.
 * Configures React plugin, path aliases, and dev server for results.
 */
import { type ViteDevServer, defineConfig } from "vite";

// Plugin to serve results directory
function serveResultsPlugin() {
	const resultsDir = path.resolve(__dirname, "../../results");

	return {
		name: "serve-results",
		configureServer(server: ViteDevServer) {
			server.middlewares.use((req, res, next) => {
				if (req.url?.startsWith("/results/")) {
					// Parse URL to strip query string and decode the pathname
					const parsed = new URL(req.url, "http://localhost");
					const relativePath = decodeURIComponent(
						parsed.pathname.replace("/results/", ""),
					);

					// Resolve and verify path stays within resultsDir (prevent traversal)
					const filePath = path.resolve(resultsDir, relativePath);
					if (!filePath.startsWith(resultsDir + path.sep)) {
						next();
						return;
					}

					if (existsSync(filePath)) {
						try {
							const content = readFileSync(filePath, "utf-8");
							res.statusCode = 200;
							res.setHeader("Content-Type", "application/json");
							res.end(content);
							return;
						} catch {
							// Fall through to next handler
						}
					}
				}
				next();
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), serveResultsPlugin()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 5173,
		fs: {
			// Allow serving files from results directory at project root
			allow: ["../.."],
		},
	},
});
