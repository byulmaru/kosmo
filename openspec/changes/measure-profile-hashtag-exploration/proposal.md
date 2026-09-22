## Why

PROD-556의 승인된 지표·session 계약을 복원했고, 사용자가 opaque Hashtag ID 수집과 Hashtag별 탐색 성과
breakdown을 이번 범위로 확정했다. 구현자가 같은 기준으로 계측과 dashboard를 검증할 수 있게 한다.

## Goal

전체 주간 사용률·결과 선택률·Empty/Error 비율과 Hashtag별 다섯 탐색 성과 지표·주간 추세를
재현할 구현 범위와 검증 계획을 준비한다.
이번 세션은 spec과 handoff를 작성하고, 구현은 다음 세션에서 수행한다.

## What Changes

- Linear에 남아 있는 승인 내용을 canonical 정책과 기록으로 복원한다.
- TagChip 진입, 첫 목록 결과, 재시도·추가 로드·선택·Account 전환의 관측 경계를 정리한다.
- session property를 `profile_tag_exploration_session_id`로 명명하고, 확인된 opaque Hashtag identity를
  `hashtag_id`로 수집·검증한다. 이번 Hashtag별 성과 분석에 필요한 원천 자료를 보존한다.
- 기존 전체 네 비율과 `hashtag_id`별 distinct 탐색 Account 수·탐색 session 수·결과 선택률·Empty 비율·Error 비율 및 주간 추세를 PostHog Insight·dashboard로 전달한다. 합성 자료와 실제 breakdown 재현을 검증한다.

## Non-Goals

탐색 UX·API·DB 변경, Post Hashtag 계측, Native SDK, PROD-557 전환 지표, 과거 이벤트 호환성,
Replay 재활성화·Cloud 설정·배포, 다른 지표의 계약과 공유 OpenSpec 정리는 포함하지 않는다.
Hashtag별 도달률, TagChip impression, 노출→탐색 funnel은 후속 후보이며 이번 계측이나 완료 조건에 추가하지 않는다.

## Constraints

- production Web·인증 Account, Asia/Seoul 월요일 주차와 승인된 WAA를 적용한다.
- Hashtag별 Account 수는 기존 사용률 분자, session 수는 확정 결과 공통 분모를 breakdown한다. 기존 전체
  계산식·session/result/주차/제외 규칙을 유지하고 새로운 도달률이나 impression 이벤트를 만들지 않는다.
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
Hashtag별 합성 기대값과 실제 PostHog Insight·dashboard의 주간 breakdown을 대조한다. ID가 payload에
존재하는 것만으로 완료하지 않으며 raw text/name 추가 없이 재현해야 한다.

## Business Context

- Canonical: `docs/domain/policies/profile-hashtag-exploration-analytics.md`, ADR 0020·0021, `docs/design/hashtag-related-profiles.md`.
- Linear: [PROD-556](https://linear.app/byulmaru/issue/PROD-556), [PROD-555](https://linear.app/byulmaru/issue/PROD-555), [PROD-795](https://linear.app/byulmaru/issue/PROD-795), [PROD-741](https://linear.app/byulmaru/issue/PROD-741).
- User agreement: PROD-556의 2026-09-03 승인 댓글 `88fa293a-616e-47d5-81fa-ede269ce3c3a`; 이번 spec workflow 명시 호출, 2026-09-22 Review Packet 수정 요청과 Hashtag별 breakdown 포함·재검증 조건부 최종 승인.

## Session Status

- Status: Active
- Last updated: 2026-09-22
