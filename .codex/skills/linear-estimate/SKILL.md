---
name: linear-estimate
description: Recalibrate Linear issue estimates and cycle scope from implementation complexity, review direction, and project-specific engineering risk. Use when the user asks to review current cycle issues, adjust estimates, define estimate criteria, compare issue complexity, or use review/PR feedback to decide Linear point values.
---

# Linear Estimate

## Overview

Use this skill to turn Linear issue lists and review evidence into consistent `1`, `2`, or `4` point estimates. Treat estimate as total issue complexity: implementation scope, verification burden, and the likelihood that review will uncover boundary or contract problems.

## Required Context

- Read project instructions and applicable memory before judging estimates.
- Use the Linear skill/tools to identify the target team, current cycle, issue details, comments, relations, attachments, and existing estimates.
- Read review context when available. Prefer human review comments and review summaries over generated PR bodies; use automated review only when it identifies a concrete, code-grounded risk.
- If using `gh` in this repo, run it with escalated permissions because sandboxed `gh` auth fails.

## Workflow

1. Identify the cycle and issue set. If the user says "current cycle" and no team is given, infer the team from recent project issues, then verify with `list_cycles`.
2. List all issues in the cycle, including completed and canceled issues. Missing estimates can distort cycle scope, so account for them explicitly.
3. For each issue that is unestimated, suspiciously low/high, or currently in review, fetch details, relations, comments, attachments, and linked PRs.
4. Read review threads for linked PRs when they exist. Classify findings by risk type: source of truth, API/cache contract, spec mismatch, runtime/process state, DB/federation policy, UI verification, or simple cleanup.
5. Assign or adjust estimates using the scale below. Update Linear only when the user asked for recalibration or it is clearly part of the task; otherwise report recommendations.
6. Summarize material changes, unresolved split candidates, and any estimates that remain uncertain.

## Scale

- Use `1`, `2`, and `4` points as the default scale.
- Do not solve oversized work by picking values above `4`. Split the issue instead, especially when parent and child issues both sit in the same cycle.
- For parent issues with child issues in the same cycle, estimate only the un-split remaining parent scope.
- For canceled issues, preserve estimate only if meaningful investigation or implementation happened; otherwise leave empty or use `1`.

## Point Criteria

- `1 point`: Localized change to one component, resolver, document, style rule, UI state, or test. No API/schema/DB/cache/OpenSpec contract change. Existing pattern is copied directly. Review should only catch minor omissions.
- `2 points`: One clear boundary changes. Examples: adding a GraphQL object/field and tests, adding a small DB migration, fixing an E2E fixture, integrating one Fedify/WebFinger edge, or aligning one OpenSpec contract with implementation. Review may ask for focused contract or test corrections.
- `4 points`: Multiple boundaries move together. Examples: GraphQL schema plus web fragments/cache plus OpenSpec; DB state policy plus federation runtime plus UI exposure; app-shell layout policy plus browser verification. Review may raise P1/P2 issues about ownership, source of truth, runtime state, or spec/implementation mismatch.

## Review Signals

Raise the estimate when:

- The issue has gone through multiple PRs, review rounds, or reopen cycles.
- The change touches fragment colocation, normalized cache, route-local queries, mutation payloads, or any client data-flow source of truth.
- OpenSpec, archived design, and implementation must be changed together.
- Test fixtures, server process cache, polyfills, runners, framework hooks, or other runtime state are involved.
- Domain state has several policy branches, such as `SUSPENDED`, `UNRESPONSIVE`, local/remote, accepted/rejected, or stale refresh.
- Backend data shape affects web URLs, display strings, button exposure, Storybook, or E2E.

Keep the estimate low when:

- The target and failure mode are narrowly described in the issue.
- No schema/API/DB/OpenSpec contract changes are needed.
- The work is style, overflow, z-index, copy, or a single deterministic test.
- The same pattern exists adjacent to the touched code and no new decision is needed.

## Current Calibration

- `PROD-130`: `2 -> 4`. Active profile switching touched GraphQL payload, Mearie cache, route-local query ownership, OpenSpec, and repeated reviews across PR #158/#170 plus older PR #89 context.
- `PROD-190`: `2 -> 4`. Actor dispatcher looked narrow, but review exposed Fedify helper boundaries, WebFinger UUID exposure, canonical URI handling, and Temporal polyfill/runtime risk.
- `PROD-191`: `1 -> 2`. WebFinger lookup is one feature, but it changes the Fedify hook, local actor identity, and malformed resource tests.
- `PROD-221`: `2`. Bottom tab UI change required OpenSpec cleanup and fragment component review.
- `PROD-238`: `1`. ProfileSwitcher stacking/overflow is a local UI bug with no GraphQL/cache contract change.
- `PROD-234`, `PROD-235`, `PROD-236`: `4` each and split candidates. Remote profile foundation, remote follow, and remote post ingestion each span federation runtime, DB/GraphQL contracts, instance-state policy, web exposure, and broad tests.
