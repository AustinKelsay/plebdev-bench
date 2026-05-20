# Record runtime environment tool versions

Plebdev Bench records concrete tool version probes in the **Runtime Environment** attached to **Run Plans** and **Run Results**. Tool versions affect reproducibility and diagnosis, but they are not part of **Machine Profile** comparability and do not change **Harness** identity. Missing local tools are recorded explicitly as unavailable instead of silently disappearing from provenance.
