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
The software execution context captured for a **Benchmark Run**.
_Avoid_: Machine profile, runtime, harness

**Run Provenance**:
The origin and verification information recorded for a **Benchmark Run**.
_Avoid_: Machine profile, runtime environment, source

**Run Result**:
The persisted outcome artifact for a **Benchmark Run**.
_Avoid_: Benchmark run, result

**Compatible Run Results**:
**Run Results** that can be compared or ranked without mixing incompatible benchmark definitions or execution contexts.
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

**Leaderboard**:
A ranked analysis view over **Compatible Run Results**, scoped by **Benchmark Checkpoint** and **Machine Profile**.
_Avoid_: Dashboard ranking, aggregate table

**Composite Score**:
A derived ranking metric that combines multiple **Run Result** signals for leaderboard analysis.
_Avoid_: Automated score, frontier score, pass rate

**Partial Run Result**:
The temporary persisted progress artifact for an incomplete **Benchmark Run**.
_Avoid_: Checkpoint, snapshot, recovery artifact

**Run Plan**:
The persisted pre-execution artifact that describes exactly what a **Benchmark Run** intends to execute.
_Avoid_: Benchmark plan, matrix plan

**Run Config**:
The user-provided and resolved settings that select and parameterize a **Benchmark Run**.
_Avoid_: Benchmark metadata, run plan, environment

### Execution And Model Identity

**Matrix**:
The expanded set of benchmark combinations selected for a **Benchmark Run**.
_Avoid_: Plan, grid

**Matrix Item**:
One executable combination of runtime, harness, model, benchmark test, and pass type within a **Matrix**.
_Avoid_: Task, case, benchmark item

**Benchmark Evidence**:
The recorded facts that explain a **Matrix Item** outcome.
_Avoid_: Artifact, logs, result blob

**Generated Output**:
The content produced by a **Runtime Model** through a **Harness** for a **Matrix Item**.
_Avoid_: Artifact, response, completion

**Output Contract**:
The required shape or location of **Generated Output** for a **Matrix Item** to be evaluated as intended.
_Avoid_: Prompt, scoring spec, generated output

**Retry Attempt**:
A repeated execution attempt for the same **Matrix Item** after a recoverable generation or scoring problem.
_Avoid_: Pass type, rerun, replacement item

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

**Harness**:
The interface used to ask a benchmark model to perform a **Benchmark Test**.
_Avoid_: Runtime, model provider

**Harness Capability**:
A specific affordance a **Harness** provides for executing benchmark tests.
_Avoid_: Tool capability, workspace capability, requirement

**Runtime Model**:
The exact executable model identifier exposed by a **Runtime**.
_Avoid_: Model profile, benchmark model

**Model Profile**:
The canonical benchmark identity used to group equivalent model variants for comparison.
_Avoid_: Runtime model, model alias

**Model Variant**:
A specific packaged or runtime-specific form of a **Model Profile**, including runtime naming, format, and quantization details.
_Avoid_: Model profile, runtime model

### Scoring And Evidence

**Automated Score**:
The deterministic local scoring outcome for a **Matrix Item**.
_Avoid_: Test result, score

**Frontier Eval**:
An optional rubric-based judgment of a **Matrix Item** by an external frontier model.
_Avoid_: Score, automated score, judge score, judge model

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
_Avoid_: Validity, quality flag, trust classification

**Benchmark Checkpoint**:
The benchmark-content identity used to group runs that executed against the same benchmark definition.
_Avoid_: Suite version, manifest hash, benchmark version

### Machine And Provenance

**Machine Profile**:
The canonical machine capability grouping used to compare runs from similar execution environments.
_Avoid_: Hardware profile, runner machine

**Machine Instance**:
The specific physical or logical machine that produced a **Benchmark Run**.
_Avoid_: Machine profile, hardware profile

## Relationships

- A **Run Plan** belongs to exactly one **Benchmark Run**.
- A **Benchmark Run** has exactly one **Run ID**.
- A **Run Plan** records exactly one **Run ID**.
- A **Run Result** records exactly one **Run ID**.
- A **Run Config** is resolved into one **Run Plan**.
- **Model Discovery** may inform which **Runtime Models** appear in a **Run Plan**.
- A **Run Plan** may record zero or more **Model Exclusions**.
- A **Run Plan** may reference one **Benchmark Checkpoint**.
- A **Run Plan** may reference one **Machine Profile**.
- A **Run Plan** may reference one **Machine Instance**.
- A **Run Plan** may reference one **Runtime Environment**.
- A **Run Plan** may reference one **Run Provenance**.
- A **Run Plan** contains exactly one **Matrix**.
- A **Matrix** contains one or more **Matrix Items**.
- A **Matrix Item** uses exactly one **Runtime**.
- A **Matrix Item** uses exactly one **Harness**.
- A **Harness** provides zero or more **Harness Capabilities**.
- A **Matrix Item** executes exactly one **Runtime Model**.
- A **Matrix Item** may produce one **Generated Output**.
- A **Generated Output** may satisfy or violate an **Output Contract**.
- A **Matrix Item** may have zero or more **Retry Attempts**.
- A **Matrix Item** may use one **Benchmark Workspace**.
- A **Run Result** records **Benchmark Evidence** for each completed or failed **Matrix Item**.
- A **Run Result** may preserve **Generated Output** inline or by reference.
- A **Runtime Model** may resolve to one **Model Variant**.
- A **Model Profile** has one or more **Model Variants**.
- A **Matrix Item** references exactly one **Benchmark Test**.
- A **Benchmark Test** has one **Benchmark Prompt** per supported **Pass Type**.
- A **Benchmark Test** has exactly one **Benchmark Metadata** record.
- A **Benchmark Test** uses exactly one **Scoring Mode**.
- A **Benchmark Test** has exactly one **Scoring Spec**.
- A **Benchmark Test** may have one **Eval Rubric**.
- A **Benchmark Test** may include zero or more **Benchmark Fixtures**.
- A **Benchmark Test** belongs to exactly one **Benchmark Category**.
- A **Benchmark Test** may require one or more **Harness Capabilities**.
- A **Harness Capability** may describe an operation available inside a **Benchmark Workspace**.
- A **Matrix Item** uses exactly one **Pass Type**.
- A **Matrix Item** may produce one **Automated Score**.
- A **Matrix Item** may produce one **Frontier Eval**.
- A **Matrix Item** may record one **Generation Failure**.
- A **Matrix Item** may record one **Scoring Failure**.
- A **Matrix Item** may record one **Frontier Eval Failure**.
- A **Matrix Item** may have one **Signal Assessment**.
- A **Benchmark Run** produces exactly one **Run Result**.
- A **Benchmark Run** may produce one **Partial Run Result** before it completes.
- A **Run Plan** records one **Schema Version**.
- A **Run Result** records one **Schema Version**.
- A **Published Run** includes exactly one **Run Result** and exactly one **Run Plan**.
- A **Published Run** may require **Published Redaction**.
- A **Run Comparison** compares two or more **Compatible Run Results**.
- A **Leaderboard** ranks **Compatible Run Results** within one **Benchmark Checkpoint** and one **Machine Profile**.
- A **Leaderboard** may rank entries by **Composite Score**.
- A **Benchmark Checkpoint** changes when **Benchmark Prompts** change.
- A **Benchmark Checkpoint** changes when **Benchmark Fixtures** change.
- A **Benchmark Checkpoint** changes when **Scoring Specs** change.
- A **Benchmark Checkpoint** changes when **Eval Rubrics** change.
- A **Benchmark Checkpoint** changes when **Benchmark Metadata** changes.

## Example dialogue

> **Dev:** "Should benchmark concepts be split across multiple contexts?"
> **Domain expert:** "No. For now, **Plebdev Bench** is one benchmark context; split only when a separate domain develops its own language and rules."
>
> **Dev:** "Is the `run.json` file the **Benchmark Run**?"
> **Domain expert:** "No. The **Benchmark Run** is the execution event; `run.json` is the **Run Result** it produces."
>
> **Dev:** "Is the **Run ID** just the directory name?"
> **Domain expert:** "No. **Run ID** identifies the **Benchmark Run** and its persisted files; a directory name is only one storage representation."
>
> **Dev:** "Is `run.partial.json` a **Benchmark Checkpoint**?"
> **Domain expert:** "No. It is a **Partial Run Result**; a **Benchmark Checkpoint** identifies benchmark content."
>
> **Dev:** "Is every local result a **Published Run**?"
> **Domain expert:** "No. A **Published Run** is made available for shared dashboard or leaderboard analysis."
>
> **Dev:** "Is redacting local paths just cleanup?"
> **Domain expert:** "No. **Published Redaction** is the privacy boundary before a **Run Result** becomes part of a **Published Run**."
>
> **Dev:** "Is a score delta the whole comparison?"
> **Domain expert:** "No. A delta is one metric difference inside a **Run Comparison**."
>
> **Dev:** "Are two parsed `run.json` files automatically **Compatible Run Results**?"
> **Domain expert:** "No. They must avoid incompatible benchmark definitions and execution contexts, not merely share a schema."
>
> **Dev:** "Is **Schema Version** the same as **Benchmark Checkpoint**?"
> **Domain expert:** "No. **Schema Version** identifies artifact format compatibility; **Benchmark Checkpoint** identifies benchmark content."
>
> **Dev:** "Is the dashboard the **Leaderboard**?"
> **Domain expert:** "No. The dashboard is a surface that may display a **Leaderboard**; the **Leaderboard** is the ranked analysis view."
>
> **Dev:** "Is **Composite Score** the same as **Automated Score**?"
> **Domain expert:** "No. **Composite Score** is derived for ranking; **Automated Score** is deterministic local scoring evidence for a **Matrix Item**."
>
> **Dev:** "Can we call the expanded combinations the **Run Plan**?"
> **Domain expert:** "No. The **Run Plan** includes the **Matrix**, plus the resolved context needed to reproduce it."
>
> **Dev:** "Is the config file the **Run Plan**?"
> **Domain expert:** "No. **Run Config** is user-provided or resolved settings; the **Run Plan** is the persisted execution intent derived from it."
>
> **Dev:** "Is Bun version part of the **Machine Profile**?"
> **Domain expert:** "No. Software provenance belongs to the **Runtime Environment**; **Machine Profile** describes comparable machine capability."
>
> **Dev:** "Does **Run Provenance** decide whether a row's output is trustworthy?"
> **Domain expert:** "No. **Run Provenance** records run origin and verification; **Signal Assessment** classifies evidence quality for a **Matrix Item**."
>
> **Dev:** "Is a benchmark task the same as a **Matrix Item**?"
> **Domain expert:** "No. A **Matrix Item** is the benchmark row; the task is what the selected **Benchmark Test** asks the model to do."
>
> **Dev:** "Is generated code an artifact?"
> **Domain expert:** "Use **Generated Output** for what the model produced; an artifact is only how that output or result evidence is stored."
>
> **Dev:** "Can we delete failure details after computing scores?"
> **Domain expert:** "No. Preserve **Benchmark Evidence** so the **Matrix Item** outcome remains explainable."
>
> **Dev:** "If the model writes code in the wrong file, did generation succeed?"
> **Domain expert:** "It may have produced **Generated Output**, but it violated the **Output Contract**, so scoring or **Signal Assessment** must reflect that."
>
> **Dev:** "Is `src/tests/todo-app` a unit test?"
> **Domain expert:** "No. It is a **Benchmark Test**; its scoring spec may contain executable test cases, but the package is the benchmark definition."
>
> **Dev:** "Is `prompt.blind.md` just documentation?"
> **Domain expert:** "No. It is a **Benchmark Prompt** for a **Pass Type**, so changing it changes the **Benchmark Checkpoint**."
>
> **Dev:** "Is `test.meta.json` incidental config?"
> **Domain expert:** "No. It is **Benchmark Metadata**; it can shape the **Run Plan** and change the **Benchmark Checkpoint**."
>
> **Dev:** "Is `scoring.spec.ts` the **Benchmark Test**?"
> **Domain expert:** "No. It is the **Scoring Spec** for the **Benchmark Test**."
>
> **Dev:** "Can the same rubric drive the **Automated Score**?"
> **Domain expert:** "No. Use **Scoring Spec** for deterministic local scoring and **Eval Rubric** for **Frontier Eval** judgment."
>
> **Dev:** "Is `workspace` a **Benchmark Category**?"
> **Domain expert:** "No. `workspace` is a **Scoring Mode**; **Benchmark Category** describes the kind of challenge being selected or analyzed."
>
> **Dev:** "Can a **Benchmark Workspace** mean the repository checkout?"
> **Domain expert:** "No. A **Benchmark Workspace** is the isolated filesystem prepared for one **Matrix Item**."
>
> **Dev:** "Can we update fixture files without changing benchmark meaning?"
> **Domain expert:** "No. **Benchmark Fixtures** are benchmark content, so changing them changes the **Benchmark Checkpoint**."
>
> **Dev:** "If a row retries after a timeout, is that a new **Pass Type**?"
> **Domain expert:** "No. **Pass Type** only describes prompt context; a **Retry Attempt** is execution behavior for the same **Matrix Item**."
>
> **Dev:** "Is OpenCode a **Runtime** because it can call a model?"
> **Domain expert:** "No. OpenCode is a **Harness**; the **Runtime** is the backend that exposes the model being benchmarked."
>
> **Dev:** "Does **Model Discovery** define **Model Profiles**?"
> **Domain expert:** "No. **Model Discovery** finds **Runtime Models**; **Model Profiles** are canonical identities used for comparison."
>
> **Dev:** "Is an excluded embedding model a **Generation Failure**?"
> **Domain expert:** "No. A **Model Exclusion** happens before execution and explains why a discovered **Runtime Model** was omitted from the **Run Plan**."
>
> **Dev:** "Should `qwen3:32b-q4_K_M` and `qwen3:32b-q8_0` be separate **Model Profiles**?"
> **Domain expert:** "No. Treat quantization as **Model Variant** metadata by default; split profiles only when the benchmark intentionally treats them as different logical models."
>
> **Dev:** "Can the **Frontier Eval** replace the **Automated Score**?"
> **Domain expert:** "No. The **Automated Score** is deterministic local evidence; the **Frontier Eval** is optional qualitative evidence."
>
> **Dev:** "Is `computer-use` a harness capability?"
> **Domain expert:** "No. It is a **Benchmark Category**; specific workspace affordances are harness capability requirements."
>
> **Dev:** "Should we include a **Matrix Item** when the **Harness** lacks a required **Harness Capability**?"
> **Domain expert:** "No. That combination is not representative and should be excluded from the **Run Plan**."
>
> **Dev:** "If a row passes automated scoring but violates the expected output contract, is it still trustworthy?"
> **Domain expert:** "Not necessarily. The **Signal Assessment** can mark benchmark evidence as tainted separately from the score."
>
> **Dev:** "Can we compare two **Benchmark Runs** after editing a prompt or scoring spec?"
> **Domain expert:** "Only with caution. The **Benchmark Checkpoint** identifies whether runs used the same benchmark definition."
>
> **Dev:** "Are two M4 Pro machines automatically the same producer?"
> **Domain expert:** "No. They may share a **Machine Profile**, but each producer should have its own **Machine Instance**."
>
> **Dev:** "Can we just call every problem an item failure?"
> **Domain expert:** "No. Use **Generation Failure**, **Scoring Failure**, or **Frontier Eval Failure** so the failed stage remains visible."

## Flagged ambiguities

- "context map" was considered for multiple bounded contexts; resolved: use one root **Plebdev Bench Context** until a genuinely separate domain emerges.
- "model" may mean a runtime identifier, canonical comparison identity, or packaged form; resolved: use **Runtime Model**, **Model Profile**, and **Model Variant** respectively.
- "modelAlias" is deprecated artifact compatibility language; resolved: use **Model Profile** for canonical comparison identity and keep `modelAlias` only when reading older persisted fields.
- "machine" may mean an execution environment class or a specific producer; resolved: use **Machine Profile** and **Machine Instance** respectively.
- "machineProfileId" and "machineLabel" are deprecated artifact compatibility language; resolved: use **Machine Profile** for comparable machine grouping and **Machine Instance** for the specific producer.
- "environment" may mean software provenance or machine capability; resolved: use **Runtime Environment** for software context and **Machine Profile** for comparable machine capability.
- "artifact" may mean a result file, dashboard file, or model-produced content; resolved: use **Generated Output** only for model-produced content.
- "config" may mean user run settings or benchmark metadata; resolved: use **Run Config** for run selection settings and **Benchmark Metadata** for benchmark-test content.
- "bad output" may mean missing content, wrong location, wrong shape, or failed scoring; resolved: use **Output Contract** when the produced content is not evaluable as intended.
