# Workspace Smoke

Baseline `computer-use` test for file creation, in-place editing, and structured output.
Nested destination directories are preseeded so the task does not implicitly require directory creation.

## Task

Inside the isolated workspace, the model must:

- create one new log file with exact text
- append one exact line to an existing checklist file
- create one JSON summary file

## Pass Criteria

- required files exist at the exact paths
- file contents match exactly
- the JSON summary matches exactly
- no files outside the allowed mutation set are changed
