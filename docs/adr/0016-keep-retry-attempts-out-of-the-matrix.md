# Keep retry attempts out of the matrix

Plebdev Bench records **Retry Attempts** as **Benchmark Evidence** for the same **Matrix Item**, rather than adding retry count or retry kind as another benchmark dimension. Treating retries as matrix rows would make recovery behavior easier to compare directly, but it would blur selected benchmark intent with execution policy and inflate the matrix; retry policy remains part of the **Benchmark Checkpoint** because it changes execution semantics and can affect measured outcomes.
