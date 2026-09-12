# Review Style Memory

## Purpose

- kosmo PR을 리뷰하거나 기존 리뷰에서 컨벤션을 추출할 때 이 메모를 적용한다.
- 리뷰는 한국어로 작성한다.
- 자동 생성 PR 본문보다 사람이 직접 남긴 review comment, review summary, resolved thread를 더 신뢰한다.
- 이 파일은 리뷰 규칙의 진입점이다. 현재 review mode에 직접 적용되는 주제 파일만 선택해 처음부터 끝까지 읽는다.

## Topic Routing

- 동작 영향, readiness와 수정 책임: [`review/posture.md`](review/posture.md)
- domain input, 공통 진입점과 layer ownership: [`review/ownership.md`](review/ownership.md)
- side effect, scope/follow-up와 spec reachability: [`review/side-effects.md`](review/side-effects.md)
- finding 근거와 production 도달성: [`review/evidence.md`](review/evidence.md)
- comment 형식, priority와 결론: [`review/comments.md`](review/comments.md)
- review thread 확인·응답·resolve와 merge 전 정리: [`review-thread.md`](review-thread.md)

리뷰 코멘트는 한국어로 작성하고, 선택한 주제 외의 전체 review 문서를 기본으로 읽지 않는다.
