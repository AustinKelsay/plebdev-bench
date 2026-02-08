/**
 * Purpose: Dialog component for displaying detailed information about a matrix item.
 * Shows generation output, scores, and frontier eval reasoning.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { WithInfoTooltip } from "@/components/ui/info-tooltip";
import { StatusBadge } from "./status-badge";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { useState } from "react";
import { itemDetail as itemDetailTooltips } from "@/lib/tooltip-content";

interface ItemDetailDialogProps {
  item: MatrixItemResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
}: ItemDetailDialogProps) {
  const [showCode, setShowCode] = useState(false);

  if (!item) return null;

  const { generation, automatedScore, frontierEval } = item;
  const hasFailures =
    !!item.generationFailure ||
    !!item.scoringFailure ||
    !!item.frontierEvalFailure;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            <span>{item.test}</span>
            <Badge variant="outline">{item.passType}</Badge>
          </DialogTitle>
          <DialogDescription>
            {item.runtime} · {item.model} via {item.harness}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Generation Info */}
          {generation && (
            <section>
              <h4 className="text-sm font-medium text-foreground-muted mb-2">
                <WithInfoTooltip tooltip={itemDetailTooltips.generation}>Generation</WithInfoTooltip>
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-foreground-faint">
                    <WithInfoTooltip tooltip={itemDetailTooltips.duration} side="right">Duration</WithInfoTooltip>
                  </span>
                  <p>{formatDuration(generation.durationMs)}</p>
                </div>
                {generation.promptTokens !== undefined && (
                  <div>
                    <span className="text-foreground-faint">
                      <WithInfoTooltip tooltip={itemDetailTooltips.promptTokens} side="right">Prompt Tokens</WithInfoTooltip>
                    </span>
                    <p>{generation.promptTokens.toLocaleString()}</p>
                  </div>
                )}
                {generation.completionTokens !== undefined && (
                  <div>
                    <span className="text-foreground-faint">
                      <WithInfoTooltip tooltip={itemDetailTooltips.completionTokens} side="right">Completion Tokens</WithInfoTooltip>
                    </span>
                    <p>{generation.completionTokens.toLocaleString()}</p>
                  </div>
                )}
                {generation.codeFilePath && (
                  <div className="col-span-2">
                    <span className="text-foreground-faint">Code Source</span>
                    <p className="text-info font-mono text-xs truncate" title={generation.codeFilePath}>
                      File: {generation.codeFilePath.split('/').pop()}
                    </p>
                  </div>
                )}
                {generation.error && (
                  <div className="col-span-2">
                    <span className="text-foreground-faint">Error</span>
                    <p className="text-danger">{generation.error}</p>
                  </div>
                )}
              </div>

              {generation.output && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowCode(!showCode)}
                    className="text-sm text-info hover:underline"
                  >
                    {showCode ? "Hide generated code" : "Show generated code"}
                  </button>
                  {showCode && (
                    <pre className="mt-2 p-4 bg-background-raised rounded border border-border overflow-x-auto text-xs max-h-60">
                      <code>{generation.output}</code>
                    </pre>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Automated Score */}
          {automatedScore && (
            <section>
              <h4 className="text-sm font-medium text-foreground-muted mb-2">
                <WithInfoTooltip tooltip={itemDetailTooltips.automatedTests}>Automated Tests</WithInfoTooltip>
              </h4>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-bold tabular-nums">
                  <span
                    className={
                      automatedScore.passed === automatedScore.total
                        ? "text-success"
                        : automatedScore.passed === 0
                          ? "text-danger"
                          : "text-warning"
                    }
                  >
                    {automatedScore.passed}
                  </span>
                  <span className="text-foreground-faint">
                    /{automatedScore.total}
                  </span>
                </div>
                <span className="text-sm text-foreground-muted">
                  tests passed ({automatedScore.failed} failed)
                </span>
              </div>
            </section>
          )}

          {/* Frontier Eval */}
          {frontierEval && (
            <section>
              <h4 className="text-sm font-medium text-foreground-muted mb-2">
                <WithInfoTooltip tooltip={itemDetailTooltips.frontierEval}>Frontier Evaluation</WithInfoTooltip>
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold tabular-nums">
                    <span
                      className={
                        frontierEval.score >= 7
                          ? "text-success"
                          : frontierEval.score >= 4
                            ? "text-warning"
                            : "text-danger"
                      }
                    >
                      {frontierEval.score}
                    </span>
                    <span className="text-foreground-faint">/10</span>
                  </div>
                  <span className="text-sm text-foreground-muted">
                    scored by {frontierEval.model}
                  </span>
                </div>
                {frontierEval.reasoning && (
                  <div className="p-3 bg-background-raised rounded border border-border text-sm">
                    <p className="text-foreground-faint text-xs mb-1">Reasoning</p>
                    <p>{frontierEval.reasoning}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {hasFailures && (
            <section>
              <h4 className="text-sm font-medium text-foreground-muted mb-2">
                <WithInfoTooltip tooltip={itemDetailTooltips.failures}>Failures</WithInfoTooltip>
              </h4>
              <div className="space-y-2 text-sm">
                {item.generationFailure && (
                  <div className="p-3 bg-background-raised rounded border border-border">
                    <p className="text-foreground-faint text-xs mb-1">
                      Generation ({item.generationFailure.type})
                      {item.generationFailure.type === "tool_missing" && (
                        <span className="ml-2 text-warning">[Tool Usage Required]</span>
                      )}
                    </p>
                    <p className="text-danger">{item.generationFailure.message}</p>
                  </div>
                )}
                {item.scoringFailure && (
                  <div className="p-3 bg-background-raised rounded border border-border">
                    <p className="text-foreground-faint text-xs mb-1">
                      Scoring ({item.scoringFailure.type})
                    </p>
                    <p className="text-warning">{item.scoringFailure.message}</p>
                  </div>
                )}
                {item.frontierEvalFailure && (
                  <div className="p-3 bg-background-raised rounded border border-border">
                    <p className="text-foreground-faint text-xs mb-1">
                      Frontier Eval ({item.frontierEvalFailure.type})
                    </p>
                    <p className="text-warning">{item.frontierEvalFailure.message}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
