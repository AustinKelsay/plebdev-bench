/**
 * Purpose: Centralized chart color constants for all dashboard visualizations.
 * Exports: CHART_COLORS, MODEL_PALETTE, FAILURE_COLORS, heatmapColor
 *
 * Invariants:
 * - All charts import colors from this file for consistency
 * - Colors are HSL strings matching the terminal-native design system
 * - Brand accent: #34c759 / hsl(142, 60%, 49%)
 * - Palette is perceptually balanced for dark backgrounds
 */

/** Semantic chart colors matching the design system. */
export const CHART_COLORS = {
	brand: "hsl(142, 60%, 49%)",
	effectiveScore: "hsl(142, 60%, 49%)",
	passRate: "hsl(152, 55%, 52%)",        // teal-green (distinct from brand)
	toolSuccess: "hsl(215, 70%, 60%)",     // steel blue
	frontier: "hsl(265, 50%, 62%)",        // soft purple
	completion: "hsl(185, 55%, 50%)",      // muted cyan
	info: "hsl(215, 80%, 62%)",            // blue
	warning: "hsl(38, 80%, 58%)",          // warm amber
	danger: "hsl(0, 70%, 60%)",            // soft red
	muted: "hsl(210, 12%, 63%)",
	grid: "hsl(213, 23%, 15%)",
	text: "hsl(210, 12%, 63%)",
	foreground: "hsl(210, 30%, 92%)",
} as const;

/** 8-color palette for distinguishing models in multi-series charts. */
export const MODEL_PALETTE = [
	"hsl(142, 60%, 49%)",  // brand green
	"hsl(215, 70%, 62%)",  // steel blue
	"hsl(265, 50%, 62%)",  // soft purple
	"hsl(38, 80%, 58%)",   // warm amber
	"hsl(185, 55%, 50%)",  // muted cyan
	"hsl(335, 55%, 58%)",  // muted rose
	"hsl(25, 70%, 55%)",   // warm coral
	"hsl(170, 45%, 48%)",  // sage
] as const;

/** Failure type colors for stacked bar breakdowns. */
export const FAILURE_COLORS: Record<string, string> = {
	timeout: "hsl(0, 70%, 60%)",
	import: "hsl(25, 70%, 55%)",
	missing_export: "hsl(38, 80%, 58%)",
	harness_error: "hsl(265, 50%, 62%)",
	factory_init_failed: "hsl(335, 55%, 58%)",
	api_error: "hsl(0, 55%, 50%)",
	tool_missing: "hsl(185, 55%, 50%)",
	other: "hsl(210, 12%, 45%)",
};

/** Model size bucket colors for test difficulty chart. */
export const SIZE_BUCKET_COLORS: Record<string, string> = {
	small: "hsl(215, 70%, 62%)",
	medium: "hsl(38, 80%, 58%)",
	large: "hsl(142, 60%, 49%)",
};

/**
 * Curated heatmap stops — avoids ugly yellow-green interpolation.
 * Each stop: [position, hue, saturation, lightness]
 */
const HEATMAP_STOPS: Array<[number, number, number, number]> = [
	[0.0, 0, 70, 58],     // soft red
	[0.25, 20, 70, 55],   // warm coral
	[0.45, 38, 72, 54],   // warm amber
	[0.65, 55, 55, 48],   // olive gold
	[0.8, 110, 40, 46],   // muted sage
	[1.0, 142, 60, 49],   // brand green
];

/**
 * Maps a 0-1 value to a perceptually balanced heatmap color.
 * Uses curated stops to avoid the sickly yellow-green zone.
 *
 * @param t - Value between 0 (worst) and 1 (best)
 * @returns HSL color string
 */
export function heatmapColor(t: number): string {
	const clamped = Math.max(0, Math.min(1, t));

	// Find the two surrounding stops
	let lo = HEATMAP_STOPS[0];
	let hi = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];

	for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
		if (clamped >= HEATMAP_STOPS[i][0] && clamped <= HEATMAP_STOPS[i + 1][0]) {
			lo = HEATMAP_STOPS[i];
			hi = HEATMAP_STOPS[i + 1];
			break;
		}
	}

	// Interpolate between stops
	const range = hi[0] - lo[0] || 1;
	const f = (clamped - lo[0]) / range;

	const h = lo[1] + f * (hi[1] - lo[1]);
	const s = lo[2] + f * (hi[2] - lo[2]);
	const l = lo[3] + f * (hi[3] - lo[3]);

	return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
