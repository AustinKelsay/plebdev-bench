/**
 * Purpose: Model-centric run explorer for a single run detail page.
 * Exports: ModelOverviewTab
 *
 * Invariants:
 * - Focuses on one model at a time and summarizes by test
 * - Uses existing matrix row detail flow via `onItemClick`
 */

import { MatrixTable } from "@/components/run-detail/matrix-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	computeFrontierStats,
	computePassRate,
	computeToolUseStats,
	inferToolHarnesses,
} from "@/lib/aggregations";
import type { MatrixItemResult } from "@/lib/types";
import { isToolSmokeItem } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface ModelOverviewTabProps {
	items: MatrixItemResult[];
	onItemClick?: (item: MatrixItemResult) => void;
}

interface ModelTestSummary {
	test: string;
	totalItems: number;
	completedItems: number;
	passedTests: number;
	totalTests: number;
	passRate: number;
	failures: number;
	frontierAvg: number | null;
}

function getSortedModelNames(items: MatrixItemResult[]): string[] {
	return Array.from(new Set(items.map((item) => item.model))).sort((a, b) =>
		a.localeCompare(b),
	);
}

function computeModelTestSummaries(
	items: MatrixItemResult[],
): ModelTestSummary[] {
	const groupedByTest = new Map<string, MatrixItemResult[]>();

	for (const item of items) {
		const group = groupedByTest.get(item.test) ?? [];
		group.push(item);
		groupedByTest.set(item.test, group);
	}

	const summaries: ModelTestSummary[] = [];

	for (const [test, testItems] of groupedByTest) {
		const completedItems = testItems.filter(
			(item) => item.status === "completed",
		).length;
		const scoredItems = testItems.filter((item) => !isToolSmokeItem(item));
		const passRate = computePassRate(scoredItems);
		const failures = testItems.filter(
			(item) =>
				item.status === "failed" ||
				item.generationFailure !== undefined ||
				item.scoringFailure !== undefined ||
				item.frontierEvalFailure !== undefined,
		).length;
		const frontierScores = testItems
			.map((item) => item.frontierEval?.score)
			.filter((score): score is number => score !== undefined);
		const frontierAvg =
			frontierScores.length > 0
				? frontierScores.reduce((sum, score) => sum + score, 0) /
					frontierScores.length
				: null;

		summaries.push({
			test,
			totalItems: testItems.length,
			completedItems,
			passedTests: passRate.passed,
			totalTests: passRate.total,
			passRate: passRate.passRate,
			failures,
			frontierAvg,
		});
	}

	return summaries.sort((a, b) => {
		if (a.failures !== b.failures) {
			return b.failures - a.failures;
		}
		if (a.totalTests === 0 && b.totalTests > 0) {
			return 1;
		}
		if (b.totalTests === 0 && a.totalTests > 0) {
			return -1;
		}
		if (a.passRate !== b.passRate) {
			return a.passRate - b.passRate;
		}
		return a.test.localeCompare(b.test);
	});
}

function findStrongestTest(
	summaries: ModelTestSummary[],
): ModelTestSummary | null {
	const scored = summaries.filter((summary) => summary.totalTests > 0);
	if (scored.length === 0) {
		return null;
	}
	return scored.reduce((best, current) =>
		current.passRate > best.passRate ? current : best,
	);
}

function findWeakestTest(
	summaries: ModelTestSummary[],
): ModelTestSummary | null {
	const scored = summaries.filter((summary) => summary.totalTests > 0);
	if (scored.length === 0) {
		return null;
	}
	return scored.reduce((worst, current) =>
		current.passRate < worst.passRate ? current : worst,
	);
}

/**
 * Renders a model-focused test overview and drill-down matrix.
 *
 * @param props - Component props
 * @returns React element
 * @throws none
 */
export function ModelOverviewTab({
	items,
	onItemClick,
}: ModelOverviewTabProps) {
	const modelNames = useMemo(() => getSortedModelNames(items), [items]);
	const [selectedModel, setSelectedModel] = useState(modelNames[0] ?? "");
	const [focusedTest, setFocusedTest] = useState<string | null>(null);

	useEffect(() => {
		if (modelNames.length === 0) {
			setSelectedModel("");
			return;
		}
		if (!selectedModel || !modelNames.includes(selectedModel)) {
			setSelectedModel(modelNames[0]);
		}
	}, [modelNames, selectedModel]);

	const modelItems = useMemo(
		() => items.filter((item) => item.model === selectedModel),
		[items, selectedModel],
	);

	useEffect(() => {
		if (!focusedTest) {
			return;
		}
		const hasFocusedTest = modelItems.some((item) => item.test === focusedTest);
		if (!hasFocusedTest) {
			setFocusedTest(null);
		}
	}, [focusedTest, modelItems]);

	const testSummaries = useMemo(
		() => computeModelTestSummaries(modelItems),
		[modelItems],
	);
	const strongestTest = useMemo(
		() => findStrongestTest(testSummaries),
		[testSummaries],
	);
	const weakestTest = useMemo(
		() => findWeakestTest(testSummaries),
		[testSummaries],
	);
	const isStrongestWeakestSameTest =
		strongestTest?.test !== undefined &&
		weakestTest?.test !== undefined &&
		strongestTest.test === weakestTest.test;
	const filteredItems = useMemo(
		() =>
			focusedTest
				? modelItems.filter((item) => item.test === focusedTest)
				: modelItems,
		[focusedTest, modelItems],
	);

	const completedItems = modelItems.filter(
		(item) => item.status === "completed",
	).length;
	const completionRate =
		modelItems.length > 0 ? completedItems / modelItems.length : 0;
	const passRate = computePassRate(
		modelItems.filter((item) => !isToolSmokeItem(item)),
	);
	const frontierStats = computeFrontierStats(modelItems);
	const toolHarnesses = inferToolHarnesses(items);
	const toolStats = computeToolUseStats(
		modelItems.filter((item) => toolHarnesses.has(item.harness)),
	);

	if (modelNames.length === 0) {
		return (
			<Card>
				<CardContent className="pt-6 text-sm text-foreground-muted">
					No model data found in this run.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Model Overview</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="max-w-md">
						<p className="mb-2 text-xs uppercase tracking-wide text-foreground-faint">
							Model
						</p>
						<Select value={selectedModel} onValueChange={setSelectedModel}>
							<SelectTrigger>
								<SelectValue placeholder="Select a model" />
							</SelectTrigger>
							<SelectContent>
								{modelNames.map((modelName) => (
									<SelectItem key={modelName} value={modelName}>
										{modelName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-3 md:grid-cols-4">
						<div className="rounded border border-border bg-background-raised p-3">
							<p className="text-xs text-foreground-faint">Completion</p>
							<p className="text-lg font-semibold tabular-nums">
								{completedItems}/{modelItems.length}
							</p>
							<p className="text-xs text-foreground-faint">
								{formatPercent(completionRate)}
							</p>
						</div>
						<div className="rounded border border-border bg-background-raised p-3">
							<p className="text-xs text-foreground-faint">
								Pass Rate (non tool-smoke)
							</p>
							<p
								className={cn(
									"text-lg font-semibold tabular-nums",
									passRate.passRate >= 0.8
										? "text-success"
										: passRate.passRate >= 0.5
											? "text-warning"
											: "text-danger",
								)}
							>
								{formatPercent(passRate.passRate)}
							</p>
							<p className="text-xs text-foreground-faint">
								{passRate.passed}/{passRate.total} tests
							</p>
						</div>
						<div className="rounded border border-border bg-background-raised p-3">
							<p className="text-xs text-foreground-faint">Tool Success</p>
							<p className="text-lg font-semibold tabular-nums">
								{toolStats.totalItems > 0
									? formatPercent(toolStats.toolSuccessRate)
									: "—"}
							</p>
							<p className="text-xs text-foreground-faint">
								{toolStats.totalItems > 0
									? `${toolStats.totalItems - toolStats.toolMissing}/${toolStats.totalItems} items`
									: "No tool-required items"}
							</p>
						</div>
						<div className="rounded border border-border bg-background-raised p-3">
							<p className="text-xs text-foreground-faint">Frontier Eval</p>
							<p className="text-lg font-semibold tabular-nums">
								{frontierStats
									? `${frontierStats.avgScore.toFixed(1)}/10`
									: "—"}
							</p>
							<p className="text-xs text-foreground-faint">
								{frontierStats
									? `${frontierStats.count} scored items`
									: "No frontier eval data"}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						{strongestTest && (
							<Badge variant="success">
								Strongest: {strongestTest.test} (
								{formatPercent(strongestTest.passRate)})
							</Badge>
						)}
						{weakestTest && !isStrongestWeakestSameTest && (
							<Badge variant="destructive">
								Weakest: {weakestTest.test} (
								{formatPercent(weakestTest.passRate)})
							</Badge>
						)}
						<Badge variant="warning">
							Tests with failures:{" "}
							{testSummaries.filter((summary) => summary.failures > 0).length}
						</Badge>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Test Breakdown for {selectedModel}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>TEST</TableHead>
								<TableHead className="text-right">ITEMS</TableHead>
								<TableHead className="text-right">PASS</TableHead>
								<TableHead className="text-right">FAILURES</TableHead>
								<TableHead className="text-right">FRONTIER</TableHead>
								<TableHead className="text-right">FOCUS</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{testSummaries.map((summary) => (
								<TableRow
									key={summary.test}
									className={cn(
										"cursor-pointer",
										focusedTest === summary.test ? "bg-muted/70" : undefined,
									)}
									onClick={() =>
										setFocusedTest(
											focusedTest === summary.test ? null : summary.test,
										)
									}
								>
									<TableCell className="font-medium">{summary.test}</TableCell>
									<TableCell className="text-right tabular-nums">
										{summary.completedItems}/{summary.totalItems}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{summary.totalTests > 0 ? (
											<span
												className={cn(
													summary.passRate >= 0.8
														? "text-success"
														: summary.passRate >= 0.5
															? "text-warning"
															: "text-danger",
												)}
											>
												{summary.passedTests}/{summary.totalTests} (
												{formatPercent(summary.passRate)})
											</span>
										) : (
											<span className="text-foreground-faint">—</span>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										<span
											className={cn(
												summary.failures > 0 ? "text-danger" : "text-success",
											)}
										>
											{summary.failures}
										</span>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{summary.frontierAvg !== null ? (
											`${summary.frontierAvg.toFixed(1)}/10`
										) : (
											<span className="text-foreground-faint">—</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											type="button"
											variant={
												focusedTest === summary.test ? "secondary" : "outline"
											}
											size="sm"
											onClick={(event) => {
												event.stopPropagation();
												setFocusedTest(
													focusedTest === summary.test ? null : summary.test,
												);
											}}
										>
											{focusedTest === summary.test ? "Clear" : "Focus"}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle className="text-base">
							Model Matrix
							{focusedTest ? ` · ${focusedTest}` : ""}
						</CardTitle>
						<p className="mt-1 text-xs text-foreground-faint">
							{filteredItems.length} items
							{focusedTest ? " in focused test" : " across all tests"}
						</p>
					</div>
					{focusedTest && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setFocusedTest(null)}
						>
							Show all tests
						</Button>
					)}
				</CardHeader>
				<CardContent>
					<MatrixTable items={filteredItems} onRowClick={onItemClick} />
				</CardContent>
			</Card>
		</div>
	);
}
