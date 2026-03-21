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
	const homeDir = os.homedir();
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
			readNonEmpty(env.LOCALAPPDATA) ??
			path.join(homeDir, "AppData", "Local");
		return path.join(
			localAppData,
			"plebdev-bench",
			"machine-instance-id",
		);
	}
	const stateHome =
		readNonEmpty(env.XDG_STATE_HOME) ??
		path.join(homeDir, ".local", "state");
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
	const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
	try {
		fs.writeFileSync(tempPath, `${value}\n`, "utf-8");
		fs.renameSync(tempPath, targetPath);
	} catch (error) {
		try {
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		} catch {
			// Best-effort cleanup only.
		}
		throw error;
	}
	return value;
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

	const envInstanceId =
		readNonEmpty(env[MACHINE_INSTANCE_ID_ENV_VAR]) ??
		readNonEmpty(env[LEGACY_MACHINE_ID_ENV_VAR]);
	if (envInstanceId) {
		return {
			instanceId: envInstanceId,
			instanceIdSource: "env",
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

	const instanceIdFilePath =
		options.instanceIdFilePath ?? resolveDefaultInstanceIdPath(process.platform, env);
	const persisted = readPersistedInstanceId(instanceIdFilePath);
	if (persisted) {
		return {
			instanceId: persisted,
			instanceIdSource: "generated",
		};
	}

	const generated = buildGeneratedInstanceId();
	return {
		instanceId: writeGeneratedInstanceId(instanceIdFilePath, generated),
		instanceIdSource: "generated",
	};
}
