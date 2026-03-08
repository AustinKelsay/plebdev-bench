/**
 * Purpose: Dashboard about page explaining benchmark mechanics, scoring, and current tests.
 * Exports: AboutPage
 *
 * Invariants:
 * - Content reflects current local benchmark implementation rather than aspirational copy.
 * - Layout stays readable on narrow screens by collapsing tables/cards into stacked sections.
 */

import { PageContainer, PageHeader } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
	aboutSummaryCards,
	artifactRows,
	benchmarkDimensions,
	checkpointNotes,
	passTypeDetails,
	scoringSystems,
	testCatalog,
	workflowSteps,
} from "./about-content";

interface SectionHeadingProps {
	title: string;
	description: string;
}

function SectionHeading({ title, description }: SectionHeadingProps) {
	return (
		<div className="space-y-1">
			<h2 className="text-lg font-semibold text-foreground">{title}</h2>
			<p className="text-sm text-foreground-muted">{description}</p>
		</div>
	);
}

interface DefinitionListProps {
	items: typeof passTypeDetails;
}

function DefinitionList({ items }: DefinitionListProps) {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<div key={item.name} className="rounded border border-border bg-muted/20 p-3">
					<p className="text-sm font-semibold text-foreground">{item.name}</p>
					<p className="mt-1 text-sm leading-6 text-foreground-muted">
						{item.description}
					</p>
				</div>
			))}
		</div>
	);
}

/**
 * Renders the benchmark about page for the dashboard.
 *
 * @returns JSX element describing benchmark scope, workflow, scoring, and tests
 */
export function AboutPage() {
	return (
		<PageContainer className="space-y-8">
			<PageHeader
				title="About plebdev-bench"
				description="What the benchmark measures, how each run is executed, and how the dashboard turns raw runs into scores."
			>
				<Button asChild variant="outline" size="sm">
					<Link to="/leaderboard">Open Leaderboard</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link to="/runs">Browse Runs</Link>
				</Button>
			</PageHeader>

			<Card className="overflow-hidden border-info/20">
				<CardHeader className="gap-3 border-b border-border/80 bg-info/5">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">local-first</Badge>
						<Badge variant="outline">CLI-driven</Badge>
						<Badge variant="outline">static dashboard</Badge>
					</div>
					<CardTitle className="text-xl">
						Benchmark local LLMs with reproducible matrix runs
					</CardTitle>
					<CardDescription className="max-w-3xl text-sm leading-6">
						`plebdev-bench` expands each run into a fixed matrix of runtime,
						harness, model, test, and prompt mode, then saves the plan and the
						fact-only results needed for later comparison. The dashboard reads
						those saved artifacts; it does not run the benchmark itself.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
					{aboutSummaryCards.map((card) => (
						<div
							key={card.label}
							className="rounded border border-border bg-background p-4"
						>
							<p className="text-xs uppercase tracking-[0.18em] text-foreground-faint">
								{card.label}
							</p>
							<p className="mt-2 text-sm font-semibold leading-6 text-foreground">
								{card.value}
							</p>
							<p className="mt-2 text-sm leading-6 text-foreground-muted">
								{card.description}
							</p>
						</div>
					))}
				</CardContent>
			</Card>

			<section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
				<Card>
					<CardHeader>
						<SectionHeading
							title="Benchmark Matrix"
							description="A run is a Cartesian product over the selected benchmark dimensions."
						/>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-36">Dimension</TableHead>
									<TableHead>Meaning</TableHead>
									<TableHead>Details</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{benchmarkDimensions.map((dimension) => (
									<TableRow key={dimension.name}>
										<TableCell className="font-semibold text-foreground">
											{dimension.name}
										</TableCell>
										<TableCell className="text-foreground-muted">
											{dimension.meaning}
										</TableCell>
										<TableCell className="text-foreground-muted">
											{dimension.details}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<SectionHeading
								title="Prompt Modes"
								description="Most tests can run in one or both pass types. `tool-smoke` is the exception and uses a single configured pass type."
							/>
						</CardHeader>
						<CardContent>
							<DefinitionList items={passTypeDetails} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<SectionHeading
								title="Why Tool Smoke Exists"
								description="Tool harnesses need a preflight before they are judged on the rest of the suite."
							/>
						</CardHeader>
						<CardContent className="space-y-3 text-sm leading-6 text-foreground-muted">
							<p>
								`tool-smoke` runs once per runtime, model, and harness
								combination using a single pass type, preferring `blind` when it
								is configured. Its job is to answer a narrow question: can this
								harness actually write code with tools when tools are expected?
							</p>
							<p>
								If the harness fails with `tool_missing` behavior, later
								tool-dependent items for that same runtime/model/harness slice
								are skipped so the run does not overstate model weakness when the
								adapter itself is broken.
							</p>
						</CardContent>
					</Card>
				</div>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Run Lifecycle"
					description="This is the actual execution pipeline behind one matrix item."
				/>
				<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
					{workflowSteps.map((step) => (
						<Card key={step.title} className="h-full">
							<CardHeader>
								<CardTitle className="text-base">{step.title}</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3 text-sm leading-6 text-foreground-muted">
								<p>{step.description}</p>
								<p className="rounded border border-border bg-muted/20 p-3 text-foreground">
									{step.evidence}
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<Card>
					<CardHeader>
						<SectionHeading
							title="How Scores Are Made"
							description="The dashboard surfaces multiple score types. They answer different questions."
						/>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-40">Signal</TableHead>
									<TableHead className="w-28">Scale</TableHead>
									<TableHead>Computation</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{scoringSystems.map((system) => (
									<TableRow key={system.name}>
										<TableCell className="font-semibold text-foreground">
											{system.name}
										</TableCell>
										<TableCell className="text-foreground-muted">
											{system.scale}
										</TableCell>
										<TableCell className="text-foreground-muted">
											{system.howItWorks}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<SectionHeading
							title="Checkpoint Fairness"
							description="The dashboard tries to prevent unfair comparisons across changed benchmark definitions."
						/>
					</CardHeader>
					<CardContent className="space-y-3">
						{checkpointNotes.map((note) => (
							<div
								key={note}
								className="rounded border border-border bg-muted/20 p-3 text-sm leading-6 text-foreground-muted"
							>
								{note}
							</div>
						))}
					</CardContent>
				</Card>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Artifacts You Can Inspect"
					description="The benchmark is designed so the evidence on disk is enough to explain what happened."
				/>
				<Card>
					<CardContent className="pt-4">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-72">Artifact</TableHead>
									<TableHead>Purpose</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{artifactRows.map((artifact) => (
									<TableRow key={artifact.path}>
										<TableCell className="font-semibold text-foreground">
											{artifact.path}
										</TableCell>
										<TableCell className="text-foreground-muted">
											{artifact.purpose}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Current Test Catalog"
					description="Each benchmark test lives under `src/tests/<slug>` with prompts, metadata, a scoring spec, and an optional rubric."
				/>
				<div className="grid gap-4 xl:grid-cols-2">
					{testCatalog.map((test) => (
						<Card key={test.slug} className="h-full">
							<CardHeader className="space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="outline">{test.slug}</Badge>
									<Badge variant="secondary">{test.category}</Badge>
									{test.tags.map((tag) => (
										<Badge key={tag} variant="outline" className="text-[11px]">
											{tag}
										</Badge>
									))}
								</div>
								<div className="space-y-1">
									<CardTitle className="text-base">{test.description}</CardTitle>
									<CardDescription className="leading-6">
										{test.contract}
									</CardDescription>
								</div>
							</CardHeader>
							<CardContent className="space-y-3 text-sm leading-6 text-foreground-muted">
								<div
									className={cn(
										"rounded border border-border bg-muted/20 p-3",
										"transition-colors hover:bg-muted/30",
									)}
								>
									<p className="text-xs uppercase tracking-[0.18em] text-foreground-faint">
										What scoring focuses on
									</p>
									<p className="mt-2 text-sm text-foreground">
										{test.scoringFocus}
									</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
		</PageContainer>
	);
}
