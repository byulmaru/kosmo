# KOSMO Review Snapshot And Action Boundary

## Establish the review surface

- Identify whether the user is asking for self-review of owned work or review of another owner's PR. Use the user's intent and current evidence. If ownership is unclear and would change whether code may be edited or GitHub feedback may be published, ask the user.
- For local self-review, capture the merge base and committed changes plus staged, unstaged, and relevant untracked files. Include changed specs, decisions, repository guidance, generated artifacts, and validation in the snapshot.
- For an external PR, refresh the repository, base SHA, head SHA, current diff, existing reviews, replies, and thread resolution state. Use thread-aware reads when inline context or resolution matters.
- Before publishing an external action, re-fetch the head. If it changed, inspect the affected lines and behavior again before proceeding.

## Keep external review read-only by default

A review request authorizes inspection and drafting. It does not authorize publishing a review, replying, resolving a thread, approving, or requesting changes. Carry out only the exact GitHub action the user explicitly authorizes for the identified PR.

Resolve feedback only when the requested behavior is reflected in the current code or conclusively answered. Do not resolve a thread merely because the author replied or moved code. Keep new and unaddressed findings open.
