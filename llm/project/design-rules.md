Purpose: Define Terminal-Native / ANSI-Inspired design rules for `plebdev-bench`, covering principles, accessibility guardrails, palette/typography, component conventions, and interaction patterns (CLI now, UI later).

# Design Rules (Terminal-Native / ANSI-Inspired)

`plebdev-bench` is **CLI-first** today, but it produces artifacts (runs, comparisons, summaries) that will likely be viewed in a UI later. These principles keep the product coherent across both modes: concise CLI output now, clean inspectable “views” later.

## Design Principles (Product + UX)

### Principle 1 — Reproducibility is the UX
- The most important “UI” is trust: every run must be explainable and re-runnable.
- Prefer explicitness over cleverness: show what will run, what did run, and where results live.
- Make it easy to compare “then vs now” without a spreadsheet.

### Principle 2 — Defaults should be boring and safe
- Non-interactive by default; “works in scripts” is a feature.
- Failures are recorded, not hidden; exit non-zero only on crashes (MVP).
- Frontier eval should auto-enable when keyed, but never block the run.

### Principle 3 — Progressive disclosure (summary first, details on demand)
- Default CLI output: short summary table + run path.
- Rich detail is always available via drill-down commands or reading `run.json`.
- Avoid dumping large generated code in the terminal unless explicitly requested.

### Principle 4 — Comparisons are a first-class view
- Design every result so it can be diffed deterministically.
- Comparison output should prioritize deltas: pass-rate changes, rubric changes, time/energy changes.
- Always preserve original evidence (logs, reasoning) so diffs can be explained.

### Principle 5 — “Matrix thinking” should feel simple
- Users are really running model × harness × test × pass-type.
- The UX should make the matrix visible without overwhelming:
  - show counts and grouping
  - let users narrow dimensions easily
  - keep naming consistent everywhere (model/harness/test/passType)

### Principle 6 — Treat files as UI surfaces
- The `results/<run-id>/` directory is a user-facing interface.
- Filenames and JSON structure should be stable, readable, and tool-friendly.
- Prefer consistent, shallow nesting and predictable keys.

## Accessibility & Readability Guardrails

- **High contrast by default**: target WCAG AA contrast ratios for any UI surfaces.
- **Never use color as the only signal**: pair colors with symbols/labels (e.g., `✓ PASS`, `✗ FAIL`, `Δ +3`).
- **Color-blind safety**: avoid red/green-only encoding; rely on text + icons + position.
- **Reduced motion**: no essential animations; if a UI exists later, respect `prefers-reduced-motion`.
- **Keyboard-first** (future UI): everything navigable without a mouse; clear focus ring.
- **Readable density**: prefer monospaced tables with consistent alignment; avoid jittery layouts.

## Terminal-Native Visual Language

This direction should feel like a great terminal tool: **tight, high-signal, restrained color**, and layouts that resemble tables/diffs.

### Color Palette (ANSI-Inspired)

We keep a near-black base and use a small set of accents that map to terminal semantics.

- **Background**
  - **bg**: `#0B0E11` (near-black)
  - **bgRaised**: `#0F141A` (panels)
- **Foreground**
  - **fg**: `#E6EDF3` (primary text)
  - **fgMuted**: `#9AA7B2` (secondary text)
  - **fgFaint**: `#6B7785` (timestamps, hints)
- **Borders / grid**
  - **border**: `#1E2630`
- **Semantic accents (use sparingly)**
  - **success**: `#3DDC97` (PASS)
  - **warning**: `#F7C948` (WARN / partial)
  - **danger**: `#FF5C5C` (FAIL / error)
  - **info**: `#58A6FF` (links, selected)
  - **deltaUp**: `#3DDC97` (improvement)
  - **deltaDown**: `#FF5C5C` (regression)
- **Rules**
  - **Limit to 1–2 accent colors per view**.
  - **Use `fg` first**; accents should highlight only the decision-critical values.
  - **In CLI**, prefer bold/underline + symbols; treat color as optional.

### Typography

- **Primary**: monospaced everywhere for terminal-native consistency.
  - UI suggestion: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- **Scale (UI)**
  - **xs**: 12px (timestamps, metadata)
  - **sm**: 13–14px (tables)
  - **md**: 15–16px (body)
  - **lg**: 18–20px (section headers)
- **Weight**
  - Use **regular** for body/table cells.
  - Use **semibold/bold** only for headings and key totals.
- **CLI conventions**
  - Prefer **fixed-width tables** and consistent column alignment.
  - Avoid emoji; use ASCII/Unicode symbols consistently (`✓`, `✗`, `Δ`).

## Component Styling Conventions (Future UI + Report Views)

Even without a UI, these conventions guide how data is shaped and displayed.

### Global
- **No heavy shadows**; use borders and subtle background elevation instead.
- **Rounding**: small radius only (2–6px). Terminal-native should feel crisp.
- **Spacing**: dense but readable; prefer vertical rhythm over wide padding.

### Key “Components”

- **Run Summary Header**
  - Shows: run id, timestamp, duration, environment summary (Bun version, OS), config hash.
  - Displays: counts (items total, passed, failed, skipped), plus “frontier eval enabled/disabled”.
  - Visual: one-line key/value grid; muted labels, bright values.

- **Matrix Table (model × harness × test × passType)**
  - Default view is a table; group rows by model, then harness, then test.
  - Columns (minimum): status, model, harness, test, passType, tests (p/f/t), rubric score (if any), duration, energy/memory (best-effort).
  - Use monospace alignment; truncate long names with ellipsis but preserve full value on hover/copy (UI) or `--verbose` (CLI).

- **Status Badge**
  - Text-first: `PASS`, `FAIL`, `WARN`, `SKIP`.
  - Color is optional; must remain legible without color.

- **Delta Badge (Compare)**
  - Always uses `Δ` plus a signed number.
  - Pair with explicit label: `Δ passRate +5%`, `Δ rubric -0.7`, `Δ time +12s`.

- **Code Panel**
  - Monospace, selectable; show file tree or modules if available.
  - Default collapsed; expand on demand.
  - Never render huge blobs inline by default (protect performance).

- **Logs Panel**
  - Separate stdout/stderr views; include timestamps optionally.
  - Provide quick filters: errors only, test failures only.

- **Frontier Eval Panel**
  - Score + model used + latency.
  - Reasoning is collapsible; never blocks the run if missing.

## Spacing, Layout, and Interaction Patterns

### Layout
- **Primary layout**: stacked sections (Header → Summary → Table → Details).
- **Comparison layout**: two-run header + delta summary + grouped diffs table.
- Keep content width comfortable for terminals and narrow windows (avoid wide-only designs).

### Spacing
- Use a tight base unit:
  - **UI base unit**: 4px
  - Common increments: 8px, 12px, 16px
- Tables should favor **row density** with enough line height for scanning.

### Interaction Patterns (CLI)

- **Default output**: summary + table + path to `results/<run-id>/`.
- **Verbosity**:
  - `--verbose` prints per-item diagnostics (timeouts, retries, stderr tails).
  - `--jsonl` (optional later) emits machine-friendly progress events.
- **Progress**:
  - Deterministic counters: `item 07/48`.
  - Avoid spinners by default (non-interactive, script-friendly).
- **Errors**:
  - Always actionable: state missing dependency, missing API key, invalid config key, etc.
  - Crash-only non-zero exit codes (MVP); otherwise record failures in `run.json`.

### Interaction Patterns (Future UI)

- **Drill-down** from a matrix row into a detail view (generated code, tests, logs, eval).
- **Compare** is a first-class route/view; users should be able to pick two runs and see deltas immediately.
- **Copy-first**: provide “copy run id”, “copy file path”, “copy JSON pointer” affordances.

## Non-Goals (MVP)

- No heavy visualization (charts) until we have enough stable data to justify it.
- No interactive TUI in MVP; keep the CLI script-friendly and deterministic.

