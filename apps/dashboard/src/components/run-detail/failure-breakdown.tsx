/**
 * Purpose: Failure breakdown component showing distribution of failure types.
 * Helps users understand patterns in failures (timeout vs tool_missing vs api_error).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip, WithInfoTooltip } from "@/components/ui/info-tooltip";
import { computeFailureStats } from "@/lib/aggregations";
import { failures as failureTooltips } from "@/lib/tooltip-content";
import type { MatrixItemResult } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

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
	missing_export: "Missing Export",
	factory_init_failed: "Factory Init",
	export_validation: "Export Error",
	test_execution: "Test Error",
	// Frontier eval failures
	auth_error: "Auth Error",
	rate_limited: "Rate Limited",
	http_error: "HTTP Error",
	invalid_response: "Invalid Response",
	parse_error: "Parse Error",
	truncated: "Truncated Response",
	unknown: "Unknown",
};

function FailureTypeList({
	failures,
	valueClassName,
}: {
	failures: Map<string, number>;
	valueClassName: string;
}) {
	return (
		<div className="space-y-1">
			{Array.from(failures.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([type, count]) => (
					<div key={type} className="flex justify-between text-sm">
						<span className="flex items-center gap-1">
							{FAILURE_LABELS[type] || type}
							{failureTooltips[type as keyof typeof failureTooltips] && (
								<InfoTooltip
									content={
										failureTooltips[type as keyof typeof failureTooltips]
									}
									side="right"
								/>
							)}
						</span>
						<span className={`${valueClassName} tabular-nums`}>{count}</span>
					</div>
				))}
		</div>
	);
}

export function FailureBreakdown({ items }: FailureBreakdownProps) {
	const stats = computeFailureStats(items);
	const hasFailures =
		stats.totalGenerationFailures > 0 ||
		stats.totalScoringFailures > 0 ||
		stats.totalFrontierEvalFailures > 0;

	if (!hasFailures) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					<WithInfoTooltip tooltip={failureTooltips.title}>
						Failure Breakdown
					</WithInfoTooltip>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{stats.totalGenerationFailures > 0 && (
					<div>
						<h4 className="text-sm text-foreground-muted mb-2">
							<WithInfoTooltip
								tooltip={failureTooltips.generation}
								side="right"
							>
								Generation
							</WithInfoTooltip>
						</h4>
						<FailureTypeList
							failures={stats.generationFailures}
							valueClassName="text-danger"
						/>
					</div>
				)}
				{stats.totalScoringFailures > 0 && (
					<div>
						<h4 className="text-sm text-foreground-muted mb-2">
							<WithInfoTooltip tooltip={failureTooltips.scoring} side="right">
								Scoring
							</WithInfoTooltip>
						</h4>
						<FailureTypeList
							failures={stats.scoringFailures}
							valueClassName="text-warning"
						/>
					</div>
				)}
				{stats.totalFrontierEvalFailures > 0 && (
					<div className="space-y-2">
						<h4 className="text-sm text-foreground-muted mb-2">
							<WithInfoTooltip
								tooltip={failureTooltips.frontierEval}
								side="right"
							>
								Frontier Eval
							</WithInfoTooltip>
						</h4>
						<FailureTypeList
							failures={stats.frontierEvalFailures}
							valueClassName="text-warning"
						/>
						<div className="overflow-x-auto">
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b border-border text-foreground-faint">
										<th className="text-left py-1.5 pr-2">ITEM</th>
										<th className="text-left py-1.5 px-2">TARGET</th>
										<th className="text-left py-1.5 px-2">TYPE</th>
										<th className="text-right py-1.5 px-2">HTTP</th>
										<th className="text-right py-1.5 px-2">ATTEMPTS</th>
										<th className="text-right py-1.5 px-2">LATENCY</th>
										<th className="text-right py-1.5 pl-2">EVAL MODEL</th>
									</tr>
								</thead>
								<tbody>
									{stats.frontierEvalFailureDetails.map((detail) => (
										<tr key={detail.id} className="border-b border-border/50">
											<td className="py-1.5 pr-2 font-mono">{detail.id}</td>
											<td
												className="py-1.5 px-2 font-mono truncate max-w-[180px]"
												title={`${detail.runtime} / ${detail.model} / ${detail.harness} / ${detail.test} / ${detail.passType}`}
											>
												{detail.runtime} / {detail.model} / {detail.harness} /{" "}
												{detail.test} / {detail.passType}
											</td>
											<td className="py-1.5 px-2">{detail.type}</td>
											<td className="text-right py-1.5 px-2 tabular-nums">
												{detail.status ?? "—"}
											</td>
											<td className="text-right py-1.5 px-2 tabular-nums">
												{detail.attempts ?? "—"}
											</td>
											<td className="text-right py-1.5 px-2 tabular-nums">
												{detail.latencyMs !== undefined
													? formatDuration(detail.latencyMs)
													: "—"}
											</td>
											<td
												className="text-right py-1.5 pl-2 font-mono truncate max-w-[130px]"
												title={detail.evalModel}
											>
												{detail.evalModel ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
