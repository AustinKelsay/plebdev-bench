/**
 * Purpose: Model radar/spider chart for multi-axis capability comparison.
 * Exports: ModelRadarChart
 *
 * Invariants:
 * - Uses Recharts RadarChart with 5 axes
 * - Multi-select dropdown for 2-5 model overlay comparison
 * - Color-coded by MODEL_PALETTE
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeModelRadarData, groupByModel } from "@/lib/aggregations";
import { MODEL_PALETTE } from "@/lib/chart-colors";
import { radar as radarTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { useMemo, useState } from "react";
import {
	Legend,
	PolarAngleAxis,
	PolarGrid,
	PolarRadiusAxis,
	Radar,
	RadarChart,
	ResponsiveContainer,
	Tooltip,
} from "recharts";

interface ModelRadarChartProps {
	items: MatrixItemResult[];
}

/**
 * Renders a radar chart comparing selected models across 5 dimensions.
 *
 * @param props - Component props
 * @param props.items - Filtered matrix items
 * @returns Card with model selector and radar visualization
 */
export function ModelRadarChart({ items }: ModelRadarChartProps) {
	const allModels = useMemo(() => {
		const groups = groupByModel(items);
		return [...groups.keys()].sort();
	}, [items]);

	const [selectedModels, setSelectedModels] = useState<string[]>(() =>
		allModels.slice(0, Math.min(3, allModels.length)),
	);

	const radarData = useMemo(
		() => computeModelRadarData(items, selectedModels),
		[items, selectedModels],
	);

	const toggleModel = (model: string) => {
		setSelectedModels((prev) => {
			if (prev.includes(model)) {
				if (prev.length <= 2) return prev; // minimum 2
				return prev.filter((m) => m !== model);
			}
			if (prev.length >= 5) return prev; // maximum 5
			return [...prev, model];
		});
	};

	if (allModels.length < 2) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						<WithInfoTooltip tooltip={radarTooltips.title}>
							Model Radar
						</WithInfoTooltip>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-foreground-faint text-sm py-8 text-center">
						Need at least 2 models for radar comparison.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={radarTooltips.title}>
						Model Radar
					</WithInfoTooltip>
				</CardTitle>
				<p className="text-xs text-foreground-muted">
					{radarTooltips.description}
				</p>
			</CardHeader>
			<CardContent>
				{/* Model selector */}
				<div className="flex flex-wrap gap-1.5 mb-4">
					{allModels.map((model) => {
						const isSelected = selectedModels.includes(model);
						const colorIndex = selectedModels.indexOf(model);
						const truncated =
							model.length > 20 ? `${model.slice(0, 18)}..` : model;
						return (
							<button
								key={model}
								type="button"
								onClick={() => toggleModel(model)}
								className={`px-2 py-0.5 text-xs rounded border transition-colors ${
									isSelected
										? "border-foreground-muted bg-background-raised text-foreground"
										: "border-border text-foreground-faint hover:text-foreground-muted"
								}`}
								style={
									isSelected && colorIndex >= 0
										? {
												borderColor:
													MODEL_PALETTE[colorIndex % MODEL_PALETTE.length],
											}
										: undefined
								}
							>
								{truncated}
							</button>
						);
					})}
				</div>

				<ResponsiveContainer width="100%" height={320}>
					<RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
						<PolarGrid stroke="hsl(213, 23%, 20%)" />
						<PolarAngleAxis
							dataKey="axis"
							tick={{ fill: "hsl(210, 12%, 63%)", fontSize: 11 }}
						/>
						<PolarRadiusAxis
							angle={90}
							domain={[0, 100]}
							tick={{ fill: "hsl(210, 10%, 47%)", fontSize: 10 }}
							tickFormatter={(v) => `${v}`}
						/>
						<Tooltip
							content={({ active, payload, label }) => {
								if (!active || !payload?.length) return null;
								return (
									<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
										<p className="font-medium mb-1">{label}</p>
										{payload.map((p) => (
											<p key={String(p.name)} style={{ color: p.color }}>
												{String(p.name).length > 20
													? `${String(p.name).slice(0, 18)}..`
													: p.name}
												: {Number(p.value).toFixed(1)}
											</p>
										))}
									</div>
								);
							}}
						/>
						{selectedModels.map((model, i) => (
							<Radar
								key={model}
								name={model}
								dataKey={model}
								stroke={MODEL_PALETTE[i % MODEL_PALETTE.length]}
								fill={MODEL_PALETTE[i % MODEL_PALETTE.length]}
								fillOpacity={0.1}
								strokeWidth={2}
							/>
						))}
						<Legend
							wrapperStyle={{ paddingTop: "10px" }}
							formatter={(value) => {
								const v = String(value);
								return (
									<span className="text-foreground-muted text-xs">
										{v.length > 20 ? `${v.slice(0, 18)}..` : v}
									</span>
								);
							}}
						/>
					</RadarChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	);
}
