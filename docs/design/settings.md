# 설정 페이지

Kosmo의 인증된 설정 표면은 `/settings` 하나를 canonical route로 사용한다. 이 페이지는 Account 수준 설정과
선택한 Local Profile 수준 설정을 같은 화면에 배치하되, 두 소유 단위를 label, heading과 접근성 이름에서
명확히 구분한다.

## Route와 진입점

- canonical route는 `/settings`다. Account와 Profile 영역을 별도 최상위 route나 준비 중인 placeholder로
  복제하지 않는다.
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
- 본문은 `계정 설정`과 `프로필 설정` section을 이 순서로 제공한다. 시각적 구분만으로 소유 단위를 전달하지
  않고 각 section heading과 하위 control의 accessible name에도 Account 또는 Profile 범위를 드러낸다.
- `계정 설정`은 로그인한 Account 전체에 적용되는 설정을 담으며 selected Profile에 속한 것처럼 표현하지
  않는다.
- `프로필 설정`은 현재 설정 대상인 Local Profile의 표시 이름과 `relativeHandle`을 section 안에서 함께
  표시한다. shell의 selected Profile을 기본 대상으로 사용하되 Account 설정과 하나의 저장 단위로 합치지
  않는다.
- Account가 접근할 수 있는 Local Profile이 없거나 selected Profile이 없으면 `계정 설정`은 계속 사용할 수
  있고, `프로필 설정`에는 대상이 없음을 설명하는 empty state와 Profile 선택·생성 흐름으로 이동할 수 있는
  action을 제공한다. 다른 Profile의 마지막 설정값을 대신 표시하지 않는다.
- 공통 page shell은 section과 상태 배치만 소유한다. 각 설정의 입력, 저장, 외부 이동과 세부 오류 복구는
  해당 기능 이슈가 소유한다.

## Header와 responsive layout

- `< compact` mobile Web에서는 `UniversalShell`이 메뉴 action과 `설정` 제목을 가진 공용
  [PageHeader](./page-header.md)를 렌더링한다. route 본문은 같은 heading을 복제하지 않는다.
- Android·iOS와 compact/full Web에서는 settings route가 scroll content의 첫 heading으로 text
  `PageHeader`를 렌더링한다. Native safe area는 mobile shell이 소유한다.
- 페이지는 기존 중앙 column과 `compact=768`, `full=1280` breakpoint를 그대로 사용한다. settings 전용
  breakpoint나 별도 Web route tree를 만들지 않는다.
- 작은 화면에서는 section을 한 column으로 유지하고, text scaling과 reflow에서도 section heading, 현재
  Profile identity와 action이 잘리거나 가로 scroll에 의존하지 않게 한다.

## Loading, error와 empty state

- route loading, error, empty와 content 상태에서 page heading과 Account/Profile 정보 구조를 서로 다른
  화면처럼 복제하지 않는다.
- route-level loading은 어떤 Account 또는 Profile 설정값도 확정된 것처럼 표시하지 않는다.
- route-level error는 안전한 한국어 설명과 재시도 action을 제공한다. 이전 Profile의 설정값을 fallback으로
  남기거나 backend 오류 원문을 그대로 노출하지 않는다.
- Profile 전환 중에는 새 대상의 identity와 데이터가 일치할 때까지 이전 Profile 설정 control을 새 대상의
  값처럼 표시하지 않는다. 세부 pending·dirty 상태와 늦은 응답 격리는 Profile 설정 기능이 소유한다.
- Account와 Profile section 중 하나만 실패할 수 있는 기능은 해당 section 안에서 복구할 수 있다. 공통
  route-level boundary가 정상인 다른 소유 단위까지 불필요하게 숨기지 않는다.

## 접근성

- `설정`, `계정 설정`, `프로필 설정`의 heading hierarchy를 programmatic하게 노출한다.
- navigation과 page action은 실제 동작에 맞는 role, accessible name, current/disabled/busy 상태를 제공한다.
- Web keyboard focus 순서는 page heading, Account section, Profile 대상과 Profile section의 문서 순서를
  따른다. 오류와 저장 결과 announcement는 각 기능이 중복 없이 소유한다.
- Web target은 [accessibility.md](./accessibility.md)의 24×24 CSS px minimum과 공식 예외를 따르고, iOS는
  기본 44×44pt, Android는 48×48dp touch target을 사용한다.
- Web 자동화 결과를 Android·iOS screen reader, font scaling과 touch target 검증의 대체 증거로 사용하지
  않는다.

## 기능 이슈 경계와 완료 검증

- PROD-653은 `/settings` route, 공통 page shell, shell navigation, Account/Profile 정보 구조와 페이지 수준
  통합 검증을 소유한다.
- PROD-645는 `계정 설정` section의 별마루 ID 설명, canonical 외부 링크, 외부 이동 오류 처리와 해당 기능
  검증을 소유한다.
- PROD-648은 `프로필 설정` section의 Profile 선택 대상, 기본 게시 공개 범위의 저장·권한·상태와 Composer
  연결 및 해당 기능 검증을 소유한다.
- PROD-653의 통합 검증은 자식 이슈의 세부 기능 테스트를 반복하지 않는다. 두 section이 한 route에서 올바른
  소유 단위와 현재 대상을 전달하고, 지원 navigation surface와 Web·Android·iOS에서 함께 동작하는지를
  확인한다.
- PROD-653이 자신의 OpenSpec 정합성 확인과 archive를 소유하며, PROD-645와 PROD-648의 통합 가능한 결과가
  준비되기 전에는 완료하지 않는다.

## 제외 범위

- 별마루 ID 설정 페이지 자체와 Account 관리 기능
- Profile 기본 게시 공개 범위의 DB, GraphQL, Relay와 Composer 계약
- 알림 설정, Follow Approval Policy와 아직 승인되지 않은 설정 category
- 향후 설정 전체의 장기 정보 구조나 별도 nested route를 미리 확정하는 것
