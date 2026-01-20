Output only TypeScript code for a single module. No explanations or tool/file usage.
The harness imports your output and calls the exported functions directly.

Export a factory `createCalculator()` that returns an object with:
- `add`, `subtract`, `multiply`, `divide`, `clear` (each returns the calculator for chaining)
- `result()` returns the current value
- `memoryStore`, `memoryRecall`, `memoryClear`, `memoryAdd` (memory starts at 0)

The calculator starts at value 0. Memory is independent from the current value (clear does not change memory).
