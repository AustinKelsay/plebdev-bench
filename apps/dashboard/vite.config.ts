/**
 * Purpose: Vite configuration for plebdev-bench dashboard.
 * Configures React plugin, path aliases, and dev server for results.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync, existsSync } from "fs";

// Plugin to serve results directory
function serveResultsPlugin() {
  const resultsDir = path.resolve(__dirname, "../../results");

  return {
    name: "serve-results",
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: Function; end: Function }, next: Function) => {
        if (req.url?.startsWith("/results/")) {
          const filePath = path.join(resultsDir, req.url.replace("/results/", ""));
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
