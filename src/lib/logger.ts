/**
 * Purpose: Pino logger configured for human-readable CLI output.
 * Exports: logger, createLogger
 *
 * Invariants:
 * - Exports `logger` and `createLogger`.
 * - Output is human-readable synchronous `pino-pretty`.
 * - Structured fields such as runId, model, harness, test, and passType are preserved.
 * - `createLogger` always returns a configured Pino logger instance.
 *
 * Default behavior: human-readable via synchronous pino-pretty stream.
 * Structured fields: runId, model, harness, test, passType.
 */

import pino from "pino";
import pretty from "pino-pretty";
import { z } from "zod";

const EnvSchema = z
	.object({
		LOG_LEVEL: z
			.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
			.optional(),
	})
	.passthrough();

const parsedEnv = EnvSchema.parse(process.env);

const prettyStream = pretty({
	colorize: true,
	ignore: "pid,hostname",
	sync: true,
	translateTime: "HH:mm:ss",
});

/**
 * Root logger instance configured for CLI output.
 * Uses pino-pretty for human-readable formatting.
 */
export const logger = pino(
	{
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
		level: parsedEnv.LOG_LEVEL ?? "info",
	},
	prettyStream,
);

/**
 * Creates a child logger with additional context bindings.
 *
 * @param bindings - Key-value pairs to include in all log entries
 * @returns A child logger instance
 * @throws {Error} If Pino cannot create a child logger for the provided bindings
 *
 * @example
 * const runLogger = createLogger({ runId: '20260114-143052' });
 * runLogger.info('Starting run');
 */
export function createLogger(bindings: Record<string, unknown>): pino.Logger {
	return logger.child(bindings);
}
