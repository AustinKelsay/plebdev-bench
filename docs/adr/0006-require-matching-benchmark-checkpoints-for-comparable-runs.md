# Require matching benchmark checkpoints for comparable runs

Plebdev Bench treats **Benchmark Runs** as comparable by default only when they share the same **Benchmark Checkpoint**. Allowing cross-checkpoint comparisons with warnings would make exploratory analysis easier, but prompt, fixture, rubric, or scoring-spec changes can alter benchmark meaning; strict checkpoint matching protects leaderboard and default compare output from silently mixing different benchmark definitions.
