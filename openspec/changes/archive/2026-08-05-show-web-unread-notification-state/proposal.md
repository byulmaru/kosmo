## Why

현재 Web 알림 목록은 읽음과 미확인 항목을 시각적으로 구분하지 않아, 전역 알림 인디케이터가 남아 있는 이유를 사용자가 목록에서 확인하기 어렵다. PROD-680은 기존 Read와 Unread count 계약을 유지하면서 미확인 항목의 상태를 목록 안에서 분명하게 드러낸다.

## What Changes

- Web 알림 목록의 미확인 행에 불투명한 `primary` 좌측 상태선과 `primary` 30% alpha 배경을 표시한다.
- 읽음 행과 미확인 행이 상태 전환 전후에 같은 콘텐츠 정렬을 유지한다.
- Web pointer hover는 기존 `surface` 피드백을 유지하고, 미확인 상태선은 hover 중에도 남긴다.
- 기존 접근성 Unread 설명과 activation 시 Read mutation, 성공 payload의 Relay 정규화 및 전역 인디케이터 수렴을 그대로 사용한다.
- 목록 진입·가시성 기반 자동 Read, 전체 읽음, 모바일 UI, API·schema와 컬러 토큰 전면 리팩터링은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/colors.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-680`
- Linear Implementations: `PROD-680`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: selected Profile의 Web 알림 목록에서 미확인 행을 시각적으로 구분하고 기존 Read·Unread count 상태와 함께 수렴하는 요구사항을 추가한다.

## Impact

- `openspec/specs/notification/spec.md`의 Web 목록 표시 계약에 delta가 적용된다.
- `apps/app`의 공용 Notification row Web 스타일, theme의 `primary` alpha 파생값과 가장 가까운 Storybook interaction 검증이 영향받는다.
- GraphQL API, Relay fragment·mutation payload, 서버 데이터 모델, 의존성 및 Native 동작은 변경되지 않는다.
