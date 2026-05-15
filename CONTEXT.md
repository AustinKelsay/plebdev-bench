# Plebdev Bench Context

Plebdev Bench is the benchmark domain for planning, executing, scoring, recording, and comparing local LLM benchmark runs.

## Language

**Benchmark Run**:
One complete benchmark execution over a selected matrix of runtimes, harnesses, models, tests, and pass types.
_Avoid_: Run, benchmark result

**Run Result**:
The persisted outcome artifact for a **Benchmark Run**.
_Avoid_: Benchmark run, result

**Run Comparison**:
An analysis of differences between compatible **Run Results**.
_Avoid_: Compare, delta

**Partial Run Result**:
The temporary persisted progress artifact for an incomplete **Benchmark Run**.
_Avoid_: Checkpoint, snapshot, recovery artifact

**Run Plan**:
The persisted pre-execution artifact that describes exactly what a **Benchmark Run** intends to execute.
_Avoid_: Benchmark plan, matrix plan

**Matrix**:
The expanded set of benchmark combinations selected for a **Benchmark Run**.
_Avoid_: Plan, grid

**Matrix Item**:
One executable combination of runtime, harness, model, benchmark test, and pass type within a **Matrix**.
_Avoid_: Task, case, benchmark item

**Benchmark Test**:
A packaged benchmark definition containing the prompts, scoring expectations, fixtures, metadata, and optional rubric for one model challenge.
_Avoid_: Test, task, scenario

**Benchmark Category**:
A grouping of **Benchmark Tests** used for selection and analysis.
_Avoid_: Test category, task category, capability area

**Pass Type**:
The prompt-context variant used for a **Matrix Item**, currently either blind or informed.
_Avoid_: Run mode, attempt type, prompt mode

**Runtime**:
The inference backend that makes benchmark models available for execution.
_Avoid_: Harness, provider

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

**Automated Score**:
The deterministic local scoring outcome for a **Matrix Item**.
_Avoid_: Test result, score

**Frontier Eval**:
An optional rubric-based judgment of a **Matrix Item** by an external frontier model.
_Avoid_: Score, automated score, judge score

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

**Machine Profile**:
The canonical machine capability grouping used to compare runs from similar execution environments.
_Avoid_: Hardware profile, runner machine

**Machine Instance**:
The specific physical or logical machine that produced a **Benchmark Run**.
_Avoid_: Machine profile, hardware profile

## Relationships

- A **Run Plan** belongs to exactly one **Benchmark Run**.
- A **Run Plan** may reference one **Benchmark Checkpoint**.
- A **Run Plan** may reference one **Machine Profile**.
- A **Run Plan** may reference one **Machine Instance**.
- A **Run Plan** contains exactly one **Matrix**.
- A **Matrix** contains one or more **Matrix Items**.
- A **Matrix Item** uses exactly one **Runtime**.
- A **Matrix Item** uses exactly one **Harness**.
- A **Harness** provides zero or more **Harness Capabilities**.
- A **Matrix Item** executes exactly one **Runtime Model**.
- A **Runtime Model** may resolve to one **Model Variant**.
- A **Model Profile** has one or more **Model Variants**.
- A **Matrix Item** references exactly one **Benchmark Test**.
- A **Benchmark Test** belongs to exactly one **Benchmark Category**.
- A **Benchmark Test** may require one or more **Harness Capabilities**.
- A **Matrix Item** uses exactly one **Pass Type**.
- A **Matrix Item** may produce one **Automated Score**.
- A **Matrix Item** may produce one **Frontier Eval**.
- A **Matrix Item** may record one **Generation Failure**.
- A **Matrix Item** may record one **Scoring Failure**.
- A **Matrix Item** may record one **Frontier Eval Failure**.
- A **Matrix Item** may have one **Signal Assessment**.
- A **Benchmark Run** produces exactly one **Run Result**.
- A **Benchmark Run** may produce one **Partial Run Result** before it completes.
- A **Run Comparison** compares two or more compatible **Run Results**.

## Example dialogue

> **Dev:** "Should benchmark concepts be split across multiple contexts?"
> **Domain expert:** "No. For now, **Plebdev Bench** is one benchmark context; split only when a separate domain develops its own language and rules."
>
> **Dev:** "Is the `run.json` file the **Benchmark Run**?"
> **Domain expert:** "No. The **Benchmark Run** is the execution event; `run.json` is the **Run Result** it produces."
>
> **Dev:** "Is `run.partial.json` a **Benchmark Checkpoint**?"
> **Domain expert:** "No. It is a **Partial Run Result**; a **Benchmark Checkpoint** identifies benchmark content."
>
> **Dev:** "Is a score delta the whole comparison?"
> **Domain expert:** "No. A delta is one metric difference inside a **Run Comparison**."
>
> **Dev:** "Can we call the expanded combinations the **Run Plan**?"
> **Domain expert:** "No. The **Run Plan** includes the **Matrix**, plus the resolved context needed to reproduce it."
>
> **Dev:** "Is a benchmark task the same as a **Matrix Item**?"
> **Domain expert:** "No. A **Matrix Item** is the benchmark row; the task is what the selected **Benchmark Test** asks the model to do."
>
> **Dev:** "Is `src/tests/todo-app` a unit test?"
> **Domain expert:** "No. It is a **Benchmark Test**; its scoring spec may contain executable test cases, but the package is the benchmark definition."
>
> **Dev:** "If a row retries after a timeout, is that a new **Pass Type**?"
> **Domain expert:** "No. **Pass Type** only describes prompt context; retries are execution behavior for the same **Matrix Item**."
>
> **Dev:** "Is OpenCode a **Runtime** because it can call a model?"
> **Domain expert:** "No. OpenCode is a **Harness**; the **Runtime** is the backend that exposes the model being benchmarked."
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
- "machine" may mean an execution environment class or a specific producer; resolved: use **Machine Profile** and **Machine Instance** respectively.
