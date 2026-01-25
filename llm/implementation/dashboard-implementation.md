Purpose: Document the dashboard frontend implementation from the Scale & Polish Phase.

# Dashboard Implementation

## Summary

The dashboard provides a visual interface for browsing and comparing benchmark results. It's built with React, TypeScript, Vite, shadcn/ui components, and Recharts for visualizations.

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
│   │   ├── run-list/        # Run list page + cards
│   │   ├── run-detail/      # Run detail page + matrix table
│   │   ├── compare/         # Compare page + delta badges
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
- **Charts**:
  - Pass rate bar chart (grouped by model/harness/test)
  - Timing distribution histogram with p50/p90 markers
  - Frontier eval scatter plot (pass rate vs score)
- **Drill-down Dialog**: Click any row to see generation output, scores, and frontier reasoning

### Compare View (`/compare`)

- Two dropdown selectors to choose runs
- URL updates to `/compare/:runA/:runB` for shareability
- **Summary Cards**: matched items, status changes, pass rate delta, frontier eval delta
- **Tabbed Tables**:
  - All matched items with deltas
  - Changes only (items with differences)
  - Regressions (completed → failed)
  - Improvements (failed → completed)

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

### DeltaBadge

```tsx
<DeltaBadge value={5.2} suffix="%" />
// Renders: Δ +5.2% (green)

<DeltaBadge value={-12} suffix="s" invert />
// Renders: Δ -12s (green, inverted for time)
```

## Data Layer

### API Functions (`src/lib/api.ts`)

- `fetchRuns()` - Fetch `results/index.json`
- `fetchRun(runId)` - Fetch `results/{runId}/run.json`
- `fetchPlan(runId)` - Fetch `results/{runId}/plan.json`

### Hooks

- `useRuns()` - List all runs with loading/error state
- `useRunDetail(runId)` - Fetch single run + plan
- `useCompare(runA, runB)` - Fetch two runs and compute comparison

### Aggregations (`src/lib/aggregations.ts`)

- `computePassRate(items)` - Calculate overall pass rate
- `groupByModel/Harness/Test(items)` - Group for breakdowns
- `computeTimingStats(items)` - min/max/median/mean/p90
- `computeFrontierStats(items)` - avg/min/max scores
- `compareRuns(runA, runB)` - Full comparison with deltas

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

- [x] Dashboard renders run list with summary cards
- [x] Run detail shows matrix table with status badges and scoring breakdowns
- [x] Compare view shows deltas with dropdown run selection
- [x] Pass rate bar chart renders by model/harness/test
- [x] Timing distribution chart shows generation durations
- [x] Frontier eval scatter plot shows score vs pass rate
- [x] Terminal-native styling matches design-rules.md palette

## Known Limitations

- **Chunk size**: Recharts adds ~200KB gzipped; could lazy-load charts if needed
- **Static data**: Dashboard reads from static JSON files; no live updates during runs
- **Production serving**: Requires a static file server to serve results directory
