## Why

첫 Profile에 저장한 태그를 실제 사람 찾기와 연결해 태그를 등록한 뒤 무엇을 할 수 있는지 보여 준다.

## Goal

PROD-1147의 태그별 Profile 탐색과 개별 팔로우·요청 흐름을 구현 세션에 인계한다. 승인된 구현을 Draft PR로 전달하고 CI 검증으로 인계한다.

## What Changes

- 첫 Profile에 실제 저장한 태그별 관련 Profile 목록을 선택해 보고, 각 Profile에서 명시적으로 팔로우한다.
- 같은 Profile의 팔로잉·요청 중 상태를 여러 태그 목록에서 일관되게 표시한다.
- 태그 없음, 결과 없음, 팔로우하지 않음, 조회 실패 상태에서도 후속 흐름으로 진행할 수 있도록 연결한다.

## Non-Goals

첫 Profile 입력·생성의 재구현, 추천·랭킹·동의어·새 검색 문법, 자동·일괄 팔로우, 기존 사용자용 태그 진입점 개선, 홈 Coachmark와 알림 설정 구현은 포함하지 않는다. 공개 콘텐츠 출발 위치 전달·자동 복귀는 최신 PROD-836 결정에 따라 제외한다.

## Constraints

- 저장되지 않은 태그 초안을 사용하지 않고 canonical Hashtag identity와 기존 조회·팔로우 정책을 따른다.
- 조회 오류를 태그 없음이나 완료된 팔로우로 바꾸지 않는다. 로딩·오류 중 태그 맥락과 이미 확인한 목록을 유지한다.
- 본인 Profile을 숨기거나 뮤트 대상 조회 정책을 새로 정하지 않는다. 기존 후보·표시 규칙을 재사용한다.
- PROD-1146은 아직 병합되지 않은 선행 작업이다. 구현 전 최신 계약·PR과 첫 Profile 완료 연결부를 다시 확인한다.

## Verification

실제 저장 태그 사용, 여러 태그 간 동일 Profile 상태 동기화, Open·Approval Required 결과, 실패·재시도, 페이지 추가 조회, 빈 상태와 무행동 진행을 검증한다. 기존 Profile 보유자의 일반 진입, 공개 조회와 자동 참여 실행 금지도 회귀 확인한다. Web·iOS·Android 검증 증거는 각각 기록한다.

## Business Context

- Product canonical: `docs/domain/policies/first-profile-tag-discovery.md`, `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/domain/policies/public-content-onboarding.md`. 선행 PROD-1146의 `docs/domain/policies/first-profile-onboarding.md`는 PR #1254 기준이며 아직 main에 없다.
- Visual design source: `docs/design/first-profile-tag-discovery.md`, `docs/design/profile-tags.md`, `docs/design/hashtag-related-profiles.md`, `docs/design/accessibility.md`. 선행 첫 Profile 화면은 PR #1254의 `docs/design/first-profile-onboarding.md`를 참조한다.
- Linear: [PROD-1147](https://linear.app/byulmaru/issue/PROD-1147), [PROD-1146](https://linear.app/byulmaru/issue/PROD-1146), [PROD-681](https://linear.app/byulmaru/issue/PROD-681), [PROD-836](https://linear.app/byulmaru/issue/PROD-836), [PROD-1148](https://linear.app/byulmaru/issue/PROD-1148).
- User agreement: 2026-10-23 `kosmo-spec-workflow PROD-1147` 요청. 첫 코스모 Profile을 만든 사용자 모두에게 적용한다는 사용자 선택을 반영했다. 완료 방식별 추가 분기는 두지 않고 실제 저장 태그를 사용한다는 기존 PROD-1147 계약을 PR #1254의 단계별 저장 구조에 맞춘다.

## Session Status

- Status: Active
- Last updated: 2026-10-23
