Purpose: Explain the llm/ docs workspace and its project/context/workflows structure.

# LLM Docs Workspace

This folder is the source of truth for project planning and repeatable guidance used by humans and agents. It now follows a four-part structure: `project/`, `context/`, `implementation/`, and `workflows/`.

## Structure

```
llm/
├── README.md                  # You are here — how this workspace works
├── project/                   # Canonical project plan and phases
│   ├── project-overview.md    # Your project definition (copy from project-overview-example.md)
│   ├── user-flow.md           # User journeys and states
│   ├── tech-stack.md          # Technology choices and conventions
│   ├── design-rules.md        # Visual language, accessibility, components
│   ├── project-rules.md       # Coding standards and workflows
│   └── phases/                # Iterative delivery plans
│       ├── README.md          # How to use phases and templates
│       ├── phase-template.md  # Scaffold for drafting phases
│       ├── setup-phase.md
│       ├── mvp-phase.md
│       ├── review-and-hardening-phase.md (optional)
│       └── [additional-phase].md (optional)
├── context/                   # Focused, reusable references for implementation
│   └── (e.g.) nostr-nip-01.md, ui-tokens.md, security-model.md
├── implementation/            # Notes on what the app currently does and how
│   └── (e.g.) encryption-and-decryption-implementation.md
└── workflows/                 # Repeated operational runbooks
    └── dev-env-local-example.md # Example: set up local dev environment
```

## Folder Intent
- `project/` — Everything about the product plan: overview, user flows, tech stack, design rules, engineering standards, and the phased roadmap.
- `context/` — Tight, implementation-oriented briefs. Examples: a protocol spec summary you’ll cite in prompts (e.g., `nostr-nip-01.md`), a domain model, or a library’s usage patterns.
- `implementation/` — Documentation about what the app currently does and how it is implemented (e.g., `nostr-queries-implementation.md`).
- `workflows/` — Runbooks you execute consistently (local lint/build/CI checks before push, db migrations, release steps).

## Conventions
- Begin each file with a single-line purpose note; keep files under 500 lines.
- Example templates end with `-example`; copy and rename them to fit your project.
- Use descriptive kebab-case filenames. Prefer short, linkable documents over mega files.
- Update `project/` first; add supporting `context/` and `workflows/` as the project evolves.
- For protocol or crypto work: add a spec summary in `context/`, write spec-based tests first, then implement and verify against those tests.

## Quick Start
1. Open `llm/project/setup.md` and follow the steps to generate your baseline docs.
2. Copy `llm/project/project-overview-example.md` to `llm/project/project-overview.md` and tailor it.
3. Add any relevant specs to `llm/context/` (e.g., `nostr-nip-01.md`).
4. If you want sovereignty-focused suggestions for the tech-stack doc, copy [`agent-prompt.md`](https://github.com/pleb-devs/freedom-tech/blob/main/agent-prompt.md) from the [freedom-tech repo](https://github.com/pleb-devs/freedom-tech) into `llm/context/freedom-tech-agent-prompt.md` and attach it only in stack-selection prompts.
5. Use `workflows/dev-env-local-example.md` as a starting point to get the environment running on a fresh machine.
