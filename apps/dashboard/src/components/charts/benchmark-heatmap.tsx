/**
 * Purpose: Dense model-by-test heatmap for at-a-glance benchmark coverage.
 * Exports: BenchmarkHeatmapChart
 *
 * Invariants:
 * - Rows are models, columns are tests
 * - Cell color reflects pass rate while labels keep the values legible
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeBenchmarkHeatmap } from "@/lib/aggregations";
import type { MatrixItemResult } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface BenchmarkHeatmapChartProps {
	items: MatrixItemResult[];
}

function getCellClassName(passRate: number | null): string {
	if (passRate === null) {
		return "bg-background/70 text-foreground-faint";
	}
	if (passRate >= 0.85) {
		return "bg-success/30 text-success";
	}
	if (passRate >= 0.65) {
		return "bg-success/15 text-foreground";
	}
	if (passRate >= 0.4) {
		return "bg-warning/20 text-warning";
	}
	return "bg-danger/20 text-danger";
}

/**
 * Renders the model-by-test benchmark heatmap.
 *
 * @param props - Chart props
 * @param props.items - Filtered leaderboard items
 * @returns React element containing the heatmap comparison grid
 */
export function BenchmarkHeatmapChart({
	items,
}: BenchmarkHeatmapChartProps) {
	const heatmap = computeBenchmarkHeatmap(items, 8);

	return (
		<Card className="border-border/80 bg-card/85 backdrop-blur">
			<CardHeader>
				<CardTitle className="text-base">Who solves what</CardTitle>
				<p className="text-sm leading-6 text-foreground-muted">
					Top models on the current slice, broken down by benchmark. Harder tests
					appear first so weak spots stand out immediately.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{heatmap.rows.length === 0 || heatmap.tests.length === 0 ? (
					<p className="py-12 text-center text-sm text-foreground-faint">
						No scored benchmark coverage is available for the current filter
						scope.
					</p>
				) : (
					<>
						<div
							className="grid gap-2 text-xs text-foreground-faint"
							style={{
								gridTemplateColumns: `minmax(180px, 1.2fr) repeat(${heatmap.tests.length}, minmax(76px, 1fr))`,
							}}
						>
							<div className="hidden md:block" />
							{heatmap.tests.map((test) => (
								<div
									key={test}
									className="hidden rounded border border-border/50 bg-background/45 px-2 py-2 text-center md:block"
								>
									{test}
								</div>
							))}
							{heatmap.rows.map((row) => (
								<div key={row.model} className="contents">
									<div className="rounded border border-border/50 bg-background/45 p-3">
										<p className="font-semibold text-foreground">{row.model}</p>
										<p className="mt-1 text-xs text-foreground-faint">
											{row.totalItems} items in scope
										</p>
									</div>
									{row.cells.map((cell) => (
										<div
											key={`${row.model}-${cell.test}`}
											title={`${row.model} · ${cell.test} · ${
												cell.passRate !== null
													? formatPercent(cell.passRate)
													: "no score"
											} · completion ${formatPercent(cell.completionRate)}`}
											className={`rounded border border-border/50 p-3 text-center text-sm font-semibold ${getCellClassName(cell.passRate)}`}
										>
											<div className="md:hidden">
												<p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-foreground-faint">
													{cell.test}
												</p>
											</div>
											<p>
												{cell.passRate !== null ? formatPercent(cell.passRate) : "—"}
											</p>
											<p className="mt-1 text-[11px] font-normal text-foreground-faint">
												{cell.total > 0 ? `${cell.passed}/${cell.total}` : "no score"}
											</p>
										</div>
									))}
								</div>
							))}
						</div>

						<div className="flex flex-wrap items-center gap-3 text-xs text-foreground-faint">
							<span className="rounded border border-border/50 bg-background/45 px-2 py-1">
								Strong
							</span>
							<span className="rounded border border-border/50 bg-background/45 px-2 py-1">
								Mixed
							</span>
							<span className="rounded border border-border/50 bg-background/45 px-2 py-1">
								Weak
							</span>
							<span>Cell label shows pass rate and raw scored checks.</span>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
