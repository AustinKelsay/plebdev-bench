# Select best observed items by local outcomes before recency

Plebdev Bench selects a **Best Observed Item** by local execution outcome and automated scoring first, then uses the latest equivalent evidence as the tie-breaker. Optional **Frontier Eval** scores and generation duration remain separate analysis signals; using them to break ties would make leaderboard evidence depend on optional external judging or noisy timing rather than the benchmark's local outcome contract.
