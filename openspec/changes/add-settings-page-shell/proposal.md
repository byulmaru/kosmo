## Why

Byulmaru ID Account Settings로 이동하는 외부 진입점(PROD-645)과 Kosmo 내부 Profile 설정(PROD-667)이 들어갈
공통 route와 정보 구조가 없어 각 결과가 서로 다른 설정 표면을 만들거나 지원 navigation surface를 빠뜨릴 수
있다. 인증 사용자가 모든 지원 플랫폼에서 하나의 설정 hub에 진입하고 외부 Account 서비스와 내부 Profile
기능의 소유 경계를 명확히 구분할 수 있는 공통 shell이 필요하다.

## What Changes

- 인증된 universal client에 canonical `/settings` hub와 내부 detail을 포함한 공통 settings route family를
  추가한다.
- full Web sidebar, compact Web icon rail, mobile Web·Android·iOS drawer에 `설정` 진입점과 page-current
  semantics를 제공하되 하단 탭 바와 우측 레일에는 중복하지 않는다.
- root 목록에 시각 label `계정 설정`인 Byulmaru ID 외부 진입점과 `게시물 기본 공개 범위` 내부 진입점을 직접 배치한다.
  full Web은 일반 RightRail 대신 center+right 폭의 Settings workspace에서 약 320px master와 flexible detail을
  함께 표시하고 Profile detail을 기본 선택한다. compact/mobile/native는 root 목록부터 시작해 내부 detail을
  한 화면씩 열고 back navigation으로 돌아간다.
- master·하위 목록은 container 폭에 맞는 공통 `SettingsItem` 시각 문법을 사용한다. 현재 두 항목만 제공하고
  한 항목짜리 category, 승인되지 않은 미래 placeholder와 범용 registry를 만들지 않는다.
- Kosmo 내부 Account 설정 route·UI·데이터 조회·입력·저장을 만들지 않는다. Account 진입점은 Byulmaru ID의
  canonical Account Settings 페이지로 이동하며 Web은 HTTPS external navigation, Android·iOS는 시스템
  브라우저 또는 승인된 external link flow를 사용한다.
- Profile detail이 Profile identity·loading·error·empty·content와 재시도를 소유하고 다른 Profile의 값을
  fallback으로 표시하지 않는다. Account 진입점을 Account 데이터 상태로 모델링하거나 Profile 오류와 함께
  조립하지 않는다.
- PROD-645의 Account 외부 진입점과 PROD-667의 Profile 내부 설정을 root/detail 구조에 배치한 뒤
  Web·Android·iOS와 keyboard·screen reader·작은 화면에서 소유 경계와 페이지 수준 통합을 검증한다.
- PROD-645의 canonical URL·플랫폼별 외부 이동과 PROD-667의 Profile 데이터·저장 계약은 재정의하지 않는다.
  PROD-685는 production route·navigation·두 child 조립과 page-level 검증을, PROD-684는 최종 Settings 통합과
  이 change의 완료·archive 판단을 소유한다. PROD-653은 완료된 정보 구조 선행 이슈다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`,
  `docs/design/page-header.md`
- Linear Contract: `PROD-685`; predecessor information architecture: `PROD-653`
- Linear Implementations: `PROD-685`가 route·공통 shell·navigation·PROD-645/667 조립과 page-level 검증을
  소유한다. `PROD-645`는 Byulmaru ID Account 외부 진입점을, `PROD-667`은 Kosmo Profile control을 소유하고,
  Backend 계약은 `PROD-648`에 남는다. `PROD-684`는 최종 Settings 통합과 change 완료·archive를 소유한다.

## Capabilities

### New Capabilities

- `settings-page-shell`: `/settings` route family, surface별 navigation, full Web master-detail workspace,
  compact/mobile/native drill-in, Byulmaru ID Account 외부 진입점/Kosmo Profile 내부 설정의 정보 구조와
  페이지 수준 통합 검증 계약

### Modified Capabilities

- `universal-expo-client`: Android·iOS·Web이 공유하는 지원 route parity에 `/settings` route family를 추가한다.
- `web-app-shell`: 유효한 세션이 필요한 앱 내부 route 목록에 `/settings`와 내부 detail을 추가해 기존 보호
  route guard를 적용한다.

## Impact

- `docs/design/settings.md`, `docs/design/breakpoints.md`, `docs/design/page-header.md`
- `apps/app/src/app/(tabs)/(protected)`의 Expo Router settings route와 공통 React Native 화면
- `apps/app/src/components/shell`의 sidebar·drawer navigation, route별 RightRail visibility, mobile Web
  root/detail header와 route active 상태
- settings page와 shell의 component/unit test, React Native Web Storybook 상태, Web navigation 회귀 검증
- PROD-645 Account 외부 진입점과 PROD-667 Profile 내부 기능을 배치할 root/detail integration boundary
- Account 설정 UI·데이터 조회·입력·저장, GraphQL schema, DB, Relay mutation/cache, Byulmaru ID 외부 링크
  동작과 Profile 공개 범위 저장 계약에는 영향이 없다.
