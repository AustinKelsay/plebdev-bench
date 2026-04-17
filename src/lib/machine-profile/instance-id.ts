/**
 * Purpose: Resolve and persist stable per-machine instance identifiers.
 * Exports: resolveMachineInstanceId, resolveDefaultInstanceIdPath
 *
 * Invariants:
 * - Generated instance IDs are random and never derived from hardware
 * - Instance ID files are stable across runs on the same machine
 */

import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MachineInstanceIdSource } from "../../schemas/index.js";

/** New environment variable name for machine instance IDs. */
export const MACHINE_INSTANCE_ID_ENV_VAR = "BENCH_MACHINE_INSTANCE_ID";

/** Deprecated legacy environment variable for machine instance IDs. */
export const LEGACY_MACHINE_ID_ENV_VAR = "BENCH_MACHINE_ID";

/**
 * Trims a candidate string and returns undefined when empty.
 *
 * @param value - Candidate string
 * @returns Trimmed non-empty string or undefined
 */
function readNonEmpty(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves the default state-file path for generated machine instance IDs.
 *
 * @param platform - Runtime platform name
 * @param env - Process environment
 * @returns Absolute state-file path
 */
export function resolveDefaultInstanceIdPath(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const homeDir =
		readNonEmpty(env.HOME) ??
		(platform === "win32" ? readNonEmpty(env.USERPROFILE) : undefined) ??
		os.homedir();
	if (platform === "darwin") {
		return path.join(
			homeDir,
			"Library",
			"Application Support",
			"plebdev-bench",
			"machine-instance-id",
		);
	}
	if (platform === "win32") {
		const localAppData =
			readNonEmpty(env.LOCALAPPDATA) ?? path.join(homeDir, "AppData", "Local");
		return path.join(localAppData, "plebdev-bench", "machine-instance-id");
	}
	const stateHome =
		readNonEmpty(env.XDG_STATE_HOME) ?? path.join(homeDir, ".local", "state");
	return path.join(stateHome, "plebdev-bench", "machine-instance-id");
}

/**
 * Writes a generated instance ID to disk atomically.
 *
 * @param targetPath - Destination path
 * @param value - Instance ID value
 * @returns Persisted instance ID value
 */
function writeGeneratedInstanceId(targetPath: string, value: string): string {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	let fileDescriptor: number | undefined;
	try {
		fileDescriptor = fs.openSync(targetPath, "wx", 0o600);
		fs.writeFileSync(fileDescriptor, `${value}\n`, "utf-8");
		fs.fchmodSync(fileDescriptor, 0o600);
		return value;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			const deadline = Date.now() + 50;
			while (Date.now() < deadline) {
				const persisted = readPersistedInstanceId(targetPath);
				if (persisted) {
					return persisted;
				}
			}
			throw new Error(
				`Machine instance ID file was created concurrently but remained unreadable: ${targetPath}`,
				{ cause: error },
			);
		}
		try {
			if (fileDescriptor !== undefined) {
				fs.closeSync(fileDescriptor);
				fileDescriptor = undefined;
			}
		} catch {
			// Best-effort cleanup only.
		}
		try {
			if (fs.existsSync(targetPath)) {
				fs.unlinkSync(targetPath);
			}
		} catch {
			// Best-effort cleanup only.
		}
		throw error;
	} finally {
		try {
			if (fileDescriptor !== undefined) {
				fs.closeSync(fileDescriptor);
			}
		} catch {
			// Best-effort cleanup only.
		}
	}
}

/**
 * Repairs a blank persisted instance-ID file and returns the final stored value.
 *
 * @param targetPath - Path to the persisted ID file
 * @param fallbackValue - Generated instance ID to persist when repair is needed
 * @returns Persisted non-empty instance ID
 * @throws {Error} When the file cannot be repaired into a readable non-empty value
 */
function repairPersistedInstanceId(
	targetPath: string,
	fallbackValue: string,
): string {
	fs.writeFileSync(targetPath, `${fallbackValue}\n`, {
		encoding: "utf-8",
		mode: 0o600,
	});
	fs.chmodSync(targetPath, 0o600);
	const persisted = readPersistedInstanceId(targetPath);
	if (persisted) {
		return persisted;
	}
	throw new Error(
		`Machine instance ID file exists but could not be repaired: ${targetPath}`,
	);
}

/**
 * Reads an existing persisted instance ID when present.
 *
 * @param instanceIdFilePath - Path to the persisted ID file
 * @returns Persisted instance ID when present
 */
function readPersistedInstanceId(
	instanceIdFilePath: string,
): string | undefined {
	if (!fs.existsSync(instanceIdFilePath)) {
		return undefined;
	}
	return readNonEmpty(fs.readFileSync(instanceIdFilePath, "utf-8"));
}

/**
 * Generates a new anonymous machine instance ID.
 *
 * @returns New stable-looking random instance ID
 */
function buildGeneratedInstanceId(): string {
	return `inst_${randomBytes(16).toString("hex")}`;
}

/** Options for resolving machine instance IDs. */
export interface ResolveMachineInstanceIdOptions {
	configuredInstanceId?: string;
	legacyConfiguredInstanceId?: string;
	env?: NodeJS.ProcessEnv;
	instanceIdFilePath?: string;
}

/** Resolved machine instance ID plus its source. */
export interface ResolvedMachineInstanceId {
	instanceId: string;
	instanceIdSource: MachineInstanceIdSource;
}

/**
 * Resolves a stable machine instance identifier from config, env, or local state.
 *
 * @param options - Resolution options
 * @returns Resolved machine instance identity
 */
export function resolveMachineInstanceId(
	options: ResolveMachineInstanceIdOptions = {},
): ResolvedMachineInstanceId {
	const env = options.env ?? process.env;
	const configuredInstanceId = readNonEmpty(options.configuredInstanceId);
	if (configuredInstanceId) {
		return {
			instanceId: configuredInstanceId,
			instanceIdSource: "config",
		};
	}

	const legacyConfiguredInstanceId = readNonEmpty(
		options.legacyConfiguredInstanceId,
	);
	if (legacyConfiguredInstanceId) {
		return {
			instanceId: legacyConfiguredInstanceId,
			instanceIdSource: "config",
		};
	}

	const envInstanceId =
		readNonEmpty(env[MACHINE_INSTANCE_ID_ENV_VAR]) ??
		readNonEmpty(env[LEGACY_MACHINE_ID_ENV_VAR]);
	if (envInstanceId) {
		return {
			instanceId: envInstanceId,
			instanceIdSource: "env",
		};
	}

	const instanceIdFilePath =
		options.instanceIdFilePath ??
		resolveDefaultInstanceIdPath(process.platform, env);
	const persisted = readPersistedInstanceId(instanceIdFilePath);
	if (persisted) {
		return {
			instanceId: persisted,
			instanceIdSource: "generated",
		};
	}
	if (fs.existsSync(instanceIdFilePath)) {
		const deadline = Date.now() + 50;
		while (Date.now() < deadline) {
			const concurrentPersisted = readPersistedInstanceId(instanceIdFilePath);
			if (concurrentPersisted) {
				return {
					instanceId: concurrentPersisted,
					instanceIdSource: "generated",
				};
			}
		}
		throw new Error(
			`Machine instance ID file exists but remained unreadable after waiting: ${instanceIdFilePath}`,
		);
	}

	const generated = buildGeneratedInstanceId();
	return {
		instanceId: writeGeneratedInstanceId(instanceIdFilePath, generated),
		instanceIdSource: "generated",
	};
}
