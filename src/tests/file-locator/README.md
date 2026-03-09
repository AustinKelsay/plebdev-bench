# File Locator

Reads a noisy workspace, finds the right source files, and writes one structured report.

## Task

- locate three specific values across different directories
- write them into `reports/found-values.json`
- avoid mutating the source files

## Pass Criteria

- the report JSON matches exactly
- no source files are changed or deleted
- no source files are changed or deleted and no extra files are created except the required `reports/found-values.json`
