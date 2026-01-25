#!/usr/bin/env bun
/**
 * Purpose: CLI entrypoint for plebdev-bench.
 *
 * Run with: bun run src/index.ts [command] [options]
 * Or via: bun run bench [command] [options]
 */

import { runCli } from "./cli/index.js";

runCli();
