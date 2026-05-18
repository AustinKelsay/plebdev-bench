# Exit non-zero only on crashes

Plebdev Bench records per-item **Generation Failure**, **Scoring Failure**, and **Frontier Eval Failure** inside the **Run Result** while reserving non-zero CLI exits for crashes, invalid configuration, or unrecoverable process-level errors. Failing the process when a model fails a benchmark would match ordinary test-runner behavior, but it would make large matrix runs brittle and prevent the benchmark from collecting comparable failure evidence across the rest of the matrix.
