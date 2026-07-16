# Git PR Workflow Memory

## Purpose

- 브랜치 생성, 커밋, push, PR 생성/수정, 기본 stacked PR 작업을 할 때 적용한다.
- 기본 운영 규칙은 먼저 `memory/commit-pr.md`를 따른다.
- 복잡한 rebase, reparent, squash merge 이후 stack 유지보수는 `memory/git-stack-maintenance.md`를 따른다.

## Source Of Truth

- Git 브랜치 ancestry와 GitHub PR의 `baseRefName`/`headRefName`을 source of truth로 삼는다.
- stacked PR에서는 GitHub PR base가 리뷰 순서를 결정하므로 모든 PR의 `baseRefName`이 의도한 부모 브랜치를 가리키는지 확인한다.

## Common Checks

- 작업 전 현재 위치와 변경 범위를 확인한다.
  - `git status --short --branch`
  - `git branch --show-current`
  - `git log --oneline --graph --decorate --all -n 30`
- PR이 이미 있거나 stack base를 확인해야 하면 GitHub의 PR base를 확인한다.
  - `gh pr view --json number,title,headRefName,baseRefName,isDraft,state,url`
- 열린 PR 목록과 stack 상태가 필요하면 다음 명령을 사용한다.
  - `gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,url`

## Branch Policy

- 브랜치 이름은 관련 Linear 이슈 ID를 그대로 사용한다.
- 별도 접두어나 설명어를 붙이기보다 이슈 추적성과 연결성을 우선한다.
- 하나의 브랜치는 하나의 Linear 이슈에 대응시키는 것을 기본으로 한다.
- PR 설명과 커밋 맥락도 같은 이슈를 중심으로 정렬한다.

## Create A Branch

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

## Create A Commit

- 변경 범위를 확인한 뒤 필요한 파일만 staging한다.
  - `git status --short`
  - `git diff`
  - `git add <paths>`
  - `git diff --cached`
  - `git commit -m "<message>"`
- 커밋 메시지는 투기적 체크포인트로 충분히 식별 가능하게 쓴다.
- 의도하지 않은 사용자 변경이 섞이면 staging하지 않고 남겨둔다.

## Open A PR

- 원격 브랜치를 먼저 올린다.
  - `git push -u origin HEAD`
- 첫 PR은 `main`을 base로 연다.
  - `gh pr create --draft --base main --head <branch> --title "<Korean title>" --body "<Korean body>"`
- 후속 PR은 부모 브랜치를 base로 연다.
  - `gh pr create --draft --base <parent-branch> --head <branch> --title "<Korean title>" --body "<Korean body>"`
- PR 본문에는 stack 위치를 명시한다.
  - `Stack: main -> <parent-branch> -> <this-branch>`
- 이미 열린 PR의 base가 틀리면 다음 명령으로 고친다.
  - `gh pr edit <branch-or-pr-number> --base <parent-branch>`

## Edit A PR

- 열린 PR의 제목, 본문, base, Draft/Ready 상태 변경은 `gh` 명령을 사용한다.
- PR 본문 형식은 `memory/pr-writing.md`를 따른다.
- Ready for review로 전환하기 전에는 현재 HEAD가 정상 동작하고 PR 범위가 리뷰 가능한 단위인지 다시 확인한다.
