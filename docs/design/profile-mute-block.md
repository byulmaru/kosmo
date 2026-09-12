# Profile Mute·Block 디자인 계약

## 목적

Profile에서 Mute·Block·해제를 실행하고 관리 목록과 제한된 Profile 상태를 확인하는 시각·상호작용 계약을
정의한다. Mute와 Block은 같은 관리 진입점을 사용하지만 결과와 위험도를 합치지 않는다.

## Profile action과 완료 피드백

- Block 생성·해제와 관리 action은 현재 selected Local Profile이 Owner일 때만 제공한다. Remote Profile이
  selected된 상태에서는 기존 Profile identity와 viewer 방향 콘텐츠 상태를 표시하되 실행할 수 없는 Block 관리
  action을 제공하지 않으며, Remote Owner의 Block/Undo ingress는 `PROD-818`이 소유한다.
- Mute는 `이 프로필을 뮤트할까요?` 확인을 거친 뒤 실행한다. 취소하면 Profile과 관계 상태를 바꾸지 않는다.
- Mute 해제도 `이 프로필을 뮤트 해제할까요?` 확인을 거친다. `{표시 이름} 님의 게시물이 홈과 로컬 타임라인에 다시
표시돼요. 팔로우 관계는 유지돼요.`를 안내하고 `취소`·`뮤트 해제`를 제공한다.
  취소 시 요청하지 않으며 확인 후 성공한 경우에만 상태를 바꾸고 `{표시 이름} 님이 뮤트 해제되었어요`
  Toast를 표시한다. 이 확인 흐름은 2026-09-06 사용자 검토에서 확정했으며 기존 Figma loaded 관리 목록은
  해제 확인창 자체의 증거가 아니다.
- 프로필에서는 더보기 메뉴가 프로필 링크 복사·뮤트·차단 항목을 이 순서로 합성한다. 뮤트 액션은 Relay fragment·mutation·확인창과
  pending을 소유한 메뉴 항목으로 참여하며 더보기 메뉴와 trigger 전체를 소유하지 않는다. 승인된 Figma Target은 모든
  레이아웃에서 FollowButton 왼쪽 `16px` 간격의 `40×40` 원형 테두리 버튼이다. 메뉴 오른쪽 위를 trigger
  오른쪽 위에 맞춰 겹치게 두고 왼쪽·아래로 펼친다. viewport 경계에서는 위치·방향을 보정한다.
  Native 입력 target은 iOS 최소 `44pt`, Android 최소 `48dp`를 확보한다. 공용 컴포넌트에 반영했으며
  Web focus 복귀와 메뉴 배치를 Storybook에서 검증한다. Native 실기기 검증은 별도다.
  게시글은 기존 더보기 메뉴의 링크 복사·작성자 뮤트·작성자 차단을 이 순서로 합성하고 메뉴 배치를 유지한다.
  차단 항목의 패턴 합성은 2026-09-08 사용자 검토에 따른다.
  Profile/Post 합성 메뉴는 기존 차단·뮤트 메뉴와 같은 ActionMenu·ProfileMoreButton 및 Web 최소 폭 160px을 사용한다.
  차단 상태에서도 Hero의 기존 액션 영역(차단 해제 버튼 옆)에 더보기 진입점을 유지한다. header로 옮기지 않는다.
  Hero의 팔로우·차단 해제 버튼은 동일한 Default `96×40` size를 사용한다.
  같은 ProfileMoreMenu에 링크 복사와 차단 해제를 표시하며, 메뉴와 Hero 버튼 모두 기존 확인 처리를 사용한다.
- Mute가 성공하면 기존 공용 Toast에 `{표시 이름} 님이 뮤트되었어요`를 표시하고 Mute 관리 action을
  `뮤트 해제`로 전환한다. `ProfileHero` 상단 Action SLOT의 관계 action은 바꾸지 않으며, 성공 전에 상태나
  Toast를 낙관적으로 확정하지 않는다.
- Mute·해제 성공 직후 현재 selected Profile의 viewer-relative 관계와 Settings 관리 connection은 `PROD-814`가
  소유한 mutation 응답/Relay 갱신으로 반영한다. 이미 로드된 Home·Local timeline은 Mute 전용 강제 재조회 대상이
  아니며, mutation 자체가 해당 timeline을 다시 조회하도록 요구하지 않는다. 이후 사용자가 발생시킨
  refresh·navigation·새 query 같은 다음 조회에서 서버 후보 정책으로 수렴한다. 클라이언트에서 Mute 후보를
  별도로 필터링하지 않는다.
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
  설명도 같은 문구로 갱신했다. 기존 리액션은 삭제하지 않는다. 현재 Storybook은 메뉴·목록 presentation을 검증하며 차단·해제 요청과 관계·리액션 정리를 구현하지 않는다.
- pending에는 같은 action의 중복 입력과 dismiss를 막고 busy 상태를 전달한다. 실패하면 기존 서버 확정 상태를
  유지하고 제품의 기존 오류 피드백을 사용한다.

## 설정 정보 구조

- Settings root에는 `뮤트 및 차단` 진입점 하나를 제공한다.
- 진입점 안에는 `뮤트한 프로필`과 `차단한 프로필`을 이 순서의 별도 destination으로 제공한다. 두 상태를
  하나의 혼합 목록이나 filter로 만들지 않는다.
- 각 목록은 자기 heading, loading, error·retry, empty, pagination과 해제 action을 소유한다. 한 목록의 상태나
  action이 다른 목록의 항목을 바꾸지 않는다.
- 같은 Target에 Mute와 Block이 모두 적용돼도 두 관리 관계는 각각의 목록·관계 Node·해제 경로에 남는다. Active
  Block은 일반 Profile 조회를 숨기지 않는다. Profile identity는 기존 lifecycle·membership 정책을 따르며, Block은
  콘텐츠·상호작용·알림 surface와 Mute/Block 관리 관계에 각각 명시된 정책으로 적용된다. 따라서 Block의 콘텐츠 제한을
  Mute 관리 connection에 적용해 저장된 Mute를 숨기지 않는다.
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

- 차단 관계의 direct Profile route는 GraphQL `node(id:)`·`profileByHandle` 직접 조회를 통해
  [Profile Block 조회 정책](../domain/objects/profile-block.md#조회-정책)과 [Profile 조회 정책](../domain/objects/profile.md#조회-정책)에
  따른 기존 공개 기본 Profile 정보와 콘텐츠 상태를 함께 표시한다. `blocking`과 `blockedBy` 모두 이 두 직접 조회 endpoint와
  같은 기본 Profile 정보 범위를 사용한다. `searchProfiles`의 exact-match/partial-match 후보는
  양방향 Active Block 관계인 Profile을 후보에서 제외하며, 이 제외는 pagination·cursor·limit 전에 적용한다.
- 유효한 Account에 selected Profile이 있으면 그 Profile을 `searchProfiles`의 viewer로 사용한다. selected Profile이
  없으면 기존 Account 인증과 공개 후보 결과를 유지하며 Profile Block predicate나 selected Local Profile을 새로 요구하지
  않는다. 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다.
- 정상적인 GraphQL `node(id:)`·`profileByHandle` 직접 route 진입·새로고침은 identity-free 결과가 아니라 기본 Profile 정보, viewer 방향별 콘텐츠 상태와
  selected Local Owner 범위의 정확한 unblock 관계 ID를 확인한다. Profile 자체가 기존 lifecycle 정책으로 조회 불가한
  경우에만 조건부 identity-free fallback 문구를 사용한다.
- `blocking` 화면에서는 Target Profile의 Post List·Post detail·첨부 Media를 기존 Post·Media 조회 정책으로
  제공한다. Profile route는 `차단한 프로필의 게시물입니다` 경고와 `게시물 보기` action을 먼저 표시하고,
  사용자가 action을 실행한 뒤 해당 결과를 표시한다. 경고는 현재 Profile handle과 selected actor lifecycle마다
  다시 적용하며, 사용자가 명시적으로 확인하기 전에는 시간 경과만으로 콘텐츠를 표시하지 않는다.
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
이전 Storybook 표현에는 DSN-53 중앙 안내형 `7580:14180`·`4592:16216` 대신 다음 조립을 사용한다.

- cover·avatar·표시 이름·handle·bio·태그·팔로우 수치와 게시물·답글·미디어·별 탭을 유지한다.
  FollowButton 자리에 Secondary `차단 해제`를 두고, 게시물 영역에는 `차단됨`과 원본 설명
  `이 사용자의 게시물·프로필을 보지 않아요.`를 표시한다. 탭 전환에도 이 안내를 유지한다.
  과거 placeholder·typography 대신 현재 production ProfileHero·TabList·Button을 재사용한다.
- Mobile은 이름·뒤로가기 header 아래에 배치하고 BottomTabBar를 추가하지 않는다.
  Compact·Full은 기존 Sidebar 옆 600px Profile column에 배치하며 별도 RightRail을 추가하지 않는다.
- 해제 확인·pending·취소·실패·retry 계약을 유지한다. 성공하면 같은 Hero의 FollowButton을 복원하고
  게시물 안내를 제거한다. 이전 Follow 관계를 복원한다는 의미는 아니다.

2026-09-09 리뷰 반영으로 이 callback 기반 화면 fixture는 제거했다. 위 내용은 당시 승인한 시각 참고 계약이며 현재 구현 완료를 뜻하지 않는다.
이전 fixture의 안내와 콘텐츠 숨김은 위의 최신 runtime 조회 정책을 정의하지 않는다. 양쪽 기본 Profile 정보 유지와
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
- Muted·Blocked 관리 목록의 loaded action은 `64px` ProfileListItem 안에서 공용 Default Secondary button을
  `96×40px` Web visual로 사용한다. 별도 wrapper나 hitSlop을 추가하지 않으며 Native는 공용 Button의
  iOS `44pt`·Android `48dp` 최소 높이를 그대로 사용한다.
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

## 요청 소유권과 신규 UI 연결 · 2026-09-09

이 결정은 같은 날의 임시 presentation callback 유지 결정을 대체한다. `ProfileHero.block`·`PostLayout.block`과
`ProfileBlockAction`의 부모 mutation callback·요청 hook, 이를 전제로 한 성공·실패·pending fixture를 제거한다.
메뉴·목록 presentation은 유지하며, callback 이름을 바꾸거나 실행하지 않는 요청 stub으로 대체하지 않는다.

- `ProfileMoreMenu`는 기존 `ActionMenuItem`과 trigger를 표시하며 각 항목의 선택·닫힘·focus를 처리한다.
  Profile 상태나 mutation callback은 받지 않는다. 실제 요청과 확인창 lifecycle은 항목을 제공하는 action 소유다.
- `BlockedProfileList`는 loading·error·empty·pagination과 전달된 행 `children`을 표시한다.
  실제 action을 포함한 행은 기존 `ProfileListItemContent.children`으로 합성하며 목록은 mutation이나 성공 feedback을 받지 않는다.
- PROD-814·823은 실제 action의 Profile fragment·mutation·pending·실패·Relay/cache 갱신·actor 격리를 구현하고
  해당 코드·인터페이스·검증 증거를 인계한다. 메뉴·버튼은 같은 요청 처리를 재사용한다.
- PROD-917은 인계된 실제 action으로 신규 UI를 연결하고 실제 action과 mock Relay 응답으로 조합을 검증한다.
  임시 callback 화면을 보존하기 위해 mutation 구현을 신규 UI 교체 작업으로 넘기지 않는다.
- 기존 Mute public API는 PROD-858에서 들어온 범위로 유지한다. #764의 Block 결합·공유 요청 hook만 제거하며,
  기존 Mute API의 최종 전환은 PROD-814와 정렬한다. 기존 기능 완료·archive는 신규 UI 교체 완료에 종속시키지 않는다.
- Storybook의 메뉴·버튼 선택은 Actions 이벤트만 검증하며 차단 상태·목록을 성공한 것처럼 바꾸지 않는다.
  확인창·요청 성공·오류·actor 전환과 실제 route는 후속 action 검증 범위다.

## Storybook 이관 · PROD-858

`ProfileMuteAction`은 기존 ModalSheet·ConfirmationContent·ToastProvider를 재사용한다. Profile/Post 소비자가
요청을 모르는 `ProfileMoreMenu`를 소유하고, 뮤트 액션이 제공하는 메뉴 항목을 다른 항목과 합성한다.
확인과 pending/dismiss, 오류 피드백은 공용 UI 경계에서 제공하며 실제 요청은 callback으로 전달한다.
관리 목록은 본문·상태·행·pagination을 소유하는 `MutedProfileList`, 행 표시는 기존 Relay `ProfileListItem`과
공유하는 `ProfileListItemContent`를 사용한다. 화면과 Storybook은 목록 밖의 heading·scroll container와
해제 성공 후 heading focus를 소유한다.
Relay 행은 `identity`로 기존 `ProfileNameBlock`을 전달하고, 관리 목록은 이름·핸들 기본 표시를 사용한다.
행의 action은 `children`으로 합성하며, FollowButton은 viewport와 무관하게 Default `96×40`을 소유한다.
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

현재 범위는 `ProfileMoreMenu`와 `BlockedProfileList` presentation이다. 메뉴는 공용 `ProfileMoreButton`·ActionMenu의
Web 최소 폭 160px과 키보드·focus 처리를 재사용하고, 목록은 제목·loading·empty·오류 Toast·재시도·pagination을 제공한다.
행은 기존 `ProfileListItemContent`를 children으로 합성한다. Mute와 목록 상태를 공유하거나 합치지 않는다.

- `KOSMO/Patterns/Profile/More Menu`는 차단·해제 모두 [아이콘 정본](icons.md#profile-차단해제--2026-09-09-결정)의 `Ban`을 표시한다.
  Playground는 수동 Controls·Actions, Tests는 선택·닫힘·focus 복귀를 검증한다. 실제 요청은 실행하지 않는다.
- `KOSMO/Patterns/Profile/Blocked Profiles`는 행·버튼 선택과 loading/error/empty/pagination을 검증한다.
  해제 버튼은 기존 Button의 presentation이며 선택을 Actions에 기록한다. 성공 Toast·행 삭제·가짜 Promise 요청은 없다.
- 최초·추가 조회 실패는 공용 danger Toast와 `다시 시도`로 알리고, Toast가 사라진 뒤에도 본문의 최초 `다시 시도`·추가
  `더 불러오기`를 유지한다. retry·pagination fixture는 목록 표시 상태만 전환한다.
- loaded 대표는 [Mobile 390](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8089),
  [Compact 1024](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25102),
  [Full 1440](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25582)을 참고한다.
  행은 64px, 표시 이름은 `UI/Label/L`이며 해제 버튼은 모든 Web viewport에서 `96×40`이다.
  Native는 폭 96과 공용 Button 자체의 최소 높이 iOS 44pt·Android 48dp를 사용한다.
  별도 wrapper·hitSlop 보정은 두지 않는다. Figma 정렬은 리뷰어가 후속으로 진행한다.
- `ProfileBlockAction`, Block을 결합한 Hero·Post props와 해당 fixture·Tests, `Screens/Profile Block`은 제거했다.
  실제 action을 전제로 하는 확인·성공·실패·pending·focus lifecycle 검증은 PROD-823의 action 구현과 함께 완료한다.
  Profile·Settings 신규 UI 조립과 교체 회귀는 PROD-917이 소유한다.
- 저장·cleanup·GraphQL·Relay/cache·actor 전환·실제 Web/iOS/Android 종단 간 검증은 완료하지 않았다.
  `add-profile-block` task 3.x와 전체 검증·archive는 각각 PROD-823·PROD-813 소유다.

## 검증 시점 분리 · PROD-814 · 2026-09-06

위 Storybook 이관 시점의 상태와 별개로 PROD-814는 shared UI·Relay와 Web 종단 간·접근성 검증을
완료했다. 사용자 결정에 따라 현재 OpenSpec의 완료 범위는 이 검증까지로 확정한다.
네이티브 앱 자체가 별도 이슈/PR에서 아직 작업 중이므로 iOS·Android runtime·접근성 검증은
앱 작업 완료 후 수행한다. 이는 미실행 후속 검증이며 Native 제품 계약이나 지원 대상의 삭제가 아니다.
PROD-814 담당자가 후속 검증 추적을 소유한다. OpenSpec archive는 Native 검증 통과나 PR 머지를 뜻하지 않는다.
