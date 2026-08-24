# Git Stack Maintenance Memory

## Purpose

- 기존 branch/PR adopt, 부모 branch rewrite, cascading rebase, reparent, squash merge 이후 Stack
  유지보수에 적용한다.
- 기본 브랜치/PR 작업은 `memory/git-pr-workflow.md`를 따른다.
- 공식 `github/gh-stack` extension으로 local branch chain, PR base, 다층 원격 GitHub Stack 객체를
  함께 관리하되 Git 복구·lease 검증 규칙을 약화하지 않는다.

## Safety Rules

- 변경 전 `gh stack view --json`, PR API, `git log --graph`로 현재 trunk, branch order, PR
  base/head, 원격 Stack을 기록한다.
- Stack을 재작성하기 전에 영향받는 모든 branch tip을 복구 가능한 backup branch로 남긴다.
  - `git branch backup/<branch>-<timestamp> <branch>`
- `git fetch origin` 후 branch별 expected remote SHA를 기록하고 원격-only commit이 없는지 확인한다.
  - `git rev-parse origin/<branch>`
  - `git merge-base --is-ancestor origin/<branch> <branch>`
  - 원격 head가 포함되지 않으면 `git log --oneline <branch>..origin/<branch>`를 확인하고 멈춘다.
- restructure/rebase 전 worktree가 clean하고 merge/rebase가 진행 중이 아니며 queued PR이 없는지
  확인한다.
- rebase 또는 reparent 뒤 `git range-diff`와 `git log --graph`로 각 layer의 고유 commit만
  이동했는지 확인한다.
- `gh stack push`는 branch별 explicit `--force-with-lease`를 사용하지만 multi-branch push는
  atomic하지 않다. 일부 branch만 갱신될 수 있으므로 명령 후 모든 remote SHA를 다시 확인한다.
- 수동 복구 push가 필요하면 반드시 기록한 SHA를 넣은
  `git push --force-with-lease=<branch>:<expected-remote-sha> origin <branch>`만 사용한다.
  인자 없는 `--force-with-lease`나 broad force refspec은 사용하지 않는다.
- `gh stack`이 실패하면 `gh pr create`, extension이 제안하는 ordinary unstacked PR, base
  retarget으로 우회하지 않는다. 부분 branch push, PR 상태, 원격 Stack 상태를 조회해 blocker로
  보고한다.

## Adopt Existing Branches Or Pull Requests

- 기존 branch는 bottom-to-top linear ancestry를 먼저 검증한다.
  - `git merge-base --is-ancestor <bottom-branch> <next-branch>`
  - 더 깊은 branch도 같은 검사를 반복한다.
- local Stack으로 adopt한다.
  - `gh stack init --base main <bottom-branch> <next-branch> ... <top-branch>`
  - `gh stack view --json`
- 기존 열린 PR은 대화형 `gh stack submit`에서 연결 대상과 변경될 base/Draft 상태를 확인해
  submit한다. `--auto`를 기본값으로 사용하지 않는다.
- submit 뒤 PR REST API에서 `main <- bottom <- ... <- top` base/head chain을 확인하고, 2-layer
  이상이면 원격 GitHub Stack 객체가 존재하는지 확인한다. base retarget만으로 adopt 완료를
  주장하지 않는다.

## Cascading Rebase And Sync

- 최신 trunk를 반영하는 일반 흐름은 backup과 expected SHA 기록 후 공식 명령을 사용한다.
  - 전체 동기화: `gh stack sync`
  - 충돌을 직접 처리할 cascading rebase: `gh stack rebase`
  - 현재 branch 위쪽만: `gh stack rebase --upstack`
  - trunk를 건드리지 않고 layer끼리만: `gh stack rebase --no-trunk`
- `gh stack sync`는 fetch, trunk fast-forward, cascading rebase, lease push, PR/Stack sync를 함께
  수행한다. remote와 local Stack이 diverged됐다는 선택지가 나오면 어느 쪽을 source of truth로
  삼을지 추론하지 않고 멈춰 보고한다. 2-layer 이상이면 sync 뒤 원격 Stack 객체도 검증한다.
- 충돌 시 파일과 기존 parent boundary를 확인한다. 의도가 명확하면 해결·stage 후
  `gh stack rebase --continue`, 불명확하면 `gh stack rebase --abort`로 모든 branch를 복원한다.
- 성공 뒤 rebase 전 backup과 각 새 branch 사이를 `git range-diff`하고, `gh stack push` 또는
  `gh stack submit` 뒤 local/remote SHA와 PR base/head를 다시 확인한다.

## Reparent Or Restructure A Stack

- 같은 Stack 안에서 parent/order를 바꾸려면 backup과 expected SHA를 기록한 뒤
  `gh stack modify`를 사용한다. TUI에서 reorder/drop/fold/insert/rename 결과를 저장하면 cascading
  rebase가 적용된다.
- 충돌은 `gh stack modify --continue`로 이어가거나 `gh stack modify --abort`로 pre-modify 상태를
  복원한다.
- 저장 후 다음 검사를 통과해야 remote에 반영한다.
  - `git merge-base --is-ancestor <new-parent> <branch>`
  - `git range-diff <old-parent>..<backup-branch> <new-parent>..<branch>`
  - `git log --oneline --graph --decorate --all -n 30`
- `gh stack submit`으로 branch를 push하고 PR base를 갱신하며, 2-layer 이상이면 원격 Stack 객체를
  다시 만든다. 이후 `gh stack view --json`과 PR API를 함께 확인한다.
- 다른 Stack으로 옮기는 등 `gh stack modify`로 표현할 수 없는 변경은 blocker로 보고한다.
  원격 Stack 삭제·재생성이 명시적으로 승인되면 `gh stack unstack`, 안전한 Git ancestry 변경,
  `gh stack init --base <trunk> <branches...>`, `gh stack submit` 순서로 복구한다. `unstack`은 PR을
  보존해도 원격 Stack 객체를 변경하므로 상태 변경을 숨기지 않는다.
- `gh pr edit --base`만으로 reparent 완료를 주장하지 않는다.

## Continue After Parent Merge

- merge 전 영향받는 branch tip을 backup하고 Stack/PR 상태를 기록한다. squash merge 후 원래
  commit이 사라져도 official CLI는 merged PR 경계를 `--onto` 방식으로 처리한다.
- merge 직후 다음을 수행한다.
  - `gh stack sync`
  - conflict가 나면 `gh stack rebase`로 전환해 해결하거나 abort한다.
  - `git range-diff`와 `git log --graph`로 미병합 branch의 고유 commit만 남았는지 확인한다.
  - `gh stack submit` 후 남은 PR의 base/head와, 2-layer 이상이면 원격 Stack order를 확인한다.
- 중간 PR만 고립해서 merge할 수 있다고 가정하지 않는다. Stack merge는 선택한 PR과 그 아래
  미병합 PR을 bottom-up으로 처리하고, 위쪽 PR은 자동 cascading rebase 대상이 된다.

## Merge, Auto-Merge, And Merge Queue

- Stack은 `gh stack merge` 또는 GitHub Stack UI/API로 merge한다. direct Stack merge는 선택한
  PR까지 all-or-nothing이지만, merge queue에서는 PR들이 함께 등록되어도 별도 group으로 순차
  처리될 수 있다.
- stacked PR에는 일반 auto-merge가 지원되지 않는다. 기존 PR을 Stack으로 연결하면서 auto-merge가
  해제되면 정확히 보고하고, 이를 Stack merge 요청이나 queue 등록으로 표현하지 않는다.
- queue 등록, merge 요청, green check는 완료가 아니다. 모든 대상 PR의 `state: MERGED`,
  `mergedAt`, `mergeCommit.oid`와 남은 Stack order를 확인한다.

## Manual Recovery Boundary

- official CLI가 실패한 뒤 local ancestry 복구가 필요할 때만 backup을 기준으로 수동
  `git rebase --onto <new-base> <old-parent-tip> <branch>`를 사용한다.
- `<old-parent-tip>`은 branch가 기존에 쌓인 직전 parent의 이전 tip이어야 하며, 사용 전
  `git merge-base --is-ancestor <old-parent-tip> <branch>`로 경계를 확인한다.
- 자식부터 한 번에 trunk로 옮기지 않는다. `main -> A -> B -> C`에서 A가 바뀌면 B를 A 위로,
  C를 갱신된 B 위로 차례대로 옮긴다.
- 수동 복구 뒤에도 explicit lease push와 `gh stack submit`을 거쳐야 한다. 다층 Stack은 local
  ancestry와 PR base가 맞더라도 원격 GitHub Stack 객체 검증 전에는 완료가 아니다.
