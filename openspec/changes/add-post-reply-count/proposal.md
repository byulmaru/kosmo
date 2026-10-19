## Why

게시글에 답글이 있어도 현재 Reply 아이콘에는 숫자가 연결되지 않아 답글의 존재와 규모를 알기 어렵다.
기존 공용 숫자 UI를 활용해 집계부터 화면 표시, 변경 후 갱신까지 함께 제공한다.

## Goal

현재 viewer가 조회할 수 있는 직접 Reply 수를 공용 Post Action Bar에 표시하도록 PROD-1152의 구현·검증
계획을 정리한다. 이번 Spec 세션의 산출물은 canonical 문서, 이 계획과 다음 구현 세션 handoff다.

## What Changes

- 새 capability `post-reply-count`: 직접 Reply 집계, 0 생략, 공용 화면 표시와 작성·삭제 후 동기화.
- Home·Local·Profile·Bookmarks 목록, 상세/스레드와 Media Viewer에 같은 의미를 적용한다.
- 본인 작성·삭제는 서버 확정 뒤 갱신하고, 다른 사용자·원격 변경은 재조회 시 반영한다.

## Non-Goals

- 이번 세션의 제품 구현, 실행 테스트, push·PR 생성과 배포.
- 전체 하위 Reply 집계, 원격 미수신 답글 수집·관계 복구·backfill, 실시간 구독.
- Repost·Reaction count 변경, 숫자 전용 클릭 동작·새 route, 측정 근거 없는 영속 counter 도입.
- PROD-466의 기존 traversal 전체 개선이나 다른 OpenSpec의 미완료 작업.

## Constraints

- Visibility·Eligibility는 Reply마다 독립적으로 적용하며 조회 불가 Reply의 존재를 숫자로 노출하지 않는다.
- Reply+Quote는 Reply로 포함하고, Quote의 Source로 Reply identity를 평탄화하지 않는다.
- 기존 Reply disabled·expanded·인증 위임, compact 포맷·target과 actor Store 경계를 유지한다.
- OpenSpec은 현재 합의를 실행하기 위한 수정 가능한 작업 메모이며 제품 요구사항을 추가하지 않는다.

## Verification

- DB/GraphQL 실행으로 직접·간접 Reply, viewer별 권한과 여러 Parent의 batch 집계를 확인한다.
- UI/Relay 실행으로 전체 적용 화면, 0·큰 숫자·실패, 작성·삭제와 actor 전환을 확인한다.
- SDL·Relay compiler·타입·집중 테스트를 다음 구현/검증 세션에 수행한다. 실제 Native 검증은 별도로 기록한다.
- 이번 세션은 문서 형식·계약 보존과 OpenSpec strict validation만 수행한다.

## Business Context

- Product canonical: `docs/domain/objects/post.md`, Accepted `docs/domain/decisions/0014-post-structure-relations.md`.
- Visual design source: `docs/design/post-action-bar.md`의 표현·접근성·기존 target 계약.
- Linear: [PROD-1152](https://linear.app/byulmaru/issue/PROD-1152).
- User agreement: 2026-10-19 이 대화에서 직접 Reply, 현재 viewer 조회 범위, 0 생략, 전체 공용 화면과 재조회 기준을 각각 선택했다.

## Session Status

- Status: Active
- Last updated: 2026-10-19
