Output only TypeScript code for a single module.
The harness imports your output and calls the exported functions directly.

Output contract:
- Return exactly one TypeScript module and nothing else.
- No prose, no explanations, and no markdown outside an optional single ```typescript code block.
- Do not include usage examples, tests, `console.log`, or self-imports.
- If writing with tools, write raw TypeScript to the file (no markdown fences).
- Use named exports exactly as specified (no default export).
- Before finishing, verify export names and signatures match exactly.

Export a factory `createCalculator()` that returns an object with:
- `add`, `subtract`, `multiply`, `divide`, `clear` (each returns the calculator for chaining)
- `result()` returns the current value
- `memoryStore`, `memoryAdd`, `memoryClear` (each returns the calculator for chaining)
- `memoryRecall()` returns the current memory value (a number) and does NOT change current value

Behavior:
- The calculator starts at value 0
- Memory starts at 0
- `memoryStore()` copies current value into memory
- `memoryAdd()` adds the current value to memory (no arguments) and does NOT change current value
- Memory is independent from the current value (clear does not change memory)
- Must export `createCalculator` as a function (do not export a class as the primary API)
