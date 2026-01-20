/**
 * Purpose: Status badge component that never relies on color alone.
 * Uses both icons/text AND color for accessibility (per design-rules.md).
 */
import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/lib/types";

const statusConfig: Record<
  ItemStatus,
  { label: string; icon: string; variant: "success" | "destructive" | "secondary" | "warning" }
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

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}
