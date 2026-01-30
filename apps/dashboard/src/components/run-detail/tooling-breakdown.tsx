/**
 * Purpose: Tooling vs scoring breakdown for identifying outliers.
 * Highlights models/harnesses with strong scores but tool failures (and vice versa).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import type { MatrixItemResult } from "@/lib/types";
import { tooling as toolingTooltips } from "@/lib/tooltip-content";
import {
  computePassRate,
  computeToolScoreBreakdown,
  computeToolUseStats,
  groupByHarness,
  groupByModel,
  groupByModelHarness,
  inferToolHarnesses,
  partitionToolSmoke,
  type ToolScoreBreakdown,
} from "@/lib/aggregations";
import { formatPercent } from "@/lib/utils";

interface ToolingBreakdownProps {
  items: MatrixItemResult[];
}

const HIGH_SCORE_THRESHOLD = 0.8;
const LOW_SCORE_THRESHOLD = 0.5;
const TOOL_FAILURE_THRESHOLD = 0.1;
const TOOL_SUCCESS_THRESHOLD = 0.95;
const MAX_OUTLIERS = 8;

function getScoreTone(passRate: number, hasData: boolean): string {
  if (!hasData) return "text-foreground-faint";
  if (passRate >= 0.8) return "text-success";
  if (passRate >= 0.5) return "text-warning";
  return "text-danger";
}

function getToolTone(successRate: number, hasData: boolean): string {
  if (!hasData) return "text-foreground-faint";
  if (successRate >= 0.95) return "text-success";
  if (successRate >= 0.8) return "text-warning";
  return "text-danger";
}

function getToolMissingRate(row: ToolScoreBreakdown): number {
  return row.toolTotal > 0 ? row.toolMissing / row.toolTotal : 0;
}

function buildOutliers(rows: ToolScoreBreakdown[]) {
  const highScoreToolIssues = rows
    .filter((row) => {
      const hasScore = row.scoreTotal > 0;
      const hasTool = row.toolTotal > 0;
      const toolMissingRate = getToolMissingRate(row);
      return (
        hasScore &&
        hasTool &&
        row.scorePassRate >= HIGH_SCORE_THRESHOLD &&
        toolMissingRate >= TOOL_FAILURE_THRESHOLD
      );
    })
    .sort((a, b) => getToolMissingRate(b) - getToolMissingRate(a))
    .slice(0, MAX_OUTLIERS);

  const toolOkLowScore = rows
    .filter((row) => {
      const hasScore = row.scoreTotal > 0;
      const hasTool = row.toolTotal > 0;
      return (
        hasScore &&
        hasTool &&
        row.scorePassRate <= LOW_SCORE_THRESHOLD &&
        row.toolSuccessRate >= TOOL_SUCCESS_THRESHOLD
      );
    })
    .sort((a, b) => a.scorePassRate - b.scorePassRate)
    .slice(0, MAX_OUTLIERS);

  return { highScoreToolIssues, toolOkLowScore };
}

function OutlierTable({
  title,
  tooltip,
  rows,
  emptyText,
}: {
  title: string;
  tooltip?: string;
  rows: ToolScoreBreakdown[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm text-foreground-muted">
        {tooltip ? <WithInfoTooltip tooltip={tooltip} side="right">{title}</WithInfoTooltip> : title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-sm text-foreground-faint">{emptyText}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NAME</TableHead>
              <TableHead className="text-right">TOOL</TableHead>
              <TableHead className="text-right">SCORE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hasTool = row.toolTotal > 0;
              const hasScore = row.scoreTotal > 0;
              const toolMissingRate = getToolMissingRate(row);
              const toolTone = getToolTone(row.toolSuccessRate, hasTool);
              const scoreTone = getScoreTone(row.scorePassRate, hasScore);

              return (
                <TableRow key={row.name}>
                  <TableCell className="font-medium truncate max-w-[220px]" title={row.name}>
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {hasTool ? (
                      <>
                        <span className={toolTone}>
                          {formatPercent(1 - toolMissingRate)}
                        </span>
                        <span className="text-xs text-foreground-faint">
                          {" "}
                          ({row.toolMissing}/{row.toolTotal} miss)
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {hasScore ? (
                      <>
                        <span className={scoreTone}>
                          {formatPercent(row.scorePassRate)}
                        </span>
                        <span className="text-xs text-foreground-faint">
                          {" "}
                          ({row.scorePassed}/{row.scoreTotal})
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground-faint">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Renders tool usage vs scoring breakdown for a run.
 * @param items - Matrix items for the run
 * @returns Tooling breakdown card
 */
export function ToolingBreakdown({ items }: ToolingBreakdownProps) {
  const toolHarnesses = inferToolHarnesses(items);
  const toolItems = items.filter((item) => toolHarnesses.has(item.harness));
  const toolStats = computeToolUseStats(toolItems);
  const { regular } = partitionToolSmoke(items);
  const scoreStats = computePassRate(regular);
  const hasToolData = toolItems.length > 0;

  const byModelHarness = computeToolScoreBreakdown(
    items,
    groupByModelHarness,
    toolHarnesses
  );
  const byModel = computeToolScoreBreakdown(items, groupByModel, toolHarnesses);
  const byHarness = computeToolScoreBreakdown(items, groupByHarness, toolHarnesses);

  const modelHarnessOutliers = buildOutliers(byModelHarness);
  const modelOutliers = buildOutliers(byModel);
  const harnessOutliers = buildOutliers(byHarness);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <WithInfoTooltip tooltip={toolingTooltips.title}>Tooling vs Scoring</WithInfoTooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasToolData ? (
          <p className="text-sm text-foreground-faint">
            No tool usage detected. Add tool-smoke to the run to enable tool breakdowns.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-foreground-muted">
                  <WithInfoTooltip tooltip={toolingTooltips.toolSuccess} side="right">Tool Success</WithInfoTooltip>
                </p>
                <p className="text-lg font-bold tabular-nums">
                  {formatPercent(toolStats.toolSuccessRate)}
                </p>
                <p className="text-xs text-foreground-faint">
                  {toolStats.totalItems} tool-expected items
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground-muted">
                  <WithInfoTooltip tooltip={toolingTooltips.toolMissing} side="right">Tool Missing</WithInfoTooltip>
                </p>
                <p className="text-lg font-bold tabular-nums text-danger">
                  {toolStats.toolMissing}
                </p>
                <p className="text-xs text-foreground-faint">
                  {formatPercent(
                    toolStats.totalItems > 0
                      ? toolStats.toolMissing / toolStats.totalItems
                      : 0
                  )}{" "}
                  of tool items
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground-muted">
                  <WithInfoTooltip tooltip={toolingTooltips.score} side="right">Score (non-tool-smoke)</WithInfoTooltip>
                </p>
                <p
                  className={`text-lg font-bold tabular-nums ${getScoreTone(
                    scoreStats.passRate,
                    scoreStats.total > 0
                  )}`}
                >
                  {formatPercent(scoreStats.passRate)}
                </p>
                <p className="text-xs text-foreground-faint">
                  {scoreStats.passed}/{scoreStats.total} tests
                </p>
              </div>
            </div>

            <Tabs defaultValue="model-harness">
              <TabsList>
                <TabsTrigger value="model-harness">Model + Harness</TabsTrigger>
                <TabsTrigger value="model">Model</TabsTrigger>
                <TabsTrigger value="harness">Harness</TabsTrigger>
              </TabsList>
              <TabsContent value="model-harness" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <OutlierTable
                    title="High Score / Tool Issues"
                    tooltip={toolingTooltips.highScoreToolIssues}
                    rows={modelHarnessOutliers.highScoreToolIssues}
                    emptyText="No high-scoring models with tool failures."
                  />
                  <OutlierTable
                    title="Tool OK / Low Score"
                    tooltip={toolingTooltips.toolOkLowScore}
                    rows={modelHarnessOutliers.toolOkLowScore}
                    emptyText="No strong tool users with low scores."
                  />
                </div>
              </TabsContent>
              <TabsContent value="model" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <OutlierTable
                    title="High Score / Tool Issues"
                    tooltip={toolingTooltips.highScoreToolIssues}
                    rows={modelOutliers.highScoreToolIssues}
                    emptyText="No high-scoring models with tool failures."
                  />
                  <OutlierTable
                    title="Tool OK / Low Score"
                    tooltip={toolingTooltips.toolOkLowScore}
                    rows={modelOutliers.toolOkLowScore}
                    emptyText="No strong tool users with low scores."
                  />
                </div>
              </TabsContent>
              <TabsContent value="harness" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <OutlierTable
                    title="High Score / Tool Issues"
                    tooltip={toolingTooltips.highScoreToolIssues}
                    rows={harnessOutliers.highScoreToolIssues}
                    emptyText="No high-scoring harnesses with tool failures."
                  />
                  <OutlierTable
                    title="Tool OK / Low Score"
                    tooltip={toolingTooltips.toolOkLowScore}
                    rows={harnessOutliers.toolOkLowScore}
                    emptyText="No strong tool users with low scores."
                  />
                </div>
              </TabsContent>
            </Tabs>

            <p className="text-xs text-foreground-faint">
              Thresholds: high score &gt;= 80%, low score &lt;= 50%, tool failure &gt;= 10%,
              tool success &gt;= 95%. Tool usage inferred from tool-smoke or tool_missing.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
