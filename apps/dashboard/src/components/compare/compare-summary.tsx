/**
 * Purpose: Compare summary component showing high-level deltas.
 * Mirrors the CLI `bench compare` summary output.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeltaBadge, DeltaPercentBadge } from "./delta-badge";
import type { CompareSummary } from "@/lib/types";

interface CompareSummaryCardProps {
  summary: CompareSummary;
}

export function CompareSummaryCard({ summary }: CompareSummaryCardProps) {
  const {
    totalMatched,
    totalOnlyInA,
    totalOnlyInB,
    statusChanges,
    scoringDelta,
    frontierEvalDelta,
  } = summary;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Matched Items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground-muted">Matched Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{totalMatched}</div>
          {(totalOnlyInA > 0 || totalOnlyInB > 0) && (
            <p className="text-sm text-foreground-faint">
              {totalOnlyInA > 0 && `+${totalOnlyInA} only in A`}
              {totalOnlyInA > 0 && totalOnlyInB > 0 && ", "}
              {totalOnlyInB > 0 && `+${totalOnlyInB} only in B`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Status Changes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground-muted">Status Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div>
              <span className="text-success text-2xl font-bold tabular-nums">
                {statusChanges.improved}
              </span>
              <p className="text-xs text-foreground-faint">improved</p>
            </div>
            <div>
              <span className="text-danger text-2xl font-bold tabular-nums">
                {statusChanges.regressed}
              </span>
              <p className="text-xs text-foreground-faint">regressed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pass Rate Delta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground-muted">Pass Rate</CardTitle>
        </CardHeader>
        <CardContent>
          {scoringDelta ? (
            <DeltaPercentBadge value={scoringDelta.passRateDelta} />
          ) : (
            <span className="text-foreground-faint">—</span>
          )}
        </CardContent>
      </Card>

      {/* Frontier Eval Delta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground-muted">Frontier Eval</CardTitle>
        </CardHeader>
        <CardContent>
          {frontierEvalDelta ? (
            <DeltaBadge value={frontierEvalDelta.avgScoreDelta} suffix="/10" />
          ) : (
            <span className="text-foreground-faint">—</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
