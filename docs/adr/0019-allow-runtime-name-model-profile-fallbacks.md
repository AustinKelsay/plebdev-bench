# Allow runtime-name model profile fallbacks

Plebdev Bench allows runtime-name fallback **Model Profile Resolution** for local exploration when no configured profile maps a **Runtime Model** to a canonical **Model Profile**. Requiring explicit configured profiles for every model would make trusted grouping cleaner, but it would slow down local-first benchmarking; fallback provenance must remain visible so published or trusted comparisons can distinguish configured model identity from heuristic runtime-name grouping.
