# Separate runtimes from harnesses

Plebdev Bench separates **Runtime** adapters from **Harness** adapters: a runtime is the inference backend that exposes benchmark models, while a harness is the interface used to ask those models to perform benchmark tests. A single combined adapter would be simpler initially, but it would blur model availability, agent/tool behavior, and prompt/execution interface behavior; keeping them separate preserves fair comparisons across direct HTTP, Goose, OpenCode, and future harnesses that target the same model runtime.
