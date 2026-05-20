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
 * Returns the Model Profile label displayed as the row's primary model identity.
 *
 * @param item - Aggregated leaderboard item
 * @returns Model Profile label or runtime-model fallback
 */
function getModelProfileLabel(item: LeaderboardAggregatedItem): string {
	return (
		item.modelProfile?.canonical.profileLabel ?? item.modelAlias ?? item.model
	);
}

/**
 * Renders Model Variant provenance metadata for a leaderboard row.
 *
 * @param item - Aggregated leaderboard item
 * @returns React fragment with runtime-specific variant details
 */
function renderModelVariantDetails(item: LeaderboardAggregatedItem) {
	const profile = item.modelProfile;
	if (!profile) {
		return (
			<span className="text-xs text-foreground-faint">
				Runtime Model: {item.model}
			</span>
		);
	}

	return (
		<>
			<span className="text-xs text-foreground-faint">
				Runtime Model: {profile.variant.runtimeModelName}
			</span>
			<span className="text-xs text-foreground-faint">
				Variant: {profile.variant.variantLabel}
			</span>
			{profile.variant.quantization && (
				<span className="text-xs text-foreground-faint">
					Quantization: {profile.variant.quantization}
				</span>
			)}
			{profile.resolutionSource === "runtime_name" && (
				<Badge variant="warning" className="w-fit">
					runtime-name fallback - lower trust
				</Badge>
			)}
		</>
	);
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
								<TableCell className="max-w-[280px]">
									<div className="flex flex-col gap-1">
										<span className="font-medium">
											{getModelProfileLabel(item)}
										</span>
										{renderModelVariantDetails(item)}
									</div>
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
