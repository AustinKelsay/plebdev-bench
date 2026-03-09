/**
 * Purpose: Model x Test heatmap chart (hero visualization).
 * Exports: ModelTestHeatmap
 *
 * Invariants:
 * - Pure React+SVG grid (no external chart library)
 * - Rows = models sorted by pass rate, columns = tests sorted by difficulty
 * - Cells color-coded red→amber→green by pass rate
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeModelTestMatrix } from "@/lib/aggregations";
import { heatmapColor } from "@/lib/chart-colors";
import { heatmap as heatmapTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { useMemo, useState } from "react";

interface ModelTestHeatmapProps {
	items: MatrixItemResult[];
}

interface TooltipState {
	x: number;
	y: number;
	model: string;
	test: string;
	passRate: number;
	passed: number;
	total: number;
}

const CELL_SIZE = 36;
const LABEL_WIDTH = 140;
const HEADER_HEIGHT = 180;
const ROW_GAP = 2;
const COL_GAP = 2;

/**
 * Renders a model x test heatmap as an SVG grid.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Full-width heatmap card
 */
export function ModelTestHeatmap({ items }: ModelTestHeatmapProps) {
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);

	const { models, tests, cells } = useMemo(
		() => computeModelTestMatrix(items),
		[items],
	);

	if (models.length === 0 || tests.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={heatmapTooltips.title}>
							Model x Test Heatmap
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						Not enough data for heatmap (need multiple models and tests).
					</p>
				</CardContent>
			</Card>
		);
	}

	const cellLookup = new Map<string, (typeof cells)[0]>();
	for (const cell of cells) {
		cellLookup.set(`${cell.model}|||${cell.test}`, cell);
	}

	// Longest test name determines how much extra width the rotated labels need
	const maxTestLen = Math.max(...tests.map((t) => t.length), 0);
	const RIGHT_PAD = Math.max(40, maxTestLen * 4);
	const svgWidth = LABEL_WIDTH + tests.length * (CELL_SIZE + COL_GAP) + RIGHT_PAD;
	const svgHeight = HEADER_HEIGHT + models.length * (CELL_SIZE + ROW_GAP);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={heatmapTooltips.title}>
						Model x Test Heatmap
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{heatmapTooltips.description}
				</p>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto relative">
					<svg
						width={svgWidth}
						height={svgHeight}
						className="font-mono"
						role="img"
						aria-label="Model vs Test pass rate heatmap"
					>
						{/* Column headers (test names) */}
						{tests.map((test, ci) => {
							const x = LABEL_WIDTH + ci * (CELL_SIZE + COL_GAP) + CELL_SIZE / 2;
							return (
								<g key={test} transform={`translate(${x}, ${HEADER_HEIGHT - 6}) rotate(-55)`}>
									<text
										x={0}
										y={0}
										textAnchor="start"
										dominantBaseline="middle"
										fill="hsl(210, 30%, 92%)"
										fontSize={12}
									>
										{test}
									</text>
								</g>
							);
						})}

						{/* Rows */}
						{models.map((model, ri) => {
							const y = HEADER_HEIGHT + ri * (CELL_SIZE + ROW_GAP);
							const truncated =
								model.length > 18 ? `${model.slice(0, 16)}..` : model;

							return (
								<g key={model}>
									{/* Model label */}
									<text
										x={LABEL_WIDTH - 8}
										y={y + CELL_SIZE / 2 + 4}
										textAnchor="end"
										fill="hsl(210, 30%, 92%)"
										fontSize={11}
									>
										{truncated}
									</text>

									{/* Cells */}
									{tests.map((test, ci) => {
										const cx =
											LABEL_WIDTH + ci * (CELL_SIZE + COL_GAP);
										const cell = cellLookup.get(`${model}|||${test}`);
										const passRate = cell?.passRate ?? 0;
										const hasData = cell !== undefined;

										return (
											<rect
												key={test}
												x={cx}
												y={y}
												width={CELL_SIZE}
												height={CELL_SIZE}
												rx={2}
												fill={hasData ? heatmapColor(passRate) : "hsl(213, 23%, 12%)"}
												fillOpacity={hasData ? 0.85 : 0.3}
												stroke="hsl(213, 23%, 15%)"
												strokeWidth={0.5}
												onMouseEnter={(e) => {
													if (!hasData) return;
													const rect = (
														e.target as SVGRectElement
													).getBoundingClientRect();
													setTooltip({
														x: rect.left + rect.width / 2,
														y: rect.top,
														model,
														test,
														passRate: cell!.passRate,
														passed: cell!.passed,
														total: cell!.total,
													});
												}}
												onMouseLeave={() => setTooltip(null)}
												className="transition-opacity hover:opacity-100"
												style={{ cursor: hasData ? "default" : undefined }}
											/>
										);
									})}
								</g>
							);
						})}
					</svg>

					{/* Tooltip overlay */}
					{tooltip && (
						<div
							className="fixed z-50 bg-background-raised border border-border rounded p-2 text-sm font-mono pointer-events-none"
							style={{
								left: tooltip.x,
								top: tooltip.y - 8,
								transform: "translate(-50%, -100%)",
							}}
						>
							<p className="font-medium">{tooltip.model}</p>
							<p className="text-foreground-muted text-xs">{tooltip.test}</p>
							<p className="text-foreground-muted mt-1">
								Pass: {(tooltip.passRate * 100).toFixed(0)}% ({tooltip.passed}/
								{tooltip.total})
							</p>
						</div>
					)}

					{/* Legend */}
					<div className="flex items-center gap-2 mt-3 text-xs text-foreground-muted">
						<span>0%</span>
						<div
							className="h-3 w-24 rounded"
							style={{
								background:
									"linear-gradient(90deg, hsl(0, 70%, 58%) 0%, hsl(20, 70%, 55%) 25%, hsl(38, 72%, 54%) 45%, hsl(55, 55%, 48%) 65%, hsl(110, 40%, 46%) 80%, hsl(142, 60%, 49%) 100%)",
							}}
						/>
						<span>100%</span>
						<span className="ml-2 text-foreground-faint">
							{models.length} models x {tests.length} tests
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
