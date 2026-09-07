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

- `FollowButton`은 기존 공용 `Button`의 시각·상태 스타일을 재사용한다. 크기는 아래 소비처 기준으로 선택하며,
  `Compact`를 Mobile의 동의어로 사용하지 않는다. 별도 Mobile 시각 variant나 `72×40` 크기는 추가하지 않는다.

| 소비처                                                                        | FollowButton 크기 | 시각 영역 |
| ----------------------------------------------------------------------------- | ----------------- | --------- |
| Web 프로필 목록: 검색, 해시태그, 팔로워·팔로잉, Post Activity·Reaction People | Compact           | `72×32`   |
| Web Profile Hero 상단 관계 action                                             | Medium            | `96×40`   |
| Mobile Web·iOS·Android의 Profile Hero와 위 프로필 목록                        | Medium            | `96×40`   |

- 위 Web 목록 기준은 Compact Web 1024와 Full Web 1440에 모두 적용한다. 화면 이름의 Compact와
  Button variant의 Compact는 별개다. Mobile에서 높이만 32로 줄이거나 웹 목록을 일괄 Medium으로 키우지 않는다.

## Mobile Follow action geometry

- Figma Target의 Action slot은 `96×40`, `right: 16`에 두고 기존 Compact action의 중심축을 유지하도록 `top: 142`에
  배치한다. Loading·Tags를 포함한 모든 Mobile `ProfileHero` variant가 같은 slot geometry를 사용한다.
- Target을 Product runtime으로 이관할 때 iOS와 Android의 실제 입력 target은 이 `40` 높이의 visual box와
  분리해 각각 최소 `44pt`, `48dp`를
  충족한다. target 확장 영역은 avatar, Connections와 인접 action을 침범하지 않는다.
- 공용 source는 Native 버튼의 위·아래에 iOS `2`, Android `4`의 입력 여백을 확보한다. Hero의 action 부모도
  `44`·`48` 높이를 수용하고 중심축을 유지한다. 목록에서는 이 입력 여백을 기존 행의 여백 안에 배치해
  Avatar `40`과 기본 행 높이 `64`를 유지한다. `hitSlop`만 늘리고 부모 bounds에 잘리게 두지 않는다.
- 관계 action 실패는 행 밖의 공용 오류 토스트로 전달하고 Hero의 avatar/action 행 높이는 유지한다.
  목록 행 높이는 하단 divider까지 포함해 `64`로 맞춘다.
- 로딩 중 전달된 실제 action도 같은 slot에 표시하고 접근성 트리에 유지한다. 접근성 제외는 장식용
  cover·avatar·본문 skeleton에만 적용하며 로딩 안내는 별도로 전달한다.

## ProfileListItem 클릭 영역

- `linked` ProfileListItem의 프로필 링크는 기존 행의 왼쪽·위·아래 padding까지 확장한다. 링크 안의
  콘텐츠 위치와 행의 시각 geometry는 유지한다.
- 링크 오른쪽의 `12px` gap, Follow action column과 그 주변 padding은 링크 밖에 둔다. Follow action은
  독립 버튼으로 동작하며 `linked={false}`의 View 구조는 바꾸지 않는다.
- Web Storybook에서 bio/no-bio 행과 링크·gap·Follow 키보드 동작을 검증한다. 실제 iOS·Android touch
  target은 Native 출시 QA에서 별도로 확인한다.

## Follow action 실패 피드백

- Follow·Unfollow·Cancel의 GraphQL 또는 network 실패는 공용 `ToastProvider`의 danger toast로 표시한다.
  ProfileHero와 ProfileListItem의 행 높이·action geometry를 늘리지 않으며, 실패 뒤 같은 버튼을 다시 눌러
  재시도할 수 있다. 토스트는 focus를 이동시키지 않고 기존 assertive live region으로 오류를 알린다.

## PROD-851 이관 상태와 Figma 정렬

- PROD-851의 공용 source는 Medium `96×40`을 기본으로 사용한다. `ProfileListItem`은 Web의
  `breakpoints.compact` 이상에서만 Compact `72×32`를 선택하고, 좁은 Web·Native에서는 Medium을 사용한다.
  소비처별 크기와 Native 입력 여백·부모 공간은 공용 source와 자동 테스트에서 검증한다.
- 2026-09-05 Figma 재점검에서 `04 Screens - Mobile`의 Follow action 44개는 모두 Medium `96×40`이었다.
  대표 근거는 [Mobile Profile Hero](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1943-1708)와
  [Mobile 검색 결과](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1938-1511)다.
- `03 Patterns`의
  [Reaction People · Mobile Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45430)(11개),
  [Reaction People · Android Dark](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45768)(10개),
  [Post Activity · Mobile Reposts](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-46151)(11개)는
  총 32개 인스턴스도 같은 날 Medium `96×40`으로 정렬했다. Follow·Following·Requested 및 Busy·Error
  속성을 보존했으며, 행 높이 `64`와 간격 `12`를 유지하고 Light·Dark 배치를 시각 확인했다.
- [FollowButton Source](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1901-1050) 설명도
  Web 목록은 Compact, Web Profile Hero와 Mobile 소비처는 Medium으로 정렬했다.
  Native 입력 target은 시각 영역과 별개임을 명시했다.
- 위 Mobile Screens·Patterns와 Source 설명의 Figma 정렬 및 공용 코드의 소비처별 크기 선택을 반영했다.
  Native 실제 touch·focus 검증은 별도 출시 gate로 남아 있다.

## 출시와 검증 범위

- 공용 React Native 구현은 Web·Android·iOS에 Header 이미지 geometry와 Mobile Follow action의
  `96×40` 소비 기준을 적용한다. source 계산·Storybook 통과는 실제 Native 입력 target 검증을 대체하지 않는다.
- 현재 PR readiness의 실제 runtime QA 범위는 Web이다. iOS·Android 실제 기기·simulator runtime QA는 이번
  검증 범위에서 제외하고 Native 출시 gate에서 별도로 수행한다.
- Web 자동화나 공용 source·단위 테스트 결과를 Native runtime 완료 증거로 사용하지 않는다. Native 출시
  전에는 실제 환경에서 비율, 중앙 cover crop, avatar overlap과 profile action 배치를 다시 검증한다.
