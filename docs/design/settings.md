# 설정 페이지

Kosmo의 인증된 설정 hub는 `/settings` 하나를 canonical route로 사용한다. 이 페이지는 Byulmaru ID가 소유한
Account 설정의 **외부 진입점**과 Kosmo가 소유한 선택 Local Profile 설정을 같은 정보 구조에 배치하되, 실제
설정 행의 label·이동 동작과 접근성 이름에서 두 서비스와 소유 단위를 명확히 구분한다. Kosmo 내부에서
제공하는 설정 기능은 Profile 설정뿐이다.

## Route와 진입점

- Kosmo 설정 hub의 canonical route는 `/settings`다. Profile 설정을 별도 최상위 route나 준비 중인
  placeholder로 복제하지 않으며, Byulmaru ID Account 설정을 위한 Kosmo 내부 route를 만들지 않는다.
- full Web sidebar와 compact Web icon rail에는 `설정` 진입점을 주요 navigation 항목으로 표시한다.
- `< compact` mobile Web과 Android·iOS에서는 mobile drawer에 `설정` 진입점을 표시한다. 하단 탭 바와
  우측 레일에는 같은 진입점을 중복하지 않는다.
- route와 page shell이 함께 동작하는 slice에서만 진입점을 노출한다. 진입점만 먼저 노출해 준비되지 않은
  화면이나 generic placeholder로 이동시키지 않는다.
- `설정` navigation은 `/settings`에서 현재 page 상태를 노출한다. 다른 shell-level 주요 route에서
  `/settings`로 forward navigation하면 [breakpoints.md](./breakpoints.md)의 scroll 정책에 따라 문서
  최상단에서 시작한다.

## Page shell과 정보 구조

- 페이지의 단일 최상위 heading은 `설정`이다.
- 본문은 기존 중앙 column을 채우는 평면 목록형 구조를 사용한다. section 전체를 둥근 테두리 카드로 감싸거나
  소유 단위 사이에 큰 바깥 여백을 두지 않고, 실제 Account/Profile content를 같은 column에 정렬한 뒤 theme
  구분선으로 경계를 표시한다.
- chevron은 Byulmaru ID 외부 진입점처럼 실제로 다른 위치를 여는 행에만 표시한다. 현재 페이지 안에서 값을
  조회·입력·저장하는 Profile control이나 비상호작용 Profile identity에는 이동을 암시하는 장식용 chevron을
  붙이지 않는다.
- 본문은 Byulmaru ID Account 외부 진입점과 현재 Local Profile의 Kosmo 설정 content를 이 순서로 제공한다.
  `계정 설정`·`프로필 설정` heading, 소유자 label과 설명을 별도 시각 block으로 반복하지 않는다. Account
  진입점의 시각 label은 `계정 설정`으로 두고, link의 accessible name과 canonical destination에서
  **Byulmaru ID가 소유한 외부 Account Settings**임을 전달한다. Profile control은 accessible name에서
  **Kosmo 내부 기능**과 현재 대상을 전달한다.
- `계정 설정` section은 Byulmaru ID가 소유하는 canonical Account Settings 페이지로 이동하는 진입점만
  제공한다. Kosmo는 이 section에 Account 데이터, 현재 값, 입력 form, 저장 action 또는 Account 관리 기능을
  구현하지 않는다.
- Account 진입점은 모든 플랫폼에서 Expo Router의 실제 external `Link`와 canonical HTTPS `href`를 사용한다.
  브라우저 또는 OS가 외부 navigation을 소유하며 Kosmo는 이를 내부 route나 저장 기능으로 바꾸지 않는다.
  URL 지원 확인, navigation 성공·실패, loading·error·retry·lock 상태를 Kosmo가 소유하지 않는다.
- `프로필 설정`은 현재 설정 대상인 Local Profile의 표시 이름과 `relativeHandle`을 section 안에서 함께
  표시한다. shell의 selected Profile을 기본 대상으로 사용하며, Profile 데이터 조회·입력·저장은 Kosmo
  내부 기능으로만 제공한다.
- Account가 접근할 수 있는 Local Profile이 없거나 selected Profile이 없으면 Byulmaru ID Account 설정 외부
  진입점은 계속 표시하고, `프로필 설정`에는 대상이 없음을 설명하는 empty state와 Profile 선택·생성 흐름으로
  이동할 수 있는 action을 제공한다. 다른 Profile의 마지막 설정값을 대신 표시하지 않는다.
- 공통 page shell은 두 소유 단위의 순서·구분선과 현재 Profile identity 배치만 소유한다. Account 외부
  진입점 child의 label·accessible name·canonical link는 PROD-645가, Profile child와 그 입력·저장 세부 상태는
  해당 Profile child 이슈가 소유한다. production 조립과 page-level 검증은 PROD-685가 소유한다.

## Header와 responsive layout

- `< compact` mobile Web에서는 `UniversalShell`이 메뉴 action과 `설정` 제목을 가진 공용
  [PageHeader](./page-header.md)를 렌더링한다. route 본문은 같은 heading을 복제하지 않는다.
- Android·iOS와 compact/full Web에서는 settings route가 scroll content의 첫 heading으로 text
  `PageHeader`를 렌더링한다. Native safe area는 mobile shell이 소유한다.
- 페이지는 기존 중앙 column과 `compact=768`, `full=1280` breakpoint를 그대로 사용한다. settings 전용
  breakpoint나 별도 Web route tree를 만들지 않는다.
- 작은 화면에서는 content를 한 column으로 유지하고, text scaling과 reflow에서도 현재 Profile identity와
  action이 잘리거나 가로 scroll에 의존하지 않게 한다.

## Loading, error와 empty state

- route loading, error, empty와 content 상태에서 page heading과 외부 Account 진입점/내부 Profile 설정의
  소유권 구조를 서로 다른 화면처럼 복제하지 않는다.
- Account 진입점에는 Kosmo가 조회할 Account 값이나 외부 navigation 상태가 없으므로 Account 데이터 및
  외부 이동 loading·empty·save·error·retry·lock 상태를 만들지 않는다. Profile identity 또는 Profile 설정을
  불러오는 동안 확인되지 않은 Profile 값을 확정된 것처럼 표시하지 않는다.
- route-level error는 안전한 한국어 설명과 재시도 action을 제공한다. 이전 Profile의 설정값을 fallback으로
  남기거나 backend 오류 원문을 그대로 노출하지 않는다.
- Profile 전환 중에는 새 대상의 identity와 데이터가 일치할 때까지 이전 Profile 설정 control을 새 대상의
  값처럼 표시하지 않는다. 세부 pending·dirty 상태와 늦은 응답 격리는 Profile 설정 기능이 소유한다.
- 외부 Account navigation의 실행과 결과는 브라우저 또는 OS가 소유한다. 이를 Account 데이터 조회 실패나
  공통 route-level boundary로 표현하지 않으며, 정상인 다른 section을 불필요하게 숨기지 않는다.

## 접근성

- `설정`을 페이지의 단일 heading으로 programmatic하게 노출하고, 문서·보조기술 읽기 순서는 `설정` page
  heading → Account 외부 진입점 → 비상호작용 Profile identity → Profile control을 따른다. 시각적으로 제거한
  `계정 설정`·`프로필 설정` heading을 screen reader 전용 중복 heading으로 다시 만들지 않는다.
- Account 진입점은 시각 label `계정 설정`과 link accessible name·canonical destination에서 Byulmaru ID 외부
  Account Settings로 이동한다는 사실을 전달한다. Profile control의 accessible name은 Kosmo 내부 기능과 현재
  대상을 전달한다. navigation과 page action은
  실제 동작에 맞는 role, accessible name, current/disabled/busy 상태를 제공한다.
- Web keyboard Tab 순서는 Account 외부 진입점 → Profile 선택 control(있는 경우) → Profile control이다. page
  heading과 비상호작용 Profile identity는 tab stop이 아니다. 외부 이동 결과 announcement나 재시도 상태는
  Kosmo가 소유하지 않으며, Profile 저장 결과 announcement는 Profile 기능이 소유한다.
- Web target은 [accessibility.md](./accessibility.md)의 24×24 CSS px minimum과 공식 예외를 따르고, iOS는
  기본 44×44pt, Android는 48×48dp touch target을 사용한다.
- Web 자동화 결과를 Android·iOS screen reader, font scaling과 touch target 검증의 대체 증거로 사용하지
  않는다.

## 기능 이슈 경계와 완료 검증

- PROD-653은 완료된 선행 정보 구조 산출물이며 active integration 또는 archive owner가 아니다.
- PROD-645는 시각 label `계정 설정`, Byulmaru ID 외부 Account Settings accessible name과 canonical `href`를
  가진 Expo Router external `Link` child 및 그 기능 계약을 소유한다. 브라우저·OS navigation 결과와
  loading·error·retry·lock은 소유하지 않는다.
- PROD-685는 production `/settings` route/navigation, PROD-645·PROD-667 child 조립과 page-level 검증을
  소유한다.
- PROD-684는 최종 Settings 통합과 전체 OpenSpec 완료·archive 판단을 소유한다.

## 제외 범위

- 별마루 ID Account Settings 페이지 자체와 Account 데이터 조회·입력·저장·관리 기능
- 브라우저·OS가 소유하는 외부 navigation 결과와 URL 지원 확인·loading·error·retry·lock 상태
- Profile 기본 게시 공개 범위의 DB, GraphQL, Relay와 Composer 계약
- 알림 설정, Follow Approval Policy와 아직 승인되지 않은 설정 category
- 향후 설정 전체의 장기 정보 구조나 별도 nested route를 미리 확정하는 것
