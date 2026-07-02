/**
 * Purpose: Free-space checks for long benchmark runs.
 * Exports: DEFAULT_MIN_FREE_DISK_BYTES, getBenchmarkWriteRoots,
 *          formatByteCount, assertFreeDiskSpace
 *
 * Invariants:
 * - Official-sized runs fail before disk pressure corrupts checkpoints.
 * - Checks cover all local write roots used by runner/harness artifacts.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Default minimum free space required before and during benchmark execution. */
export const DEFAULT_MIN_FREE_DISK_BYTES = 20 * 1024 ** 3;

function isErrorWithCode(error: unknown, code: string): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

/**
 * Formats byte counts as compact binary units.
 *
 * @param bytes - Non-negative byte count
 * @returns Human-readable binary size string
 * @throws {RangeError} If bytes is not finite or is negative
 */
export function formatByteCount(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		throw new RangeError(
			"formatByteCount bytes must be finite and non-negative",
		);
	}

	const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	return unitIndex === 0
		? `${Math.round(value)} ${units[unitIndex]}`
		: `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Returns benchmark write roots that need free-space checks.
 *
 * @param outputDir - Configured result output directory
 * @returns Absolute or platform-root paths used for run artifacts/temp files
 * @throws {never} This helper only normalizes path strings
 */
export function getBenchmarkWriteRoots(outputDir: string): string[] {
	const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
	const opencodeDataHome =
		xdgDataHome && xdgDataHome.length > 0
			? xdgDataHome
			: path.join(os.homedir(), ".local", "share");

	return [
		path.resolve(outputDir),
		os.tmpdir(),
		process.platform === "darwin" ? "/tmp" : os.tmpdir(),
		opencodeDataHome,
	].filter((value, index, values) => values.indexOf(value) === index);
}

async function resolveExistingPath(targetPath: string): Promise<string> {
	let currentPath = path.resolve(targetPath);

	while (true) {
		try {
			const stats = await fs.promises.stat(currentPath);
			return stats.isDirectory() ? currentPath : path.dirname(currentPath);
		} catch (error) {
			if (!isErrorWithCode(error, "ENOENT")) {
				throw error;
			}
			const parentPath = path.dirname(currentPath);
			if (parentPath === currentPath) {
				return currentPath;
			}
			currentPath = parentPath;
		}
	}
}

async function readAvailableBytes(targetPath: string): Promise<number> {
	const existingPath = await resolveExistingPath(targetPath);
	const stats = await fs.promises.statfs(existingPath);
	return Number(stats.bavail) * Number(stats.bsize);
}

/**
 * Asserts every supplied write root has enough available disk space.
 *
 * @param paths - Filesystem paths that may receive benchmark writes
 * @param minFreeBytes - Required available bytes; zero disables the guard
 * @param action - User-facing action label included in failure messages
 * @returns Resolves when all paths have enough available space
 * @throws {RangeError} If minFreeBytes is invalid
 * @throws {Error} If any path has less free space than required
 */
export async function assertFreeDiskSpace(input: {
	paths: string[];
	minFreeBytes: number;
	action: string;
}): Promise<void> {
	if (!Number.isFinite(input.minFreeBytes) || input.minFreeBytes < 0) {
		throw new RangeError("minFreeBytes must be finite and non-negative");
	}
	if (input.minFreeBytes === 0) {
		return;
	}

	const failures: string[] = [];
	for (const checkPath of input.paths) {
		const freeBytes = await readAvailableBytes(checkPath);
		if (freeBytes < input.minFreeBytes) {
			failures.push(`${checkPath}: ${formatByteCount(freeBytes)} free`);
		}
	}

	if (failures.length > 0) {
		throw new Error(
			`Insufficient free disk space for ${input.action}; require at least ${formatByteCount(input.minFreeBytes)} at each benchmark write root. ${failures.join("; ")}`,
		);
	}
}
