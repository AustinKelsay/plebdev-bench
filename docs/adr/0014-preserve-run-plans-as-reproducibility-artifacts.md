# Preserve run plans as reproducibility artifacts

Plebdev Bench treats each **Run Plan** as a durable reproducibility artifact for a **Benchmark Run**, not as a transient execution helper. Folding plan data into the final **Run Result** would reduce artifact count, but it would blur intended execution from observed outcomes and make it harder to explain excluded models, incompatible combinations, planned matrix shape, and resolved run settings after the run has completed.
