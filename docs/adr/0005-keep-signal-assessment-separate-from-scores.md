# Keep signal assessment separate from scores

Plebdev Bench records **Signal Assessment** separately from **Automated Score** and **Frontier Eval** so benchmark artifacts preserve both the factual scoring outcome and the evidence-quality judgment for a matrix item. Automatically changing scores for tainted rows would simplify aggregate filtering, but it would hide what the deterministic scorer or frontier judge actually observed and make later analysis less reproducible.
