/**
 * Purpose: Pino logger configured for human-readable CLI output.
 * Exports: logger, createLogger
 *
 * Default behavior: human-readable via pino-pretty transport.
 * Structured fields: runId, model, harness, test, passType.
 */

import pino from "pino";

/**
 * Root logger instance configured for CLI output.
 * Uses pino-pretty for human-readable formatting.
 */
export const logger = pino({
	redact: {
		paths: [
			"apiKey",
			"openRouterKey",
			"OPENROUTER_API_KEY",
			"authorization",
			"Authorization",
			"headers.authorization",
			"headers.Authorization",
			"request.headers.authorization",
			"request.headers.Authorization",
		],
		censor: "[redacted]",
		remove: false,
	},
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true,
			ignore: "pid,hostname",
			translateTime: "HH:MM:ss",
		},
	},
	level: process.env.LOG_LEVEL ?? "info",
});

/**
 * Creates a child logger with additional context bindings.
 *
 * @param bindings - Key-value pairs to include in all log entries
 * @returns A child logger instance
 *
 * @example
 * const runLogger = createLogger({ runId: '20260114-143052' });
 * runLogger.info('Starting run');
 */
export function createLogger(bindings: Record<string, unknown>): pino.Logger {
	return logger.child(bindings);
}
