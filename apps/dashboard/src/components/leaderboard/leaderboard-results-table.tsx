/**
 * Purpose: Filtered aggregate results table for the leaderboard page.
 * Exports: LeaderboardResultsTable
 *
 * Invariants:
 * - Displays only already-filtered aggregate items
 * - Keeps source-run provenance visible for every leaderboard row
 */

import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { LeaderboardAggregatedItem } from "@/lib/types";
import { formatDate, formatDuration } from "@/lib/utils";
import { Link } from "react-router-dom";

interface LeaderboardResultsTableProps {
	items: LeaderboardAggregatedItem[];
}

function getStatusVariant(
	status: LeaderboardAggregatedItem["status"],
): BadgeProps["variant"] {
	if (status === "completed") {
		return "success";
	}
	if (status === "failed") {
		return "destructive";
	}
	return "warning";
}

/**
 * Renders the filtered aggregate leaderboard table.
 *
 * @param props - Results-table props
 * @param props.items - Filtered aggregate items to display
 * @returns React element containing the aggregate leaderboard table
 */
export function LeaderboardResultsTable({
	items,
}: LeaderboardResultsTableProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Aggregated Results</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Machine</TableHead>
							<TableHead>Runtime</TableHead>
							<TableHead>Model</TableHead>
							<TableHead>Harness</TableHead>
							<TableHead>Test</TableHead>
							<TableHead>Pass</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Score</TableHead>
							<TableHead>Duration</TableHead>
							<TableHead>Source Run</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow
								key={`${item.machineProfileKey}|${item.id}|${item.sourceRunId}`}
							>
								<TableCell>
									<div className="flex flex-col gap-1">
										<span className="font-medium">
											{item.machineDisplayLabel?.trim() ||
												item.machineProfileLabel?.trim() ||
												item.machineProfileKey}
										</span>
										{item.machineInstanceId && (
											<span className="text-xs text-foreground-faint">
												{item.machineInstanceId}
											</span>
										)}
										<Badge variant="secondary" className="w-fit">
											{item.verificationStatus}
										</Badge>
									</div>
								</TableCell>
								<TableCell>{item.runtime}</TableCell>
								<TableCell className="max-w-[240px] truncate">
									{item.model}
								</TableCell>
								<TableCell>{item.harness}</TableCell>
								<TableCell>{item.test}</TableCell>
								<TableCell>{item.passType}</TableCell>
								<TableCell>
									<Badge variant={getStatusVariant(item.status)}>
										{item.status}
									</Badge>
								</TableCell>
								<TableCell>
									{item.automatedScore
										? `${item.automatedScore.passed}/${item.automatedScore.total}`
										: "—"}
								</TableCell>
								<TableCell>
									{item.generation?.durationMs !== undefined
										? formatDuration(item.generation.durationMs)
										: "—"}
								</TableCell>
								<TableCell>
									<div className="flex flex-col gap-1">
										<Link
											to={`/runs/${item.sourceRunId}`}
											className="underline underline-offset-2 hover:text-foreground"
										>
											{item.sourceRunId}
										</Link>
										<span className="text-xs text-foreground-faint">
											{formatDate(item.sourceCompletedAt)}
										</span>
									</div>
								</TableCell>
							</TableRow>
						))}
						{items.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={10}
									className="text-center text-foreground-muted"
								>
									No items match current filters.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
