# Plebdev Bench Context

Plebdev Bench is the benchmark domain for planning, executing, scoring, recording, and comparing local LLM benchmark runs.

## Language

### Run Identity And Artifacts

**Benchmark Run**:
One complete benchmark execution over a selected matrix of runtimes, harnesses, models, tests, and pass types.
_Avoid_: Run, benchmark result

**Run ID**:
The stable identifier assigned to one **Benchmark Run** and its persisted files.
_Avoid_: Directory name, timestamp, artifact ID

**Runtime Environment**:
The software execution context captured for a **Benchmark Run**, including runtime and harness tool versions.
_Avoid_: Machine profile, runtime, harness

**Run Provenance**:
The origin and verification status recorded for a **Benchmark Run**.
_Avoid_: Machine profile, runtime environment, source

**Tamper Evidence**:
Evidence that a **Run Artifact Pair** has not changed since it was recorded or published.
_Avoid_: Verification, redaction, trust score

**Run Result**:
The persisted outcome artifact for a **Benchmark Run**.
_Avoid_: Benchmark run, result

**Run Artifact Pair**:
The **Run Plan** and **Run Result** that together form the canonical artifact set for one **Benchmark Run**.
_Avoid_: Run directory, artifact folder, logs

**Compatible Run Results**:
**Run Results** that share the same benchmark meaning and can be compared without mixing incompatible benchmark definitions.
_Avoid_: Same schema, matching runs, comparable artifacts

**Schema Version**:
The artifact-format compatibility marker recorded on persisted benchmark files.
_Avoid_: Benchmark checkpoint, release version, package version

**Published Run**:
A **Run Result** and its companion **Run Plan** made available for shared dashboard or leaderboard analysis.
_Avoid_: Hosted artifact, dashboard run, public result

**Published Redaction**:
The removal or replacement of local or private details before a **Run Result** becomes part of a **Published Run**.
_Avoid_: Cleanup, migration, filtering

### Comparison And Publishing

**Run Comparison**:
An analysis of differences between **Compatible Run Results**.
_Avoid_: Compare, delta

**Comparison Space**:
The full active analysis scope used by a **Run Comparison** or **Leaderboard**, including checkpoint, machine, dimension, and trust filters.
_Avoid_: Filter, run config, selected rows

**Leaderboard**:
A ranked analysis view over **Compatible Run Results**, scoped by **Benchmark Checkpoint** and **Machine Profile**.
_Avoid_: Dashboard ranking, aggregate table

**Best Observed Item**:
The strongest recorded **Matrix Item** outcome selected for one leaderboard aggregation key, including **Pass Type**, within a **Benchmark Checkpoint** and **Machine Profile**.
_Avoid_: Fastest item, latest item, current item, deduped row

**Composite Score**:
A derived ranking metric that combines multiple **Run Result** signals for leaderboard analysis.
_Avoid_: Automated score, frontier score, pass rate

**Partial Run Result**:
The temporary persisted progress artifact for an incomplete **Benchmark Run**.
_Avoid_: Checkpoint, snapshot, recovery artifact

**Run Plan**:
The durable pre-execution artifact that describes exactly what a **Benchmark Run** intends to execute.
_Avoid_: Benchmark plan, matrix plan

**Run Config**:
The resolved settings that select and parameterize a **Benchmark Run** before matrix expansion.
_Avoid_: Raw CLI args, benchmark metadata, run plan, environment

### Execution And Model Identity

**Matrix**:
The expanded set of benchmark combinations selected for a **Benchmark Run**.
_Avoid_: Plan, grid

**Matrix Item**:
One executable combination of runtime, harness, model, benchmark test, and pass type within a **Matrix**.
_Avoid_: Task, case, benchmark item

**Benchmark Evidence**:
The persisted or referenced facts that explain a **Matrix Item** outcome.
_Avoid_: Incidental logs, artifact, result blob

**Generated Output**:
The model-produced content or workspace changes created through a **Harness** for a **Matrix Item**.
_Avoid_: Artifact, response, completion

**Output Contract**:
The required shape or location of **Generated Output** for a **Matrix Item** to be evaluated as intended.
_Avoid_: Prompt, scoring spec, generated output

**Retry Attempt**:
A repeated execution attempt recorded as **Benchmark Evidence** for the same **Matrix Item** after a recoverable generation or scoring problem.
_Avoid_: Pass type, rerun, replacement item, matrix item

**Retry Policy**:
The resolved execution rule that determines when a **Matrix Item** may produce one or more **Retry Attempts**.
_Avoid_: Retry attempt, pass type, failure handling

### Benchmark Content

**Benchmark Test**:
A packaged benchmark definition containing the prompts, scoring expectations, fixtures, metadata, and optional eval rubric for one model challenge.
_Avoid_: Test, task, scenario

**Benchmark Prompt**:
The task instruction packaged with a **Benchmark Test** for one **Pass Type**.
_Avoid_: Test, task, system prompt

**Benchmark Metadata**:
The structured descriptive and execution-shaping data packaged with a **Benchmark Test**.
_Avoid_: Config, docs, incidental metadata

**Scoring Spec**:
The deterministic scoring definition used to produce an **Automated Score** for a **Benchmark Test**.
_Avoid_: Test, unit test, rubric

**Eval Rubric**:
The qualitative judgment criteria used by **Frontier Eval** for a **Benchmark Test**.
_Avoid_: Scoring spec, automated test, score

**Scoring Mode**:
The evaluation shape a **Benchmark Test** uses to turn **Generated Output** or workspace changes into an **Automated Score**.
_Avoid_: Test type, benchmark category, harness mode

**Benchmark Workspace**:
The isolated filesystem area prepared for a **Matrix Item** when a **Benchmark Test** requires file-based execution or scoring.
_Avoid_: Repo, project, artifact directory

**Benchmark Fixture**:
Seed data packaged with a **Benchmark Test** to prepare a **Benchmark Workspace** or scoring input.
_Avoid_: Artifact, sample file, workspace

**Benchmark Category**:
A grouping of **Benchmark Tests** used for selection and analysis.
_Avoid_: Test category, task category, capability area

**Pass Type**:
The prompt-context variant used for a **Matrix Item**, currently either blind or informed.
_Avoid_: Run mode, attempt type, prompt mode

### Runtime, Harness, And Model Identity

**Runtime**:
The inference backend that makes benchmark models available for execution.
_Avoid_: Harness, provider

**Model Discovery**:
The pre-plan process of identifying **Runtime Models** exposed by a **Runtime**.
_Avoid_: Model availability, model config, model profile

**Model Exclusion**:
A recorded decision to omit a discovered **Runtime Model** from a **Run Plan**.
_Avoid_: Missing model, failure, filter

**Combination Exclusion**:
A recorded decision to omit an incompatible planned combination before **Matrix** expansion.
_Avoid_: Failed item, skipped item, matrix item

**Harness**:
The interface used to ask a benchmark model to perform a **Benchmark Test**.
_Avoid_: Runtime, model provider, tool version

**Harness Capability**:
A specific benchmark-relevant affordance a **Harness** provides for representative **Benchmark Test** execution.
_Avoid_: Tool feature, product capability, requirement

**Runtime Model**:
The exact executable model identifier exposed by a **Runtime**.
_Avoid_: Model profile, benchmark model

**Model Profile**:
The canonical benchmark identity used to group equivalent model variants for comparison.
_Avoid_: Runtime model, model alias

**Model Profile Resolution**:
The provenance of how a **Runtime Model** was assigned to a **Model Profile**.
_Avoid_: Model discovery, model alias, profile trust

**Model Variant**:
A specific packaged or runtime-specific form of a **Model Profile**, including runtime naming, format, and quantization details.
_Avoid_: Model profile, runtime model

### Scoring And Evidence

**Automated Score**:
The deterministic local scoring outcome for a **Matrix Item**.
_Avoid_: Test result, score, composite score

**Frontier Eval**:
An optional rubric-based judgment of a **Matrix Item** by an external frontier model.
_Avoid_: Score, automated score, judge score, judge model

**Frontier Eval Model**:
The external model used to produce one **Frontier Eval** judgment.
_Avoid_: Runtime model, model profile, benchmark model

**Generation Failure**:
A recorded failure to obtain usable benchmark output from the selected runtime, harness, and model for a **Matrix Item**.
_Avoid_: Item failure, scoring failure

**Scoring Failure**:
A recorded failure to evaluate generated benchmark output with local scoring for a **Matrix Item**.
_Avoid_: Item failure, generation failure

**Frontier Eval Failure**:
A recorded failure to obtain optional frontier-eval judgment for a **Matrix Item**.
_Avoid_: Item failure, scoring failure

**Signal Assessment**:
The classification of whether a **Matrix Item** provides trustworthy benchmark evidence.
_Avoid_: Validity, quality flag, trust classification, exclusion rule

**Benchmark Checkpoint**:
The derived benchmark-definition and execution-semantics identity used to group runs that measured the same benchmark meaning.
_Avoid_: Suite version, manifest hash, benchmark version, content hash

### Machine And Provenance

**Machine Profile**:
The canonical machine capability grouping used to compare runs from similar execution environments.
_Avoid_: Hardware profile, runner machine, runtime environment

**Machine Instance**:
The specific producer identity that created a **Benchmark Run**.
_Avoid_: Machine profile, hardware profile

## Relationships

- A **Run Plan** belongs to exactly one **Benchmark Run**.
- A **Run Plan** is preserved as a durable reproducibility artifact for one **Benchmark Run**.
- A **Run Artifact Pair** includes exactly one **Run Plan** and exactly one **Run Result**.
- A **Run Artifact Pair** belongs to exactly one **Benchmark Run**.
- A **Partial Run Result** is not part of the canonical **Run Artifact Pair**.
- A **Benchmark Run** has exactly one **Run ID**.
- A **Run Plan** records exactly one **Run ID**.
- A **Run Result** records exactly one **Run ID**.
- A **Run Config** is resolved into one **Run Plan**.
- Raw user inputs are resolved into one **Run Config** before creating a **Run Plan**.
- A **Run Config** may include one **Retry Policy**.
- **Model Discovery** may inform which **Runtime Models** appear in a **Run Plan**.
- A **Run Plan** may record zero or more **Model Exclusions**.
- A **Run Plan** may record zero or more **Combination Exclusions**.
- A **Model Exclusion** removes a discovered **Runtime Model** before planned combinations are considered.
- A **Combination Exclusion** removes an incompatible planned combination before **Matrix** expansion.
- A **Run Plan** may reference one **Benchmark Checkpoint**.
- A **Run Plan** may reference one **Machine Profile**.
- A **Run Plan** may reference one **Machine Instance**.
- A **Run Plan** may reference one **Runtime Environment**.
- A **Machine Profile** captures comparable machine capability, while software versions belong to the **Runtime Environment**.
- A **Machine Instance** may change when producer provenance continuity is broken, even if **Machine Profile** stays the same.
- A **Run Plan** may reference one **Run Provenance**.
- **Run Provenance** may include **Tamper Evidence**.
- **Run Provenance** describes run origin and verification status; **Tamper Evidence** describes artifact integrity.
- **Tamper Evidence** may cover the local **Run Artifact Pair** or a redacted publication representation as distinct integrity claims.
- A **Run Plan** contains exactly one **Matrix**.
- A **Matrix** contains one or more **Matrix Items**.
- A **Matrix** contains executable **Matrix Items**, not incompatible combinations.
- A **Matrix Item** uses exactly one **Runtime**.
- A **Matrix Item** uses exactly one **Harness**.
- A **Harness** names a logical interface, while its concrete tool version belongs to the **Runtime Environment**.
- A **Harness** provides zero or more **Harness Capabilities**.
- A **Matrix Item** executes exactly one **Runtime Model**.
- A **Matrix Item** may produce one **Generated Output**.
- **Generated Output** may be represented as inline text, file paths, or workspace state.
- A **Generated Output** may satisfy or violate an **Output Contract**.
- A **Benchmark Test** defines the **Output Contract** for its **Generated Output**.
- A **Matrix Item** may have zero or more **Retry Attempts**.
- A **Retry Attempt** does not create a new **Matrix Item**.
- A **Retry Attempt** records observed execution behavior, while **Retry Policy** records planned execution intent.
- A **Matrix Item** may use one **Benchmark Workspace**.
- A **Benchmark Workspace** is the isolated area where workspace-form **Generated Output** may appear.
- A **Benchmark Workspace** may contain **Benchmark Fixtures** that are not **Generated Output**.
- A **Run Result** records **Benchmark Evidence** for each completed or failed **Matrix Item**.
- **Benchmark Evidence** belongs to the **Run Result** unless the **Run Result** explicitly references supporting files.
- A **Run Result** may preserve **Generated Output** inline or by reference.
- A **Runtime Model** may resolve to one **Model Variant**.
- A **Model Profile** has one or more **Model Variants**.
- A **Leaderboard** groups by **Model Profile** by default and may expose **Model Variant** filtering or drilldown.
- A **Model Profile Resolution** explains whether a **Model Profile** came from configuration, legacy aliasing, or runtime-name fallback.
- A **Matrix Item** references exactly one **Benchmark Test**.
- A **Benchmark Test** has one **Benchmark Prompt** per supported **Pass Type**.
- A **Benchmark Test** has exactly one **Benchmark Metadata** record.
- A **Benchmark Test** uses exactly one **Scoring Mode**.
- A **Benchmark Test** has exactly one **Scoring Spec**.
- A **Benchmark Test** may have one **Eval Rubric**.
- A **Benchmark Test** may include zero or more **Benchmark Fixtures**.
- A **Benchmark Test** belongs to exactly one **Benchmark Category**.
- A **Benchmark Category** labels selection and analysis; it does not define **Compatible Run Results**.
- A **Benchmark Test** may require one or more **Harness Capabilities**.
- A **Harness Capability** may describe an operation available inside a **Benchmark Workspace**.
- A **Matrix Item** uses exactly one **Pass Type**.
- A **Matrix Item** may produce one **Automated Score**.
- A **Matrix Item** may produce one **Frontier Eval**.
- A **Frontier Eval** records one **Frontier Eval Model**.
- A **Frontier Eval** applies to code-module **Scoring Modes** unless a workspace evidence contract is explicitly defined.
- A **Matrix Item** may record one **Generation Failure**.
- A **Matrix Item** may record one **Scoring Failure**.
- A **Matrix Item** may record one **Frontier Eval Failure**.
- A **Matrix Item** may record multiple stage-specific failures when multiple stages ran.
- A **Scoring Failure** normally requires usable **Generated Output** from the generation stage.
- A **Matrix Item** may have one **Signal Assessment**.
- A **Signal Assessment** may be used to filter trusted-only analysis views.
- A **Signal Assessment** does not remove a **Matrix Item** from the canonical **Run Result**.
- A **Signal Assessment** does not change the numeric **Composite Score**.
- A **Benchmark Run** produces exactly one **Run Result**.
- A **Benchmark Run** may produce one **Partial Run Result** before it completes.
- A **Run Plan** records one **Schema Version**.
- A **Run Result** records one **Schema Version**.
- A **Published Run** includes exactly one **Run Result** and exactly one **Run Plan**.
- A **Published Run** shares one **Run Artifact Pair** for analysis.
- A **Published Run** requires a final **Run Result**, not a **Partial Run Result**.
- A **Published Run** may require **Published Redaction**.
- **Published Redaction** creates a publication representation without mutating the original local **Run Result**.
- A **Published Run** does not imply verified **Run Provenance**.
- A **Run Comparison** compares two or more **Compatible Run Results**.
- A **Run Comparison** has one **Comparison Space**.
- A default **Run Comparison** requires **Compatible Run Results** with the same **Benchmark Checkpoint**.
- A **Run Comparison** may compare different **Run Config** selections when the **Run Results** are compatible.
- A **Run Comparison** may label or group differing **Machine Profiles** without making the **Run Results** incompatible.
- A **Leaderboard** ranks **Compatible Run Results** within one **Benchmark Checkpoint** and one **Machine Profile**.
- A **Leaderboard** has one **Comparison Space**.
- A **Leaderboard** may include **Run Results** from partial **Run Config** selections when coverage is visible.
- A **Leaderboard** may represent duplicate aggregation keys with one **Best Observed Item**.
- A **Best Observed Item** is selected within one **Pass Type**, not across pass types.
- A **Best Observed Item** is not selected by **Frontier Eval** score.
- A **Best Observed Item** is not selected by generation duration.
- A **Leaderboard** may rank entries by **Composite Score**.
- The default **Composite Score** does not include **Frontier Eval**.
- The default **Composite Score** accounts for completion coverage.
- **Composite Score** completion coverage is scoped to the **Comparison Space**, not only a run's own **Run Plan**.
- Trusted-only filtering changes the **Comparison Space** and its completion denominator.
- A **Benchmark Checkpoint** is derived from benchmark content and benchmark-affecting semantics.
- A **Benchmark Checkpoint** changes when **Benchmark Prompts** change.
- A **Benchmark Checkpoint** changes when **Benchmark Fixtures** change.
- A **Benchmark Checkpoint** changes when **Scoring Specs** change.
- A **Benchmark Checkpoint** changes when **Eval Rubrics** change.
- A **Benchmark Checkpoint** changes when benchmark-affecting **Benchmark Metadata** changes.
- A **Benchmark Checkpoint** changes when **Scoring Mode** changes.
- A **Benchmark Checkpoint** changes when **Signal Assessment** logic changes.
- A **Benchmark Checkpoint** changes when benchmark execution or scoring semantics change.
- A **Retry Policy** change may change the **Benchmark Checkpoint** when it affects benchmark execution semantics.

## Example dialogue

> **Dev:** "Should benchmark concepts be split across multiple contexts?"
> **Domain expert:** "No. For now, **Plebdev Bench** is one benchmark context; split only when a separate domain develops its own language and rules."
>
> **Dev:** "Is the `run.json` file the **Benchmark Run**?"
> **Domain expert:** "No. The **Benchmark Run** is the execution event; `run.json` is the **Run Result** it produces."
>
> **Dev:** "Is the whole results directory the canonical artifact?"
> **Domain expert:** "No. The **Run Artifact Pair** is exactly one **Run Plan** and one final **Run Result**; a **Partial Run Result** is only recovery/progress evidence."
>
> **Dev:** "Can I publish by redacting `run.json` in place?"
> **Domain expert:** "No. **Published Redaction** creates a publication representation without mutating the local **Run Result**."
>
> **Dev:** "Are two `run.json` files comparable if their schemas match?"
> **Domain expert:** "No. Default **Run Comparison** requires the same **Benchmark Checkpoint**; **Machine Profile** differences are visible context, not incompatibility."
>
> **Dev:** "Should a category-only run get 100% leaderboard completion?"
> **Domain expert:** "No. **Composite Score** completion coverage is scoped to the active **Comparison Space**, while run-detail completion can use the run's own plan."
>
> **Dev:** "Can the **Best Observed Item** choose an informed, frontier-favored, or faster row over an equivalent blind row?"
> **Domain expert:** "No. **Pass Type** is part of the aggregation key, and optional **Frontier Eval** plus duration remain separate analysis."
>
> **Dev:** "Does changing `category` or tags in **Benchmark Metadata** change the **Benchmark Checkpoint**?"
> **Domain expert:** "No. Analysis labels do not define benchmark meaning; **Scoring Mode**, prompts, fixtures, scoring specs, rubrics, and signal logic do."
>
> **Dev:** "Is OpenCode a **Runtime** because it can call a model?"
> **Domain expert:** "No. OpenCode is a **Harness**; concrete tool versions belong to the **Runtime Environment**."
>
> **Dev:** "If OpenCode edits files instead of returning text, is that still **Generated Output**?"
> **Domain expert:** "Yes. **Generated Output** includes model-produced workspace changes, while the **Benchmark Workspace** also contains fixtures and untouched context."
>
> **Dev:** "Is an excluded embedding model a **Generation Failure**?"
> **Domain expert:** "No. **Model Exclusion** happens after **Model Discovery**; **Combination Exclusion** happens before **Matrix** expansion; failures happen during item execution."
>
> **Dev:** "Can **Frontier Eval** replace **Automated Score** or change the default **Composite Score**?"
> **Domain expert:** "No. **Automated Score** is deterministic local evidence; **Frontier Eval** is optional qualitative evidence with one **Frontier Eval Model**."
>
> **Dev:** "Does a tainted **Signal Assessment** lower the **Composite Score**?"
> **Domain expert:** "No. **Signal Assessment** annotates trust and can define trusted-only views, but does not numerically mutate scores."
>
> **Dev:** "Are two M4 Pro machines automatically the same producer?"
> **Domain expert:** "No. They may share a **Machine Profile**, but each producer has its own **Machine Instance**."

## Flagged ambiguities

- "context map" was considered for multiple bounded contexts; resolved: use one root **Plebdev Bench Context** until a genuinely separate domain emerges.
- "model" may mean a runtime identifier, canonical comparison identity, or packaged form; resolved: use **Runtime Model**, **Model Profile**, and **Model Variant** respectively.
- "profiled model" could hide whether grouping was explicit or inferred; resolved: use **Model Profile Resolution** to distinguish configured profiles from runtime-name fallback.
- "modelAlias" is deprecated artifact compatibility language; resolved: use **Model Profile** for canonical comparison identity and keep `modelAlias` only when reading older persisted fields.
- "machine" may mean an execution environment class or a specific producer; resolved: use **Machine Profile** and **Machine Instance** respectively.
- "machineProfileId" and "machineLabel" are deprecated artifact compatibility language; resolved: use **Machine Profile** for comparable machine grouping and **Machine Instance** for the specific producer.
- "environment" may mean software provenance or machine capability; resolved: use **Runtime Environment** for software context and **Machine Profile** for comparable machine capability.
- "artifact" may mean a result file, dashboard file, or model-produced content; resolved: use **Generated Output** only for model-produced content.
- "run artifact" may mean a directory or logs; resolved: use **Run Artifact Pair** for the canonical **Run Plan** plus **Run Result** trust unit.
- "config" may mean user run settings or benchmark metadata; resolved: use **Run Config** for run selection settings and **Benchmark Metadata** for benchmark-test content.
- "bad output" may mean missing content, wrong location, wrong shape, or failed scoring; resolved: use **Output Contract** when the produced content is not evaluable as intended.
- "tainted" could imply automatic deletion from analysis; resolved: **Signal Assessment** annotates trust by default and supports explicit trusted-only views.
- "benchmark content" was too narrow for **Benchmark Checkpoint**; resolved: **Benchmark Checkpoint** covers benchmark definition plus execution and scoring semantics that affect measured meaning, excluding pure analysis labels like **Benchmark Category**, tags, and descriptions.
- "deduped row" hid leaderboard selection semantics; resolved: use **Best Observed Item** when a **Leaderboard** selects the strongest duplicate row for capability ranking.
- "published" could imply public trust; resolved: **Published Run** means shared for analysis, while verification and **Tamper Evidence** remain separate provenance concerns.
