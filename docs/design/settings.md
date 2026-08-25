# 설정 페이지

Kosmo의 인증된 설정은 `/settings`를 canonical hub로 사용하는 route family다. 이 hub는 현재 승인된 설정
진입점을 명시적으로 구성하고, 선택한 내부 설정을 detail surface에서 단계적으로 보여 준다. 장기적으로
다양한 설정 category와 detail이 추가될 수 있지만, 승인되지 않은 category·placeholder·범용 registry를
미리 노출하거나 구현하지 않는다.

현재 설정 IA에는 Byulmaru ID가 소유한 Account 설정의 **외부 진입점**, 클라이언트 로컬의 `테마`
**내부 진입점**, Kosmo가 소유한 Local Profile의 `게시물 기본 공개 범위`, `뮤트 및 차단` **내부 진입점**을
직접 배치한다. 실제 행의 label·이동 동작과 접근성 이름에서 서비스와 소유 단위를 명확히 구분한다.
DSN-54는 테마 선택의 Figma 계약을, PROD-812는 production runtime과 기기 로컬 persistence를 소유한다.

## Route와 진입점

- Kosmo 설정 hub의 canonical route는 `/settings`다. 내부 설정 detail은 이 route 아래에서 열 수 있지만,
  Byulmaru ID Account 설정을 위한 Kosmo 내부 route나 form은 만들지 않는다.
- 테마 detail의 canonical 내부 route는 `/settings/theme`다. 홈이나 다른 주요 route에 임시 테마 toggle을
  중복 배치하지 않는다.
- full Web sidebar와 compact Web icon rail에는 `설정` 진입점을 주요 navigation 항목으로 표시한다.
- `< compact` mobile Web과 Android·iOS에서는 mobile drawer에 `설정` 진입점을 표시한다. 하단 탭 바와
  우측 레일에는 같은 진입점을 중복하지 않는다.
- route와 page shell이 함께 동작하는 slice에서만 진입점을 노출한다. 진입점만 먼저 노출해 준비되지 않은
  화면이나 generic placeholder로 이동시키지 않는다.
- `설정` navigation은 `/settings`와 지원되는 내부 detail route에서 현재 page 상태를 노출한다. 다른
  shell-level 주요 route에서 `/settings`로 forward navigation하면 [breakpoints.md](./breakpoints.md)의
  scroll 정책에 따라 문서 최상단에서 시작한다.

## 정보 구조

- Settings는 모든 control을 한 화면에 쌓는 긴 form이 아니라, 진입점 목록에서 category·하위 목록·detail로
  점진적으로 이동하는 탐색 구조를 사용한다.
- root 목록에는 시각 label `계정 설정`인 Byulmaru ID 외부 진입점, 현재 선택값을 함께 보여 주는 `테마`,
  `게시물 기본 공개 범위`, `뮤트 및 차단` 내부 진입점을 이 순서로 직접 표시한다. 항목 하나만 가진
  `계정`·`화면 설정`·`프로필` 대분류를 만들지 않는다.
- `뮤트 및 차단`은 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 제공하는 하위 목록을 연다.
  두 상태를 하나의 혼합 목록으로 표시하지 않는다. 세부 action과 Profile 상태는
  [Profile Mute·Block 디자인 계약](./profile-mute-block.md)을 따른다.
- full Web의 `/settings`는 `게시물 기본 공개 범위`를 기본 선택해 detail에 표시한다. compact Web, mobile Web,
  Android와 iOS의 `/settings`는 root 목록부터 표시하고, 내부 진입점을 선택하면 한 화면짜리 detail로
  이동한다.
- 향후 승인된 항목은 direct destination, 하위 목록을 여는 category 또는 기존 독립 화면으로 이동하는
  destination으로 추가할 수 있다. 모든 detail을 Settings workspace 안에 강제로 넣거나 현재 구현에 미래
  category를 위한 disabled item·placeholder를 만들지 않는다.
- Account 외부 진입점은 Byulmaru ID가 소유하는 canonical Account Settings 페이지로만 이동한다. 시각 label은
  `계정 설정`을 사용하고 link accessible name과 canonical destination에서 Byulmaru ID 외부 서비스임을
  전달한다. Kosmo는 Account 데이터, 현재 값, 입력 form, 저장 action 또는 Account 관리 기능을 구현하지
  않는다.
- Account 진입점은 모든 플랫폼에서 Expo Router의 실제 external `Link`와 canonical HTTPS `href`를 사용한다.
  브라우저 또는 OS가 외부 navigation을 소유하며 URL 지원 확인, navigation 성공·실패,
  loading·error·retry·lock 상태를 Kosmo가 소유하지 않는다. 이 계약은 PROD-645가 소유한다.
- Profile detail은 shell의 selected Local Profile을 기본 대상으로 사용하고 표시 이름과 `relativeHandle`,
  Profile 설정 content를 함께 제공한다. Profile 데이터 조회·입력·저장은 Kosmo 내부 기능으로만 제공한다.
- selected Profile이 없으면 Profile detail은 대상이 없음을 설명하고 기존 Profile 선택·생성 흐름으로 이동할
  수 있는 action을 제공한다. 다른 Profile의 마지막 설정값을 대신 표시하지 않는다.

## SettingsItem

- 공통 presentational `SettingsItem`은 Mobile Figma 설정 cell을 기준으로 행 높이·padding·divider를
  제공하고, 필수 label과 선택적 leading content·description·trailing content·selected presentation을
  조합한다.
- `SettingsItem`은 부모 container의 가용 폭을 채우며 `minWidth: 0`과 text reflow를 보존한다. master 목록,
  하위 목록과 독립 중앙 화면은 같은 행 문법을 사용하되 각 container가 실제 폭과 정보 밀도를 결정한다.
- 새로 승인된 navigation·value·toggle·status·identity 행은 `SettingsItem` 구현을 수정하거나 feature 이름별
  분기를 추가하지 않고 같은 조합 API로 만들 수 있어야 한다.
- Link·Pressable·focus·accessible name과 feature 상태·조회·저장·persistence semantics는 각 사용처가
  소유한다. `SettingsItem`은 destination이나 interaction을 추론하지 않는다.
- chevron이나 현재 값 같은 trailing content는 실제 동작과 정보에 맞을 때만 사용한다. 내부 detail과 외부
  destination은 이동을 전달할 수 있지만, 현재 화면에서 값을 바꾸는 control에는 장식용 chevron을 붙이지
  않는다.

## 테마 설정

- `/settings` root와 full Web master의 `테마` 행은 현재 선택값 `시스템`·`라이트`·`다크` 중 하나를 함께
  보여 주고 `/settings/theme` detail로 이동한다.
- detail 본문은 `테마 설정` section label로 시작하고, 그 아래 기존 `RadioOption` 문법으로 `시스템`,
  `라이트`, `다크` 세 항목을 제공한다. `시스템`은 기기 색상 모드 변경을 따르고, `라이트`와 `다크`는 기기
  설정과 무관하게 해당 모드를 사용한다.
- 세 항목 아래에는 `테마 설정은 이 기기에만 적용되며 다른 기기와 동기화되지 않아요.` 안내를 보조 텍스트로
  한 번만 표시한다.
- 선택은 별도 `저장` action 없이 즉시 화면에 반영하고 같은 기기의 클라이언트 로컬 저장소에 유지한다.
  server·DB에 저장하거나 계정 및 다른 기기로 동기화하지 않으며 성공 feedback도 표시하지 않는다.
- 앱 시작 시 로컬 선택값 확인이 끝나기 전에는 기존 Splash를 유지해 잘못된 테마가 잠깐 노출되지 않게 한다.
  로컬 유지 실패는 별도 완료 화면을 만들지 않고 기존 `Toast` 오류 feedback을 사용한다.
- 이 detail은 Primary Color를 변경하지 않는다. Primary Color가 별도 범위로 승인되면 root의 독립 항목으로
  추가하고, 실제 display 관련 항목이 충분히 늘어나기 전에는 중간 category를 만들지 않는다.
- Legacy `ThemePresetCard`와 `Profile / Theme` source는 재사용하지 않는다. 별도 preview card·Primary
  Color·저장 성공 UI를 포함하지 않으며, 현재 Settings 화면 전체가 선택 즉시 반영되는 preview다.

## Full Web Settings workspace

- `full` Web에서는 전역 Kosmo sidebar를 유지하고, settings route family에서 일반 `RightRail`의 Composer와
  개인정보 처리방침 링크를 표시하지 않는다.
- 기존 중앙 column과 우측 rail이 사용하던 영역을 Settings 전용 wide workspace로 사용한다. workspace는
  약 `320px` master pane과 남은 폭을 채우는 detail pane으로 나누고 theme border로 경계를 표시한다.
- master pane은 `설정` heading과 root 또는 선택된 category의 진입점 목록을 소유한다. detail pane은 선택된
  하위 목록 또는 설정 화면과 그 heading을 소유한다.
- 두 pane은 Web document scroll을 계속 사용한다. 중앙 content만의 별도 app-style internal scroller를
  만들거나 settings 때문에 전역 sidebar 폭과 `full=1280` breakpoint를 바꾸지 않는다.

## Compact·mobile·Native layout과 header

- compact Web, mobile Web, Android와 iOS에서는 Settings root 목록과 detail을 동시에 나누어 표시하지 않고
  한 화면씩 보여 준다. 내부 detail의 back action은 이전 navigation stack의 화면과 무관하게 `/settings`
  root 목록을 명시적으로 연다.
- `< compact` mobile Web의 root에서는 `UniversalShell`이 메뉴 action과 `설정` heading을 가진 공용
  [PageHeader](./page-header.md)를 렌더링한다. 내부 detail에서는 shell이 back action과 detail heading을
  렌더링하고 route 본문은 같은 heading을 복제하지 않는다.
- Android·iOS와 compact Web에서는 root 또는 detail route가 자기 text `PageHeader`를 scroll content의 첫
  heading으로 렌더링한다. detail header는 back action을 제공하고 Native safe area는 mobile shell이 소유한다.
- Android·iOS one-pane route는 `PageHeader`부터 root/detail content 전체를 하나의 platform vertical
  `ScrollView`에 둔다. compact·mobile·full Web은 기존 document scroll을 계속 사용한다.
- full Web에서는 master pane의 `설정` heading과 detail pane의 현재 화면 heading을 각각 노출한다. 같은 pane
  안에 중복 heading을 만들지 않는다.
- 모든 layout은 기존 `compact=768`, `full=1280` breakpoint를 사용한다. text scaling과 reflow에서도 행의
  label·description·trailing action이 잘리거나 불필요한 가로 scroll에 의존하지 않게 한다.

## Loading, error와 empty state

- Account 외부 진입점에는 Kosmo가 조회할 Account 값이나 외부 navigation 상태가 없으므로 Account 데이터 및
  외부 이동 loading·empty·save·error·retry·lock 상태를 만들지 않는다. 브라우저·OS가 소유하는 외부 이동을
  Kosmo Account 데이터 오류로 표현하지 않는다.
- Profile detail은 자기 Profile identity·loading·error·empty·content와 재시도 상태를 소유한다. shell이나
  Account 진입점이 Profile 오류 종류를 해석하거나 Profile 저장 상태를 공통 상태로 끌어올리지 않는다.
- Profile 조회 중에는 확인되지 않은 값을 확정된 것처럼 표시하지 않고, 오류에는 backend 원문이 아닌 안전한
  한국어 설명과 재시도 action을 제공한다.
- Profile 전환 중에는 새 대상의 identity와 데이터가 일치할 때까지 이전 Profile 설정 control을 새 대상의
  값처럼 표시하지 않는다. 세부 request 상태와 늦은 응답 격리는 PROD-667 Profile 기능이 소유한다.
- 테마 선택에는 저장 버튼·dirty·saving·success 화면을 만들지 않는다. 초기 local hydration은 기존 Splash가,
  local persistence 실패 feedback은 기존 `Toast`가 소유한다.
- 기본 게시 공개 범위의 inline option·dropdown·sheet·즉시 저장·명시적 저장 여부는 page shell 계약으로
  고정하지 않는다.

## 접근성

- root 화면과 master pane은 `설정` heading을, detail 화면과 detail pane은 현재 설정 이름 heading을
  programmatic하게 노출한다. 시각적으로 없는 category heading을 screen reader 전용으로 반복하지 않는다.
- root/master 목록의 문서·보조기술 읽기 순서는 `설정` heading → `계정 설정` 외부 진입점 → `테마`와 현재
  선택값 → `게시물 기본 공개 범위` → `뮤트 및 차단`이다. full Web에서는 이어서 detail heading과 현재
  선택된 content를 읽는다.
- Account 진입점은 시각 label `계정 설정`과 link accessible name·canonical destination에서 Byulmaru ID 외부
  Account Settings로 이동한다는 사실을 전달한다. 내부 진입점은 선택·현재 상태와 destination을, Profile
  control은 Kosmo 내부 기능과 현재 대상을 전달한다.
- Web keyboard focus는 현재 보이는 pane의 문서 순서를 따르며, full Web에서는 master의 interactive row 다음
  detail의 interactive control로 이동한다. heading과 비상호작용 identity는 tab stop이 아니다.
- navigation과 page action은 실제 동작에 맞는 role, accessible name, current·disabled·busy 상태를 제공한다.
  외부 이동 결과 announcement는 Kosmo가 소유하지 않으며 Profile 조회·저장 결과 announcement는 PROD-667이
  중복 없이 소유한다.
- Web target은 [accessibility.md](./accessibility.md)의 24×24 CSS px minimum과 공식 예외를 따르고, iOS는
  기본 44×44pt, Android는 48×48dp touch target을 사용한다.
- Web 자동화 결과를 Android·iOS screen reader, font scaling과 touch target 검증의 대체 증거로 사용하지
  않는다.

## 기능 이슈 경계와 완료 검증

- PROD-653은 완료된 선행 정보 구조 산출물이며 active integration 또는 archive owner가 아니다.
- PROD-685는 production Settings route family, full Web wide workspace, compact/mobile/native one-pane
  navigation, 공통 `SettingsItem`, shell navigation, PROD-645·PROD-667 결과의 배치와 페이지 수준 통합
  검증을 소유한다.
- PROD-645는 시각 label `계정 설정`, Byulmaru ID 외부 Account Settings accessible name과 canonical `href`를
  가진 Expo Router external `Link` child 및 그 기능 계약을 소유한다. 브라우저·OS navigation 결과와
  loading·error·retry·lock은 소유하지 않는다.
- PROD-667은 Profile 선택 대상, 기본 게시 공개 범위의 저장·권한·상태와 Composer 연결 및 해당 기능 검증을
  소유한다. PROD-648은 Backend DB·GraphQL 계약을 소유한다.
- `뮤트 및 차단`의 Figma IA·source·대표 consumer는 DSN-53이 소유한다. runtime의 Mute 진입점·목록·통합
  검증은 PROD-814, Block 진입점·목록과 Relay 수렴은 PROD-823, Block의 종단 간 검증·archive는 PROD-813이
  소유한다. 이 범위를 완료된 PROD-685·PROD-684에 소급해 귀속하지 않는다.
- DSN-54는 Settings root/master의 테마 현재값 행, `/settings/theme`의 System·Light·Dark 선택 화면,
  Light/Dark 시각 상태와 client-local handoff를 소유한다. PROD-812는 선택값 상태, 기기 로컬 persistence,
  초기 hydration과 app-wide ThemeProvider 적용을 소유한다.
- PROD-685의 통합 검증은 자식 기능의 세부 테스트를 반복하지 않는다. 지원 navigation surface, root/detail
  전환, full workspace, 외부/내부 소유 경계, 반응형 heading·focus·reflow가 함께 동작하는지 확인한다.
- PROD-685는 구현과 검증 증거를 PROD-684에 인계하고, PROD-684가 최종 Settings 통합·OpenSpec 정합성 확인과
  archive를 소유한다.
- 자동화·source/unit 결과는 실제 Web keyboard·screen reader·zoom 또는 Android·iOS runtime 접근성·
  navigation 통과 증거로 일반화하지 않는다.

## 제외 범위

- Byulmaru ID Account Settings 페이지 자체와 Account 데이터 조회·입력·저장·관리 기능
- 브라우저·OS가 소유하는 외부 navigation 결과와 URL 지원 확인·loading·error·retry·lock 상태
- Profile 기본 게시 공개 범위의 DB, GraphQL, Relay와 Composer 계약
- 공개 범위 control의 구체적인 선택·저장 UI
- 홈 또는 다른 주요 route의 테마 toggle과 임시 진입점
- 테마 선택값의 server·DB 저장, 계정 동기화와 기기 간 동기화
- Primary Color 변경과 아직 필요하지 않은 `화면 설정`·`테마 설정` 중간 category
- 알림 설정, Follow Approval Policy와 아직 승인되지 않은 설정 category·placeholder
- 미래 category 전체를 위한 범용 registry나 현재 승인되지 않은 destination route
- settings 밖 기존 route의 전역 shell·RightRail 동작 변경
