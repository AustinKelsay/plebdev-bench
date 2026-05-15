# Exclude incompatible harness-test combinations

Plebdev Bench excludes harness-test combinations from the **Run Plan** when a benchmark test requires **Harness Capabilities** the selected harness does not provide. Recording those impossible combinations as failures would make matrix expansion simpler, but it would pollute benchmark signal by treating missing execution affordances as model or harness performance on a task that was never representatively executable.
