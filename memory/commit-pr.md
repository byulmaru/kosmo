# Commit And PR Memory

## Purpose

- 커밋, 브랜치, PR 또는 stacked PR 작업을 할 때 적용하는 짧은 라우터다.
- 현재 작업에 필요한 세부 문서만 추가로 읽는다. 커밋 정책, GitHub 운영, PR 작성과 Stack 유지보수는 각 canonical 문서가 소유한다.

## Routing Rules

- 작업 시작 전에 사용자의 명시된 의도와 `git status --short --branch`를 확인한다. 이미 의도가 정해졌다면 다시 묻지 않는다.
- 이슈·브랜치·PR 범위와 소유권을 바꾸는 선택, 공개 결과·보안·롤아웃·되돌릴 수 없는 원격 상태를 바꾸는 선택만 사람 결정 경계로 올린다. 현재 요청과 기존 canonical contract 안의 routine 선택은 계속 진행한다.
- 새 PR은 단일 PR이어도 공식 `github/gh-stack`의 1-layer Stack으로 만들고 `gh stack submit`으로 생성·갱신한다. `gh stack`이 실패하면 일반 `gh pr create`나 unstacked PR로 우회하지 않는다.
- 의도하지 않은 사용자 변경을 staging하지 않는다. 변경의 scoped 결과, 필요한 검증과 수정까지 끝낸 뒤 보고한다.

## Load By Task

- 커밋 단위, staging 범위, 메시지: [`commit-policy.md`](commit-policy.md)
- 브랜치, push, PR 생성·수정, merge와 Stack 상태: [`git-pr-workflow.md`](git-pr-workflow.md)
- rebase, reparent, squash merge 이후 Stack 유지보수: [`git-stack-maintenance.md`](git-stack-maintenance.md)
- PR 범위, 한국어 제목·본문, Draft/Ready: [`pr-writing.md`](pr-writing.md)
- 리뷰 thread 처리: [`review-thread.md`](review-thread.md)
- 리뷰 코멘트와 결론 형식: [`review-style.md`](review-style.md)

세부 문서를 읽을 때는 해당 파일을 처음부터 끝까지 읽는다. PR 본문은 한국어로 쓰며, agent `Co-authored-by` trailer는 커밋이나 설명에 넣지 않는다.
