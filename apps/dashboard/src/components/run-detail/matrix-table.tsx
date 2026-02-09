/**
 * Purpose: Matrix table component for displaying run items.
 * Exports: MatrixTable
 *
 * Invariants:
 * - Rows are keyed by `MatrixItemResult.id`
 * - Pass/eval/time cells render `—` when data is missing
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { StatusBadge } from "./status-badge";
import type { MatrixItemResult } from "@/lib/types";
import { isToolSmokeItem } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { computeItemPassRate } from "@/lib/aggregations";
import { matrix as matrixTooltips } from "@/lib/tooltip-content";

interface MatrixTableProps {
  items: MatrixItemResult[];
  onRowClick?: (item: MatrixItemResult) => void;
}

/**
 * Renders a matrix table for a run's items.
 *
 * @param props - Component props
 * @returns React element
 */
export function MatrixTable({ items, onRowClick }: MatrixTableProps) {
  const hasToolSmoke = items.some(isToolSmokeItem);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">
              <WithInfoTooltip tooltip={matrixTooltips.status}>STATUS</WithInfoTooltip>
            </TableHead>
            <TableHead>
              <WithInfoTooltip tooltip={matrixTooltips.runtime}>RUNTIME</WithInfoTooltip>
            </TableHead>
            <TableHead>
              <WithInfoTooltip tooltip={matrixTooltips.model}>MODEL</WithInfoTooltip>
            </TableHead>
            <TableHead>
              <WithInfoTooltip tooltip={matrixTooltips.harness}>HARNESS</WithInfoTooltip>
            </TableHead>
            <TableHead>
              <WithInfoTooltip tooltip={matrixTooltips.test}>TEST</WithInfoTooltip>
            </TableHead>
            <TableHead className="w-[80px]">
              <WithInfoTooltip tooltip={matrixTooltips.pass}>PASS</WithInfoTooltip>
            </TableHead>
            <TableHead className="w-[100px] text-right">
              <WithInfoTooltip tooltip={matrixTooltips.tests}>TESTS</WithInfoTooltip>
            </TableHead>
            <TableHead className="w-[60px] text-right">
              <WithInfoTooltip tooltip={matrixTooltips.eval}>EVAL</WithInfoTooltip>
            </TableHead>
            <TableHead className="w-[80px] text-right">
              <WithInfoTooltip tooltip={matrixTooltips.time}>TIME</WithInfoTooltip>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const passRate = computeItemPassRate(item.automatedScore);
            const passRateText = item.automatedScore
              ? `${item.automatedScore.passed}/${item.automatedScore.total}`
              : "—";
            const evalScore = item.frontierEval?.score;
            const duration = item.generation?.durationMs;

            return (
              <TableRow
                key={item.id}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={() => onRowClick?.(item)}
              >
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="font-medium truncate max-w-[150px]">
                  {item.runtime}
                </TableCell>
                <TableCell className="font-medium truncate max-w-[150px]">
                  {item.model}
                </TableCell>
                <TableCell>{item.harness}</TableCell>
                <TableCell>
                  {item.test}
                  {isToolSmokeItem(item) && (
                    <span className="ml-1 text-xs text-info">*</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-foreground-muted">{item.passType}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.automatedScore ? (
                    <span
                      className={
                        passRate === 1
                          ? "text-success"
                          : passRate === 0
                            ? "text-danger"
                            : "text-warning"
                      }
                    >
                      {passRateText}
                    </span>
                  ) : (
                    <span className="text-foreground-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {evalScore !== undefined ? (
                    <span
                      className={
                        evalScore >= 7
                          ? "text-success"
                          : evalScore >= 4
                            ? "text-warning"
                            : "text-danger"
                      }
                    >
                      {evalScore}/10
                    </span>
                  ) : (
                    <span className="text-foreground-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {duration !== undefined ? (
                    formatDuration(duration)
                  ) : (
                    <span className="text-foreground-faint">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hasToolSmoke && (
        <p className="mt-2 text-xs text-foreground-faint">
          * Tool-smoke tests verify tool-calling capability
        </p>
      )}
    </div>
  );
}
