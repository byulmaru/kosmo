# Profile Mute·Block 디자인 계약

## 목적

Profile에서 Mute·Block·해제를 실행하고 관리 목록과 제한된 Profile 상태를 확인하는 시각·상호작용 계약을
정의한다. Mute와 Block은 같은 관리 진입점을 사용하지만 결과와 위험도를 합치지 않는다.

## Profile action과 완료 피드백

- Mute는 `이 프로필을 뮤트할까요?` 확인을 거친 뒤 실행한다. 취소하면 Profile과 관계 상태를 바꾸지 않는다.
- Mute 해제도 `이 프로필을 뮤트 해제할까요?` 확인을 거친다. `{표시 이름} 님의 게시물이 타임라인에 다시
표시되고 새 알림을 받을 수 있어요. 팔로우 관계는 유지돼요.`를 안내하고 `취소`·`뮤트 해제`를 제공한다.
  취소 시 요청하지 않으며 확인 후 성공한 경우에만 상태를 바꾸고 `{표시 이름} 님이 뮤트 해제되었어요`
  Toast를 표시한다. 이 확인 흐름은 2026-09-06 사용자 검토에서 확정했으며 기존 Figma loaded 관리 목록은
  해제 확인창 자체의 증거가 아니다.
- 프로필에서는 더보기 메뉴에 프로필 링크 복사·뮤트·차단을 이 순서로 합성한다. 승인된 Figma Target은 모든
  레이아웃에서 FollowButton 왼쪽 `16px` 간격의 `40×40` 원형 테두리 버튼이다. 메뉴 오른쪽 위를 trigger
  오른쪽 위에 맞춰 겹치게 두고 왼쪽·아래로 펼친다. viewport 경계에서는 위치·방향을 보정한다.
  Native 입력 target은 iOS 최소 `44pt`, Android 최소 `48dp`를 확보한다. 공용 컴포넌트에 반영했으며
  Web focus 복귀와 메뉴 배치를 Storybook에서 검증한다. Native 실기기 검증은 별도다.
  게시글은 기존 더보기 메뉴의 링크 복사·작성자 뮤트·작성자 차단을 이 순서로 합성하고 메뉴 배치를 유지한다.
  차단 항목의 패턴 합성은 2026-09-08 사용자 검토에 따른다.
  Profile/Post 합성 메뉴는 기존 차단·뮤트 메뉴와 같은 ActionMenu·ProfileMoreButton 및 Web 최소 폭 160px을 사용한다.
  차단 상태에서도 Hero의 기존 액션 영역(차단 해제 버튼 옆)에 더보기 진입점을 유지한다. header로 옮기지 않는다.
  Hero의 팔로우·차단 해제 버튼은 동일한 size를 사용한다: medium `96×40`, compact `72×32`.
  같은 ProfileMoreMenu에 링크 복사와 차단 해제를 표시하며, 메뉴와 Hero 버튼 모두 기존 확인 처리를 사용한다.
- Mute가 성공하면 기존 공용 Toast에 `{표시 이름} 님이 뮤트되었어요`를 표시하고 Mute 관리 action을
  `뮤트 해제`로 전환한다. `ProfileHero` 상단 Action SLOT의 관계 action은 바꾸지 않으며, 성공 전에 상태나
  Toast를 낙관적으로 확정하지 않는다.
- Mute가 확정된 직접 Profile은 기존 Profile 내용과 Post를 유지한다. 팔로잉·팔로워 수치 아래에는 canonical
  `VolumeOff`, `이 사용자의 게시글은 뮤트되어 있습니다.`, link-colored text action `뮤트 해제`를 한
  상태·action 행으로 표시한다. 상단 Action SLOT에는 현재 관계 상태에 맞는 기존 `FollowButton`의 `팔로우`
  또는 `팔로우 해제` action을 그대로 표시하며, Mute 상태를 경고 banner나 safety panel로 확장하지 않는다.
- 직접 방문한 Profile ID만 Mute 예외로 허용하고, 다른 Mute Target의 Post를 direct Source로 가진
  Repost·Quote는 목록에서 제외한다. 표시되는 Post는 기존 Post presentation을 유지한다. 본문·미디어를 Mute
  전용 disclosure로 접거나 별도 reveal을 요구하지 않는다. 작성자가 설정한 Content Warning과 Sensitive
  Media disclosure는 Profile Mute와 독립된 기존 계약대로 적용한다. Content가 없는 Repost와 Quote도 기존
  Repost Author attribution, direct Source, `PostActionBar` target routing과 Post presentation을 유지한다.
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
  `차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.` 설명, `취소`와 Danger `차단 해제` action을
  제공한다. 확인 전에는 요청하지 않고, 취소·닫기·Escape는 기존 차단 상태를 유지한다.
  이 확인 단계는 2026-09-05 PROD-861 구현 계획 검토에서 승인한 presentation 계약이며, Figma에 별도 해제
  confirmation consumer가 있다는 의미는 아니다. 해제 action의 Danger tone은 2026-09-08 사용자 검토에서
  확정했다. geometry는 기존 `ModalSheet`·`ConfirmationContent`를 따른다.
- 차단 확인의 결과 설명은 `상대방은 내 게시물을 볼 수 없고, 타임라인과 검색에서 서로의 게시물이 숨겨져요. 팔로우 관계와 요청은 삭제돼요.`를
  사용한다. 2026-09-09 [현재 Block 정책](../domain/objects/profile-block.md)에 맞춰
  Figma [`4595:6482`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4595-6482)의
  설명도 같은 문구로 갱신했다. 기존 리액션은 삭제하지 않는다. Storybook은 차단·해제 callback과 feedback을 검증하며 관계·리액션 정리를 구현하지 않는다.
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

- 차단 관계의 direct Profile route는 [Profile Block 조회 정책](../domain/objects/profile-block.md#조회-정책)과
  [Profile 조회 정책](../domain/objects/profile.md#조회-정책)에 따라 기존 공개 기본 Profile 정보와 콘텐츠 상태를
  함께 표시한다. `blocking`과 `blockedBy` 모두 Profile Node·handle route·일반 Profile 검색과 같은 기본 Profile
  정보 범위를 사용한다.
- `blocking` 화면에서는 Target Profile의 Post List·Post detail·첨부 Media를 기존 Post·Media 조회 정책으로
  제공한다. Profile route는 콘텐츠 경고를 먼저 표시하고, 사용자가 확인한 뒤 해당 결과를 표시한다. 경고의
  구체적인 문구와 표시 기간은 후속 디자인 계약에서 정한다.
- `blockedBy` 화면에서는 Owner Profile의 기본 Profile 정보를 유지하면서 Post·Media 콘텐츠 차단 상태를 표시한다.
  양방향 Block이면 양쪽 화면에서 콘텐츠 차단 상태를 적용하며, Profile route와 다른 API 표면은 같은 콘텐츠 정책을
  사용한다. 차단 해제의 data와 lifecycle은 적용 Product/OpenSpec/runtime 범위다.
- Mobile Dark [`6774:12067`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6774-12067), Compact Web Light
  [`7371:19453`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7371-19453), Full Web Light
  [`7380:20771`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7380-20771), Mobile Dark
  [`7580:14180`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7580-14180)와 Full Web
  [`4592:16216`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4592-16216)은 기존 route chrome과 StateView
  조립의 물리적 참고 자료로 유지한다. 이 Target들은 현재 기본 Profile 정보와 방향성 콘텐츠 조회 계약의 전체
  표현을 확정하지 않는다.
- Mobile은 MenuOnly header와 BottomTabBar, Compact는 Sidebar, Full은 Sidebar와 RightRail을 유지한다. Web 중앙
  column에는 별도 PageHeader를 두지 않는다. Sidebar와 RightRail의 로그인 Owner 정보는 차단 Target identity가
  아니다.

### PROD-861 Storybook 표현의 범위

2026-09-08 사용자 검토에서 Storybook의 `blocking` 표현은 Legacy 페이지의
[`Profile / Blocked · 348:3910`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=348-3910)으로 승인했다.
이 Storybook 표현에는 DSN-53 중앙 안내형 `7580:14180`·`4592:16216` 대신 다음 조립을 사용한다.

- cover·avatar·표시 이름·handle·bio·태그·팔로우 수치와 게시물·답글·미디어·별 탭을 유지한다.
  FollowButton 자리에 Secondary `차단 해제`를 두고, 게시물 영역에는 `차단됨`과 원본 설명
  `이 사용자의 게시물·프로필을 보지 않아요.`를 표시한다. 탭 전환에도 이 안내를 유지한다.
  과거 placeholder·typography 대신 현재 production ProfileHero·TabList·Button을 재사용한다.
- Mobile은 이름·뒤로가기 header 아래에 배치하고 BottomTabBar를 추가하지 않는다.
  Compact·Full은 기존 Sidebar 옆 600px Profile column에 배치하며 별도 RightRail을 추가하지 않는다.
- 해제 확인·pending·취소·실패·retry 계약을 유지한다. 성공하면 같은 Hero의 FollowButton을 복원하고
  게시물 안내를 제거한다. 이전 Follow 관계를 복원한다는 의미는 아니다.

이 fixture의 안내와 콘텐츠 숨김은 위의 최신 runtime 조회 정책을 정의하지 않는다. 양쪽 기본 Profile 정보 유지와
viewer 방향별 콘텐츠 정책은 위 계약을 따르며, 실제 route의 경고 확인 뒤 콘텐츠 노출은 PROD-823이 기존 레거시 UI에
구현·통합한다. PROD-917의 신규 UI 교체는 별도 후속 범위다. PROD-861은 `blockedBy` 화면을 구현하지 않으며,
기존 identity-free Figma Target은 물리 참고 자료다. Storybook 검증은 API·actor·cache와 runtime 완료 증거가 아니다.

## 뮤트 관계의 직접 Profile

- Mobile Light Target [`7541:14061`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7541-14061)은
  기존 Android baseline Profile shell과 전체 `ProfileHero`, Post, BottomTabBar를 유지한다. `ProfileHero`의
  `Muted=true`는 Mute 상태·해제 action을 표시하는 근거로만 사용한다.
- ProfileHero 안에 `이 사용자의 게시글은 뮤트되어 있습니다.`와 `뮤트 해제` action을 표시하며 별도
  `StateView`나 새 화면 컴포넌트는 추가하지 않는다. Post에는 `PostContent.CW=MutedCollapsed` 또는
  `MutedRevealed`를 적용하지 않는다. 방문한 Profile만 Mute 예외로 허용하며, 다른 muted Source Author를
  제외하고 기존 Post Visibility·Eligibility를 통과한 결과를 평소와 같이 표시한다.
- Figma의 [`Mobile Text MutedCollapsed`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7648-1590),
  [`MutedRevealed`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7648-1607)와 공용
  `PostContentWarning`의 `Reason=Muted` source는 이전 검토 흔적으로만 남아 있다. 직접 Profile의 현재 제품
  계약이나 runtime 구현 근거로 사용하지 않는다.

## Source 재사용과 접근성

- Button, ActionMenu, ModalSheet, Toast, SettingsItem, SettingsNavigationList, ProfileHero, StateView와
  Profile shell의 기존 production source를 재사용한다. 이 흐름만을 위한 새 Toast나 범용 safety component를
  만들지 않는다.
- Mobile Muted·Blocked 목록의 loaded action은 `64px` ProfileListItem 안에서 공용 Default Secondary button을
  `88×40px` visual로 유지하고 투명 `88×48dp` wrapper 가운데 배치한다. 공용 Button source와 Web compact
  geometry는 변경하지 않는다.
- 확인은 공용 [`ConfirmationContent`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5103-15173)를
  사용한다. Mute는 `Tone=Primary`, Block·Unblock은 `Tone=Danger`이며 각 action의 `Idle|Pending`에서 같은 제목·설명·action
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

`ProfileMoreMenu`가 Profile/Post의 단일 ActionMenu를 소유하고, 뮤트 확인 처리는 관리용
`ProfileMuteAction`과 함께 기존 ModalSheet·ConfirmationContent·ToastProvider를 재사용한다.
확인과 pending/dismiss, 오류 피드백은 공용 UI 경계에서 제공하며 실제 요청은 callback으로 전달한다.
관리 목록은 `MutedProfileList`, 행 표시는 기존 Relay `ProfileListItem`과 공유하는 `ProfileListItemContent`를 사용한다.
Relay 행은 `identity`로 기존 `ProfileNameBlock`을 전달하고, 관리 목록은 이름·핸들 기본 표시를 사용한다.
행의 action은 `children`으로 합성하며, FollowButton의 Web·Native 크기 선택은 Relay wrapper가 유지한다.
`ProfileHero.mute.muted`에는 서버 확정 상태를 전달하고, loading에서는 메뉴·상태행을 표시하지 않는다.

- 요청 callback은 성공할 때 resolve하고 실패할 때 reject한다. 성공 feedback이 전달되기 전에는 낙관적으로
  상태를 전환하거나 목록 항목을 제거하지 않는다. `onFeedback`은 요청의 성공/실패를 관찰하며 성공 이후의
  확정 표시 갱신에도 사용할 수 있다. pending target 교체 시 이전 completion의 UI feedback은 폐기한다.
- 목록은 loading/error/loaded와 pagination의 more/loading/error/end를 구분한다. 최초·추가 조회 실패는
  inline 오류 대신 공용 danger Toast와 `다시 시도` action으로 안내한다. 추가 실패에도 기존 목록은 유지한다.
  Toast가 사라지거나 다른 알림으로 교체되어도 재시도할 수 있도록 최초 실패에는 `다시 시도`, 추가 실패에는
  `더 불러오기` 버튼을 본문에 유지한다. 오류 해소·화면 이탈 시 해당 Toast를 정리한다. 초기/추가 요청과
  실제 Relay connection·cursor·cache 연결은 PROD-814 소유다.
- 직접 확인하는 loaded 화면은 [Mobile](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8075),
  [Compact](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-24942),
  [Full](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25436)이다.
- `KOSMO/Patterns/ProfileHero`, `KOSMO/Patterns/Post/Mute`, `KOSMO/Patterns/Profile/Muted Profiles`에서
  실제 프로필·게시글·관리 목록 맥락으로 검토한다. 단독 Mute Action Playground는 유지하지 않는다.
  Playground는 수동 Controls·Actions, 각 Tests 하위는 자동 interaction을 소유한다.
- 뮤트·해제 확인창의 초기 focus는 취소이며 pending에는 중복 요청·dismiss를 막는다. 실패 시 확정 관계와 목록 항목을 유지하고 확인창을 닫는다. 닫힘이 완료되면 원래 action으로 focus를
  복구하고 공용 danger Toast로 오류를 안내하며 error feedback을 전달한다. 재시도는 action을 다시 열어 진행한다. 성공 후 확인창이
  닫힌 다음 완료 Toast와 feedback을 전달하며,
  제거되는 관리 행 대신 목록 heading, 제거되는 ProfileHero 상태행 대신 팔로잉 링크로 focus를 옮긴다.
- `ProfileHero.mute`는 현재 확정 상태와 mutation callback을 함께 받는다. `PostLayout.mute`는 해당
  더보기 메뉴 작성자의 Profile ID까지 명시하며 selected Profile 자신 또는 다른 작성자에는 노출하지
  않는다. 실제 mutation·Relay 연결은 PROD-814 소유다.
- Current: 위 공용 컴포넌트와 Storybook 검증 표면. Target: 실제 Profile/Settings route에서의 사용.
  Product not implemented: 뮤트 storage·GraphQL·content policy·Relay 연동 및 Web/iOS/Android 종단 간 검증.
  PROD-824·825·814의 완료나 `add-profile-mute` OpenSpec 전체 완료를 뜻하지 않는다.

## Storybook 이관 · PROD-861

`ProfileMoreMenu`는 기존 Profile/Post 메뉴에 차단 항목을 합성한다. 확인 처리는 관리용
`ProfileBlockAction`과 공유하며, 기존 ModalSheet·ConfirmationContent·ToastProvider를 사용해 차단과 해제를
모두 확인 후 실행한다. `BlockedProfileList`는 `ProfileListItemContent`를 재사용하며 별도 차단 목록과
loading/error·retry/empty/pagination 상태를 제공한다. Mute 목록과 상태를 공유하거나 합치지 않는다.

- 실제 요청은 Promise callback으로 받는다. 성공 `onFeedback` 뒤 consumer가 확정 상태·목록을 갱신하며,
  실패하면 기존 상태를 유지하고 확인창을 닫는다. 닫힘 완료 후 원래 trigger focus를 복원한 뒤 공용 오류
  Toast를 표시하며, 같은 action을 다시 열어 재시도한다. `onDismiss`는 사용자 취소·닫기만
  전달한다. pending에는 중복 요청·dismiss를 막고, 대상 Profile 교체 후 이전 완료의 feedback을 폐기한다.
- 초기 focus는 `취소`이며 성공·실패·취소로 확인창을 닫은 뒤 원래 trigger로 돌아간다. 목록의 해제
  성공 feedback으로 행을 제거하면 목록 제목으로 focus를 이동한다. 게시글 차단 성공으로 기존 trigger가
  제거되면 새로 표시된 차단 안내 영역으로 focus를 이동한다.
- 2026-09-08 뮤트 개선 적용 요청에 따라 메뉴 trigger는 공용 `ProfileMoreButton`을 재사용한다.
  최초·추가 조회 실패는 공용 danger Toast의 `다시 시도`로 알리고, Toast가 사라진 뒤에도 본문에
  최초 `다시 시도`·추가 `더 불러오기`를 유지한다. Playground의 retry와 pagination은 fixture 상태를 실제 전환한다.
- loaded 대표는 [Mobile 390](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8089),
  [Compact 1024](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25102),
  [Full 1440](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25582)을 따른다.
  행은 64px이며 표시 이름은 `UI/Label/L`(16px/24px, 600)을 사용한다. 해제 버튼 visual은 Mobile `88×40`, Web Compact·Full `72×32`다. Native target은
  시각 geometry를 유지하면서 iOS 44pt·Android 48dp로 확장한다.
- 독립 `KOSMO/Patterns/Profile/Block Action` 카탈로그는 제거한다. `ProfileHero`, `Post/Block`,
  `Profile/Blocked Profiles`의 Playground는 수동 Controls·Actions, 각 Tests 하위는 자동 interaction을 소유한다.
- `ProfileHero.block`은 상태에 따라 `onBlock` 또는 `onUnblock`과 `onFeedback`·`onDismiss`를 받는다.
  Profile/Post 메뉴의 확인창은 취소·닫기·Escape를 `onDismiss`로 전달하고 성공·실패 feedback과 구분한다.
  `PostLayout.block`은 작성자
  Profile ID도 받으며, 실제 action 대상 작성자와 일치하고 selected Profile 자신이 아닐 때만 항목을 표시한다.
  loading Profile에는 메뉴를 표시하지 않는다. ProfileHero 패턴은 차단 성공 뒤에도 Hero를 유지하며
  FollowButton을 ProfileBlockAction으로 바꾼다. `Screens/Profile Block`은 기존 SidebarNavigation·PageHeader·
  ProfileHero·TabList·StateView를 조합해 Profile 유지와 차단된 게시물 영역, 차단→해제 presentation을 검증한다.
  별도 ProfileBlockingState wrapper나 StateView 전용 action slot은 추가하지 않는다. 실제 route·Settings shell·API 연결은
  이 Storybook 증거에 포함하지 않는다.
- Current는 이 공용 UI와 Storybook presentation이다. 실제 Profile·Settings 조립은 PROD-917,
  mutation·Relay/cache 연결은 PROD-823이 소유한다.
  Product not implemented: 저장·cleanup·GraphQL·Relay/cache·actor 전환·실제 Web/iOS/Android 종단 간 검증.
  `add-profile-block` task 3.x와 전체 검증·archive는 각각 PROD-823·PROD-813이 계속 소유한다.
