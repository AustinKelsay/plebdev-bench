/**
 * Purpose: Card component for displaying a single run summary.
 * Shows runId, timestamp, duration, pass rate, and item counts.
 */
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RunListItem } from "@/lib/types";
import { formatDuration, formatDate, formatPercent } from "@/lib/utils";

interface RunCardProps {
  run: RunListItem;
  /** Optional pass rate (0-1 scale) */
  passRate?: number;
}

export function RunCard({ run, passRate }: RunCardProps) {
  const { runId, startedAt, durationMs, summary } = run;
  const hasFailures = summary.failed > 0;

  return (
    <Link to={`/runs/${runId}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm truncate">{runId}</CardTitle>
            {hasFailures ? (
              <Badge variant="destructive" className="ml-2">
                {summary.failed} failed
              </Badge>
            ) : (
              <Badge variant="success" className="ml-2">
                all pass
              </Badge>
            )}
          </div>
          <p className="text-xs text-foreground-faint">{formatDate(startedAt)}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-foreground-muted">Items</span>
              <p className="font-medium">
                {summary.completed}/{summary.total}
              </p>
            </div>
            <div>
              <span className="text-foreground-muted">Duration</span>
              <p className="font-medium">{formatDuration(durationMs)}</p>
            </div>
            {passRate !== undefined && (
              <div className="col-span-2">
                <span className="text-foreground-muted">Pass Rate</span>
                <p className="font-medium">{formatPercent(passRate)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
