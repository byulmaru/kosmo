# Hashtag 관련 Profile 목록 탐색

## 목적

공개 Profile에서 이미 확인한 Hashtag를 TagChip으로 선택하면, 해당 Hashtag와 관계된 공개 Profile 목록을
Web·Android·iOS에서 같은 정보 구조와 상태로 탐색한다.

## 진입점과 범위

- TagChip은 공개 Profile에 표시된 정확한 Hashtag identity를 전달하는 진입점이다. 선택 시 그 Hashtag와 관계된
  Profile 목록을 열며, 임의의 검색창 입력을 Hashtag 조건으로 해석하지 않는다.
- 기존 사람 검색의 handle 입력·결과·pagination 계약과 `searchProfiles` 동작은 변경하지 않는다.
- 검색창에서 Hashtag 또는 Hashtag Name 결과를 찾는 기능은 별도 계약이며 이 문서와 현재 PR에서 구현하거나
  확정하지 않는다.
- 화면 navigation은 PROD-529, API 계약은 PROD-528이 소유한다. 이 문서는 route path나 GraphQL field명이 아닌
  관찰 가능한 결과와 상태만 정의한다.

## 결과와 공개 조건

- 인증된 Account 요청만 허용한다. 인증되지 않은 요청은 Profile 후보를 조회하기 전에 기존 로그인 정책에 따라
  처리한다.
- 결과는 Hashtag와 Profile Tag 관계가 있고 공개 Profile 조회 조건을 통과한 Active·Normal Local Profile이다.
  Remote Profile과 원격 조회·refresh·materialization은 포함하지 않는다.
- Profile은 결과에 한 번만 나타나며, 관련도나 알파벳순을 표시하지 않는다. 목록은 안정적인 immutable Profile
  cursor를 사용하고 한 페이지는 최대 20개다.
- Profile Tag 관계는 무순서·무상한이므로 관계의 표현 방식이나 개수 제한을 결과 계약으로 사용하지 않는다.
- 첫 목록 또는 다음 페이지 요청이 실패해도 선택한 Hashtag 맥락과 이미 표시된 Profile을 지우지 않는다. 실패한
  요청만 독립적으로 재시도할 수 있다.

## 표시와 접근성

- 결과는 기존 Profile 목록 item을 재사용하고, Hashtag 자체나 Hashtag Name 목록을 결과 item으로 표시하지 않는다.
- TagChip에는 `#<normalized-name>`과 Hashtag 관련 Profile 목록 탐색 목적을 설명하는 접근성 이름을 제공한다.
- 공용 화면은 React Native primitive와 기존 theme token을 사용하며 Web·Android·iOS가 같은 정보 구조를 공유한다.

## 제외 범위

- 사람 검색창의 `#` 모드 판정, 임의 Hashtag 입력 정규화·자동완성, Hashtag/Hashtag Name 검색
- canonical URL, 구체 route path, GraphQL field명과 API 입력 타입
- Profile 검색의 부분 일치, 추천, trend, 관련도 랭킹
- Profile Tag 관계의 순서·개수 상한, Remote Profile Tag와 ActivityPub 표현
