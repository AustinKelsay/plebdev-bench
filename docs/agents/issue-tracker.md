# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `AustinKelsay/plebdev-bench`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..." --label "ready-for-agent"`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from the current Git remote when possible.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `AustinKelsay/plebdev-bench`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
