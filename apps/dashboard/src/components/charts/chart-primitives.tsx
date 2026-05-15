/**
 * Purpose: Shared chart primitive components extracted from composite-score-chart.
 * Exports: ClickableYAxisTick, createRowBackground, ChartTooltipWrapper
 *
 * Invariants:
 * - Reused across multiple chart components for consistent interactive behavior
 */

import { CHART_COLORS } from "@/lib/chart-colors";
import type { KeyboardEvent, ReactNode } from "react";

interface ClickableYAxisTickProps {
	x: number;
	y: number;
	payload: { value: string };
	onClick?: (name: string) => void;
}

/**
 * Custom Y-axis tick that can be clicked to trigger drill-down.
 *
 * @param props - Tick position and click handler
 * @returns SVG group with interactive text label
 */
export function ClickableYAxisTick({
	x,
	y,
	payload,
	onClick,
}: ClickableYAxisTickProps) {
	const isInteractive = Boolean(onClick);

	const handleActivate = () => {
		onClick?.(payload.value);
	};

	const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
		if (!isInteractive) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleActivate();
		}
	};

	return (
		<g
			transform={`translate(${x},${y})`}
			onClick={isInteractive ? handleActivate : undefined}
			onKeyDown={handleKeyDown}
			role={isInteractive ? "button" : undefined}
			tabIndex={isInteractive ? 0 : undefined}
			aria-label={isInteractive ? `Select ${payload.value}` : undefined}
			style={{ cursor: onClick ? "pointer" : "default" }}
		>
			<text
				x={-5}
				y={0}
				dy={4}
				textAnchor="end"
				fill={CHART_COLORS.foreground}
				fontSize={12}
				className={onClick ? "hover:fill-green-400 transition-colors" : ""}
			>
				{payload.value}
			</text>
		</g>
	);
}

/**
 * Creates a custom background component for bar chart rows.
 * Provides full-width clickable area for row selection.
 *
 * @param onRowClick - Callback when row is clicked
 * @returns React component for bar background
 */
export function createRowBackground(onRowClick?: (name: string) => void) {
	return function RowBackground(props: {
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		payload?: { raw?: { name: string } };
	}) {
		const { x, y, width, height, payload } = props;
		const isInteractive = Boolean(onRowClick && payload?.raw?.name);

		const handleActivate = () => {
			if (!payload?.raw?.name) return;
			onRowClick?.(payload.raw.name);
		};

		const handleKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
			if (!isInteractive) return;
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				handleActivate();
			}
		};

		return (
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={CHART_COLORS.foreground}
				fillOpacity={0}
				onClick={isInteractive ? handleActivate : undefined}
				onKeyDown={handleKeyDown}
				role={isInteractive ? "button" : undefined}
				tabIndex={isInteractive ? 0 : undefined}
				aria-label={isInteractive ? `Select ${payload?.raw?.name}` : undefined}
				style={{ cursor: isInteractive ? "pointer" : "default" }}
				className="hover:fill-opacity-5 transition-all"
			/>
		);
	};
}

interface ChartTooltipWrapperProps {
	children: ReactNode;
}

/**
 * Common tooltip container matching the terminal aesthetic.
 *
 * @param props - Tooltip content
 * @returns Styled tooltip wrapper
 */
export function ChartTooltipWrapper({ children }: ChartTooltipWrapperProps) {
	return (
		<div className="bg-background-raised border border-border rounded p-2 text-sm font-mono">
			{children}
		</div>
	);
}
