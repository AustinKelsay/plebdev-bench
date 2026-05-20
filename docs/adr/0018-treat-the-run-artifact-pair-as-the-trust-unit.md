# Treat the run artifact pair as the trust unit

Plebdev Bench treats the **Run Artifact Pair** — one **Run Plan** plus one **Run Result** — as the future unit for tamper evidence and publication trust. Signing or hashing the whole run directory would capture more auxiliary evidence, but it would make publication fragile because logs, generated side files, local paths, and redaction outputs can change; the plan/result pair carries the durable reproducibility and outcome contract.
