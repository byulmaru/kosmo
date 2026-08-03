## Why

Byulmaru ID Account Settings로 이동하는 외부 진입점(PROD-645)과 Kosmo 내부 Profile 설정(PROD-648)이 들어갈
공통 route와 정보 구조가 없어 각 결과가 서로 다른 설정 표면을 만들거나 지원 navigation surface를 빠뜨릴 수
있다. 인증 사용자가 모든 지원 플랫폼에서 하나의 설정 hub에 진입하고 외부 Account 서비스와 내부 Profile
기능의 소유 경계를 명확히 구분할 수 있는 공통 shell이 필요하다.

## What Changes

- 인증된 universal client에 canonical `/settings` route와 공통 settings page shell을 추가한다.
- full Web sidebar, compact Web icon rail, mobile Web·Android·iOS drawer에 `설정` 진입점과 page-current
  semantics를 제공하되 하단 탭 바와 우측 레일에는 중복하지 않는다.
- 페이지에 단일 `설정` heading을 두고 Byulmaru ID Account 외부 진입점과 Kosmo Profile 내부 content를 평면
  행 구조로 이 순서에 배치한다. 독립된 section heading·소유자 label·설명 block은 반복하지 않고 실제 행의
  label·이동 동작·접근성 이름에서 소유 경계를 구분한다.
- Kosmo 내부 Account 설정 route·UI·데이터 조회·입력·저장을 만들지 않는다. Account 진입점은 Byulmaru ID의
  canonical Account Settings 페이지로 이동하며 Web은 HTTPS external navigation, Android·iOS는 시스템
  브라우저 또는 승인된 external link flow를 사용한다.
- Profile identity·Profile 기능의 loading·error·empty 상태와 section-level 복구 경계를 정의하고 다른
  Profile의 값을 fallback으로 표시하지 않는다. Account 진입점을 Account 데이터 상태로 모델링하지 않는다.
- PROD-645의 Account 외부 진입점과 PROD-648의 Profile 내부 설정을 같은 route에 배치한 뒤 Web·Android·iOS와
  keyboard·screen reader·작은 화면에서 소유 경계와 페이지 수준 통합을 검증한다.
- PROD-645의 canonical URL·플랫폼별 외부 이동·실패 복구와 PROD-648의 데이터·저장 계약은 재정의하지 않고,
  PROD-653은 정보 구조·공통 shell·페이지 통합과 change 정합성 확인·archive만 소유한다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`,
  `docs/design/page-header.md`
- Linear Contract: `PROD-653`
- Linear Implementations: `PROD-653`이 route·공통 shell·navigation·소유 경계·페이지 통합 검증과 이
  change의 archive를 소유한다. `PROD-645`는 Byulmaru ID Account 외부 진입점·navigation을, `PROD-648`은
  Kosmo Profile 기능 구현·검증을 소유하며 둘 다 PROD-653 완료의 통합 dependency다.

## Capabilities

### New Capabilities

- `settings-page-shell`: `/settings` route, surface별 navigation, Byulmaru ID Account 외부 진입점/Kosmo Profile
  내부 설정의 정보 구조, Profile 상태와 페이지 수준 통합 검증 계약

### Modified Capabilities

- `universal-expo-client`: Android·iOS·Web이 공유하는 지원 route parity에 `/settings`를 추가한다.
- `web-app-shell`: 유효한 세션이 필요한 앱 내부 route 목록에 `/settings`를 추가해 기존 보호 route guard를
  적용한다.

## Impact

- `docs/design/settings.md`, `docs/design/breakpoints.md`, `docs/design/page-header.md`
- `apps/app/src/app/(tabs)/(protected)`의 Expo Router settings route와 공통 React Native 화면
- `apps/app/src/components/shell`의 sidebar·drawer navigation, mobile Web header와 route active 상태
- settings page와 shell의 component/unit test, React Native Web Storybook 상태, Web navigation 회귀 검증
- PROD-645 Account 외부 진입점과 PROD-648 Profile 내부 기능을 배치할 section integration boundary
- Account 설정 UI·데이터 조회·입력·저장, GraphQL schema, DB, Relay mutation/cache, Byulmaru ID 외부 링크
  동작과 Profile 공개 범위 저장 계약에는 영향이 없다.
