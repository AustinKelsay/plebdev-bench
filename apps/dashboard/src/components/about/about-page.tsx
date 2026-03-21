/**
 * Purpose: Dashboard about page — benchmark mechanics, scoring, and test catalog.
 * Exports: AboutPage
 *
 * Invariants:
 * - Content reflects current local benchmark behavior.
 * - Layout readable on narrow screens; tables collapse to stacked cards.
 * - Visual polish matches leaderboard: glow, accents, stagger animations.
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
import { SectionHeading } from "@/components/ui/section-heading";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";
import {
	aboutFacts,
	artifactRows,
	benchmarkDimensions,
	checkpointNotes,
	scoringSystems,
	testCatalog,
	workflowSteps,
} from "./about-content";

/** Accent colors for workflow step cards. */
const STEP_ACCENTS = [
	"hsl(142, 60%, 49%)", // brand green — Plan
	"hsl(215, 70%, 60%)", // steel blue — Generate
	"hsl(38, 80%, 58%)",  // warm amber — Score
	"hsl(265, 50%, 62%)", // soft purple — Retry
	"hsl(185, 55%, 50%)", // muted cyan — Frontier eval
	"hsl(335, 55%, 58%)", // muted rose — Persist
];

/** Accent colors for fact cards. */
const FACT_ACCENTS = [
	"hsl(142, 60%, 49%)", // brand green — Matrix
	"hsl(215, 70%, 60%)", // steel blue — Artifacts
	"hsl(38, 80%, 58%)",  // warm amber — Score
	"hsl(265, 50%, 62%)", // soft purple — Failures
];

/**
 * Renders the benchmark about page.
 *
 * @returns JSX element describing benchmark scope, workflow, scoring, and tests
 */
export function AboutPage() {
	return (
		<PageContainer className="space-y-8">
			<PageHeader
				title="About plebdev-bench"
				description="How the benchmark works, how scores are computed, and what each test measures."
			>
				<Button asChild variant="outline" size="sm">
					<Link to="/leaderboard">Leaderboard</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link to="/runs">Runs</Link>
				</Button>
			</PageHeader>

			{/* ── Quick facts ── */}
			<Card className="overflow-hidden border-success/20" glow>
				<CardHeader className="gap-3 border-b border-border/80 bg-success/5">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">local-first</Badge>
						<Badge variant="outline">CLI-driven</Badge>
						<Badge variant="outline">static dashboard</Badge>
					</div>
					<CardTitle className="text-xl">
						Reproducible matrix runs for local LLMs
					</CardTitle>
					<CardDescription className="max-w-3xl text-sm leading-6">
						Each run expands a matrix of runtime × harness × model × test
						× prompt mode, then saves results as JSON artifacts and exits. The
						dashboard reads those artifacts — it never runs the benchmark itself.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
					{aboutFacts.map((fact, i) => (
						<div
							key={fact.label}
							className={`rounded border border-border border-l-2 bg-background p-4 animate-fade-slide-up animate-stagger-${i + 1}`}
							style={{ borderLeftColor: FACT_ACCENTS[i] }}
						>
							<p className="text-xs uppercase tracking-[0.18em] text-foreground-faint">
								{fact.label}
							</p>
							<p className="mt-2 text-sm font-semibold leading-6 text-foreground">
								{fact.value}
							</p>
							<p className="mt-1 text-xs leading-5 text-foreground-muted">
								{fact.detail}
							</p>
						</div>
					))}
				</CardContent>
			</Card>

			{/* ── Matrix dimensions ── */}
			<section className="space-y-4">
				<SectionHeading
					title="Matrix Dimensions"
					description="A run is a Cartesian product over these five axes."
				/>
				<Card glow>
					<CardContent className="pt-6">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-32">Dimension</TableHead>
									<TableHead>Description</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{benchmarkDimensions.map((dim) => (
									<TableRow key={dim.name}>
										<TableCell className="font-semibold text-foreground">
											<code className="text-success">{dim.name}</code>
										</TableCell>
										<TableCell className="text-foreground-muted">
											{dim.description}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</section>

			{/* ── Run lifecycle ── */}
			<section className="space-y-4">
				<SectionHeading
					title="Run Lifecycle"
					description="Pipeline stages for each matrix item."
				/>
				<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
					{workflowSteps.map((ws, i) => (
						<Card
							key={ws.step}
							glow
							className={`h-full border-l-2 animate-fade-slide-up animate-stagger-${i + 1}`}
							style={{ borderLeftColor: STEP_ACCENTS[i] }}
						>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">
									<span className="text-foreground-faint mr-2 text-sm">{i + 1}.</span>
									{ws.step}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2 text-sm leading-6 text-foreground-muted">
								<p>{ws.description}</p>
								<p className="rounded border border-border bg-muted/20 p-2 text-xs text-foreground">
									{ws.detail}
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			{/* ── Scoring + Checkpoints ── */}
			<section className="space-y-4">
				<SectionHeading
					title="Scoring"
					description="Multiple score types answer different questions."
				/>
				<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
					<Card glow className="border-l-2 border-l-success">
						<CardContent className="pt-6">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-36">Signal</TableHead>
										<TableHead className="w-24">Scale</TableHead>
										<TableHead>How</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{scoringSystems.map((s) => (
										<TableRow key={s.name}>
											<TableCell className="font-semibold text-foreground">
												{s.name}
											</TableCell>
											<TableCell>
												<code className="text-xs text-info">{s.scale}</code>
											</TableCell>
											<TableCell className="text-foreground-muted">
												{s.description}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					<Card glow className="border-l-2 border-l-warning">
						<CardHeader>
							<CardTitle className="text-base">Seasons &amp; Checkpoints</CardTitle>
							<CardDescription className="text-xs leading-5">
								A checkpoint is a content-hash of all benchmark definitions (prompts, specs, rubrics, harness code). Each season is pinned to one checkpoint so comparisons stay fair.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							{checkpointNotes.map((note, i) => (
								<div
									key={note}
									className={`rounded border border-border bg-muted/20 p-3 text-sm leading-6 text-foreground-muted animate-fade-slide-up animate-stagger-${i + 1}`}
								>
									{note}
								</div>
							))}
						</CardContent>
					</Card>
				</div>
			</section>

			{/* ── Artifacts ── */}
			<section className="space-y-4">
				<SectionHeading
					title="Artifacts"
					description="Evidence on disk — enough to explain what happened."
				/>
				<Card glow className="border-l-2 border-l-info">
					<CardContent className="pt-6">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-72">Path</TableHead>
									<TableHead>Purpose</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{artifactRows.map((a) => (
									<TableRow key={a.path}>
										<TableCell>
											<code className="font-mono text-xs text-success">{a.path}</code>
										</TableCell>
										<TableCell className="text-foreground-muted">
											{a.purpose}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</section>

			{/* ── Test catalog ── */}
			<section className="space-y-4">
				<SectionHeading
					title="Test Catalog"
					description="Each test lives under src/tests/<slug> with prompts, a scoring spec, and an optional rubric."
				/>
				<div className="grid gap-4 xl:grid-cols-2">
					{testCatalog.map((test, i) => (
						<Card
							key={test.slug}
							glow
							className={`h-full border-l-2 border-l-success/50 animate-fade-slide-up animate-stagger-${(i % 8) + 1}`}
						>
							<CardHeader className="pb-2">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="success" className="font-mono">{test.slug}</Badge>
									{test.tags.map((tag) => (
										<Badge key={tag} variant="secondary" className="text-[11px]">
											{tag}
										</Badge>
									))}
								</div>
								<CardTitle className="text-base mt-2">{test.description}</CardTitle>
								<CardDescription className="text-xs leading-5">
									{test.contract}
								</CardDescription>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="rounded border border-border bg-muted/20 p-2">
									<p className="text-[10px] uppercase tracking-widest text-foreground-faint mb-1">
										Scoring
									</p>
									<p className="text-xs text-foreground-muted">{test.scoring}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
		</PageContainer>
	);
}
