---
name: openspec-propose
description: Create an authority-backed OpenSpec proposal with requirements, design, decisions, and tasks. Use when the user asks to plan a new change.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: '1.0'
  generatedBy: '1.3.1'
---

# Propose an OpenSpec change

Create the smallest change that captures a concrete, approved product or system contract and is ready for implementation.

## Route

1. Resolve a kebab-case change name from the user's concrete request. If the request is too vague to identify the intended result, ask one focused question before creating anything.
2. Before writing artifacts, read the applicable canonical `docs/domain` and `docs/design` documents and independently verify the current Linear issue bodies, relations, and contract-changing comments. Confirm the Domain and Issue Gates; OpenSpec cannot prove either gate.
3. Run `openspec new change "<name>"`, then inspect `openspec status --change "<name>" --json` for the active schema, dependencies, and artifacts.
4. Build artifacts in the schema's dependency order with `openspec instructions <artifact-id> --change "<name>" --json`. Read completed dependencies before each artifact and use the supplied template. Do not copy instruction context or rules into the artifact.
5. Create all artifacts required by `apply.requires` for the active schema and keep each requirement, decision, and task tied to its upstream authority. If a requirement has no authority, record it as a `Blocked Upstream Change Required` decision instead of adding it to a normative spec or task.
6. Recheck status and artifact files after each write. Stop when the change is apply-ready; do not implement application code as part of proposal creation.

## Scope and completion

Keep a change around one behavior contract whose approval, implementation, verification, and completion share a lifecycle. Do not create orphan changes or merge independently approvable lifecycles merely to reduce file count. Report the change path, artifacts created, authority and remaining decisions, schema progress, and whether it is ready for apply.
