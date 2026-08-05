## Why

Kosmo의 `/settings`에는 Byulmaru ID가 소유한 Account Settings로 이동할 수 있는 명확한 외부 링크 진입점이
필요하다. Account 관리 기능을 Kosmo에 중복 구현하지 않고, 사용자가 실제 소유 서비스로 이동할 수 있어야
한다.

## What Changes

- `/settings`의 Account 위치에 시각 label `계정 설정`인 평면 행을 제공한다.
- 행은 `Byulmaru ID Account Settings 외부 서비스로 이동` accessible name과 canonical
  `https://id.byulmaru.co` destination으로 소유권과 외부 이동 의미를 전달한다.
- Web·Android·iOS 모두 Expo Router의 실제 external `Link`를 사용한다. 브라우저 또는 OS가 navigation을
  소유하며, Kosmo는 URL 지원 확인, navigation 성공·실패, loading·error·retry·lock 상태를 소유하지 않는다.
- 실제 외부 링크 행에만 chevron을 표시하고, Kosmo 내부 Account route·UI·데이터 상태를 만들지 않는다.
- unit test와 Storybook은 실제 이동을 실행하지 않고 label·link semantics·exact href·chevron·focus-visible
  및 browser 기본 링크 증거를 검증한다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/accessibility.md`
- Linear Contract / Child: `PROD-645`
- Linear Integration and page-level verification: `PROD-685` (Backlog)
- Linear Final Settings integration and OpenSpec completion/archive owner: `PROD-684` (Backlog)
- Predecessor information-architecture artifact: `PROD-653` (completed; not active integration/archive owner)

## Capabilities

### New Capabilities

- `byulmaru-id-account-settings-entry`: Byulmaru ID Account Settings의 canonical 외부 URL, 소유권을 드러내는
  label·accessible name과 모든 플랫폼의 external Link semantics

### Modified Capabilities

없음.

## Impact

- `apps/app`의 settings Account 행과 Expo Router external Link 접근성 계약
- Account 외부 링크의 정적 unit test와 React Native Web Storybook catalog
- `PROD-685`가 소유하는 production `/settings` route/navigation, PROD-645·PROD-667 child 조립 및
  page-level 검증의 통합 입력
- `PROD-684`가 소유하는 최종 Settings 통합 및 OpenSpec 완료/archive 판단
- GraphQL, DB, Relay Account 데이터 계약과 Kosmo 내부 Account route에는 변경 없음
