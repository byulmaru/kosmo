# 공개 Profile Hero

## 목적

공개 Profile 화면의 header 이미지, avatar와 action이 Web·Android·iOS의 지원 폭에서 같은 정보 구조와
geometry를 유지하도록 한다. 이 문서는 Profile 편집 화면의 header preview가 아니라 공개 `ProfileHero`의
표시 계약을 다룬다.

## Header 이미지 geometry

- header 이미지 영역은 모든 지원 폭에서 가로:세로 `3:1`을 유지한다. 너비가 `W`이면 높이는 `W / 3`이며,
  `600px` surface에서는 `600×200`, `390px` mobile에서는 `390×130`이다.
- Profile 데이터가 로딩 중이거나 header 이미지가 없는 상태도 같은 `3:1` 영역을 유지한다. 상태에 따라 고정
  높이로 대체하거나 영역을 접지 않는다.
- 원본 이미지 비율이 다르면 `3:1` 경계 안에서 중앙 기준 cover crop으로 표시한다.
- avatar overlap과 follow 등 profile action은 header 이미지 영역 밖의 hero layout이 소유한다. 이 요소의
  배치나 높이는 header 이미지의 `3:1` 계산에 포함하지 않는다.

## Follow action 소비처별 크기

- `FollowButton`은 기존 공용 `Button`의 시각·상태 스타일을 재사용한다. 모든 소비처는 공용 기본 높이와
  `96px` 폭을 사용하며 별도 관계 action 크기 variant를 만들지 않는다.

| 소비처                                                                        | FollowButton 크기 | Web 시각 영역 |
| ----------------------------------------------------------------------------- | ----------------- | ------------- |
| Web 프로필 목록: 검색, 해시태그, 팔로워·팔로잉, Post Activity·Reaction People | Default           | `96×40`       |
| Web Profile Hero 상단 관계 action                                             | Default           | `96×40`       |
| Mobile Web·iOS·Android의 Profile Hero와 위 프로필 목록                        | Default           | `96×40`       |

- 위 기준은 Mobile Web, Compact Web 1024, Full Web 1440에 모두 적용한다. Native는 공용 Button의
  iOS `44pt`·Android `48dp` 최소 높이를 사용하며 별도 hitSlop을 더하지 않는다.
- 본인 Profile Hero의 `편집` action도 같은 `96×40` 시각 영역을 사용한다. 공용 Button의 Secondary 스타일과
  Native 최소 입력 높이는 유지한다. Figma ProfileHero의 `96×40` action slot에 맞춘 production 소비처 결정이다.

## Profile 더보기 배치

- Mobile Web·iOS·Android·Compact·Full Web 모두 Default `96×40` FollowButton 왼쪽 `16px` 간격에 `40×40` 원형
  더보기 버튼을 둔다. `20px` 가로 Ellipsis와 `color/border/default`의 `1px` 안쪽 테두리를 사용한다.
  두 버튼의 위·아래 경계를 맞추고 커버 이미지에는 겹치지 않는다. Mobile 공통 상단 바에는 더보기를 두지 않는다.
- Native 입력 target은 visual box 중심을 유지하며 iOS 최소 `44pt`, Android 최소 `48dp`로 확장한다.
  부모가 입력 영역을 수용하고 인접 Follow·avatar의 입력 영역과 겹치지 않게 한다.
- 원형 전체의 Hover·Pressed 배경에는 각각 `color/state/hover`, `color/state/pressed` overlay를 적용한다.
  Default는 투명 배경과 기본 테두리다. 아이콘만 흐리게 하는 피드백으로 대체하지 않는다.
- Web focus-visible은 현재 배경을 유지하면서 원 바깥 `2px` 간격의 `2px` 링을
  `color/state/focus-ring`으로 표시한다. Hover·Pressed와 독립적으로 함께 표시할 수 있다.
- Disabled는 `color/state/disabled-surface`, `color/state/disabled-foreground`, `color/border/disabled`를
  사용하고 활성화·hover·focus 반응을 제공하지 않는다. Hover·Pressed 색상 전환은 공용 motion의
  `120ms`·standard를 따르며 reduced motion에서는 즉시 반영한다.
- Figma `ProfileMoreButton` 원본의 State와 별도 Focus visible 속성이 위 상태를 소유한다.
  [Light·Dark 상태표](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=8380-13737)에서
  Default·Hover·Pressed·Focus·Hover + focus·Disabled를 비교한다. Native에는 hover를 요구하지 않는다.
- 프로필 팝오버 메뉴는 오른쪽 위 모서리를 더보기 trigger의 오른쪽 위에 맞춘다. 간격 없이 trigger와
  겹치며 왼쪽·아래로 펼쳐진다. viewport 밖으로 나가면 경계 안으로 보정하고 아래 공간이 부족하면 방향을
  전환한다. 메뉴 항목과 dismiss·focus 복귀 계약은 유지한다.
- 로딩 중이거나 사용할 수 있는 프로필 action이 없으면 더보기를 숨긴다. `blockedBy`에서는 뮤트·차단 생성
  action을 숨기지만, 조회 가능한 Profile의 신고 진입점은 아래 신고 조립 계약을 따른다.
- 2026-09-07 승인된 Figma 계약을 `ProfileMoreButton`·`ProfileHero`·`ActionMenu`에 반영했다.
  Storybook Tests에서 40px 원형·16px 간격, hover·pressed·focus 조합, 메뉴 겹침·viewport 보정과
  dismiss 후 trigger 복귀를 검증한다. Native 44/48 입력 target과 disabled·reduced motion은 단위
  테스트로 확인하며, Native 실기기 및 실제 Profile route의 데이터 연동 완료를 뜻하지 않는다.

## Mobile Follow action geometry

- Figma Target의 Action slot은 `96×40`, `right: 16`에 두고 기존 Compact action의 중심축을 유지하도록 `top: 142`에
  배치한다. Loading·Tags를 포함한 모든 Mobile `ProfileHero` variant가 같은 slot geometry를 사용한다.
- 2026-09-09 결정에 따라 Native는 공용 Button 자체의 최소 높이 iOS `44`·Android `48`을 사용한다.
  FollowButton은 size·폭을 제공하며 별도 hitSlop·입력 여백을 중복 추가하지 않는다. Web visual은 그대로다.
  Hero의 action 부모와 목록의 기존 음수 margin은 이 높이를 수용하며 중심축·기본 행 높이 `64`를 유지한다.
  Figma의 40px visual 원본은 아직 수정하지 않았다.
- 관계 action 실패는 행 밖의 공용 오류 토스트로 전달하고 Hero의 avatar/action 행 높이는 유지한다.
  Bio가 없는 목록 행 높이는 하단 divider까지 포함해 `64`로 맞춘다.
- 로딩 중 전달된 실제 action도 같은 slot에 표시하고 접근성 트리에 유지한다. 접근성 제외는 장식용
  cover·avatar·본문 skeleton에만 적용하며 로딩 안내는 별도로 전달한다.

## 프로필 목록의 Bio 표시 정책

사람을 발견하고 구분하는 목록에서는 자기소개를 제공하고, 행동 참여자 확인이나 내 프로필 선택에서는
간결한 식별 정보를 제공한다. Web·Mobile Web·iOS·Android에 같은 표시 정책을 적용한다.

| 사용처                         | Bio 표시 | 목적                                       |
| ------------------------------ | -------- | ------------------------------------------ |
| 팔로워·팔로잉                  | 최대 3줄 | 관계망에서 사람을 발견하고 구분한다.       |
| 사람 검색·해시태그 관련 프로필 | 최대 3줄 | 이름·핸들 외에 관심사와 정체성을 확인한다. |
| 반응한 사람·재게시 참여자 목록 | 숨김     | 해당 행동에 참여한 사람을 빠르게 확인한다. |
| 내 프로필 선택·전환            | 숨김     | 이미 아는 프로필을 빠르게 선택한다.        |

- 표시 대상이라도 Bio가 비어 있으면 해당 영역과 빈 여백을 만들지 않는다. 긴 Bio는 최대 3줄에서
  말줄임하며 행 내부에 별도의 펼치기 동작을 추가하지 않는다.
- Bio가 있는 행은 내용에 따라 높이가 늘어나며 Avatar와 Follow action은 상단에 정렬한다. Bio가 없는
  기본 행은 `64px`이고, 두 경우 모두 같은 상하 padding과 하단 divider를 유지한다.
- Bio 표시 여부는 프로필 이동·Follow action·선택 상태와 키보드 focus 동작을 바꾸지 않는다.
- 사용자가 전역 밀도 설정을 선택하거나 breakpoint에 따라 Bio 표시 정책이 달라지는 동작은 제공하지 않는다.

### 결정 근거

2026-09-22 PROD-218에서 승인했다. 공식 소스 조사에서 Bluesky와 Misskey는 팔로워·팔로잉과 사람 검색에
Bio를 최대 3줄 표시하고, Mastodon 웹은 같은 목록에서 숨겼다. 조사한 세 서비스의 멘션 자동완성은
Bio를 숨겼다. 서비스 공통 규칙으로 단정하지 않고, KOSMO의 사람 발견 목적과 기존 정보량을 유지하는
정책을 선택했다. X는 로그인 전 화면과 공식 도움말만으로 현재 목록의 Bio 표시 규칙을 확인하지 못했다.

- [Bluesky 프로필 카드](https://github.com/bluesky-social/social-app/blob/085584d68c814eaafc894a23b4f5e9fc503fbeaf/src/components/ProfileCard.tsx)
- [Mastodon 팔로워 목록](https://github.com/mastodon/mastodon/blob/4d818a63dbddeaadc3957e0996b5ff4a6c5c142f/app/javascript/mastodon/features/followers/components/list.tsx)
- [Misskey 팔로우 목록](https://github.com/misskey-dev/misskey/blob/b16acdcd1c1c7ef72ac5f8a48b7aefb23fd3b506/packages/frontend/src/pages/user/follow-list.vue)·[사용자 카드](https://github.com/misskey-dev/misskey/blob/b16acdcd1c1c7ef72ac5f8a48b7aefb23fd3b506/packages/frontend/src/components/MkUserInfo.vue)

이 근거는 해당 커밋의 정적 소스 조사이며 실제 배포 화면·Native runtime·사용성 실험의 증거가 아니다.

## ProfileListItem 클릭 영역

- `linked` ProfileListItem의 프로필 링크는 기존 행의 왼쪽·위·아래 padding까지 확장한다. 링크 안의
  콘텐츠 위치와 행의 시각 geometry는 유지한다.
- 링크 오른쪽의 `12px` gap, Follow action column과 그 주변 padding은 링크 밖에 둔다. Follow action은
  독립 버튼으로 동작하며 `linked={false}`의 View 구조는 바꾸지 않는다.
- Web Storybook에서 bio/no-bio 행과 링크·gap·Follow 키보드 동작을 검증한다. 실제 iOS·Android touch
  target은 Native 출시 QA에서 별도로 확인한다.

## FollowRequestListItem 행 계약

- `FollowRequestListItem`의 loaded 행은 `ProfileListItem`과 같은 `ProfileListItemContent`를 재사용한다.
  Avatar `40`, 콘텐츠·action 사이 `12`, 좌우 `16`과 상하 `12` padding, fill 없는 배경과 하단 divider를
  유지한다.
- 승인·거절 `IconButton`의 입력 target은 Web `32`, iOS `44`, Android `48`이며 행 높이는 divider를 포함해
  각각 `64`, `68`, `72`가 된다. 요청자 정보를 확인할 수 없으면 승인 action과 프로필 링크는 생략하고 거절
  action은 유지한다.
- 프로필 링크는 명시적인 접근 가능한 이름을 가지며 왼쪽·위·아래 padding까지 확장한다. 승인·거절 action은
  링크 밖의 독립 버튼으로 유지한다.
- 승인·거절 실패는 공용 danger toast로 알리고 행 내부에 error 문구나 별도 retry 상태를 추가하지 않는다.
  실패 뒤 원래 이름의 같은 action을 다시 누를 수 있으며, mutation과 Relay connection 제거는
  `FollowRequestListItem`이 계속 소유한다.

## Follow action 실패 피드백

- Follow·Unfollow·Cancel의 GraphQL 또는 network 실패는 공용 `ToastProvider`의 danger toast로 표시한다.
  ProfileHero와 ProfileListItem의 행 높이·action geometry를 늘리지 않으며, 실패 뒤 같은 버튼을 다시 눌러
  재시도할 수 있다. 토스트는 focus를 이동시키지 않고 기존 assertive live region으로 오류를 알린다.

## PROD-851 이관 상태와 Figma 정렬

- PROD-851의 공용 source는 Default `96×40`을 사용한다. `ProfileListItem`도 viewport와 무관하게 같은
  관계 action 크기를 사용한다. Native 입력 여백·부모 공간은 공용 source와 자동 테스트에서 검증한다.
- 2026-09-05 Figma 재점검에서 `04 Screens - Mobile`의 Follow action 44개는 모두 Medium `96×40`이었다.
  대표 근거는 [Mobile Profile Hero](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1943-1708)와
  [Mobile 검색 결과](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1938-1511)다.
- `03 Patterns`의
  [Reaction People · Mobile Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45430)(11개),
  [Reaction People · Android Dark](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45768)(10개),
  [Post Activity · Mobile Reposts](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-46151)(11개)는
  총 32개 인스턴스도 같은 날 Medium `96×40`으로 정렬했다. Follow·Following·Requested 및 Busy·Error
  속성을 보존했으며, 행 높이 `64`와 간격 `12`를 유지하고 Light·Dark 배치를 시각 확인했다.
- [FollowButton Source](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1901-1050)의 Figma 정렬은
  후속으로 진행한다. 코드와 문서는 최신 결정에 따라 모든 소비처를 Default `96×40`으로 먼저 통일했다.
  Native 입력 target은 시각 영역과 별개이며 실제 touch·focus 검증은 별도 출시 gate로 남아 있다.

## 출시와 검증 범위

- 공용 React Native 구현은 Web·Android·iOS에 Header 이미지 geometry와 Mobile Follow action의
  `96×40` 소비 기준을 적용한다. source 계산·Storybook 통과는 실제 Native 입력 target 검증을 대체하지 않는다.
- 현재 PR readiness의 실제 runtime QA 범위는 Web이다. iOS·Android 실제 기기·simulator runtime QA는 이번
  검증 범위에서 제외하고 Native 출시 gate에서 별도로 수행한다.
- Web 자동화나 공용 source·단위 테스트 결과를 Native runtime 완료 증거로 사용하지 않는다. Native 출시
  전에는 실제 환경에서 비율, 중앙 cover crop, avatar overlap과 profile action 배치를 다시 검증한다.

## 신고와 관계 action 조립 · 2026-09-15

- #857의 신고와 #772의 차단 UI를 함께 반영하며, 더보기 trigger 하나에 링크 복사·뮤트·차단 또는 차단 해제·신고를
  해당 action의 노출 조건에 따라 합성한다. 신고용 두 번째 trigger를 만들지 않는다.
- 신고는 [신고 계약](content-reporting.md)의 로그인한 Account 조건을 유지한다. selected Profile이 없거나
  차단 관계여도 조회 가능한 Profile 화면의 신고 진입점은 유지한다. 차단 방향에 따른 콘텐츠·관계 action 제한과
  신고 eligibility를 합치지 않는다.
- 뮤트·차단 action의 pending과 포커스 연결은 같은 메뉴를 통해 유지한다.
