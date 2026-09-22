## Why

검색 결과 선택과 이후 Profile 조회·Follow를 연결할 수 없어 탐색 전환율을 계산하기 어렵다. PROD-557의 승인된 계산 계약을 현재 웹 계측에 연결할 구현·검증 계획을 정리한다.

## Goal

검색 결과에서 선택한 대상별 `search_profile_journey_id`를 기준으로, 최초 선택 후 30분 이내의 Profile 조회 또는 Follow 성공을 HogQL canonical 집계로 재현할 수 있게 한다.

## What Changes

- 복원한 canonical 계산 정책에 현재 사용자가 정한 `search_profile_journey_id` 이름과 HogQL canonical 집계를 반영한다.
- 검색 선택, 실제 Profile 표시, Follow 응답과 귀속 종료 경계를 연결할 작업을 정리한다.
- distinct `search_profile_journey_id` 기준의 분모·전체·Profile 조회·Follow 분자와 `6 / 4 / 3 / 2` fixture acceptance를 정리한다.

## Non-Goals

- PROD-520의 전체 북극성 지표, WAA, 추천·랭킹·개인화.
- 검색·Profile·Follow UX, API·DB, Native SDK 또는 공통 PostHog 수집 정책 변경.
- 대상 Profile ID와 그 hash·암호화 대체값 수집, 탭 간 공유와 reload 뒤 복원.
- 이전 이벤트명·property 호환성 보장, PROD-575의 공통 production acceptance, PROD-741의 Replay 검증.

## Constraints

- 같은 검색 결과 맥락에서 같은 대상의 재선택·뒤로가기는 중복 제거한다. 다른 대상은 별도 journey다.
- 유효한 Profile 표시 또는 실제 Follow Relationship 응답만 성공이다. Pending Follow Request와 이후 비동기 승인은 제외한다.
- 최초 선택 후 정확히 30분까지 포함한다. 새 검색, Account·선택 Profile·인증 상태·PostHog session 변경, 탭 종료·전체 reload 중 먼저 발생한 경계에서 새 귀속을 끝낸다.
- 시작 시점·Asia/Seoul로 집계한다. 관측 window가 남으면 잠정치, 분모가 0이면 데이터 없음으로 표시한다.
- `search_profile_journey_id`는 Account·Profile·검색어에서 파생하지 않은 opaque identifier다. custom 귀속의 개인정보 제한과 기존 SDK identity·표준 Search `q`·click/referrer/session metadata 계약을 함께 유지한다.
- canonical 집계는 HogQL이다. PostHog Funnel·dashboard는 필요한 경우 시각화·교차검증에만 사용한다.
- OpenSpec은 수정 가능한 세션 메모다. 승인된 계산 계약의 권위는 canonical·Linear에 있으며, 별도 artifact 승인이나 archive를 구현·PR 완료의 조건으로 추가하지 않는다.

## Verification

단위 테스트로 중복·시간·종료 경계를, 컴포넌트와 웹 통합 테스트로 실제 표시·응답을 확인한다. 동일 테스트 journey를 HogQL로 집계해 분모·전체·Profile 조회·Follow 분자가 정확히 `6 / 4 / 3 / 2`인지 확인한다. 시작일·Asia/Seoul·30분 포함·잠정치·분모 0과 추가 종료 경계도 검증한다. 이번 Spec 세션은 문서 윤문·구조 대조·strict validation만 수행한다.

## Business Context

- Canonical: `docs/domain/policies/search-conversion-analytics.md`.
- Linear: [PROD-557](https://linear.app/byulmaru/issue/PROD-557), 승인 댓글 `ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`.
- User agreement: 2026-09-03 계산 계약·소유권 승인 및 2026-09-22 `search_profile_journey_id` 명명·HogQL canonical 집계·fixture acceptance 수정 지시. 이번 수정 지시는 기존 funnel 중심 검증 문구보다 우선한다.
- 2026-09-22 조회 기준 PROD-819·820·795는 Done이다. 공통 운영 인수의 후속 책임은 PROD-575에 남으며, 이번 지표의 HogQL 집계 검증은 PROD-557이 소유한다.

## Session Status

- Status: Active
- Last updated: 2026-09-22
