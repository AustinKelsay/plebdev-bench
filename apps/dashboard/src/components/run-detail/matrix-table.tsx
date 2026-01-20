/**
 * Purpose: Matrix table component for displaying run items.
 * Shows all matrix items with status, model, harness, test, scores, and timing.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { computeItemPassRate } from "@/lib/aggregations";

interface MatrixTableProps {
  items: MatrixItemResult[];
  onRowClick?: (item: MatrixItemResult) => void;
}

export function MatrixTable({ items, onRowClick }: MatrixTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">STATUS</TableHead>
          <TableHead>MODEL</TableHead>
          <TableHead>HARNESS</TableHead>
          <TableHead>TEST</TableHead>
          <TableHead className="w-[80px]">PASS</TableHead>
          <TableHead className="w-[100px] text-right">TESTS</TableHead>
          <TableHead className="w-[60px] text-right">EVAL</TableHead>
          <TableHead className="w-[80px] text-right">TIME</TableHead>
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
                {item.model}
              </TableCell>
              <TableCell>{item.harness}</TableCell>
              <TableCell>{item.test}</TableCell>
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
  );
}
