# Define benchmark checkpoints from benchmark content

Plebdev Bench treats **Benchmark Checkpoint** identity as a function of benchmark content, including **Benchmark Prompts**, **Benchmark Fixtures**, **Scoring Specs**, **Eval Rubrics**, and test metadata. Limiting checkpoints to executable scoring code or ignoring prompt/fixture/rubric edits would make exploratory iteration easier, but it would let default comparisons and **Leaderboards** silently mix runs that measured different benchmark definitions.
