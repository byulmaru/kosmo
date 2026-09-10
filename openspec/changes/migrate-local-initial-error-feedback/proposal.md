## Why

저장된 성공 목록이 없는 Local Timeline 최초 조회 실패는 현재 인라인 `StateView`로 표시되어 Figma의
플랫폼별 Target과 다르다. PROD-939는 Web의 빈 목록 영역과 Native의 2행 skeleton 위에 공용 persistent
Danger Toast를 표시하는 복구 경로를 전달한다.

## What Changes

- 최초 Local 조회 실패에서 Web은 빈 목록 영역을, Native는 2행 skeleton을 표시한다.
- 두 플랫폼 모두 공용 persistent Danger Toast로 오류 문구와 `다시 시도` action을 제공한다.
- 재시도·성공·route 이탈·selected Profile 전환에 맞춰 Toast를 정리하고 중복 재시도를 막는다.
- 기존 새로고침, 부분 GraphQL 응답, pagination, cursor, filtering과 Home 동작은 유지한다.
- Storybook·동작 테스트와 디자인 문서의 Current/Target 기록을 구현 결과와 정렬한다.

## Authority / Provenance

- Canonical: `docs/design/local-timeline.md`, `docs/design/accessibility.md`, Figma Mobile `4665:4855`, Figma Web `5560:13625`
- Linear Contract: `PROD-939`
- Linear Implementations: `PROD-939`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Local Timeline 최초 조회 실패의 플랫폼별 표시와 persistent Toast 복구 lifecycle을 변경한다.

## Impact

- `apps/app`의 Local route 오류 fallback, 공용 Toast 소비, `ToastProvider` action guard와 단위·Storybook·E2E 검증
- `docs/design/local-timeline.md`의 플랫폼별 Target·Current 기록
- GraphQL schema·query·Relay connection, API와 새 dependency에는 영향 없음
