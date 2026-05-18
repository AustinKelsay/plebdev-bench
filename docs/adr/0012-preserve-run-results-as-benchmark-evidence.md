# Preserve run results as benchmark evidence

Plebdev Bench treats **Run Results** as preserved **Benchmark Evidence** for what happened during a **Benchmark Run**, rather than mutable summaries to silently clean up after execution. Rewriting scores, failures, generated output, or signal assessments in place would make downstream analysis tidier, but it would weaken reproducibility and make it harder to explain historical outcomes; corrections should happen through explicit migrations or new **Benchmark Runs**.
