# Score leaderboard completion against comparison space

Plebdev Bench scores **Leaderboard** completion coverage against the active **Comparison Space**, not only against a run's own **Run Plan**. Treating a partial category or pass-type run as 100% complete would make exploratory runs look equivalent to full benchmark runs, but requiring complete runs would discard useful evidence; **Comparison Space** coverage keeps partial runs visible while preserving ranking fairness.
