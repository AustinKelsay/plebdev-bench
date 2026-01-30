Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Export a factory `createCalculator()` that returns an object with:
- `add`, `subtract`, `multiply`, `divide`, `clear` (each returns the calculator for chaining)
- `result()` returns the current value
- `memoryStore`, `memoryAdd`, `memoryClear` (each returns the calculator for chaining)
- `memoryRecall()` returns the current memory value (a number) and does NOT change current value

Behavior:
- The calculator starts at value 0
- Memory starts at 0
- `memoryStore()` copies current value into memory
- `memoryAdd()` adds the current value to memory (no arguments)
- Memory is independent from the current value (clear does not change memory)
