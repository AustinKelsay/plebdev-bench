/**
 * Purpose: Delta badge component for showing changes between values.
 * Shows direction with color (green = good, red = bad) and always includes text.
 */
import { cn } from "@/lib/utils";

interface DeltaBadgeProps {
  /** The delta value (positive or negative) */
  value: number;
  /** Suffix to display after the number (e.g., "%", "/10", "ms", "s") */
  suffix?: string;
  /** If true, negative values are good (e.g., duration decrease) */
  invert?: boolean;
  /** Number of decimal places to show */
  decimals?: number;
}

/**
 * Renders a delta value with direction indicator and semantic coloring.
 * Examples: "Δ +5.2%", "Δ -0.7", "Δ +12s"
 */
export function DeltaBadge({
  value,
  suffix = "",
  invert = false,
  decimals = 1,
}: DeltaBadgeProps) {
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  const sign = value > 0 ? "+" : "";
  const displayValue = Math.abs(value) < 0.1 && value !== 0
    ? value.toFixed(2)
    : value.toFixed(decimals);

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-sm px-2 py-0.5 rounded",
        isPositive && "bg-success/20 text-success",
        isNegative && "bg-danger/20 text-danger",
        !isPositive && !isNegative && "bg-muted text-muted-foreground"
      )}
    >
      Δ {sign}
      {displayValue}
      {suffix}
    </span>
  );
}

/**
 * Renders a delta for percentages (expects 0-1 scale, displays as %).
 */
export function DeltaPercentBadge({
  value,
  invert = false,
}: Omit<DeltaBadgeProps, "suffix" | "decimals">) {
  return (
    <DeltaBadge
      value={value * 100}
      suffix="%"
      invert={invert}
      decimals={1}
    />
  );
}
