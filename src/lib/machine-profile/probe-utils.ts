/**
 * Purpose: Shared machine-probe helpers used across platform-specific collectors.
 * Exports: BYTES_PER_MIB, BYTES_PER_GIB, runProbe, parsePositiveInt, parseMemoryBytes, dedupeAccelerators
 *
 * Invariants:
 * - Probe helpers never throw for ordinary command failures
 * - Deduped accelerator entries preserve per-device counts
 */

import { execa } from "execa";
import type { ObservedAccelerator } from "../../schemas/index.js";

const PROBE_TIMEOUT_MS = 8_000;

/** Binary MiB conversion constant shared by probe parsers. */
export const BYTES_PER_MIB = 1024 ** 2;

/** Binary GiB conversion constant shared by probe parsers. */
export const BYTES_PER_GIB = 1024 ** 3;

/**
 * Attempts to execute a command and returns trimmed stdout on success.
 *
 * @param command - Command name
 * @param args - Command arguments
 * @returns Stdout text when the command succeeds
 */
export async function runProbe(
	command: string,
	args: string[],
): Promise<string | undefined> {
	try {
		const result = await execa(command, args, {
			timeout: PROBE_TIMEOUT_MS,
			reject: false,
		});
		if (result.exitCode !== 0) {
			return undefined;
		}
		const stdout = result.stdout.trim();
		return stdout.length > 0 ? stdout : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Parses a numeric probe result into a positive integer.
 *
 * @param value - Raw probe stdout
 * @returns Positive integer when valid
 */
export function parsePositiveInt(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value.trim(), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Parses a memory string such as `8 GB` or `8192 MB`.
 *
 * @param value - Raw memory string
 * @returns Memory in bytes when parsable
 */
export function parseMemoryBytes(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const normalized = value.trim().replace(/,/g, "");
	const match = normalized.match(
		/(\d+(?:\.\d+)?)\s*(tib|gib|mib|kib|tb|gb|mb|kb|b)?/i,
	);
	if (!match) return undefined;
	const amount = Number.parseFloat(match[1]);
	const unit = (match[2] ?? "b").toLowerCase().replace("ib", "b");
	if (!Number.isFinite(amount) || amount <= 0) return undefined;
	switch (unit) {
		case "tb":
			return Math.round(amount * 1024 * BYTES_PER_GIB);
		case "gb":
			return Math.round(amount * BYTES_PER_GIB);
		case "mb":
			return Math.round(amount * BYTES_PER_MIB);
		case "kb":
			return Math.round(amount * 1024);
		default:
			return Math.round(amount);
	}
}

/**
 * Deduplicates accelerators merged from multiple probe sources while preserving device counts.
 *
 * @param accelerators - Candidate accelerator entries
 * @returns Stable deduplicated accelerator list
 */
export function dedupeAccelerators(
	accelerators: ObservedAccelerator[],
): ObservedAccelerator[] {
	const deduped = new Map<string, ObservedAccelerator>();
	for (const accelerator of accelerators) {
		const key = accelerator.modelRaw.trim().toLowerCase();
		const current = deduped.get(key);
		if (!current) {
			deduped.set(key, { ...accelerator });
			continue;
		}
		const merged: ObservedAccelerator = {
			...current,
			count: (current.count ?? 1) + (accelerator.count ?? 1),
		};
		if (!current.vendor && accelerator.vendor) {
			merged.vendor = accelerator.vendor;
		}
		if (!current.memoryBytes && accelerator.memoryBytes) {
			merged.memoryBytes = accelerator.memoryBytes;
		}
		if (!current.backend && accelerator.backend) {
			merged.backend = accelerator.backend;
		}
		if (current.kind === "unknown" && accelerator.kind !== "unknown") {
			merged.kind = accelerator.kind;
		}
		deduped.set(key, merged);
	}
	return [...deduped.values()];
}
