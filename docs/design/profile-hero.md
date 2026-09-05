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

| 소비처 | FollowButton 크기 | 시각 영역 |
| --- | --- | --- |
| Web 프로필 목록: 검색, 해시태그, 팔로워·팔로잉, Post Activity·Reaction People | Compact | `72×32` |
| Web Profile Hero 상단 관계 action | Medium | `96×40` |
| Mobile Web·iOS·Android의 Profile Hero와 위 프로필 목록 | Medium | `96×40` |

- 위 Web 목록 기준은 Compact Web 1024와 Full Web 1440에 모두 적용한다. 화면 이름의 Compact와
  Button variant의 Compact는 별개다. Mobile에서 높이만 32로 줄이거나 웹 목록을 일괄 Medium으로 키우지 않는다.

## Mobile Follow action geometry

- Figma Target의 Action slot은 `96×40`, `right: 16`에 두고 기존 Compact action의 중심축을 유지하도록 `top: 142`에
  배치한다. Loading·Tags를 포함한 모든 Mobile `ProfileHero` variant가 같은 slot geometry를 사용한다.
- Target을 Product runtime으로 이관할 때 iOS와 Android의 실제 입력 target은 이 `40` 높이의 visual box와
  분리해 각각 최소 `44pt`, `48dp`를
  충족한다. target 확장 영역은 avatar, Connections와 인접 action을 침범하지 않는다.

## PROD-851 이관 상태와 Figma 정렬

- PROD-851의 공용 source는 Compact `72×32`와 Medium `96×40`을 구현했지만, 현재 자동 선택은 좁은 Web·Native에서
  Compact를 선택하고 `ProfileListItem`도 Compact를 명시한다. 따라서 위 소비처 기준의 Mobile 이관은 아직
  완료되지 않았다. 이 문서 정렬만으로 코드·Storybook·Native touch 검증이 완료된 것으로 세지 않는다.
- 2026-09-05 Figma 재점검에서 `04 Screens - Mobile`의 Follow action 44개는 모두 Medium `96×40`이었다.
  대표 근거는 [Mobile Profile Hero](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1943-1708)와
  [Mobile 검색 결과](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1938-1511)다.
- 같은 점검에서 `03 Patterns`의
  [Reaction People · Mobile Light](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45430)(11개),
  [Reaction People · Android Dark](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-45768)(10개),
  [Post Activity · Mobile Reposts](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=5314-46151)(11개)는
  Compact `72×32`가 남아 있었다. 이 32개 인스턴스는 Mobile Screens 및 위 기준과 미정렬 상태다.
- [FollowButton Source](https://www.figma.com/design/Erj975S6vVP8PlHQius801?node-id=1901-1050)의
  “Compact is used in rows and Mobile” 설명도 미정렬 상태다. Source 설명이나 Pattern의 잔존 Compact를
  Mobile 크기 선택의 근거로 재사용하지 않는다.
- 위 잔여 Figma 항목은 읽기 전용으로 점검했으며 이번 문서 변경에서 수정하지 않았다. PROD-851에서 코드의
  소비처별 선택과 Storybook 검증을 정렬하고, Figma 설명·인스턴스 정렬 여부를 별도로 확인한다.

## 출시와 검증 범위

- 공용 React Native 구현은 Web·Android·iOS에 Header 이미지 geometry를 적용한다. Mobile Follow action의
  `96×40` 소비 기준은 위 이관 상태가 해소되기 전까지 구현 완료로 세지 않는다.
- 현재 PR readiness의 실제 runtime QA 범위는 Web이다. iOS·Android 실제 기기·simulator runtime QA는 이번
  검증 범위에서 제외하고 Native 출시 gate에서 별도로 수행한다.
- Web 자동화나 공용 source·단위 테스트 결과를 Native runtime 완료 증거로 사용하지 않는다. Native 출시
  전에는 실제 환경에서 비율, 중앙 cover crop, avatar overlap과 profile action 배치를 다시 검증한다.
