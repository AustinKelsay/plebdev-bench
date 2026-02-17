/**
 * Purpose: Run diagnostics for plan/execution alignment and scoring/eval coverage.
 * Exports: CoverageDiagnostics
 *
 * Invariants:
 * - "Plan Summary" values come from plan.summary/config snapshot.
 * - "Plan Items" values are derived from expanded plan.items.
 * - "Executed" values are derived from run.items.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	computeCoverageStats,
	computeDimensionCounts,
} from "@/lib/aggregations";
import type { RunPlan, RunResult } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface CoverageDiagnosticsProps {
	run: RunResult;
	plan: RunPlan;
}

type AlignmentRow = {
	label: string;
	planSummary: number;
	planItems: number;
	executed: number;
};

function getDeltaTone(base: number, actual: number): string {
	if (base === actual) return "text-success";
	if (actual > base) return "text-warning";
	return "text-danger";
}

function formatDelta(base: number, actual: number): string {
	const delta = actual - base;
	if (delta === 0) return "0";
	return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * Renders plan/execution alignment diagnostics and scoring/eval coverage.
 *
 * @param props - Run and plan payloads for a single run detail page
 * @returns React element
 */
export function CoverageDiagnostics({ run, plan }: CoverageDiagnosticsProps) {
	const coverage = computeCoverageStats(run.items);
	const planItemCounts = computeDimensionCounts(plan.items);
	const executedCounts = computeDimensionCounts(run.items);
	const frontierEvalFailures = run.items.filter(
		(i) => i.frontierEvalFailure,
	).length;

	const rows: AlignmentRow[] = [
		{
			label: "Items",
			planSummary: plan.summary.totalItems,
			planItems: planItemCounts.items,
			executed: executedCounts.items,
		},
		{
			label: "Runtimes",
			planSummary: plan.summary.runtimes,
			planItems: planItemCounts.runtimes,
			executed: executedCounts.runtimes,
		},
		{
			label: "Models",
			planSummary: plan.summary.models,
			planItems: planItemCounts.models,
			executed: executedCounts.models,
		},
		{
			label: "Harnesses",
			planSummary: plan.summary.harnesses,
			planItems: planItemCounts.harnesses,
			executed: executedCounts.harnesses,
		},
		{
			label: "Tests",
			planSummary: plan.summary.tests,
			planItems: planItemCounts.tests,
			executed: executedCounts.tests,
		},
		{
			label: "Pass Types",
			planSummary: plan.config.passTypes.length,
			planItems: planItemCounts.passTypes,
			executed: executedCounts.passTypes,
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Coverage & Plan Alignment</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border text-foreground-faint">
								<th className="text-left py-2 pr-2">DIMENSION</th>
								<th className="text-right py-2 px-2">PLAN SUMMARY</th>
								<th className="text-right py-2 px-2">PLAN ITEMS</th>
								<th className="text-right py-2 px-2">EXECUTED</th>
								<th className="text-right py-2 px-2">SUM→EXEC</th>
								<th className="text-right py-2 pl-2">PLAN→EXEC</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.label} className="border-b border-border/50">
									<td className="py-1.5 pr-2 font-medium">{row.label}</td>
									<td className="text-right py-1.5 px-2 tabular-nums">
										{row.planSummary}
									</td>
									<td className="text-right py-1.5 px-2 tabular-nums">
										{row.planItems}
									</td>
									<td className="text-right py-1.5 px-2 tabular-nums">
										{row.executed}
									</td>
									<td
										className={`text-right py-1.5 px-2 tabular-nums ${getDeltaTone(row.planSummary, row.executed)}`}
									>
										{formatDelta(row.planSummary, row.executed)}
									</td>
									<td
										className={`text-right py-1.5 pl-2 tabular-nums ${getDeltaTone(row.planItems, row.executed)}`}
									>
										{formatDelta(row.planItems, row.executed)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-muted">
							Automated Score Coverage
						</p>
						<p className="text-lg font-bold tabular-nums">
							{formatPercent(coverage.automatedScoreCoverage)}
						</p>
						<p className="text-xs text-foreground-faint">
							{coverage.automatedScoreItems}/{coverage.totalItems} items
						</p>
					</div>
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-muted">
							Frontier Eval Coverage
						</p>
						<p className="text-lg font-bold tabular-nums">
							{formatPercent(coverage.frontierEvalCoverage)}
						</p>
						<p className="text-xs text-foreground-faint">
							{coverage.frontierEvalItems}/{coverage.totalItems} items
						</p>
					</div>
					<div className="rounded border border-border bg-background-raised p-3">
						<p className="text-xs text-foreground-muted">
							Frontier Eval Failures
						</p>
						<p className="text-lg font-bold tabular-nums text-warning">
							{frontierEvalFailures}
						</p>
						<p className="text-xs text-foreground-faint">
							{coverage.totalItems - coverage.frontierEvalItems} missing evals
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
