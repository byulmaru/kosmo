## Why

홈 헤더의 브랜드 마크와 shell의 홈 navigation 항목은 같은 홈 진입점이지만, 현재 홈에서 다시 실행해도 최신 timeline으로 돌아가는 동작이 없다. `PROD-610`에 따라 모든 Web shell 단계에서 현재 홈 재선택을 document 최상단 이동과 중복 없는 Relay 새로고침으로 통일한다.

## What Changes

- 모바일·compact·full Web의 홈 헤더 브랜드 마크와 shell 홈 navigation 항목을 같은 홈 진입 control로 취급한다.
- 다른 route에서는 기존 홈 forward navigation을 유지하고, 현재 홈에서는 document scroll을 최상단으로 이동한 뒤 현재 Home Relay 데이터를 한 번 다시 요청한다.
- 홈 재선택 새로고침이 진행 중이면 추가 네트워크 요청을 시작하지 않되, 각 실행의 최상단 이동은 유지한다. 완료 또는 실패 뒤의 다음 실행은 새 요청을 한 번 시작하고 이전 요청이 실패했어도 현재 timeline은 유지한다.
- 브랜드 마크의 기존 시각 geometry를 바꾸지 않고 pointer·keyboard·screen reader에서 같은 navigation 결과를 제공한다.
- route 이동, 현재 홈 재선택, 단일 refetch와 Web shell 단계별 접근성 의미를 자동화로 검증한다.
- 다른 현재 route 재선택, PageHeader 시각 규격, Android/iOS Native, GraphQL schema·서버 timeline 정책, subscription과 새 Post prepend 동작은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-610`
- Linear Implementations: `PROD-610`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 현재 홈 진입 control 재실행의 document 최상단 이동, 중복 없는 Home Relay 새로고침과 Web 접근성 동작을 추가한다.

## Impact

- `apps/app/src/components/shell`: 현재 route인 홈 navigation 활성화와 shell-to-route 새로고침 전달
- `apps/app/src/components/PageHeader.tsx`: 기존 브랜드 geometry를 유지하는 접근 가능한 홈 control
- `apps/app/src/app/(tabs)/(protected)/home.tsx`: Home Relay 새로고침과 Relay in-flight dedupe
- `apps/app` 단위 테스트와 `apps/web/e2e`: current-home, 단일 refetch와 mobile·compact·full Web 회귀 검증
- GraphQL schema, 서버, 새 dependency와 migration 변화 없음
