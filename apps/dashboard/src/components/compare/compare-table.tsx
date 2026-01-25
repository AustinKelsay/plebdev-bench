/**
 * Purpose: Compare table component showing matched items with deltas.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeltaBadge, DeltaPercentBadge } from "./delta-badge";
import type { MatchedItem } from "@/lib/types";

interface CompareTableProps {
  items: MatchedItem[];
  /** Filter to show only items with changes */
  showOnlyChanges?: boolean;
}

export function CompareTable({ items, showOnlyChanges = false }: CompareTableProps) {
  const filteredItems = showOnlyChanges
    ? items.filter(
        (item) =>
          item.deltas.status !== null ||
          item.deltas.automatedScore !== null ||
          item.deltas.frontierEval !== null
      )
    : items;

  if (filteredItems.length === 0) {
    return (
      <p className="text-foreground-faint text-sm py-4">
        {showOnlyChanges ? "No changes between runs." : "No items to compare."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>MODEL</TableHead>
          <TableHead>HARNESS</TableHead>
          <TableHead>TEST</TableHead>
          <TableHead>PASS</TableHead>
          <TableHead>STATUS</TableHead>
          <TableHead className="text-right">TESTS</TableHead>
          <TableHead className="text-right">EVAL</TableHead>
          <TableHead className="text-right">TIME</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredItems.map((item) => (
          <TableRow key={item.key}>
            <TableCell className="font-medium truncate max-w-[120px]">
              {item.model}
            </TableCell>
            <TableCell>{item.harness}</TableCell>
            <TableCell>{item.test}</TableCell>
            <TableCell>
              <span className="text-foreground-muted">{item.passType}</span>
            </TableCell>
            <TableCell>
              {item.deltas.status ? (
                <div className="flex items-center gap-1">
                  <Badge
                    variant={
                      item.deltas.status.a === "completed"
                        ? "success"
                        : item.deltas.status.a === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px] px-1"
                  >
                    {item.deltas.status.a === "completed" ? "PASS" : "FAIL"}
                  </Badge>
                  <span className="text-foreground-faint">→</span>
                  <Badge
                    variant={
                      item.deltas.status.b === "completed"
                        ? "success"
                        : item.deltas.status.b === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px] px-1"
                  >
                    {item.deltas.status.b === "completed" ? "PASS" : "FAIL"}
                  </Badge>
                </div>
              ) : (
                <span className="text-foreground-faint">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {item.deltas.automatedScore ? (
                <DeltaPercentBadge value={item.deltas.automatedScore.passRateDelta} />
              ) : (
                <span className="text-foreground-faint">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {item.deltas.frontierEval ? (
                <DeltaBadge value={item.deltas.frontierEval.scoreDelta} />
              ) : (
                <span className="text-foreground-faint">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {item.deltas.durationMs !== null ? (
                <DeltaBadge
                  value={item.deltas.durationMs / 1000}
                  suffix="s"
                  invert={true}
                  decimals={1}
                />
              ) : (
                <span className="text-foreground-faint">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Table showing regressions (completed → failed) */
export function RegressionsTable({ items }: { items: MatchedItem[] }) {
  const regressions = items.filter(
    (item) =>
      item.deltas.status?.a === "completed" && item.deltas.status?.b === "failed"
  );

  if (regressions.length === 0) {
    return (
      <p className="text-foreground-faint text-sm py-4">No regressions.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>MODEL</TableHead>
          <TableHead>HARNESS</TableHead>
          <TableHead>TEST</TableHead>
          <TableHead>PASS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {regressions.map((item) => (
          <TableRow key={item.key}>
            <TableCell className="font-medium">{item.model}</TableCell>
            <TableCell>{item.harness}</TableCell>
            <TableCell>{item.test}</TableCell>
            <TableCell>
              <span className="text-foreground-muted">{item.passType}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Table showing improvements (failed → completed) */
export function ImprovementsTable({ items }: { items: MatchedItem[] }) {
  const improvements = items.filter(
    (item) =>
      item.deltas.status?.a === "failed" && item.deltas.status?.b === "completed"
  );

  if (improvements.length === 0) {
    return (
      <p className="text-foreground-faint text-sm py-4">No improvements.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>MODEL</TableHead>
          <TableHead>HARNESS</TableHead>
          <TableHead>TEST</TableHead>
          <TableHead>PASS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {improvements.map((item) => (
          <TableRow key={item.key}>
            <TableCell className="font-medium">{item.model}</TableCell>
            <TableCell>{item.harness}</TableCell>
            <TableCell>{item.test}</TableCell>
            <TableCell>
              <span className="text-foreground-muted">{item.passType}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
