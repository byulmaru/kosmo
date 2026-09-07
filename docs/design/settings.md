# 설정 페이지

Kosmo의 인증된 설정은 `/settings`를 canonical hub로 사용하는 route family다. 이 hub는 현재 승인된 설정
진입점을 명시적으로 구성하고, 선택한 내부 설정을 detail surface에서 단계적으로 보여 준다. 장기적으로
다양한 설정 category와 detail이 추가될 수 있지만, 승인되지 않은 category·placeholder·범용 registry를
미리 노출하거나 구현하지 않는다.

현재 Target 설정 IA에는 Byulmaru ID가 소유한 Account 설정의 **외부 진입점**, Kosmo가 소유한 Local
Profile의 `프로필 설정`과 `뮤트 및 차단`, 클라이언트 로컬의 `테마` **내부 진입점**을 직접 배치한다.
`게시물 기본 공개 범위`는 root의 독립 destination이 아니라 `프로필 설정` 안의 Profile별 field다. 실제 행의
label·이동 동작과 접근성 이름에서 서비스와 소유 단위를 명확히 구분한다.
DSN-54는 테마 선택의 Figma 계약을, PROD-812는 production runtime과 기기 로컬 persistence를 소유한다.

2026-09-10 PROD-889 결정으로 `정보`를 Settings root의 추가 direct destination으로 두고
`/settings/info` detail에서 공개 정책 문서 진입점을 제공한다. `정보`는 기존 Settings 목록·detail·back·header
조합을 사용하며, `개인정보 처리방침`·`계정 삭제 안내`·`아동 안전 정책`의 public route로 이동하는 링크만
포함한다. 이 추가 진입점은 Byulmaru ID가 소유하는 기존 `계정 설정` 외부 진입점과 결합하지 않는다.
비로그인 landing의 기존 개인정보 처리방침 링크와 full Web 우측 레일의 기존 개인정보 처리방침 링크는
유지하고, Sidebar·mobile drawer에 정책 링크를 추가하지 않는다.

## Route와 진입점

- Kosmo 설정 hub의 canonical route는 `/settings`다. 내부 설정 detail은 이 route 아래에서 열 수 있지만,
  Byulmaru ID Account 설정을 위한 Kosmo 내부 route나 form은 만들지 않는다.
- Target의 Profile detail canonical route는 `/settings/profile`이다. 현재 runtime에 남은
  `/settings/default-post-visibility`는 이 Target으로 이관할 구현 경로이지 별도 Target destination이 아니다.
- 공개 정책 문서 진입점의 canonical Settings detail route는 `/settings/info`다. 이 route는 준비된 public
  `/privacy`, `/account-deletion`, `/child-safety`로 이동하는 링크를 제공하며 정책 문서 내용을 복제하지 않는다.
- Mobile Target evidence는 [`Default`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6704-9409)와
  [`Profile required`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6704-9415) `390×844`
  consumer다. 이 조립 화면은 Product migration이나 실제 선택·저장 동작의 완료 증거가 아니다.
- 테마 detail의 canonical 내부 route는 `/settings/theme`다. 홈이나 다른 주요 route에 임시 테마 toggle을
  중복 배치하지 않는다.
- full Web sidebar와 compact Web icon rail에는 `설정` 진입점을 주요 navigation 항목으로 표시한다.
- `< compact` mobile Web과 Android·iOS에서는 mobile drawer에 `설정` 진입점을 표시한다. 하단 탭 바와
  우측 레일에는 같은 진입점을 중복하지 않는다.
- route와 page shell이 함께 동작하는 slice에서만 진입점을 노출한다. 진입점만 먼저 노출해 준비되지 않은
  화면이나 generic placeholder로 이동시키지 않는다.
- `설정` navigation은 `/settings`와 지원되는 내부 category·detail route에서 현재 page 상태를 노출한다. 다른
  shell-level 주요 route에서 `/settings`로 forward navigation하면 [breakpoints.md](./breakpoints.md)의
  scroll 정책에 따라 문서 최상단에서 시작한다.

## 정보 구조

- Settings는 모든 control을 한 화면에 쌓는 긴 form이 아니라, 진입점 목록에서 category·하위 목록·detail로
  점진적으로 이동하는 탐색 구조를 사용한다.
- Target root 목록은 `계정 설정 → 프로필 설정 → 뮤트 및 차단 → 테마 → 정보` 순서다. `계정 설정`은 Byulmaru ID
  외부 진입점이고 나머지는 내부 진입점이다. `테마`는 현재 선택값을 함께 표시한다. `게시물 기본 공개 범위`를
  root에 중복 노출하거나 항목 하나만 가진 `계정`·`화면 설정` 대분류를 만들지 않는다.
- `정보`는 별도 category나 generic policy registry가 아닌 Settings root의 direct destination이다. `/settings/info`
  detail은 `개인정보 처리방침`, `계정 삭제 안내`, `아동 안전 정책`을 각각 public route로 여는 기존 Settings
  link-row 문법을 사용한다. 정책 문서의 본문·시행일·이메일 처리와 public route 간 cross-link는 각 정책 문서가
  소유한다.
- `뮤트 및 차단`은 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 제공하는 하위 목록을 연다.
  두 상태를 하나의 혼합 목록으로 표시하지 않는다. 세부 action과 Profile 상태는
  [Profile Mute·Block 디자인 계약](./profile-mute-block.md)을 따른다.
- Figma Target evidence에서 Full loaded 화면
  [`뮤트한 프로필`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25436)과
  [`차단한 프로필`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25582)은 Settings
  master에 이 하위 목록을 표시하고, Compact는 category 화면
  [`6338:1641`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6338-1641)에서 같은 순서로
  destination을 제공한다. Mobile category 화면
  [`6393:8193`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6393-8193)도 기존 loaded
  destination [`6316:8075`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8075)와
  [`6316:8089`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8089)을 같은 순서로 제공한다.
- full Web의 Target `/settings`는 `프로필 설정`을 기본 선택해 detail에 표시한다. compact Web, mobile Web,
  Android와 iOS의 `/settings`는 root 목록부터 표시하고, 내부 진입점을 선택하면 한 화면짜리 category 또는
  detail destination으로 이동한다.
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
  대상 전환 affordance, `게시물 기본 공개 범위`를 포함한 Profile 설정 content를 함께 제공한다. Profile 데이터
  조회·입력·저장은 Kosmo 내부 기능으로만 제공한다.
- Profile Migration source 준비는 이 Profile detail에서 feature flag가 켜져 있고 값을 확인할 수 있을 때만 노출한다.
  flag가 꺼져 있거나 사용할 수 없거나 로딩 중이면 준비 control을 렌더링하지 않는다. 이 flag는 UI 노출 조건이며
  Profile Owner 권한을 대신하지 않는다. 이미 준비된 관계와 그로부터 파생된 alias, inbound Move 처리는 flag 상태로
  중단하거나 제거하지 않는다. 구체적인 flag key·추가 route·시각 세부는 이 문서에서 고정하지 않는다.
- Profile target selector의 Figma lifecycle source는
  [`Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4867-13083),
  [`Compact`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4868-38112),
  [`Full`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-45172)
  `TargetSelectorOpen`을 제공하고 Full consumer
  [`6316:48437`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-48437)가 연결된다.
  Figma lifecycle은 실제 선택·저장·focus·dismiss 완료 증거가 아니다.
- selected Profile이 없으면 Profile detail은 대상이 없음을 설명하고 기존 Profile 선택·생성 흐름으로 이동할
  수 있는 action을 제공한다. 다른 Profile의 마지막 설정값을 대신 표시하지 않는다.

## Profile 설정의 후속 lifecycle 조립

PROD-860의 `ProfileSettingsScreen`은 설정 content를 `children`으로 받아 유지하고, optional `lifecycle`이
주어진 경우에만 비활성화·재활성화·영구 삭제 흐름을 조립한다. 기본 Storybook에는 lifecycle 진입점이 없고,
`WithLifecycle`에서 도입 후 구성을 검토한다. 비활성화는 Web·Native 모두 내용 전체를 교체하며,
재활성화·영구 삭제는 확인 팝업을 사용한다. 자세한 계약은 [Profile lifecycle](./profile-lifecycle.md)을 따른다.
이 Target presentation은 현재 `SettingsProfileDetail`과 Profile Edit의 저장·route를 교체하거나 기능을 활성화하지 않는다.

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
- Mobile assembled evidence는 기존 System Light consumer와
  [`Dark Target`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6770-10380)이다. Dark Target은
  `ThemePreferenceControl · Dark` source와 explicit Dark mode를 상속하며 persistence 구현 완료 증거는 아니다.
- preference 초기값은 `시스템`이다. 저장값이 없거나 `시스템`·`라이트`·`다크` 외의 값으로 유효하지 않으면
  `시스템`으로 정규화한다. `/settings` root의 현재값과 detail radio 선택 상태는 정규화된 preference를
  동일하게 표시한다.
- 세 항목 아래에는 `테마 설정은 이 기기에만 적용되며 다른 기기와 동기화되지 않아요.` 안내를 보조 텍스트로
  한 번만 표시한다.
- 선택은 별도 `저장` action 없이 즉시 화면에 반영하고 같은 기기의 클라이언트 로컬 저장소에 유지한다.
  server·DB에 저장하거나 계정 및 다른 기기로 동기화하지 않으며 성공 feedback도 표시하지 않는다.
- 로컬 저장에 실패해도 이미 적용한 선택을 rollback하지 않고 현재 세션의 화면, root 현재값과 radio 선택
  상태에 유지하며 기존 `Toast`로 실패만 알린다. 다음 실행은 마지막으로 성공 저장된 preference를 사용하고,
  성공 저장값이 없으면 `시스템`으로 시작한다.
- 앱 시작 시 로컬 선택값 확인이 끝나기 전에는 기존 Splash를 유지해 잘못된 테마가 잠깐 노출되지 않게 한다.
  저장소 read가 예외로 실패하면 preference를 `시스템`으로 fallback해 hydration을 완료하고 Splash를 해제하며,
  기존 `Toast`로 실패를 알린다. 이 실패 경로에서는 저장소 재쓰기를 시도하지 않는다.
- preference를 실제 Light/Dark `resolved theme`로 해석해 앱 화면, Native `StatusBar` foreground style과 Web
  `theme-color`가 같은 mode를 사용하게 한다. `시스템`은 OS mode 변경을 함께 따르고, 명시적 `라이트`·`다크`는
  OS mode와 무관하게 system chrome에도 동일하게 반영한다.
- Native의 `시스템`은 `apps/app/app.config.ts`의 Expo `userInterfaceStyle`을 `automatic`으로 이관한 build에서
  활성화한다. PROD-812는 Native rebuild 후 Android/iOS 각각에서 OS Light/Dark 전환이 resolved theme에
  반영되는지 검증한다.
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

- compact Web, mobile Web, Android와 iOS에서는 Settings root 목록과 선택한 category·detail destination을
  동시에 나누어 표시하지 않고 한 화면씩 보여 준다.
- 모든 내부 category·detail destination은 명시적인 parent를 가진다. back action은 이전 navigation stack의
  화면과 무관하게 해당 parent를 명시적으로 연다. root의 직접 진입점이 여는 1단계 destination의 parent는
  `/settings` root이고, 중첩 destination의 parent는 바로 위 category다. direct·deep link로 연 경우에도 같은
  parent를 사용한다.
- `< compact` mobile Web의 root에서는 `UniversalShell`이 메뉴 action과 `설정` heading을 가진 공용
  [PageHeader](./page-header.md)를 렌더링한다. 내부 category·detail destination에서는 shell이 back action과
  현재 destination heading을 렌더링하고 route 본문은 같은 heading을 복제하지 않는다.
- Android·iOS와 compact Web에서는 root 또는 category·detail destination route가 자기 text `PageHeader`를
  scroll content의 첫 heading으로 렌더링한다. category·detail header는 back action을 제공하고 Native safe
  area는 mobile shell이 소유한다.
- Android·iOS one-pane route는 `PageHeader`부터 root·category·detail content 전체를 하나의 platform vertical
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

- root 화면과 master pane은 `설정` heading을, one-pane category·detail 화면과 full Web detail pane은 현재
  destination heading을 programmatic하게 노출한다. 시각적으로 없는 category heading을 screen reader 전용으로
  반복하지 않는다.
- Target root/master 목록의 문서·보조기술 읽기 순서는 `설정` heading → `계정 설정` 외부 진입점 →
  `프로필 설정` → `뮤트 및 차단` → `테마`와 현재 선택값 → `정보`다. full Web에서는 이어서 detail heading과
  현재 선택된 content를 읽는다. `/settings/info`에서는 `정보` heading 다음에 세 public policy link를 문서
  순서대로 읽는다.
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
- PROD-743은 Profile detail의 feature-flagged Profile Migration source 준비 노출과 해당 Settings UI 검증을 소유한다.
  Profile Owner 권한, Profile Migration 관계, alias와 inbound Move 동작은 [Profile](../domain/objects/profile.md)과
  [ADR 0027](../domain/decisions/0027-profile-migration-inbound-move.md)의 canonical 계약을 따른다.
- `뮤트 및 차단`의 Figma IA·source·대표 consumer는 DSN-53이 소유한다. runtime의 Mute 진입점·목록·통합
  검증은 PROD-814, Block 진입점·목록과 Relay 수렴은 PROD-823, Block의 종단 간 검증·archive는 PROD-813이
  소유한다. 이 범위를 완료된 PROD-685·PROD-684에 소급해 귀속하지 않는다.
- DSN-54는 Settings root/master의 테마 현재값 행, `/settings/theme`의 System·Light·Dark 선택 화면,
  Light/Dark 시각 상태와 client-local handoff를 소유한다. PROD-812는 preference 초기값·정규화, 선택값 상태,
  기기 로컬 persistence와 read/write 실패 semantics, 초기 hydration, app-wide ThemeProvider 적용, Native Expo
  `userInterfaceStyle` build config·`StatusBar`, Web `theme-color` 적용, 남은 route·shell·domain consumer의
  semantic token 이관·예외 정리와 지원 플랫폼의 대표 Light/Dark 화면·주요 interaction state·system chrome
  검증을 소유한다.
- PROD-685의 통합 검증은 자식 기능의 세부 테스트를 반복하지 않는다. 지원 navigation surface, root/category/detail
  전환, full workspace, 외부/내부 소유 경계, 반응형 heading·focus·reflow가 함께 동작하는지 확인한다.
- PROD-889는 `/settings/info` direct destination과 세 public policy route link의 배치, 기존 landing·RightRail
  개인정보 처리방침 보존, Sidebar·mobile drawer 정책 링크 비노출을 소유한다. `/settings/info`는 새 정책 내용이나
  Account 관리 기능을 구현하지 않는다.
- PROD-685는 구현과 검증 증거를 PROD-684에 인계하고, PROD-684가 최종 Settings 통합·OpenSpec 정합성 확인과
  archive를 소유한다.
- 자동화·source/unit 결과는 실제 Web keyboard·screen reader·zoom 또는 Android·iOS runtime 접근성·
  navigation 통과 증거로 일반화하지 않는다.

## Switch·SearchField 재사용 매핑 (PROD-895)

Figma 이름마다 public component를 추가하지 않는다. Switch는 기존 `react-native` Switch를 사용하고,
SearchField는 Production `TextField`·`IconButton`을 합성한다. Playground의 얇은 consumer fixture가
입력 상태와 clear 뒤 입력 focus 복귀를 소유하며, route·검색 결과·debounce 정책은 포함하지 않는다.

| Figma source                                                                               | Production 구현·consumer                                   | Storybook 표면                                                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Switch](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3324-22405)     | `react-native` Switch                                      | `KOSMO/Components/Switch` Playground·RepresentativeStates·Tests                                                |
| 같은 Switch                                                                                | `ProfileEditForm.tsx`의 Follow Approval                    | `screens/ProfileEdit.stories.tsx`의 `FollowPolicySwitchSubmitsEnum`·`FollowPolicyApprovalRequiredInitialState` |
| 같은 Switch                                                                                | `PostComposerMediaControls.tsx`의 `PostComposerMediaItems` | `patterns/Posts.stories.tsx`의 `ComposerMediaStates`·`ComposerReplyMediaMutationContract`                      |
| [SearchField](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3899-1389) | `ui/TextField.tsx`·`ui/IconButton.tsx` 합성                | `KOSMO/Patterns/Search Field` Playground·RepresentativeStates·Tests                                            |

- Switch는 Off/On·Disabled와 boolean `onValueChange`를 유지한다. Figma의 40×20은 의도 표현이며
  Web·iOS·Android의 native 렌더 크기·모양·색상 차이를 허용한다. `OPEN`/`APPROVAL_REQUIRED` 변환은
  [ProfileEdit consumer](./profile-edit.md)의 계약이다. 민감한 이미지 Switch는 별도의 boolean 값을 전달한다.
- SearchField는 TextField의 44px 높이·테마·focus ring을 재사용하며 Empty/Filled와
  Default/Focused/Disabled를 표현한다. Filled라도 disabled이면 clear를 숨긴다. Focused는 실제 입력
  focus로 도달하며 테스트 전용 state prop을 추가하지 않는다. Web 입력은 `searchbox`, Native 입력은
  `search` 접근성 역할을 사용한다. clear는 선택 상태가 없는 버튼이며 기존 IconButton의 플랫폼 target
  보정을 사용한다. 입력 callback과 clear callback은 별도 Actions로 관찰한다.
- `SearchToolbar`는 별도의 toolbar다. 기존 48px 입력·Filled+Disabled의 비활성 clear 표시와
  leading action·route focus lifecycle을 유지한다. SearchField로 rename하거나 치환하지 않는다.
- Light/Dark는 공용 toolbar로 전환한다. 대표 상태는 disabled Off/On, Empty/Filled, 긴 label/value를
  제공하며 자동 interaction은 Controls가 비활성화된 `*.tests.stories.tsx`에서 실행한다.

2026-09-07 검증: `pnpm --filter @kosmo/app check`, 변경 story ESLint·Prettier,
`pnpm --filter @kosmo/app build-storybook` 통과. `vitest run --project=storybook`으로 Switch·SearchField의
main/Tests 파일 4개에서 8개 테스트와 위 표의 기존 consumer 테스트 4개가 통과했다. 기존
`TextField.test.ts`·`IconButton.test.ts`의 단위 테스트 14개도 통과했다. 내장 Browser에서 Light/Dark,
긴 label/value, disabled 상태와 Playground Controls·Actions를 확인했다. 기존 Posts consumer 검증에는
Relay mock의 누락 field 경고가 남는다.

Storybook의 자동 a11y 검사는 `color-contrast`를 제외하며 실제 screen reader나 Android/iOS runtime QA를
의미하지 않는다. 해당 Settings runtime QA 소유자는 PROD-727이다. 이번에는 새 public API나 행동 계약을
도입하지 않고 기존 계약을 검증하므로 새 OpenSpec은 만들지 않는다. Tailnet serve는 범위에서 제외한다.

## Checkbox·SegmentedControl 매핑 (PROD-893)

Checkbox와 SegmentedControl은 실제 Settings route나 저장 정책에 연결하지 않고 재사용 가능한 Production
공용 UI로 제공한다. 두 컴포넌트의 controlled value와 callback까지만 소유하며 label 배치, group summary의
데이터 lifecycle과 제품별 선택 정책은 consumer가 소유한다.

| Figma source                                                                                      | Production 구현                      | Storybook 표면                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| [Checkbox](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3435-7529)           | `ui/Checkbox.tsx`                    | `KOSMO/Components/Checkbox` Playground·RepresentativeStates·Tests          |
| [SegmentedControl/2](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3455-7525) | `ui/SegmentedControl.tsx`의 2개 옵션 | `KOSMO/Components/Segmented Control` Playground·RepresentativeStates·Tests |
| [SegmentedControl/3](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3457-7465) | 같은 컴포넌트의 3개 옵션             | 같은 표면                                                                  |
| [SegmentedControl/4](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=3459-7609) | 같은 컴포넌트의 4개 옵션             | 같은 표면                                                                  |

- Checkbox는 `false`·`true`·`mixed` checked 상태와 필수 accessible name을 제공한다. `mixed`는
  indeterminate/group summary 전용이며 activation은 `true`를 요청한다. 32×32 root와 20×20 indicator를
  유지하고 Native host 자체는 iOS 44×44pt·Android 48×48dp target을 제공한다.
- SegmentedControl은 타입에서 2–4개 option만 받고, 유효하지 않은 controlled value도 첫 option으로
  정규화해 정확히 하나의 radio를 선택한다. Web은 선택 항목 하나만 Tab stop으로 두고 방향키가 focus와
  선택을 함께 순환 이동한다. 320px × 48px root 안에서 option은 같은 폭을 나누고 긴 label은 줄인다.
  selected는 항목마다 border를 다시 만들지 않고 하나의 pill이 이동 방향으로 최대 8px만 60ms 동안
  늘어난 뒤 140ms 동안 목표 항목에 정착한다. 시각 전환은 `motion/duration/standard` 200ms와
  `motion/easing/standard`를 사용하고 accessible selected 상태는 즉시 갱신하며 reduced motion에서는 최종
  pill 위치를 즉시 표시한다.
- Light/Dark는 semantic theme token과 Storybook toolbar를 사용한다. Storybook 자동화와 Web 시각 검토는
  실제 screen reader, iOS·Android touch/focus 또는 Settings runtime 완료 증거가 아니며 PROD-727이 해당
  runtime QA를 계속 소유한다.
- 새 제품 정책이나 route 계약을 만들지 않고 승인된 Figma·Linear 계약을 코드로 이관하므로 별도 OpenSpec은
  만들지 않는다.

2026-09-09 검증: `pnpm --filter @kosmo/app test`로 Relay·TypeScript 검사, 단위 테스트 498개,
Storybook static build와 Storybook 테스트 707개가 통과했다. 내장 Browser에서 SegmentedControl의 320×48
root, 3개 option 균등 폭, 선택 이동과 최종 pill 위치를 확인했다. 실제 screen reader, iOS·Android
touch·focus, 빠른 연속 입력의 중간 frame은 확인하지 않았으며 PROD-727 runtime QA 범위로 남긴다.

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
