Purpose: Document the dashboard frontend implementation from the Scale & Polish Phase.

# Dashboard Implementation

## Summary

The dashboard provides a visual interface for browsing benchmark results, inspecting latest-checkpoint aggregates, and explaining benchmark semantics. It's built with React, TypeScript, Vite, shadcn/ui components, and Recharts for visualizations.

## Architecture

### Project Structure

```
apps/dashboard/
├── scripts/
│   └── build-index.ts       # Generates results/index.json
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # Header, page containers
│   │   ├── about/           # About page content
│   │   ├── leaderboard/     # Leaderboard page + filters/cards/table
│   │   ├── run-list/        # Run list page + cards
│   │   ├── run-detail/      # Run detail page + matrix table
│   │   └── charts/          # Recharts visualizations
│   ├── hooks/               # Data fetching hooks
│   ├── lib/                 # Types, API, utils, aggregations
│   ├── pages/               # Route components
│   ├── App.tsx              # Router setup
│   ├── main.tsx             # Entry point
│   └── index.css            # Theme + Tailwind
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

### Stack

- **Vite** - Build tool with React plugin
- **React 18** - UI framework
- **TypeScript** - Type safety
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Radix-based component library
- **Recharts** - Chart library

## Features

### Leaderboard View (`/leaderboard`)

- Latest-checkpoint aggregate with machine/runtime/model/harness/test/passType filtering
- Summary cards for pass rate, eval coverage, machine count, and run coverage
- Latest runs panel with links back to source runs
- Aggregated results table with machine-aware provenance
- Chart gallery for effective score, blind vs informed deltas, timing, and frontier correlation

### Run List View (`/runs`)

- Grid of summary cards showing all benchmark runs
- Each card displays: runId, timestamp, duration, item counts
- Links to run detail page
- Empty state with instructions for new users

### Run Detail View (`/runs/:runId`)

- **Summary Cards**: items completed/failed, pass rate, frontier eval average, environment info
- **Matrix Table**: All items with status badges, model, harness, test, pass type, scores, timing
- **Scoring Breakdown**: Pass rates by model, harness, and test (tabbed view)
- **Timing Stats**: min/max/median/mean/p90 durations
- **Failure Breakdown**: Generation and scoring failures by type
- **Tooling Breakdown**: Tool success rate for tool-calling harnesses
- **Charts**:
  - Composite score chart (effective + pass rate + tool success + frontier)
  - Blind vs informed chart (paired bars comparing pass types)
  - Pass rate bar chart (grouped by model/harness/test)
  - Timing distribution histogram with p50/p90 markers
  - Frontier eval scatter plot (pass rate vs score)
- **Drill-down Dialogs**:
  - ItemDetailDialog: Click any row to see generation output, scores, and frontier reasoning
  - DimensionDetailDialog: Click chart bars to see dimension details

### About View (`/about`)

- Explains the benchmark matrix, prompt modes, scoring pipeline, checkpoint semantics, and current test catalog
- Documents how leaderboard effective score differs from raw automated pass rate
- Links readers back to run history and leaderboard views

## Design System

### Color Palette (ANSI-Inspired)

| Token | Color | Usage |
|-------|-------|-------|
| `--background` | `#0B0E11` | Main background |
| `--background-raised` | `#0F141A` | Cards, panels |
| `--foreground` | `#E6EDF3` | Primary text |
| `--foreground-muted` | `#9AA7B2` | Secondary text |
| `--foreground-faint` | `#6B7785` | Timestamps, hints |
| `--border` | `#1E2630` | Borders, dividers |
| `--success` | `#3DDC97` | PASS, improvements |
| `--warning` | `#F7C948` | WARN, partial |
| `--danger` | `#FF5C5C` | FAIL, regressions |
| `--info` | `#58A6FF` | Links, highlights |

### Typography

- **Font**: Monospace everywhere (`ui-monospace, SFMono-Regular, Menlo, ...`)
- **Numeric values**: `tabular-nums` for alignment

### Accessibility

- Status badges always include text + icon (never color-only)
- High contrast dark theme (WCAG AA compliant)

## Components

### StatusBadge

```tsx
<StatusBadge status="completed" />
// Renders: ✓ PASS (green)

<StatusBadge status="failed" />
// Renders: ✗ FAIL (red)
```

### InfoTooltip

Contextual help tooltips with question mark trigger:

```tsx
// Standalone tooltip
<InfoTooltip content="Explanation text" side="top" />

// Wrapper to add tooltip next to any content
<WithInfoTooltip tooltip="Help text">Label</WithInfoTooltip>
```

Tooltip content strings are centralized in `apps/dashboard/src/lib/tooltip-content.ts` for easy maintenance.

## Data Layer

### API Functions (`src/lib/api.ts`)

- `fetchRuns()` - Fetch `results/index.json`
- `fetchRun(runId)` - Fetch `results/{runId}/run.json`
- `fetchPlan(runId)` - Fetch `results/{runId}/plan.json`

### Hooks

- `useRuns()` - List all runs with loading/error state
- `useRunDetail(runId)` - Fetch single run + plan
- `useCompare(runA, runB)` - Fetch two runs and compute comparison

### Aggregations (`apps/dashboard/src/lib/aggregations.ts`)

**Core Functions:**
- `computePassRate(items)` - Calculate overall pass rate (0-1)
- `computeItemPassRate(score)` - Pass rate from single score
- `groupByModel/Harness/Test/ModelHarness(items)` - Group for breakdowns
- `computeBreakdown(items, groupFn)` - Pass rate breakdown by dimension

**Timing & Frontier:**
- `computeTimingStats(items)` - min/max/median/mean/p90/count
- `computeFrontierStats(items)` - avg/min/max/count

**Composite Metrics:**
- `computeCompositeMetrics(items, groupFn, toolHarnesses)` - Effective score with weights
- `computeBlindInformedBreakdown(items, groupFn)` - Blind vs informed delta per group

**Tool & Failure Stats:**
- `inferToolHarnesses(items)` - Detect harnesses expected to use tools
- `computeToolUseStats(items)` - Tool success rate
- `computeToolScoreBreakdown(items, groupFn)` - Tool usage vs scoring per group
- `computeFailureStats(items)` - Failure counts by type
- `partitionToolSmoke(items)` - Separate tool-smoke from regular items

**Comparison:**
- `compareRuns(runA, runB)` - Full comparison with matched items and deltas

## Scripts

### Root package.json

```json
{
  "scripts": {
    "dashboard": "bun run --cwd apps/dashboard dev",
    "dashboard:build": "bun run --cwd apps/dashboard build",
    "dashboard:index": "bun run apps/dashboard/scripts/build-index.ts"
  }
}
```

### build-index.ts

Scans `results/` directory and generates `results/index.json` with run summaries:

```bash
bun dashboard:index
```

## Development

### Start dev server

```bash
bun dashboard
# Opens http://localhost:5173
```

### Build for production

```bash
bun dashboard:build
# Output in apps/dashboard/dist/
```

### Generate runs index

```bash
bun dashboard:index
# Creates results/index.json
```

## Vite Configuration

The Vite config includes a custom plugin to serve the results directory:

- Requests to `/results/*` are proxied to `../../results/`
- Allows fetching run.json and plan.json files during development
- Production builds require a static file server or reverse proxy

## Exit Criteria Status

- [x] Leaderboard renders latest-checkpoint aggregate with filters and charts
- [x] Dashboard renders run list with summary cards
- [x] Run detail shows matrix table with status badges and scoring breakdowns
- [x] About page explains benchmark and scoring semantics
- [x] Pass rate bar chart renders by model/harness/test
- [x] Timing distribution chart shows generation durations
- [x] Frontier eval scatter plot shows score vs pass rate
- [x] Terminal-native styling matches design-rules.md palette

## Known Limitations

- **Chunk size**: Recharts adds ~200KB gzipped; could lazy-load charts if needed
- **Static data**: Dashboard reads from static JSON files; no live updates during runs
- **Production serving**: Requires a static file server to serve results directory
