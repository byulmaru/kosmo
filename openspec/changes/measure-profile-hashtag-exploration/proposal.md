## Why

PROD-556의 지표·session 계약은 승인됐지만 현재 checkout에는 이전 spec 산출물이 없다.
승인된 계약과 최신 PostHog 상태를 다시 연결해 구현자가 이벤트와 dashboard를 같은 기준으로 검증할 수 있게 한다.

## Goal

주간 Hashtag 탐색 사용률, 결과 선택률, Empty·Error 비율을 재현할 구현 범위와 검증 계획을 준비한다.
이번 세션은 spec과 handoff를 작성하고, 구현은 다음 세션에서 수행한다.

## What Changes

- Linear에 남아 있는 승인 내용을 canonical 정책과 기록으로 복원한다.
- TagChip 진입, 첫 목록 결과, 재시도·추가 로드·선택·Account 전환의 관측 경계를 정리한다.
- session property를 `profile_tag_exploration_session_id`로 명명하고, 확인된 opaque Hashtag identity를
  `hashtag_id`로 수집·검증한다. 향후 Hashtag별 분석에 쓸 원천 자료를 보존하도록 한 2026-09-22 사용자 변경이다.
- PostHog Insight·dashboard, 합성 자료 대조와 실제 수집 확인을 PROD-556의 전달 범위로 묶는다.

## Non-Goals

탐색 UX·API·DB 변경, Post Hashtag 계측, Native SDK, PROD-557 전환 지표, 과거 이벤트 호환성,
Replay 재활성화·Cloud 설정·배포, 다른 지표의 계약과 공유 OpenSpec 정리는 포함하지 않는다.

## Constraints

- production Web·인증 Account, Asia/Seoul 월요일 주차와 승인된 WAA를 적용한다.
- raw Hashtag text·이름·검색어·Profile 정보는 custom property에 추가하지 않는다. 새 allowlist는
  `profile_tag_exploration_session_id`, `hashtag_id`와 필요한 고정 분류값이며 표준 SDK metadata·identify/reset을 유지한다.
- opaque Hashtag identity의 연결 가능성과 수집 필요성을 기록한다. SDK 식별 실패는 mock/stub으로 검증하고
  귀속 한계를 보고하며 fail-open을 강화하거나 별도 identity recovery system을 만들지 않는다.
- main의 Replay 비활성화를 유지한다. PROD-741의 재활성화 범위와 PROD-795·575의 운영 책임을 가져오지 않는다.
- OpenSpec은 수정 가능한 작업 메모다. canonical·Linear에 없는 제품 요구사항이나 영구 구현 규칙을 만들지 않는다.

## Verification

Session 경계, 첫 결과·재시도 우선순위, 선택 중복, 주 경계, 분모 0, payload와 fail-open을 실행으로 검증한다.
고정 합성 자료의 손계산 값과 실제 PostHog 집계를 대조하고, Hashtag identity의 안정성과 원문 비포함을 확인한다.
Account 전환의 reset·identify 실패는 capture 당시 SDK identity로 검증하고, 운영 인수는 실제 선행 증거 뒤 마친다.
Hashtag별 Insight·dashboard의 추가 소유권은 사용자 결정 대기이며 ID 계측·검증은 이미 PROD-556 범위다.

## Business Context

- Canonical: `docs/domain/policies/profile-hashtag-exploration-analytics.md`, ADR 0020·0021, `docs/design/hashtag-related-profiles.md`.
- Linear: [PROD-556](https://linear.app/byulmaru/issue/PROD-556), [PROD-555](https://linear.app/byulmaru/issue/PROD-555), [PROD-795](https://linear.app/byulmaru/issue/PROD-795), [PROD-741](https://linear.app/byulmaru/issue/PROD-741).
- User agreement: PROD-556의 2026-09-03 승인 댓글 `88fa293a-616e-47d5-81fa-ede269ce3c3a`; 이번 spec workflow 명시 호출과 2026-09-22 Review Packet 수정 요청.

## Session Status

- Status: Active
- Last updated: 2026-09-22
