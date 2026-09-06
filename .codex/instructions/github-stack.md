Repository-root-relative paths and commands. Read before branch or pull request work.

## GitHub Stacked Pull Requests

- Create every new pull request, including a standalone pull request, as a GitHub Stack with the
  official `github/gh-stack` GitHub CLI extension. A standalone pull request is a one-layer Stack.
- Before branch or pull request work, verify the extension with `gh extension list` and
  `gh stack --version`. If it is missing, install it for the current user with
  `gh extension install github/gh-stack`; it is a local CLI extension, not a repository dependency.
- Start the first layer from the latest trunk with `gh stack init --base main <branch>`.
  Add each later layer only from the current top with `gh stack add <branch>`.
- Feature and contract branches use their Linear issue ID. A behavior-preserving simple refactor may use a descriptive branch without creating a Linear issue solely for the pull request.
- Push tracked layers with `gh stack push` and create or update pull requests with `gh stack submit`.
  For two or more pull requests, submit must also create or update the remote GitHub Stack object.
  A one-layer Stack remains locally tracked and its standalone pull request has a null REST `stack`
  field until another layer is submitted. If `gh stack` is unavailable or fails, do not fall back
  to `gh pr create` or an ordinary unstacked pull request; report the blocker and observed
  local/remote state, including partial branch, pull request, Stack, auto-merge, or Draft changes.
- Do not use `gh stack submit --auto` by default. Use the interactive editor, or a narrower explicit
  command whose title, body, Draft/Ready transitions, and affected existing pull requests have been
  reviewed.
- After submission, verify local Stack state with `gh stack view --json` and GitHub pull request
  head/base/stack state with the pull request REST API. For multi-layer Stacks, a base retarget or a
  successful branch push alone does not prove that the remote GitHub Stack object exists.
- GitHub Stack merge is distinct from pull request auto-merge and merge queue registration. Stacked
  pull requests currently cannot retain ordinary auto-merge; report any auto-merge removal or queue
  state change instead of hiding it. A queued Stack may land in separate groups and is not merged
  until GitHub reports the pull requests as merged.
