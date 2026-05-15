# Keep frontier eval optional and separate from automated scoring

Plebdev Bench treats **Automated Score** as the primary deterministic local evidence for a matrix item, while **Frontier Eval** is optional rubric-based supporting evidence. Requiring frontier evaluation would simplify aggregate scoring semantics, but it would break local-first operation, add network cost and availability constraints, and make otherwise valid benchmark runs depend on an external judge.
