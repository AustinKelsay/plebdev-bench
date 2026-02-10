/**
 * Purpose: Status badge component that never relies on color alone.
 * Exports: StatusBadge
 *
 * Uses both icons/text AND color for accessibility (per design-rules.md).
 *
 * Invariants:
 * - `status` must be a valid ItemStatus value from the results schema.
 */
import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/lib/types";

const statusConfig: Record<
	ItemStatus,
	{
		label: string;
		icon: string;
		variant: "success" | "destructive" | "secondary" | "warning";
	}
> = {
	completed: { label: "PASS", icon: "✓", variant: "success" },
	failed: { label: "FAIL", icon: "✗", variant: "destructive" },
	pending: { label: "PEND", icon: "○", variant: "secondary" },
	running: { label: "RUN", icon: "◉", variant: "warning" },
};

interface StatusBadgeProps {
	status: ItemStatus;
	showIcon?: boolean;
}

/**
 * Renders an accessible status badge for a matrix item.
 *
 * Uses `statusConfig` to map an `ItemStatus` to label/icon/variant and renders a `Badge`.
 *
 * @param props - Component props (see `StatusBadgeProps`).
 * @param props.status - Item status (`completed`, `failed`, `pending`, `running`).
 * @param props.showIcon - Whether to render the icon glyph alongside the label (default: true).
 * @returns The rendered Badge element for the given status.
 * @throws {Error} If `status` is unrecognized (should be prevented by typing and schema validation).
 */
export function StatusBadge(props: StatusBadgeProps): JSX.Element {
	const { status, showIcon = true } = props;
	const config = statusConfig[status];
	if (!config) {
		throw new Error(`Unknown status: ${String(status)}`);
	}
	return (
		<Badge variant={config.variant}>
			{showIcon && <span className="mr-1">{config.icon}</span>}
			{config.label}
		</Badge>
	);
}
