/**
 * Purpose: Failure breakdown component showing distribution of failure types.
 * Helps users understand patterns in failures (timeout vs tool_missing vs api_error).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WithInfoTooltip, InfoTooltip } from "@/components/ui/info-tooltip";
import type { MatrixItemResult } from "@/lib/types";
import { failures as failureTooltips } from "@/lib/tooltip-content";

interface FailureBreakdownProps {
  items: MatrixItemResult[];
}

/** Human-readable labels for failure types */
const FAILURE_LABELS: Record<string, string> = {
  // Generation failures
  timeout: "Timeout",
  api_error: "API Error",
  tool_missing: "Tool Not Used",
  harness_error: "Harness Error",
  prompt_not_found: "Prompt Missing",
  // Scoring failures
  no_spec: "No Spec",
  extraction: "Extraction",
  spec_load: "Spec Load",
  import: "Import Error",
  export_validation: "Export Error",
  test_execution: "Test Error",
  unknown: "Unknown",
};

export function FailureBreakdown({ items }: FailureBreakdownProps) {
  // Count generation failures
  const genFailures = items.reduce(
    (acc, item) => {
      if (item.generationFailure) {
        acc[item.generationFailure.type] =
          (acc[item.generationFailure.type] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  // Count scoring failures
  const scoreFailures = items.reduce(
    (acc, item) => {
      if (item.scoringFailure) {
        acc[item.scoringFailure.type] =
          (acc[item.scoringFailure.type] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const hasFailures =
    Object.keys(genFailures).length > 0 || Object.keys(scoreFailures).length > 0;

  if (!hasFailures) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <WithInfoTooltip tooltip={failureTooltips.title}>Failure Breakdown</WithInfoTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.keys(genFailures).length > 0 && (
          <div>
            <h4 className="text-sm text-foreground-muted mb-2">
              <WithInfoTooltip tooltip={failureTooltips.generation} side="right">Generation</WithInfoTooltip>
            </h4>
            <div className="space-y-1">
              {Object.entries(genFailures)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      {FAILURE_LABELS[type] || type}
                      {failureTooltips[type as keyof typeof failureTooltips] && (
                        <InfoTooltip
                          content={failureTooltips[type as keyof typeof failureTooltips]}
                          side="right"
                        />
                      )}
                    </span>
                    <span className="text-danger tabular-nums">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
        {Object.keys(scoreFailures).length > 0 && (
          <div>
            <h4 className="text-sm text-foreground-muted mb-2">
              <WithInfoTooltip tooltip={failureTooltips.scoring} side="right">Scoring</WithInfoTooltip>
            </h4>
            <div className="space-y-1">
              {Object.entries(scoreFailures)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      {FAILURE_LABELS[type] || type}
                      {failureTooltips[type as keyof typeof failureTooltips] && (
                        <InfoTooltip
                          content={failureTooltips[type as keyof typeof failureTooltips]}
                          side="right"
                        />
                      )}
                    </span>
                    <span className="text-warning tabular-nums">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
