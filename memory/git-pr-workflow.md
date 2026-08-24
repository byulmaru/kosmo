# Git PR Workflow Memory

## Purpose

- 브랜치 생성, 커밋, push, PR 생성/수정, 기본 stacked PR 작업을 할 때 적용한다.
- 기본 운영 규칙은 먼저 `memory/commit-pr.md`를 따른다.
- 복잡한 rebase, reparent, squash merge 이후 Stack 유지보수는
  `memory/git-stack-maintenance.md`를 따른다.

## Source Of Truth

- `gh stack view --json`의 trunk와 branch order, Git 브랜치 ancestry, GitHub PR REST API의
  base/head/stack, GitHub 원격 Stack 객체를 함께 source of truth로 삼는다.
- stacked PR에서는 GitHub PR base가 리뷰 순서를 결정하므로 모든 PR의 `baseRefName`이 의도한
  부모 브랜치를 가리키는지 확인한다. 단순 base retarget만으로 원격 Stack 생성이나 연결을
  완료했다고 판단하지 않는다.

## Tooling Contract

- 공식 도구는 `github/gh-stack` GitHub CLI extension이다.
  - 설치 확인: `gh extension list`, `gh stack --version`
  - 없을 때 사용자 환경에 설치: `gh extension install github/gh-stack`
- extension은 사용자 로컬 GitHub CLI에 설치하며 repository dependency나 workspace package로
  추가하지 않는다.
- `gh stack`이 없거나 명령이 실패하면 원인과 현재 local/remote 상태를 보고하고 멈춘다.
  일반 `gh pr create`나 extension이 제안하는 ordinary unstacked PR fallback으로 우회하지 않는다.
- 1-layer Stack은 local tracking과 `gh stack submit` 경로를 사용하지만 GitHub REST의 PR
  `stack` 필드는 `null`이다. 원격 Stack 객체는 PR이 2개 이상일 때 생성된다.

## Common Checks

- 작업 전 현재 위치와 변경 범위를 확인한다.
  - `git status --short --branch`
  - `git branch --show-current`
  - `git log --oneline --graph --decorate --all -n 30`
- PR과 Stack 상태를 확인한다.
  - `gh stack view --json`
  - `gh pr view --json number,title,headRefName,baseRefName,isDraft,state,url`
  - `gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,url`

## Branch Policy

- 브랜치 이름은 관련 Linear 이슈 ID를 그대로 사용한다.
- 별도 접두어나 설명어를 붙이기보다 이슈 추적성과 연결성을 우선한다.
- 하나의 브랜치는 하나의 Linear 이슈에 대응시키는 것을 기본으로 한다.
- PR 설명과 커밋 맥락도 같은 이슈를 중심으로 정렬한다.

## Create A Branch

- 새 작업은 단일 PR이어도 1-layer Stack으로 시작한다.
  - `git fetch origin`
  - `git switch main`
  - `git pull --ff-only`
  - `gh stack init --base main <Linear issue ID>`
- 후속 PR 브랜치는 current top에서만 Stack에 추가한다.
  - `gh stack top`
  - `gh stack add <Linear issue ID>`
- `gh stack add`는 현재 HEAD에서 새 branch를 만들고 Stack top으로 checkout한다. branch 자동 생성
  이름 대신 Linear issue ID를 명시한다.

## Adopt Existing Branches Or Pull Requests

- 기존 branch chain은 먼저 bottom-to-top linear ancestry와 예상 PR base를 확인한 뒤 adopt한다.
  - `git merge-base --is-ancestor <lower-branch> <upper-branch>`
  - `gh stack init --base main <bottom-branch> <next-branch> ... <top-branch>`
  - `gh stack view --json`
- 기존 열린 PR이 있으면 안전한 대화형 `gh stack submit`에서 기존 PR 연결과 변경될 base/Ready
  상태를 확인한다. 기존 PR의 title/body는 editor에서 잠기므로 필요하면 별도 `gh pr edit`이나
  GitHub UI에서 명시적으로 수정한다. `gh stack submit --auto`를 기본값으로 쓰지 않는다.
- submit 후에는 각 PR의 base/head/stack과, 2-layer 이상이면 원격 Stack 객체를 다시 확인한다.
  기존 PR base만 맞췄다고 adopt가 끝난 것은 아니다.

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

- branch만 원격에 올릴 때는 `gh stack push`를 사용한다. 이 명령은 PR이나 원격 Stack 객체를
  만들지 않는다.
- PR은 `gh stack submit`으로 생성하거나 갱신한다. 2-layer 이상이면 이 명령이 원격 Stack 객체도
  함께 생성하거나 갱신해야 한다.
  - 기본은 대화형 editor에서 PR별 한국어 제목, 본문, Draft/Ready 상태, 포함 범위를 확인한다.
  - 검증이 끝난 PR은 repository Ready 정책에 맞게 Ready로 제출한다.
  - `--open`은 Stack의 새 PR과 기존 PR을 모두 Ready로 바꾸려는 의도가 명확할 때만 쓴다.
  - `--auto`는 editor를 생략하고 자동 제목과 더 넓은 PR 변경을 적용할 수 있으므로 기본값으로
    쓰지 않는다.
- PR 본문에는 Stack 위치를 명시한다.
  - `Stack: main -> <parent-branch> -> <this-branch>`
- submit 직후 다음을 확인한다.
  - `gh stack view --json`
  - `gh pr view <branch-or-pr-number> --json number,title,headRefName,baseRefName,isDraft,state,url`
  - `gh api "repos/{owner}/{repo}/pulls/<number>" --jq '{base:.base.ref,head:.head.ref,stack:.stack}'`
  - 2-layer 이상이면 `gh api "repos/{owner}/{repo}/stacks?pull_request=<number>"`로 원격 Stack
    객체와 bottom-to-top branch order
- 1-layer PR의 REST `stack: null`은 공식 API의 정상 표현이다. 이 경우 local 1-layer tracking과
  `gh stack submit` 생성 경로는 보고하되 원격 Stack 객체가 생성됐다고 주장하지 않는다.
- `gh stack submit`이 실패하면 부분적으로 생성·수정된 PR, branch push, auto-merge/Draft 상태를
  조회해 보고하고 멈춘다. `gh pr create`나 ordinary unstacked PR fallback으로 나머지를 만들지
  않는다.

## Edit A PR

- 열린 PR의 제목, 본문, Draft/Ready 상태 같은 Stack 구조와 무관한 변경에는 일반 `gh pr` 명령을
  사용할 수 있다.
- PR base나 Stack 순서를 바꿀 때는 `memory/git-stack-maintenance.md`의 `gh stack` restructure와
  submit 절차를 따른다. `gh pr edit --base`만 실행하고 Stack 변경이 끝났다고 주장하지 않는다.
- PR 본문 형식은 `memory/pr-writing.md`를 따른다.
- Ready for review로 전환하기 전에는 현재 HEAD가 정상 동작하고 PR 범위가 리뷰 가능한 단위인지
  다시 확인한다.

## Merge And Closeout

- merge 직전에 PR head SHA, base, checks, merge state와 unresolved review thread를 새로 조회한다.
- Stack merge는 `gh stack merge` 또는 GitHub Stack UI/API의 bottom-up merge 흐름을 사용한다.
- stacked PR에는 기존 PR auto-merge를 사용할 수 없으므로 Stack 생성 과정에서 auto-merge가
  해제되면 반드시 보고한다. 일반 auto-merge 해제를 merge나 queue 등록으로 표현하지 않는다.
- merge queue를 사용하는 repository에서는 Stack이 함께 queue에 들어가도 각 PR이 별도 group으로
  처리될 수 있다. queue 등록은 merge 완료가 아니며, 각 PR의 `state: MERGED`, `mergedAt`,
  `mergeCommit.oid`를 다시 확인한다.
