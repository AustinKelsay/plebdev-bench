/**
 * Purpose: Validate dashboard schema compatibility helpers.
 */

import { describe, expect, it } from "vitest";
import { LeaderboardAggregateSchema } from "../apps/dashboard/src/lib/schemas.js";

describe("LeaderboardAggregateSchema", () => {
	it("upgrades legacy schemaVersion 1 aggregates to the v2 shape", () => {
		const parsed = LeaderboardAggregateSchema.parse({
			schemaVersion: 1,
			generatedAt: "2026-03-25T12:00:00.000Z",
			checkpointId: "chk_test",
			summary: {
				runsConsidered: 2,
				runsMatched: 2,
				rawItems: 4,
				dedupedItems: 2,
				machines: 1,
				automatedScoreItems: 2,
				frontierEvalItems: 1,
			},
			machines: [
				{
					machineProfileId: "legacy-machine",
					machineLabel: "Legacy Machine",
					verificationStatus: "self_reported",
					runCount: 2,
					itemCount: 2,
				},
			],
			items: [
				{
					id: "01",
					runtime: "ollama",
					model: "llama3.2:3b",
					harness: "direct",
					test: "smoke",
					passType: "blind",
					status: "completed",
					machineProfileId: "legacy-machine",
					machineLabel: "Legacy Machine",
					verificationStatus: "self_reported",
					sourceRunId: "run-a",
					sourceCompletedAt: "2026-03-25T12:00:00.000Z",
				},
			],
		});

		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.summary.instances).toBe(1);
		expect(parsed.machines[0]?.machineProfileKey).toBe("legacy-machine");
		expect(parsed.machines[0]?.instanceCount).toBe(1);
		expect(parsed.items[0]?.machineProfileKey).toBe("legacy-machine");
		expect(parsed.items[0]?.machineDisplayLabel).toBe("Legacy Machine");
	});
});
