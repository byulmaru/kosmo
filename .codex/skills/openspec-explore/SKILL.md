---
name: openspec-explore
description: Explore an OpenSpec idea or implementation question before choosing a design. Use to investigate, clarify, or compare options.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.3.1'
---

# Explore an OpenSpec change

Explore the question at hand and choose only the steps that inform the decision. This mode is for investigation and reasoning; it does not implement product code.

## Route

- Read the relevant code, docs, and active change artifacts only when they inform the current question. If a change is named or clearly relevant, use `openspec list --json` and read its applicable artifacts.
- Map the current behavior, ownership, constraints, and integration points. Follow the thread that affects the user's decision; do not build a full repository map by default.
- Compare viable options when useful, including observable consequences, risks, and what evidence would distinguish them. Ask a focused question only when the answer changes scope, authority, or implementation direction.
- If the user explicitly asks to capture a decision or requirement, verify the applicable canonical and Linear authority first. Record requirements in specs, design choices in `design.md`, durable decisions in `decisions.md`, scope in `proposal.md`, and work in `tasks.md` according to the active schema.
- If exploration reveals behavior without upstream authority, keep it as an open question or `Blocked` `Upstream Change Required` decision. Do not make it normative through an OpenSpec artifact.

## Boundaries and handoff

- Do not edit application code, tests, or configuration in explore mode. Artifact edits are allowed only when explicitly requested and their upstream gates are satisfied.
- Do not auto-capture every observation or repeat a standard question. Summarize the current understanding, unresolved decisions, and the smallest useful next step.
- When the user explicitly asks to build, leave explore mode and continue through the applicable proposal or apply workflow. Use an existing approved change when one is available; do not regenerate a proposal solely because exploration ended.
