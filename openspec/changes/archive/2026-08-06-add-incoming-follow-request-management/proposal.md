## Why

Follow Request의 pending-only 저장·GraphQL 처리 계약은 이미 제공되지만, App에는 현재 선택한 Profile이 받은 요청을 확인하고 승인·거절할 화면이 없다. 그 결과 실제 화면 없이 `/menu` placeholder로 향하던 반응형 내비게이션 진입점도 임시로 숨겨져 있으므로, 관리 화면과 준비된 화면으로 향하는 shell 진입점을 하나의 완료 계약으로 전달해야 한다.

## What Changes

- protected canonical route `/follow-requests`에 공통 `PageHeader`를 사용하는 받은 팔로우 요청 화면을 추가한다.
- 현재 선택한 Profile의 `incomingProfileFollowRequests`를 loading, empty, error와 자동 pagination 상태로 표시한다.
- 각 요청 행에서 승인·거절을 처리하고, 서버 성공 후 삭제된 request ID로 현재 connection을 정리하며 실패 시 행과 재시도를 유지한다.
- unavailable requester가 있는 요청도 숨기지 않고 fallback 행과 거절 동작을 제공한다.
- Profile 전환 시 이전 actor의 요청, pending, error와 Relay cache state가 새 Profile에 섞이지 않게 한다.
- 화면이 준비된 뒤 full Web sidebar, compact Web rail과 mobile Web drawer에 `UserRoundPlus` 진입점을 복원한다.
- mobile bottom tab과 generic `/menu` placeholder는 복원하지 않으며 Follow Request API·저장 모델·알림 전달 계약은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/page-header.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`
- Linear Contract: [PROD-272](https://linear.app/byulmaru/issue/PROD-272), [PROD-566](https://linear.app/byulmaru/issue/PROD-566)
- Linear Implementations: [PROD-566](https://linear.app/byulmaru/issue/PROD-566), [PROD-654](https://linear.app/byulmaru/issue/PROD-654)
- Linear Completion: [PROD-668](https://linear.app/byulmaru/issue/PROD-668)
- Deferred Non-blocking Native QA: [PROD-699](https://linear.app/byulmaru/issue/PROD-699)

## Capabilities

### New Capabilities

- `profile-follow-request-management`: 선택한 Profile이 받은 pending Follow Request를 전용 화면에서 조회하고 승인·거절하는 UI, 상태, cache와 접근성 계약

### Modified Capabilities

- `web-app-shell`: 관리 화면이 제공된 이후 full Web sidebar, compact Web rail과 mobile Web drawer가 동일한 `/follow-requests` route를 노출하도록 기존 임시 비노출 계약을 확장

## Impact

- `apps/app`의 Expo Router protected route, Relay pagination fragment와 mutations, 요청 목록·행 UI, 공통 `PageHeader` 소비가 영향받는다.
- shared shell navigation, Shell Storybook과 관련 component/Web E2E 검증이 영향받는다.
- PROD-668 completion slice는 기존 두 구현 slice를 연결하는 Web E2E, Web runtime 검증과 OpenSpec 정합·archive만 변경한다.
- 기존 `Profile.incomingProfileFollowRequests`, `approveProfileFollowRequest`, `rejectProfileFollowRequest` GraphQL 계약을 그대로 사용한다.
- API schema, core service, DB schema·migration과 새 dependency 변경은 없다.
