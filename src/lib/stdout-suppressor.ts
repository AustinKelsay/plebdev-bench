/**
 * Purpose: Suppress stdout/console output while running generated code safely.
 * Exports: suppressStdout, suppressStdoutAsync
 *
 * Invariants:
 * - Always restores stdout/console handlers, even on errors.
 * - `suppressStdoutAsync` exposes a manual restore hook for timeout paths.
 */

/**
 * Suppresses stdout during code execution to prevent generated code from polluting logs.
 *
 * @param fn - Function to execute with suppressed stdout
 * @returns Result of the function (supports both sync and async)
 */
export function suppressStdout<T>(fn: () => Promise<T>): Promise<T>;
export function suppressStdout<T>(fn: () => T): T;
export function suppressStdout<T>(fn: () => T | Promise<T>): T | Promise<T> {
	const originalWrite = process.stdout.write.bind(process.stdout);
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;

	const suppressedWrite = () => true;
	process.stdout.write = suppressedWrite as typeof process.stdout.write;
	console.log = () => {};
	console.error = () => {};
	console.warn = () => {};

	const restore = () => {
		process.stdout.write = originalWrite;
		console.log = originalLog;
		console.error = originalError;
		console.warn = originalWarn;
	};

	try {
		const result = fn();
		if (result instanceof Promise) {
			return result.finally(restore) as Promise<T>;
		}
		restore();
		return result;
	} catch (error) {
		restore();
		throw error;
	}
}

/**
 * Suppresses stdout during async code execution and provides a manual restore hook.
 *
 * @param fn - Async function to execute with suppressed stdout
 * @returns Promise and restore function for early cleanup
 */
export function suppressStdoutAsync<T>(fn: () => Promise<T>): {
	promise: Promise<T>;
	restore: () => void;
} {
	const originalWrite = process.stdout.write.bind(process.stdout);
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;
	let isRestored = false;

	const suppressedWrite = () => true;
	process.stdout.write = suppressedWrite as typeof process.stdout.write;
	console.log = () => {};
	console.error = () => {};
	console.warn = () => {};

	const restore = () => {
		if (isRestored) {
			return;
		}
		isRestored = true;
		process.stdout.write = originalWrite;
		console.log = originalLog;
		console.error = originalError;
		console.warn = originalWarn;
	};

	const promise = (async () => {
		try {
			return await fn();
		} finally {
			restore();
		}
	})();

	return { promise, restore };
}
