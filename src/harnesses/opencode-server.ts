/**
 * Purpose: OpenCode server lifecycle management for --attach mode.
 * Exports: ensureServerRunning, stopServer
 *
 * This module manages a singleton OpenCode server instance to avoid
 * cold boot overhead on each generation request.
 *
 * Usage:
 *   const url = await ensureServerRunning();
 *   // Use opencode run --attach <url> ...
 *   await stopServer(); // cleanup
 *
 * Invariants:
 * - Only one server instance runs at a time
 * - Server auto-cleans up on process exit
 * - Health checks before reusing existing server
 */

import { execa, type ResultPromise } from "execa";
import { logger } from "../lib/logger.js";

/** Default port for OpenCode server. */
const DEFAULT_PORT = 4096;

/** Maximum wait time for server startup (ms). */
const SERVER_STARTUP_TIMEOUT_MS = 30_000;

/** Initial health check interval for exponential backoff (ms). */
const HEALTH_CHECK_INITIAL_MS = 100;

/** Multiplier for exponential backoff. */
const HEALTH_CHECK_BACKOFF_MULTIPLIER = 1.5;

/** Maximum health check interval (ms). */
const HEALTH_CHECK_MAX_MS = 500;

/** Singleton server state. */
let serverProcess: ResultPromise | null = null;
let serverUrl: string | null = null;

const log = logger.child({ service: "opencode-server" });

/**
 * Check if the server is healthy by making an HTTP request.
 *
 * @param url - Server URL to check
 * @returns True if server responds, false otherwise
 */
async function isServerHealthy(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "GET",
			signal: AbortSignal.timeout(2000),
		});
		return response.ok || response.status < 500;
	} catch {
		return false;
	}
}

/**
 * Wait for the server to become ready using exponential backoff.
 *
 * Starts with 100ms polling interval, multiplies by 1.5 each iteration,
 * caps at 500ms. This reduces startup latency for fast-starting servers
 * while still allowing time for slower starts.
 *
 * @param url - Server URL to poll
 * @param timeoutMs - Maximum wait time
 * @throws Error if server doesn't start within timeout
 */
async function waitForServerReady(
	url: string,
	timeoutMs: number = SERVER_STARTUP_TIMEOUT_MS,
): Promise<void> {
	const startTime = Date.now();
	let currentInterval = HEALTH_CHECK_INITIAL_MS;

	while (Date.now() - startTime < timeoutMs) {
		if (await isServerHealthy(url)) {
			log.debug({ url, elapsedMs: Date.now() - startTime }, "OpenCode server is ready");
			return;
		}

		// Wait with exponential backoff
		await new Promise((resolve) => setTimeout(resolve, currentInterval));

		// Increase interval with backoff, cap at max
		currentInterval = Math.min(
			currentInterval * HEALTH_CHECK_BACKOFF_MULTIPLIER,
			HEALTH_CHECK_MAX_MS,
		);
	}

	throw new Error(`OpenCode server did not start within ${timeoutMs}ms`);
}

/**
 * Ensures an OpenCode server is running and returns its URL.
 * Starts the server if not already running.
 *
 * @param port - Port to run the server on (default: 4096)
 * @returns Server URL
 * @throws Error if server fails to start
 */
export async function ensureServerRunning(port: number = DEFAULT_PORT): Promise<string> {
	const url = `http://localhost:${port}`;

	// ALWAYS check if server is already healthy on this port first
	// This handles: reusing our server, externally started servers,
	// or orphaned servers from previous runs/crashes
	if (await isServerHealthy(url)) {
		serverUrl = url;
		log.debug({ url }, "Reusing existing OpenCode server");
		return url;
	}

	// No server running on this port, start one
	log.info({ port }, "Starting OpenCode server...");

	// Environment to optimize for headless mode
	const env = {
		...process.env,
		OPENCODE_DISABLE_AUTOUPDATE: "true",
		OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
		OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
		OPENCODE_DISABLE_AUTOCOMPACT: "true",
		OPENCODE_DISABLE_PRUNE: "true",
		OPENCODE_DISABLE_TERMINAL_TITLE: "true",
	};

	// Run in temp directory to avoid codebase scanning
	const tmpDir = process.env.TMPDIR || "/tmp";

	// Start server in background (don't await - it runs forever)
	serverProcess = execa("opencode", ["serve", "--port", String(port)], {
		env,
		cwd: tmpDir,
		// Don't pipe to parent - let it run silently
		stdio: "ignore",
		// Detach so it survives if parent dies unexpectedly
		detached: false,
	});

	serverUrl = url;

	// Handle process errors (but not intentional kills during cleanup)
	serverProcess.catch((error) => {
		// Don't log error if it was killed intentionally (SIGTERM)
		const errorStr = String(error);
		if (!errorStr.includes("SIGTERM")) {
			log.error({ error: errorStr }, "OpenCode server crashed");
		}
		serverProcess = null;
		serverUrl = null;
	});

	// Wait for server to be ready
	await waitForServerReady(serverUrl);
	log.info({ url: serverUrl }, "OpenCode server started");

	return serverUrl;
}

/**
 * Stops the OpenCode server if running.
 */
export async function stopServer(): Promise<void> {
	if (serverProcess) {
		log.debug("Stopping OpenCode server...");
		try {
			serverProcess.kill("SIGTERM");
			// Give it a moment to clean up
			await Promise.race([
				serverProcess,
				new Promise((resolve) => setTimeout(resolve, 2000)),
			]);
		} catch {
			// Process already exited or kill failed, that's fine
		}
		serverProcess = null;
		serverUrl = null;
		log.debug("OpenCode server stopped");
	}
}

/**
 * Get the current server URL if running.
 *
 * @returns Server URL or null if not running
 */
export function getServerUrl(): string | null {
	return serverUrl;
}

// Register cleanup handlers
const cleanup = () => {
	if (serverProcess) {
		try {
			serverProcess.kill("SIGTERM");
		} catch {
			// Ignore errors during cleanup
		}
	}
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
	cleanup();
	process.exit(130);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(143);
});
