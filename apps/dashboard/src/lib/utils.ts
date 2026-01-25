/**
 * Purpose: Utility functions for the dashboard.
 * Exports: cn (class name merger), formatDuration, formatNumber, formatDate
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes with proper precedence.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats milliseconds as human-readable duration.
 * @example formatDuration(125000) => "2m 5s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Formats a number with thousands separators.
 * @example formatNumber(12345) => "12,345"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Formats a percentage with one decimal place.
 * @example formatPercent(0.956) => "95.6%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Formats an ISO date string as a short human-readable date.
 * @example formatDate("2026-01-15T14:30:00Z") => "Jan 15, 14:30"
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formats a short date for run IDs.
 * @example formatShortDate("2026-01-15T14:30:00Z") => "Jan 15"
 */
export function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
