# Commit And PR Memory

## Purpose

- 커밋, 브랜치, PR, stacked PR 작업을 시작할 때 항상 먼저 읽는 짧은 라우터다.
- 세부 절차는 작업 상황에 맞는 하위 메모리만 추가로 읽는다.
- 기본 도구는 Git CLI와 GitHub CLI(`gh`)다.

## Always Apply

- AI로 작업을 시작할 때는 사용자의 의도를 먼저 물어보고, 이미 대화에 명확히 드러난 의도가 있으면 그 의도를 작업 맥락으로 기록한다.
- 커밋/브랜치/PR 작업 전 `git status --short --branch`로 현재 위치와 변경 범위를 확인한다.
- 브랜치 이름은 관련 Linear 이슈 ID를 그대로 사용한다.
- 하나의 브랜치는 하나의 Linear 이슈에 대응시키는 것을 기본으로 한다.
- 커밋은 되돌릴 수 있는 작업 체크포인트로 자주 남기되, 의도하지 않은 사용자 변경은 staging하지 않는다.
- PR은 리뷰어가 독립적으로 이해하고 검증할 수 있는 하나의 기능적 변화만 담는다.
- stacked PR의 리뷰 순서는 GitHub PR의 `baseRefName`/`headRefName`과 로컬 Git ancestry가 함께 결정한다.
- PR 제목과 본문은 한국어로 작성한다.
- PR 제목에는 `[codex]` 같은 agent/tool 출처 prefix를 넣지 않는다.
- PR 제목과 본문은 작업 시작 시 확인한 사용자 의도를 반영한다.
- PR 본문은 `무엇을 변경했는지`, `왜 변경했는지`, `이번 PR의 주요 결정`, `어떻게 확인할 수 있는지`, `아직 어떤 문제가 남았는지` 순서를 기본으로 한다.
- AI는 계획·구현 중 사람이 확정한 주요 결정과 이유를 PR 본문으로 정리할 수 있지만, 불명확한 내용을 새
  결정처럼 추론하지 않는다.
- unresolved review thread는 merge 전 남기지 않는다.
- agent `Co-authored-by` trailer는 커밋 메시지나 PR 설명에 쓰지 않는다.

## Load More When Needed

- staging 범위, 커밋 단위, 커밋 메시지를 판단해야 하면 `memory/commit-policy.md`를 읽는다.
- 새 브랜치, 커밋, push, PR 생성/수정, 기본 stacked PR 작업을 해야 하면 `memory/git-pr-workflow.md`를 읽는다.
- 부모 브랜치 rewrite, squash merge 이후 자식 PR 이어가기, reparent, force-push가 필요하면 `memory/git-stack-maintenance.md`를 읽는다.
- PR 제목, 본문, Draft/Ready 전환, 한국어 작성 형식을 다뤄야 하면 `memory/pr-writing.md`를 읽는다.
- 리뷰 스레드를 처리하거나 merge 전 unresolved thread를 정리해야 하면 `memory/review-thread.md`를 읽는다.
- 리뷰 코멘트를 작성하는 업무라면 `memory/review-style.md`도 함께 읽는다.

## Minimum Checklist

- 현재 브랜치가 `main`이 아닌 적절한 작업 브랜치인가.
- 브랜치 이름이 대응되는 Linear 이슈 ID와 일치하는가.
- PR이 하나의 기능적 변화로 설명되는가.
- 독립적으로 테스트하거나 수동 검증할 수 있는가.
- 제목이 구현 방식이 아니라 PR의 의도와 달성하려는 결과를 설명하는가.
- 제목과 본문이 한국어로 작성되어 있는가.
- 본문에 변경 내용, 변경 이유, 사람이 소유한 주요 결정 또는 새 결정이 없다는 명시, 확인 방법, 남은 문제가 정리되어 있는가.
- Draft가 아니라면 현재 HEAD가 정상 동작하는가.
