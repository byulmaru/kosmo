# Commit And PR Memory

## Purpose

- 팀 공통 커밋/PR 정책을 따를 때 이 메모를 적용한다.
- 투기적 커밋, 최소 단위 PR, 한국어 PR 작성, Linear 이슈 ID 브랜치 규칙을 정리한다.

## Core Principles

- 커밋은 작업 중간 가설과 방향 전환을 안전하게 보존하는 투기적 단위로 자주 남긴다.
- PR은 리뷰어가 정상 동작을 검증할 수 있는 최소 단위로 자른다.
- Draft PR은 초기에 가볍게 열어 공유하고, 구현 중인 맥락과 리스크를 빠르게 노출한다.
- 최종 머지는 PR 내용 기준의 squash merge를 전제로 하므로, 커밋 히스토리 정리보다 PR의 기능적 일관성과 리뷰 가능성을 더 우선한다.
- 브랜치 이름은 관련 Linear 이슈 ID를 그대로 사용한다.
- 브랜치 생성, 커밋 생성, PR 생성은 기본적으로 Aviator CLI(`av`)를 사용한다.
- 현재 워크트리에서 Aviator CLI(`av`)가 반복적으로 실패하거나 스택 메타데이터가 불안정하면, 작업을 멈추지 않고 Git/GitHub CLI fallback flow를 사용한다.
- 기존 PR 제목/본문/상태 등 PR 편집은 Aviator CLI(`av pr --edit`) 대신 GitHub CLI(`gh`)를 사용한다.
- Aviator CLI(`av`)가 설치되어 있지 않다면 커밋/PR 작업을 계속하기 전에 설치를 권장한다.

## Basic Commands

- 커밋이나 PR 작업 전에 현재 브랜치를 먼저 확인한다.
- 현재 브랜치가 작업 브랜치가 아니거나 `main` 같은 trunk 브랜치라면, 먼저 `av branch <name>`으로 작업 브랜치를 만든다.
- 브랜치는 `av branch <name>`으로 만든다.
- 커밋은 `av commit -m "<message>"`로 만든다.
- PR은 기본적으로 `av pr -t "<title>" -b "<body>"`로 연다.
- Draft PR로 열어야 할 때는 `av pr --draft -t "<title>" -b "<body>"`를 사용한다.
- 이미 열린 PR의 제목/본문/상태를 편집할 때는 `gh pr edit` 같은 GitHub CLI 명령을 사용한다.
- 브랜치 정리가 필요할 때는 `av sync --ff-trunk --rebase-to-trunk --prune`으로 로컬 브랜치 스택을 정리한다.
- 별도 이유가 없다면 같은 목적을 위해 `git switch -c`, `git commit`, `gh pr create`를 직접 쓰지 않는다.
- 단, `av`가 현재 워크트리에서 반복 실패하는 상황에서는 아래 Git fallback 명령을 우선한다.

## Git Fallback Flow When `av` Fails

이 fallback은 `av`의 숨은 스택 메타데이터 대신 Git 브랜치 ancestry와 GitHub PR base를 source of truth로 삼는다.

### 공통 확인

- 작업 전 항상 현재 위치와 변경 범위를 확인한다.
  - `git status --short --branch`
  - `git branch --show-current`
  - `git log --oneline --graph --decorate --all -n 30`
- PR이 이미 있거나 스택 base를 확인해야 하면 GitHub의 PR base를 확인한다.
  - `gh pr view --json number,title,headRefName,baseRefName,isDraft,state,url`
- 스택을 재작성하기 전에는 현재 브랜치 위치를 복구 가능한 백업 브랜치로 남긴다.
  - `git branch backup/<branch>-<timestamp> <branch>`
- 여러 층을 다시 쓰는 작업에서는 각 브랜치의 직전 부모 tip을 잃지 않도록 영향받는 하위 브랜치 tip을 모두 먼저 백업한다.
- `git rebase --onto <new-base> <old-base> <branch>`의 `<old-base>`는 항상 해당 브랜치가 기존에 쌓여 있던 직전 부모의 이전 tip이어야 한다.
- rebase 또는 reparent 후에는 `git range-diff`나 `git log --graph`로 의도한 커밋만 이동했는지 확인한다.
- 공유 브랜치를 다시 push할 때는 branch별 expected remote SHA를 지정한 `--force-with-lease=<branch>:<expected-remote-sha>`만 사용한다.
  - rebase 전에 `git fetch origin` 후 `git rev-parse origin/<branch>`로 `<expected-remote-sha>`를 기록한다.
  - rebase 전에 `git merge-base --is-ancestor origin/<branch> <branch>`로 로컬 브랜치가 원격 head를 포함하는지 확인한다.
  - 원격 head가 로컬에 포함되어 있지 않으면 force-push하지 않는다. `git log --oneline <branch>..origin/<branch>`로 원격-only 커밋을 확인하고, 필요한 커밋을 먼저 통합한 뒤 다시 진행한다.
  - 기본 `git push --force-with-lease`는 직전 `fetch`로 갱신된 원격 추적 ref를 기준으로 삼을 수 있어, 로컬에 포함하지 않은 원격 변경을 덮어쓸 수 있으므로 fallback 절차에서는 사용하지 않는다.

### 새 스택 브랜치 만들기

- 첫 PR 브랜치는 최신 trunk에서 만든다.
  - `git fetch origin`
  - `git switch main`
  - `git pull --ff-only`
  - `git switch -c <Linear issue ID>`
- 후속 PR 브랜치는 부모 브랜치에서 만든다.
  - `git fetch origin`
  - `git switch <parent-branch>`
  - `git pull --ff-only origin <parent-branch>`
  - `git switch -c <Linear issue ID>`
- 브랜치 이름은 fallback에서도 관련 Linear 이슈 ID를 그대로 사용한다.

### 커밋 만들기

- 변경 범위를 확인한 뒤 필요한 파일만 staging한다.
  - `git status --short`
  - `git diff`
  - `git add <paths>`
  - `git diff --cached`
  - `git commit -m "<message>"`
- 커밋 메시지는 투기적 체크포인트로 충분히 식별 가능하게 쓴다.
- 의도하지 않은 사용자 변경이 섞이면 staging하지 않고 남겨둔다.

### 스택 PR 열기

- 원격 브랜치를 먼저 올린다.
  - `git push -u origin HEAD`
- 첫 PR은 `main`을 base로 연다.
  - `gh pr create --draft --base main --head <branch> --title "<Korean title>" --body "<Korean body>"`
- 후속 PR은 부모 브랜치를 base로 연다.
  - `gh pr create --draft --base <parent-branch> --head <branch> --title "<Korean title>" --body "<Korean body>"`
- PR 본문에는 스택 위치를 명시한다.
  - `Stack: main -> <parent-branch> -> <this-branch>`
- 이미 열린 PR의 base가 틀리면 `gh pr edit <branch-or-pr-number> --base <parent-branch>`로 고친다.

### 부모 브랜치 변경을 자식 브랜치에 반영하기

- 부모 브랜치가 force-push나 rebase로 다시 쓰일 수 있는 fallback 상황에서는 자식 브랜치의 기존 base였던 부모 tip을 먼저 백업 ref나 commit SHA로 남긴다.
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
- 더 깊은 스택도 같은 규칙을 반복한다. 예를 들어 `main -> A -> B -> C -> D`에서 `A`가 rewrite되면 `B`는 갱신된 `A` 위로 옮기고, `C`는 갱신된 `B` 위로, `D`는 갱신된 `C` 위로 옮긴다. 이때 `C`의 old-base는 rewrite 전 `B` tip이고, `D`의 old-base는 rewrite 전 `C` tip이다.
- 부모 브랜치가 fast-forward로만 변경됐다는 점이 확실할 때는 `git rebase origin/<parent-branch>`도 동작하지만, 부모가 rewrite됐거나 확실하지 않으면 사용하지 않는다.
- `git rebase origin/<parent-branch>`는 `<upstream>`만 지정하는 형태라 old-base 경계를 받지 못한다. 부모가 rewrite된 뒤 이 명령을 쓰면 기존 부모 커밋까지 자식 브랜치에서 replay되어 충돌하거나 자식 PR diff에 부모 변경이 섞일 수 있다.
- 충돌 해결 후에는 `git status`, 관련 테스트, `git log --graph`를 확인한다.

### 부모 PR이 squash merge된 뒤 자식 PR 이어가기

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
- 더 깊은 스택도 같은 규칙을 반복한다. 예를 들어 `main -> A -> B -> C -> D`에서 `A`가 squash merge되면 `B`만 `origin/main` 위로 옮기고, `C`는 갱신된 `B` 위로, `D`는 갱신된 `C` 위로 옮긴다. 이 과정을 끝내면 `C`와 `D`도 새 `main` 위의 히스토리를 갖지만, PR base는 각각 `B`, `C`로 유지된다.
- 3층 이상 스택의 맨 위 브랜치에서 `git rebase --onto origin/main <merged-parent> <top-branch>`를 바로 실행하면 중간 PR의 커밋까지 맨 위 PR에 포함될 수 있으므로 사용하지 않는다.

### Reparent 하기

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

### 스택 상태 보기

- 로컬 커밋 관계는 Git graph로 본다.
  - `git log --oneline --graph --decorate --all --date-order -n 80`
- PR 체인은 각 PR의 base/head로 본다.
  - `gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,url`

### fallback 종료

- `av`가 다시 정상화되기 전까지는 같은 스택에서 `av reorder`, `av reparent`, `av sync`와 Git fallback rebase를 섞지 않는다.
- `av`를 다시 쓰려면 먼저 열린 PR의 base/head와 로컬 브랜치 ancestry가 일치하는지 확인한 뒤, 별도 정리 작업으로 전환한다.

## Commit Policy

- 커밋은 "완전히 정리된 서사"보다 "되돌릴 수 있는 작업 체크포인트"에 가깝게 취급한다.
- 실험, 리팩터링, 경계 정리, 임시 우회도 나중에 비교와 복구에 도움이 된다면 분리해 커밋한다.
- 다만 깨진 상태를 오래 공유하지는 않는다. 브랜치 밖으로 보여줄 시점에는 최소한 현재 HEAD 기준으로 동작 가능해야 한다.
- 커밋 메시지는 해당 시점의 의도를 빠르게 식별할 수 있게 쓴다. 완벽한 사용자 가치 설명보다 작업 의도와 영향 범위가 우선이다.
- 머지는 squash로 이뤄진다는 전제하에, PR 직전에 커밋을 억지로 합치거나 히스토리를 미적으로 정리할 필요는 없다.
- 리뷰와 복구에 도움이 되는 한, 거친 실험 커밋이나 경유 커밋이 남아 있어도 괜찮다.

## Branch Policy

- 브랜치 이름은 관련 Linear 이슈 ID를 그대로 사용한다.
- 별도 접두어나 설명어를 붙이기보다 이슈 추적성과 연결성을 우선한다.
- 하나의 브랜치는 하나의 Linear 이슈에 대응시키는 것을 기본으로 한다.
- PR 설명과 커밋 맥락도 같은 이슈를 중심으로 정렬한다.
- 브랜치를 새로 만들 때는 `av branch <Linear issue ID>` 형식을 기본으로 한다.

## Stacked PR Policy

- 팀은 Stacked PR 플로우를 사용한다.
- 브랜치 스택의 부모 관계를 바꿔야 할 때는 `av reparent --parent <branch>`로 현재 브랜치의 부모를 수정한다.
- 브랜치 순서를 재구성하거나, 커밋을 다른 브랜치로 옮기거나, 스택 단위로 정리해야 할 때는 `av reorder`를 사용한다.
- `av reorder`는 스택 전체를 대상으로 동작하므로, 단순 커밋 순서 조정뿐 아니라 브랜치 간 커밋 이동이 필요한 경우에도 우선 고려한다.
- 브랜치 구조가 틀어졌을 때 임의의 `git rebase -i`로 개별 브랜치를 손대기보다 Aviator 스택 명령을 우선 사용한다.
- 단, `av`가 현재 워크트리에서 실패하는 동안에는 Git fallback flow를 예외 정책으로 사용한다.
- fallback 중에는 GitHub PR base가 리뷰 순서를 결정하므로, 모든 stacked PR의 `baseRefName`이 의도한 부모 브랜치를 가리키는지 확인한다.

## PR Policy

- PR 하나에는 리뷰어가 독립적으로 이해하고 검증할 수 있는 하나의 기능적 변화만 담는다.
- 큰 작업은 선행 정리 PR, 기능 PR, 후속 PR로 나눌 수 있는지 검토한다.
- 선행 정리 PR에는 이름 변경, 타입 정리, 구조 이동, 기계적 리팩터링을 담는다.
- 기능 PR에는 실제 동작 변화를 담는다.
- 후속 PR에는 관측성, 문서화, 추가 최적화, 확장 대응을 담는다.
- "어차피 같은 화면/같은 기능"이라는 이유만으로 변경을 합치지 않는다. 배포와 롤백 관점에서 최소 정상 동작 단위인지 확인한다.
- 리뷰어가 로컬에서 쉽게 검증할 수 없다면 분리가 덜 된 것이다.
- stacked PR에서 특정 concern의 변경이 다른 PR 책임이면 해당 PR로 옮긴다.
- 다른 PR 위에 쌓이거나 먼저 merge되어야 하는 의존성이 있으면 PR 본문, 댓글, 또는 리뷰 응답에서 PR 번호를 명시한다.

## Review Thread Policy

- merge 전에는 unresolved review thread가 남아 있지 않아야 한다.
- 리뷰 코멘트는 코드를 수정했을 때뿐 아니라 확인만으로 충분한 경우에도 resolve한다.
- 같은 문제가 다른 PR에서 이미 논의됐으면 해당 PR/comment를 링크해 같은 기준을 반복 적용한다.
- 자동화나 AI가 남긴 리뷰라도 의미 있는 지적이면 실제 코드 기준으로 판단하고, 틀린 지적은 왜 틀렸는지 남긴 뒤 무시한다.

## PR Title

- PR 제목은 구현 수단이나 변경 파일 목록이 아니라 PR의 의도를 기준으로 적는다.
- 제목만 봐도 "왜 이 변경이 필요한지"와 "무엇을 가능하게 하려는지"가 보여야 한다.
- 가능하면 사용자/시스템 관점에서 달성하려는 결과를 쓴다.
- PR 제목은 한국어로 작성한다.
- 내부 구현 나열, 추상적인 정리 표현, 맥락 없는 `refactor`, `fix stuff`는 피한다.
- 좋은 예시는 `요청 간 렌더링 상태가 섞이지 않게 한다`, `배포 환경에서 서버 엔트리가 누락되지 않게 한다`이다.

## PR Body

- PR 본문은 한국어로 작성한다.
- PR 본문은 `무엇을 변경했는지`, `왜 변경했는지`, `어떻게 확인할 수 있는지`, `아직 어떤 문제가 남았는지` 순서를 기본으로 한다.
- `무엇을 변경했는지`에는 리뷰어가 diff를 열기 전에 큰 구조를 파악할 수 있도록 구체적인 변경 내용을 bullet로 적는다.
- `왜 변경했는지`에는 변경이 필요한 배경, 해결하려는 문제, 줄어드는 사용자 문제나 운영 문제나 개발 흐름 문제를 설명한다.
- `어떻게 확인할 수 있는지`에는 자동 테스트, 수동 검증, 로컬 실행 명령을 적고, 확인하지 못한 항목은 이유와 함께 명시한다.
- `아직 어떤 문제가 남았는지`에는 설계상 열려 있는 질문, 후속 작업, 회귀 위험, 운영 영향, 의도적으로 남긴 제한을 적는다.
- 남은 문제가 없으면 `없음`이라고 적는다.

## Draft PR Policy

- 작업 초반이라도 방향성이 잡히면 Draft PR을 가볍게 연다.
- Draft PR의 목적은 승인 요청이 아니라 맥락 공유, 조기 피드백, CI 가시성 확보다.
- 기본 PR 생성은 `av pr -t "<title>" -b "<body>"`이고, Draft PR을 열 때는 `--draft`를 붙인다.
- 이미 열린 Draft PR의 설명을 수정하거나 상태를 바꿀 때는 `av pr --edit` 대신 `gh pr edit` 또는 관련 `gh` 명령을 사용한다.
- Draft PR에는 지금까지 된 것, 아직 안 된 것, 막히는 점 또는 확인이 필요한 점을 간단히 적는다.
- Ready for review로 전환할 때는 최소한 브랜치 HEAD가 정상 동작하고, PR 범위가 리뷰 가능한 단위인지 다시 확인한다.

## Checklist

- 이 PR이 하나의 기능적 변화로 설명되는가.
- 현재 브랜치가 `main`이 아닌 적절한 작업 브랜치인가.
- 브랜치 이름이 대응되는 Linear 이슈 ID와 일치하는가.
- 독립적으로 테스트하거나 수동 검증할 수 있는가.
- 제목이 구현 방식이 아니라 PR의 의도와 달성하려는 결과를 설명하는가.
- 제목과 본문이 한국어로 작성되어 있는가.
- 본문에 무엇을 변경했는지, 왜 변경했는지, 어떻게 확인할 수 있는지가 정리되어 있는가.
- 아직 남은 문제나 후속 작업이 필요한 만큼 드러나 있는가.
- Draft가 아니라면 현재 HEAD가 정상 동작하는가.
