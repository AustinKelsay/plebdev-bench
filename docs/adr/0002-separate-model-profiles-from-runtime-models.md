# Separate model profiles from runtime models

Plebdev Bench separates **Runtime Model**, **Model Variant**, and **Model Profile** so result rows preserve the exact executable runtime identifier while compare and dashboard views can group equivalent variants under one canonical benchmark identity. Using only runtime model names would be simpler, but it would make cross-runtime and cross-quantization comparisons unstable; using only canonical profiles would hide the concrete package, quantization, and runtime form that materially affect benchmark outcomes.
