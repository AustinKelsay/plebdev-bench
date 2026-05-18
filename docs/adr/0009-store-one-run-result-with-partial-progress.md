# Store one run result with partial progress

Plebdev Bench writes one final **Run Result** per **Benchmark Run** and uses a temporary **Partial Run Result** during execution for crash recovery. Per-item result files would make streaming and recovery simpler, but a single final artifact keeps compare, dashboard ingestion, publishing, and reproducibility easier to reason about while still preserving progress during long-running matrices.
