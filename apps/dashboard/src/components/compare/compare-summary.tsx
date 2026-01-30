/**
 * Purpose: Compare summary component showing high-level deltas.
 * Mirrors the CLI `bench compare` summary output.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { DeltaBadge, DeltaPercentBadge } from "./delta-badge";
import type { CompareSummary } from "@/lib/types";
import { compare as compareTooltips } from "@/lib/tooltip-content";

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
          <CardTitle className="text-sm text-foreground-muted">
            <WithInfoTooltip tooltip={compareTooltips.matchedItems}>Matched Items</WithInfoTooltip>
          </CardTitle>
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
          <CardTitle className="text-sm text-foreground-muted">
            <WithInfoTooltip tooltip={compareTooltips.statusChanges}>Status Changes</WithInfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div>
              <span className="text-success text-2xl font-bold tabular-nums">
                {statusChanges.improved}
              </span>
              <p className="text-xs text-foreground-faint">
                <WithInfoTooltip tooltip={compareTooltips.improved} side="bottom">improved</WithInfoTooltip>
              </p>
            </div>
            <div>
              <span className="text-danger text-2xl font-bold tabular-nums">
                {statusChanges.regressed}
              </span>
              <p className="text-xs text-foreground-faint">
                <WithInfoTooltip tooltip={compareTooltips.regressed} side="bottom">regressed</WithInfoTooltip>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pass Rate Delta */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground-muted">
            <WithInfoTooltip tooltip={compareTooltips.passRateDelta}>Pass Rate</WithInfoTooltip>
          </CardTitle>
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
          <CardTitle className="text-sm text-foreground-muted">
            <WithInfoTooltip tooltip={compareTooltips.frontierDelta}>Frontier Eval</WithInfoTooltip>
          </CardTitle>
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
