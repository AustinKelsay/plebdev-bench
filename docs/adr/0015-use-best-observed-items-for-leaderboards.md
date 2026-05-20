# Use best observed items for leaderboards

Plebdev Bench uses the **Best Observed Item** for duplicate leaderboard aggregation keys within the same **Benchmark Checkpoint** and **Machine Profile**, with latest result used only as a tie-breaker. Choosing the latest item would make regressions visible in the ranking, but **Leaderboards** are capability summaries rather than longitudinal trend views; current-behavior and regression analysis should use run history or comparison views that preserve time semantics explicitly.
