Repository-root-relative paths and commands. Read before CodeGraph use or initialization.

## CodeGraph In Linked Worktrees

- For this repository, consider CodeGraph initialized only when the current worktree contains
  `.codegraph/codegraph.db`. A `.codegraph/` directory containing only `.gitignore` is not an
  initialized index. This rule overrides broader instructions that check only for the directory.
- Do not run `codegraph init` in a linked worktree without user approval.
- When the current worktree has no local index, use `git worktree list --porcelain` to find the
  `main` checkout. If that checkout has `.codegraph/codegraph.db`, pass its absolute path as
  CodeGraph's `projectPath` and use its graph only as a read-only structural baseline. Do not
  hard-code a machine-specific checkout path in repository files.
- Before using the shared baseline, run `codegraph status <main-checkout-path>` to verify that the
  index is up to date. If freshness cannot be verified or CodeGraph reports a pending or stale
  state, treat the entire baseline as stale and use current-worktree reads and targeted searches.
- Before relying on the baseline graph, collect paths that differ between the baseline checkout
  and the current worktree, plus staged, unstaged, and untracked paths in both checkouts. Treat
  CodeGraph results for those paths, and relationships that cross them, as hints only; verify the
  current worktree with direct reads and targeted searches.
- If graph-shaping configuration differs or the task makes broad structural changes, state that
  the shared baseline is not branch-exact and ask whether to initialize CodeGraph in the current
  worktree. Otherwise, do not create a worktree-local index by default.
