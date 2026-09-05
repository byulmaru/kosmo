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
  [`04 Screens - Mobile`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6312-21917)의
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
  사용한다. Mute는 `Tone=Primary`, Block은 `Tone=Danger`이며 둘 다 `Idle|Pending`에서 같은 제목·설명·action
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
