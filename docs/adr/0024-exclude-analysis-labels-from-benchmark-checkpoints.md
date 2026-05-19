# Exclude analysis labels from benchmark checkpoints

Plebdev Bench derives **Benchmark Checkpoints** from benchmark-defining content and benchmark-affecting metadata, but excludes pure analysis labels such as **Benchmark Category**. Hashing the entire metadata file would be simpler, but it would make category-only reorganizations incompatible with prior runs even though the measured benchmark meaning did not change.
