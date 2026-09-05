# Profile Mute·Block 디자인 계약

## 목적

Profile에서 Mute·Block·해제를 실행하고 관리 목록과 제한된 Profile 상태를 확인하는 시각·상호작용 계약을
정의한다. Mute와 Block은 같은 관리 진입점을 사용하지만 결과와 위험도를 합치지 않는다.

## Profile action과 완료 피드백

- Mute는 `이 프로필을 뮤트할까요?` 확인을 거친 뒤 실행한다. 취소하면 Profile과 관계 상태를 바꾸지 않는다.
- Mute가 성공하면 기존 공용 Toast에 `{표시 이름} 님이 뮤트되었어요`를 표시하고 Mute 관리 action을
  `뮤트 해제`로 전환한다. `ProfileHero` 상단 Action SLOT의 관계 action은 바꾸지 않으며, 성공 전에 상태나
  Toast를 낙관적으로 확정하지 않는다.
- Mute가 확정된 직접 Profile은 기존 Profile 내용과 Post를 유지한다. 팔로잉·팔로워 수치 아래에는 canonical
  `VolumeOff`, `이 사용자의 게시글은 뮤트되어 있습니다.`, link-colored text action `뮤트 해제`를 한
  상태·action 행으로 표시한다. 상단 Action SLOT에는 현재 관계 상태에 맞는 기존 `FollowButton`의 `팔로우`
  또는 `팔로우 해제` action을 그대로 표시하며, Mute 상태를 경고 banner나 safety panel로 확장하지 않는다.
- 같은 Profile의 각 Post는 작성자·시간·`PostActionBar`를 유지하되 본문·미디어를 기본 접힘으로 표시한다.
  Mute disclosure는 작성자 Content Warning을 대체하지 않는 바깥 gate다. 작성자 Content Warning도 있는
  Post는 처음에 Mute와 작성자 Content Warning을 각각 `Collapsed`로 유지하며, Mute의 `내용 보기`를 눌러도
  안쪽 작성자 summary와 gate는 계속 접힌 상태로 둔다. 적용 중인 Mute와 작성자 Content Warning gate를 모두
  `Revealed`해야 본문을 표시하며, 미디어는 그 조건을 충족한 뒤에도 기존 Sensitive Media disclosure가
  `Revealed`인 경우에만 표시한다. 작성자 Content Warning이 없는 Post는 `PostContent.CW=MutedCollapsed`의 기존 content warning
  disclosure 배치와 펼침 동작을 재사용하고, `VolumeOff`, `뮤트된 사용자의 게시물입니다`, content meta,
  `내용 보기`를 표시한다. 펼치면 `CW=MutedRevealed`와 `다시 가리기`를 사용한다. 이 문구는 작성자가 입력한
  content warning summary가 아니라 Mute 관계에서 정해지는 고정 안내다. Sensitive Media disclosure는 기존
  계약대로 이 gate들과 독립적으로 유지한다. Content가 없는 순수 Repost는 새 `PostContent Kind=Repost`를
  만들지 않는다. Repost Author attribution, direct Source의 작성자·시간과 기존 순수 Repost `PostActionBar`
  target routing을 유지하고, Source의 본문·미디어 영역에는 같은 Mute disclosure를 바깥 gate로 적용한다.
  Source에 작성자 Content Warning 또는 Sensitive Media가 있으면 위 중첩 순서를 그대로 유지한다.
- Profile 데이터 로딩 중에는 기존 `ProfileHero` loading·skeleton variant를 유지하고 Mute 상태·action 행은
  loading이 끝난 뒤에만 표시한다.
- 현재 Mute는 영구 적용만 제공한다. 기간 선택 control과 만료 상태는 표시하지 않는다.
- 향후 기간 지정 Mute가 별도 계약으로 도입되면 같은 Toast의 message만
  `{표시 이름} 님이 {기간} 동안 뮤트되었어요`로 확장한다. 기간은 승인된 preset을 기존 단일 선택 control로
  선택하고 `{기간}`에는 그 preset의 표시 문구를 사용한다. 직접 날짜·시각 입력이나 전용 picker는 제공하지
  않는다.
- Block은 관계·상호작용 정리 결과를 설명하는 별도 확인을 사용한다. Mute 확인 문구나 완료 상태를 재사용해
  두 행동의 결과를 같게 표현하지 않는다.
- 차단 해제도 차단과 같은 공용 확인창을 거친다. `이 프로필의 차단을 해제할까요?` 제목,
  `차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.` 설명, `취소`와 Primary `차단 해제` action을
  제공한다. 확인 전에는 요청하지 않고, 취소·닫기·Escape는 기존 차단 상태를 유지한다.
  이 확인 단계는 2026-09-05 PROD-861 구현 계획 검토에서 승인한 presentation 계약이며, Figma에 별도 해제
  confirmation consumer가 있다는 의미는 아니다. geometry는 기존 `ModalSheet`·`ConfirmationContent`를 따른다.
- 차단 확인의 결과 설명은 `서로의 프로필과 게시물을 볼 수 없게 되고, 팔로우 관계와 요청이 삭제돼요.`를
  사용한다. Figma [`4595:6482`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4595-6482)에
  남아 있는 기존 리액션 삭제 문구는 [현재 Block 정책](../domain/objects/profile-block.md)과 다르므로
  이관하지 않는다. Storybook은 차단·해제 callback과 feedback을 검증하며 관계·리액션 정리를 구현하지 않는다.
- pending에는 같은 action의 중복 입력과 dismiss를 막고 busy 상태를 전달한다. 실패하면 기존 서버 확정 상태를
  유지하고 제품의 기존 오류 피드백을 사용한다.

## 설정 정보 구조

- Settings root에는 `뮤트 및 차단` 진입점 하나를 제공한다.
- 진입점 안에는 `뮤트한 프로필`과 `차단한 프로필`을 이 순서의 별도 destination으로 제공한다. 두 상태를
  하나의 혼합 목록이나 filter로 만들지 않는다.
- 각 목록은 자기 heading, loading, error·retry, empty, pagination과 해제 action을 소유한다. 한 목록의 상태나
  action이 다른 목록의 항목을 바꾸지 않는다.
- full Web은 기존 Settings master/detail 문법을, compact Web·mobile Web·Android·iOS는 기존 한 화면 이동
  문법을 사용한다. Mute·Block 때문에 새 Settings shell이나 navigation pattern을 만들지 않는다.
- Target screen evidence는 [`05 Screens - Web`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-16233)의
  Full·Compact loaded destination 4개, Full Settings master의 두 destination 하위 목록, Compact category
  [`6338:1641`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6338-1641)과
  [`04 Screens - Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8075)의
  Mobile category [`6393:8193`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6393-8193) 및
  loaded destination 2개다. 모든 viewport에서 category와 destination의 IA coverage가 연결된다.
  loading·empty·error·pagination은 이 loaded representative와 별도의 runtime state coverage다.

## 차단 관계의 직접 Profile

- 차단 관계의 direct Profile route는 [Profile Block 조회 정책](../domain/objects/profile-block.md#조회-정책)을 따르는
  identity-free presentation이다. `blocking`·`blockedBy` 모두 Target의 identity·content·social action을 표시하지
  않는다.
- `blockedBy` Target은 별개 오류 화면을 만들지 않고 viewport별 기존 Profile route chrome 안의 중앙 column에
  actionless `StateView`로 `이 프로필을 볼 수 없습니다`만 표시한다. Mobile Dark
  [`6774:12067`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6774-12067), Compact Web Light
  [`7371:19453`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7371-19453), Full Web Light
  [`7380:20771`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7380-20771)이 exact evidence다.
- `blocking`도 같은 identity-free route shell을 사용하되 action이 있는 `StateView`로 `차단한 프로필입니다`와
  Secondary `차단 해제`를 제공한다. Mobile Dark [`7580:14180`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7580-14180)과
  Full Web [`4592:16216`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4592-16216)이
  Target evidence다. 차단 해제의 data와 lifecycle은 적용 Product/OpenSpec/runtime 범위다.
- Mobile은 MenuOnly header와 BottomTabBar, Compact는 Sidebar, Full은 Sidebar와 RightRail을 유지한다. Web 중앙
  column에는 별도 PageHeader를 두지 않는다. Sidebar와 RightRail의 로그인 Owner 정보는 차단 Target identity가
  아니다.
- Block 관리 목록에서 관계 관리를 위해 표시하는 최소 identity는 direct Profile route의 identity 노출 근거가
  아니다.

## 뮤트 관계의 직접 Profile

- Mobile Light Target [`7541:14061`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7541-14061)은
  기존 Android baseline Profile shell과 전체 `ProfileHero`, Post, BottomTabBar를 유지하고 `ProfileHero`의
  `Muted=true`와 Post의 중첩 `PostContent.CW=MutedCollapsed`를 적용한다.
- ProfileHero 안에 `이 사용자의 게시글은 뮤트되어 있습니다.`와 `뮤트 해제` action을 표시하며 별도
  `StateView`나 새 화면 컴포넌트는 추가하지 않는다. Post에서는 작성자·시간·`PostActionBar`를 유지하고
  본문을 [`PostContent`의 Mobile Text MutedCollapsed variant](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7648-1590)로
  가린다. 대응하는 [`MutedRevealed`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7648-1607)는
  같은 행 아래에 본문을 다시 표시하는 source state다.
- 공용 [`PostContentWarning`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5001-14786)은
  각 disclosure의 visual state를 `Reason=ContentWarning|Muted`, `State=Collapsed|Revealed`로 구분해 제공한다.
  여기서 `Reason`은 Figma source의 visual state 구분이며, Content Warning과 Mute를 하나의 배타적 gate로
  선택한다는 뜻이 아니다. 실제 조합에서는 Mute variant가 바깥 disclosure가 되고 기존 content warning variant가
  안쪽 독립 gate로 남는다. 기존 content warning은 `EyeOff`와 입력 가능한 summary를 유지하고, Mute variant
  [`Collapsed`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7644-1544)·[`Revealed`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7644-1550)는
  `VolumeOff`와 고정 summary를 사용한다. 두 gate가 동시에 적용된 경우 Mute만 펼쳐도 본문·미디어가 노출되지
  않으며, 두 gate를 모두 펼친 뒤에도 Sensitive Media가 `Collapsed`이면 미디어는 계속 가린다. Sensitive Media
  state도 별도 계약으로 유지한다. Dark consumer는 이번 범위에서 만들지 않았고 실제
  게시물별 reveal state·뮤트 해제 동작은 runtime 완료 증거가 아니다.

## Source 재사용과 접근성

- Button, ActionMenu, ModalSheet, Toast, SettingsItem, SettingsNavigationList, ProfileHero, StateView,
  PostContentWarning, PostContent와 Profile shell의 기존 production source를 재사용한다. 이 흐름만을 위한 새
  Toast나 범용 safety component를 만들지 않는다.
- Mobile Muted·Blocked 목록의 loaded action은 `64px` ProfileListItem 안에서 공용 Default Secondary button을
  `88×40px` visual로 유지하고 투명 `88×48dp` wrapper 가운데 배치한다. 공용 Button source와 Web compact
  geometry는 변경하지 않는다.
- 확인은 공용 [`ConfirmationContent`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5103-15173)를
  사용한다. Mute·Unblock은 `Tone=Primary`, Block은 `Tone=Danger`이며 각 action의 `Idle|Pending`에서 같은 제목·설명·action
  label을 유지한다.
- Mute 상태·action 행은 `ProfileHero` 내부 sublayer로 유지하고 Profile hashtag 의미를 가진
  `ProfileTagChip`이나 새 범용 Badge로 승격하지 않는다. 팔로잉·팔로워 아래 `space/8`을 두고, canonical
  `VolumeOff` `icon/size/16`, secondary 상태 문구와 `UI/Label/M` text action을 `space/8` 간격으로 배치한다.
  text action은 내용 너비를 HUG하고 시각 높이 `32`를 유지하며 별도 surface fill, border, radius를 추가하지
  않는다. 이 전용 sublayer를 새 범용 TextAction component로 승격하지 않는다.
- `뮤트 해제`의 Rest는 `color/action/link/base`, Hover는 `color/action/link/hover`, Pressed는
  `color/action/link/pressed`를 사용한다. 정보 상태 행 안에 있지만 Info Purple을 링크처럼 사용하지 않으며,
  FocusVisible은 기존 `color/state/focus-ring` 계약을 따른다.
- Center에서는 상태 문구와 `뮤트 해제`를 내용 너비로 바로 이어 붙이고, Mobile에서는 상태 문구가 남은 너비를
  사용하며 text action은 HUG해 서로 침범하지 않게 한다. 표시 이름은 상태 행과 별도 행에서 전체 너비를
  사용하고 길어지면 기존 Profile typography의 줄바꿈·높이 확장 동작을 유지한다.
- 수정하는 텍스트는 기존 typography variable 또는 binding을 유지한다. raw font size·weight·line height 값을
  새로 입력하지 않는다.
- `VolumeOff`는 보이는 Mute 상태 문장을 보조하는 장식 아이콘이다. production runtime은 같은 Mute 상태를
  보조 기술에 프로그램적으로 전달하고 아이콘에 중복 이름을 부여하지 않는다. `뮤트 해제`는 navigation
  Link가 아닌 local button action으로 구현하고 그 이름을 그대로 제공한다. Web 시각 target은 내용 너비와
  높이 `32`를 사용하며, Native 실제 입력 target은 시각 geometry를 바꾸지 않고 iOS `44×44 pt`, Android
  `48×48 dp`를 충족하되 인접한 Connections action과 겹치지 않게 한다.
- 확인 UI는 제목, 결과 설명, `취소`와 확정 action, 안전한 초기 focus, modal 의미와 Web `Escape`·Native back
  동작을 제공한다.
- Toast는 기존 공용 host의 체류시간·교체·safe area·보조 기술 announcement 계약을 그대로 사용한다.
- Light/Dark, Mobile 390, Web 1024·1440에서 reflow, focus 순서, touch target과 긴 표시 이름을 확인한다.

## 제외 범위

- 기간 Mute의 구체 preset 값과 만료 저장·변경·자동 해제
- DB·GraphQL·Relay·federation 구현과 콘텐츠·Notification 정책 자체
- Mute와 Block을 합친 단일 관리 목록 또는 새 Settings shell
- Figma 결과를 production runtime 완료 증거로 사용하는 것

## Storybook 이관 · PROD-858

`ProfileMuteAction`은 기존 ActionMenu·ModalSheet·ConfirmationContent·ToastProvider를 재사용한다.
확인과 pending/dismiss, 오류 피드백은 공용 UI 경계에서 제공하며 실제 요청은 callback으로 전달한다.
관리 목록은 `MutedProfileList`, 행 표시는 기존 Relay `ProfileListItem`과 공유하는 `ProfileListItemContent`를 사용한다.
`ProfileHero.mute`는 서버 확정 뮤트 상태에서만 제공하고, loading에서는 내부 상태행을 표시하지 않는다.

- 요청 callback은 성공할 때 resolve하고 실패할 때 reject한다. 성공 feedback이 전달되기 전에는 낙관적으로
  상태를 전환하거나 목록 항목을 제거하지 않는다. `onFeedback`은 요청의 성공/실패를 관찰하며 성공 이후의
  확정 표시 갱신에도 사용할 수 있다. pending target 교체 시 이전 completion의 UI feedback은 폐기한다.
- 목록은 loading/error/loaded와 pagination의 more/loading/error/end를 구분한다. 초기/추가 요청과
  실제 Relay connection·cursor·cache 연결은 PROD-814 소유다.
- 직접 확인하는 loaded 화면은 [Mobile](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8075),
  [Compact](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-24942),
  [Full](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25436)이다.
- `KOSMO/Patterns/Profile/Mute Action`과 `Muted Profiles`의 Playground는 수동 Controls·Actions,
  각 Tests 하위는 자동 interaction을 소유한다. ProfileHero의 muted 상태도 기존 component title에서 검증한다.
- Current: 위 공용 컴포넌트와 Storybook 검증 표면. Target: 실제 Profile/Settings route에서의 사용.
  Product not implemented: 뮤트 storage·GraphQL·content policy·Relay 연동 및 Web/iOS/Android 종단 간 검증.
  PROD-824·825·814의 완료나 `add-profile-mute` OpenSpec 전체 완료를 뜻하지 않는다.

## Storybook 이관 · PROD-861

`ProfileBlockAction`은 기존 ActionMenu·ModalSheet·ConfirmationContent·ToastProvider를 사용해 차단과 해제를
모두 확인 후 실행한다. `BlockedProfileList`는 `ProfileListItemContent`를 재사용하며 별도 차단 목록과
loading/error·retry/empty/pagination 상태를 제공한다. Mute 목록과 상태를 공유하거나 합치지 않는다.

- 실제 요청은 Promise callback으로 받는다. 성공 `onFeedback` 뒤 consumer가 확정 상태·목록을 갱신하며,
  실패하면 기존 상태와 확인창을 유지하고 오류 Toast·재시도를 제공한다. `onDismiss`는 사용자 취소·닫기만
  전달한다. pending에는 중복 요청·dismiss를 막고, 대상 Profile 교체 후 이전 완료의 feedback을 폐기한다.
- 초기 focus는 `취소`, 실패 후 focus는 확인창의 `취소`, 닫은 뒤에는 원래 trigger로 돌아간다. 목록의 해제
  성공으로 행이 제거되면 다음 행의 해제 버튼, 다음 행이 없으면 이전 행, 목록이 비면 제목으로 이동한다.
- loaded 대표는 [Mobile 390](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8089),
  [Compact 1024](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25102),
  [Full 1440](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25582)을 따른다.
  행은 64px, 해제 버튼 visual은 Mobile `88×40`, Web Compact·Full `72×32`다. Native target은
  시각 geometry를 유지하면서 iOS 44pt·Android 48dp로 확장한다.
- `KOSMO/Patterns/Profile/Block Action`과 `Blocked Profiles`의 Playground는 수동 Controls·Actions,
  각 Tests 하위는 자동 interaction을 소유한다. 새 route·Settings shell과 차단된 direct Profile 화면은 만들지 않는다.
- Current는 이 공용 UI와 Storybook presentation이며, Target은 PROD-823의 실제 Profile·Settings 연결이다.
  Product not implemented: 저장·cleanup·GraphQL·Relay/cache·actor 전환·실제 Web/iOS/Android 종단 간 검증.
  `add-profile-block` task 3.x와 전체 검증·archive는 각각 PROD-823·PROD-813이 계속 소유한다.
