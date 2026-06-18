# Git Stack Maintenance Memory

## Purpose

- 부모 브랜치 rewrite, squash merge 이후 자식 PR 이어가기, reparent, force-push가 필요할 때 적용한다.
- 기본 브랜치/PR 작업은 `memory/git-pr-workflow.md`를 따른다.
- 이 문서는 Git 브랜치 ancestry와 GitHub PR base를 직접 관리하는 공식 stack 유지보수 절차다.

## Safety Rules

- stack을 재작성하기 전에는 현재 브랜치 위치를 복구 가능한 백업 브랜치로 남긴다.
  - `git branch backup/<branch>-<timestamp> <branch>`
- 여러 층을 다시 쓰는 작업에서는 각 브랜치의 직전 부모 tip을 잃지 않도록 영향받는 하위 브랜치 tip을 모두 먼저 백업한다.
- `git rebase --onto <new-base> <old-base> <branch>`의 `<old-base>`는 항상 해당 브랜치가 기존에 쌓여 있던 직전 부모의 이전 tip이어야 한다.
- rebase 또는 reparent 후에는 `git range-diff`나 `git log --graph`로 의도한 커밋만 이동했는지 확인한다.
- 공유 브랜치를 다시 push할 때는 branch별 expected remote SHA를 지정한 `--force-with-lease=<branch>:<expected-remote-sha>`만 사용한다.
  - rebase 전에 `git fetch origin` 후 `git rev-parse origin/<branch>`로 `<expected-remote-sha>`를 기록한다.
  - rebase 전에 `git merge-base --is-ancestor origin/<branch> <branch>`로 로컬 브랜치가 원격 head를 포함하는지 확인한다.
  - 원격 head가 로컬에 포함되어 있지 않으면 force-push하지 않는다. `git log --oneline <branch>..origin/<branch>`로 원격-only 커밋을 확인하고, 필요한 커밋을 먼저 통합한 뒤 다시 진행한다.
  - 기본 `git push --force-with-lease`는 직전 `fetch`로 갱신된 원격 추적 ref를 기준으로 삼을 수 있어, 로컬에 포함하지 않은 원격 변경을 덮어쓸 수 있으므로 사용하지 않는다.

## Update A Child After Parent Rewrite

- 부모 브랜치가 force-push나 rebase로 다시 쓰일 수 있으면 자식 브랜치의 기존 base였던 부모 tip을 먼저 백업 ref나 commit SHA로 남긴다.
  - `<old-parent-tip>`은 자식 브랜치가 쌓여 있던 이전 부모 tip이며, fetch/pull/rebase로 ref가 이동하기 전에 `git rev-parse <parent-branch>` 또는 `git rev-parse origin/<parent-branch>`로 확인한다.
  - `<old-parent-tip>`은 자식 브랜치 히스토리에 포함된 경계 커밋이어야 하므로, 의심스러우면 `git merge-base --is-ancestor <old-parent-tip> <child-branch>`로 확인한다.
  - `git branch backup/<parent-branch>-before-update-<timestamp> <old-parent-tip>`
  - `git branch backup/<child-branch>-before-parent-update-<timestamp> <child-branch>`
  - `git branch backup/<grandchild-branch>-before-parent-update-<timestamp> <grandchild-branch>`
- 부모 브랜치가 push된 최신 상태라면 자식 고유 커밋만 새 부모 브랜치 위로 rebase한다.
  - `git fetch origin`
  - `git switch <child-branch>`
  - `git rev-parse origin/<child-branch>`로 `<expected-child-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<child-branch> <child-branch>`
  - `git rebase --onto origin/<parent-branch> backup/<parent-branch>-before-update-<timestamp> <child-branch>`
  - `git push --force-with-lease=<child-branch>:<expected-child-remote-sha> origin <child-branch>`
- 자식 PR이 또 다른 PR의 부모라면, 그 아래 브랜치도 갱신된 직전 부모 브랜치 위로 차례대로 rebase한다.
  - `git switch <grandchild-branch>`
  - `git rev-parse origin/<grandchild-branch>`로 `<expected-grandchild-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<grandchild-branch> <grandchild-branch>`
  - `git rebase --onto <child-branch> backup/<child-branch>-before-parent-update-<timestamp> <grandchild-branch>`
  - `git push --force-with-lease=<grandchild-branch>:<expected-grandchild-remote-sha> origin <grandchild-branch>`
  - `gh pr edit <grandchild-branch> --base <child-branch>`
- 더 깊은 stack도 같은 규칙을 반복한다. 예를 들어 `main -> A -> B -> C -> D`에서 `A`가 rewrite되면 `B`는 갱신된 `A` 위로 옮기고, `C`는 갱신된 `B` 위로, `D`는 갱신된 `C` 위로 옮긴다.
- 부모 브랜치가 fast-forward로만 변경됐다는 점이 확실할 때는 `git rebase origin/<parent-branch>`도 동작하지만, 부모가 rewrite됐거나 확실하지 않으면 사용하지 않는다.
- `git rebase origin/<parent-branch>`는 `<upstream>`만 지정하는 형태라 old-base 경계를 받지 못한다. 부모가 rewrite된 뒤 이 명령을 쓰면 기존 부모 커밋까지 자식 브랜치에서 replay되어 충돌하거나 자식 PR diff에 부모 변경이 섞일 수 있다.
- 충돌 해결 후에는 `git status`, 관련 테스트, `git log --graph`를 확인한다.

## Continue Child PR After Parent Squash Merge

- 부모 PR을 squash merge하기 전, 또는 merge 직후 부모 ref를 삭제하거나 prune하기 전에 rebase 경계로 사용할 기존 branch tip을 백업 ref나 commit SHA로 남긴다.
  - 이 백업은 작업 중인 파일을 보관하기 위한 것이 아니라, `git rebase --onto`의 `<old-base>` 기준점을 잃지 않기 위한 것이다.
  - `git stash`는 uncommitted worktree/index 변경 보관용이므로 이 기준점을 대체하지 못한다.
  - `git branch backup/<merged-parent>-before-squash-<timestamp> <merged-parent>`
  - `git branch backup/<child-branch>-before-squash-<timestamp> <child-branch>`
  - `git branch backup/<grandchild-branch>-before-squash-<timestamp> <grandchild-branch>`
- 이미 부모 ref가 삭제됐다면 먼저 local reflog, PR commit 목록, 또는 남아 있는 descendant 히스토리에서 이전 부모 tip을 복구해 백업한 뒤 진행한다.
- squash merge된 PR의 직계 자식만 최신 `main` 위로 옮긴다.
  - `git fetch origin`
  - `git switch <child-branch>`
  - `git rev-parse origin/<child-branch>`로 `<expected-child-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<child-branch> <child-branch>`
  - `git rebase --onto origin/main backup/<merged-parent>-before-squash-<timestamp> <child-branch>`
  - `git push --force-with-lease=<child-branch>:<expected-child-remote-sha> origin <child-branch>`
  - `gh pr edit <child-branch> --base main`
- 손자 이하 브랜치도 결과적으로 새 `main`을 포함하도록 다시 써진다. 다만 `main` 위로 직접 옮기지 않고, 갱신된 직전 부모 브랜치 위로 차례대로 옮긴다.
  - `git switch <grandchild-branch>`
  - `git rev-parse origin/<grandchild-branch>`로 `<expected-grandchild-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<grandchild-branch> <grandchild-branch>`
  - `git rebase --onto <child-branch> backup/<child-branch>-before-squash-<timestamp> <grandchild-branch>`
  - `git push --force-with-lease=<grandchild-branch>:<expected-grandchild-remote-sha> origin <grandchild-branch>`
  - `gh pr edit <grandchild-branch> --base <child-branch>`
- 더 깊은 stack도 같은 규칙을 반복한다. 예를 들어 `main -> A -> B -> C -> D`에서 `A`가 squash merge되면 `B`만 `origin/main` 위로 옮기고, `C`는 갱신된 `B` 위로, `D`는 갱신된 `C` 위로 옮긴다. 이 과정을 끝내면 `C`와 `D`도 새 `main` 위의 히스토리를 갖지만, PR base는 각각 `B`, `C`로 유지된다.
- 3층 이상 stack의 맨 위 브랜치에서 `git rebase --onto origin/main <merged-parent> <top-branch>`를 바로 실행하면 중간 PR의 커밋까지 맨 위 PR에 포함될 수 있으므로 사용하지 않는다.

## Reparent A PR

- PR의 부모를 바꿔야 하면 local ancestry와 GitHub PR base를 같이 바꾼다. 이때도 현재 브랜치가 쌓여 있던 기존 부모 tip을 rebase 경계로 남긴다.
  - `<old-parent-tip>`은 현재 브랜치가 기존에 쌓여 있던 직전 부모의 이전 tip이며, fetch/pull/rebase로 ref가 이동하기 전에 기록한다.
  - 의심스러우면 `git merge-base --is-ancestor <old-parent-tip> <branch>`로 `<old-parent-tip>`이 현재 브랜치 히스토리에 포함된 경계인지 확인한다.
  - `git branch backup/<old-parent-branch>-before-reparent-<timestamp> <old-parent-tip>`
  - `git branch backup/<branch>-before-reparent-<timestamp> <branch>`
  - `git branch backup/<child-branch>-before-reparent-<timestamp> <child-branch>`
  - `git branch backup/<grandchild-branch>-before-reparent-<timestamp> <grandchild-branch>`
  - `git fetch origin`
  - `git switch <branch>`
  - `git rev-parse origin/<branch>`로 `<expected-branch-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<branch> <branch>`
  - `git rebase --onto origin/<new-parent-branch> backup/<old-parent-branch>-before-reparent-<timestamp> <branch>`
  - `git push --force-with-lease=<branch>:<expected-branch-remote-sha> origin <branch>`
  - `gh pr edit <branch> --base <new-parent-branch>`
- reparent한 브랜치가 또 다른 PR의 부모라면, 하위 브랜치들도 갱신된 직전 부모 브랜치 위로 차례대로 rebase한다.
  - `git switch <child-branch>`
  - `git rev-parse origin/<child-branch>`로 `<expected-child-remote-sha>`를 기록
  - `git merge-base --is-ancestor origin/<child-branch> <child-branch>`
  - `git rebase --onto <branch> backup/<branch>-before-reparent-<timestamp> <child-branch>`
  - `git push --force-with-lease=<child-branch>:<expected-child-remote-sha> origin <child-branch>`
  - `gh pr edit <child-branch> --base <branch>`
- 더 깊은 하위 브랜치도 같은 규칙을 반복한다. 각 단계의 old-base는 해당 브랜치가 기존에 쌓여 있던 직전 부모의 reparent 전 tip이며, 이 old-base로 쓸 직전 부모 tip도 첫 rebase 전에 백업해 둔다.
- 기존 부모 브랜치가 rewrite됐거나 rewrite 여부가 불확실하면 `origin/<old-parent-branch>`를 old-base로 직접 쓰지 않는다.
- reparent 후에는 `gh pr view --json headRefName,baseRefName,url`로 GitHub base가 맞는지 확인한다.
