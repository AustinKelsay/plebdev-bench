# Keep published redaction non-mutating

Plebdev Bench treats **Published Redaction** as a transformation that creates a publication representation without mutating the original local **Run Result**. Sanitizing the original result in place would reduce artifact handling complexity, but it would weaken the preserved-evidence rule and make it harder to audit what actually happened during the local **Benchmark Run**.
