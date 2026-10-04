# Hashtag 관련 Profile 목록 탐색

## 목적

공개 Profile에서 이미 확인한 Hashtag를 TagChip으로 선택하면, 해당 Hashtag와 관계된 공개 Profile 목록을
Web·Android·iOS에서 같은 정보 구조와 상태로 탐색한다.

## 진입점과 범위

- TagChip은 공개 Profile에 표시된 정확한 Hashtag identity를 전달하는 진입점이다. 선택 시 그 Hashtag와 관계된
  Profile 목록을 열며, 임의의 검색창 입력을 Hashtag 조건으로 해석하지 않는다.
- 기존 사람 검색의 handle 입력·검색 진입점·pagination 문법은 유지한다. 다만 후보 eligibility에는 selected
  Profile과 양방향 Active Block 관계인 Profile을 제외하는 정책이 추가된다.
- 검색창에서 Hashtag 또는 Hashtag Name 결과를 찾는 기능은 별도 계약이며 이 문서와 현재 PR에서 구현하거나
  확정하지 않는다.
- 화면 navigation은 PROD-529, API 계약은 PROD-528이 소유한다. 이 문서는 route path나 GraphQL field명이 아닌
  관찰 가능한 결과와 상태만 정의한다.

## 결과와 공개 조건

- 인증된 Account 요청만 허용한다. 인증되지 않은 요청은 Profile 후보를 조회하기 전에 기존 로그인 정책에 따라
  처리한다.
- 결과는 Hashtag와 Profile Tag 관계가 있고 공개 Profile 조회 조건을 통과한 Active·Normal Profile이다.
  원격 조회·refresh·materialization은 포함하지 않는다.
- 유효한 Account에 selected Profile이 있으면 그 Profile과 양방향 Active Block 관계인 후보를 목록의
  pagination·cursor·limit 전에 제외한다. selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를
  유지하며 selected Profile을 새로 요구하지 않는다.
- Profile은 결과에 한 번만 나타나며, 관련도나 알파벳순을 표시하지 않는다. 목록은 안정적인 immutable Profile
  cursor를 사용하고 한 페이지는 최대 20개다.
- Profile Tag 관계는 무순서·무상한이므로 관계의 표현 방식이나 개수 제한을 결과 계약으로 사용하지 않는다.
- 첫 목록 또는 다음 페이지 요청이 실패해도 선택한 Hashtag 맥락과 이미 표시된 Profile을 지우지 않는다. 실패한
  요청만 독립적으로 재시도할 수 있다.

## 태그 상세 페이지의 뮤트·해제

- 이 관련 Profile 목록 페이지가 현재 프로필 태그 상세 페이지다. PROD-735는 이 화면의 태그 맥락에서
  뮤트 상태와 설정·해제 action을 제공한다. 별도 상세 페이지나 알림 설정 화면을 만들지 않는다.
- 공개 Profile의 TagChip은 이 페이지로 이동하는 링크다. 프로필 화면에 태그 뮤트용 벨·메뉴·확인 진입점을
  두지 않는다. 태그 상세 페이지로 직접 진입해도 같은 Hashtag identity와 뮤트 계약을 사용한다.
- 2026-10-04 승인 목업에 따라 `#<태그 이름> 관련 프로필` 헤더 우측에 종 아이콘을 둔다. 미뮤트는 `Bell`,
  뮤트 상태는 `BellOff`로 표시하고 클릭하면 중간 메뉴 없이 기존 확인창을 바로 연다. 헤더 제목은 한 줄로
  표시하며 긴 이름은 생략하되 action의 접근성 이름에는 전체 태그 이름과 뮤트·해제 목적을 제공한다.
- 뮤트 확인 제목은 `이 태그를 뮤트할까요?`, 해제는 `이 태그를 뮤트 해제할까요?`이며 대상 태그는 설명에
  표시한다. `취소`와 `뮤트` 또는 `뮤트 해제` 버튼을 제공하고 초기 focus는 취소다. 상태 조회 실패 시 같은
  우측 위치에 재시도 action을 제공하며 확정하지 못한 상태를 미뮤트로 표시하지 않는다.
- 대상은 현재 페이지의 canonical Hashtag이며 Owner는 현재 selected Profile이다. 출발 Profile이나 목록의
  Profile 자체를 뮤트하지 않는다. 기존 Profile 자체의 뮤트 기능은 유지한다.
- 기존 [Profile Mute 확인·피드백 패턴](./profile-mute-block.md)을 재사용한다. 해당 태그를 프로필에 단
  사람의 새 알림을 영구적으로 끄거나 다시 받는 결과를 안내한다. 범위·방식·기간 선택을 제공하지 않으며,
  게시물 숨김·검색 제외·기존 알림 삭제·과거 억제 알림 복구를 약속하지 않는다.
- 서버 확정 상태, 취소 시 요청 없음, 요청 중 중복 제출 방지, 오류·재시도, 성공 후 현재 화면의 상태 수렴과
  actor·target 격리는 [기존 뮤트 UI 계약](./profile-tags.md#hashtag-mute의-현재-제공-범위)을 유지한다.
  다른 Scope의 활성 임시 규칙도 기존 보존 계약을 따른다.
- action 종료 후 focus는 현재 태그 상세 페이지의 유효한 control로 돌아오거나 이어진다. 관련 Profile
  탐색·pagination을 유지하며, 뮤트 여부로 이 목록의 후보를 숨기지 않는다.
- selected Profile이 없거나 뮤트 권한이 없는 상태에서도 위 목록 조회 계약을 유지한다. 다른 Profile의
  뮤트 상태를 노출하거나 뮤트 사용을 위해 목록 탐색에 새로운 selected Profile 조건을 추가하지 않는다.

## 표시와 접근성

- 결과는 기존 Profile 목록 item을 재사용하고, Hashtag 자체나 Hashtag Name 목록을 결과 item으로 표시하지 않는다.
- TagChip에는 전체 `#<Display Hashtag Name>`과 Hashtag 관련 Profile 목록 탐색 목적을 설명하는 접근성 이름을 제공한다.
- 공용 화면은 React Native primitive와 기존 theme token을 사용하며 Web·Android·iOS가 같은 정보 구조를 공유한다.

## 제외 범위

- 사람 검색창의 `#` 모드 판정, 임의 Hashtag 입력 정규화·자동완성, Hashtag/Hashtag Name 검색
- canonical URL, 구체 route path, GraphQL field명과 API 입력 타입
- Profile 검색의 부분 일치, 추천, trend, 관련도 랭킹
- Profile Tag 관계의 순서·개수 상한, Remote Profile Tag 수집·동기화와 ActivityPub 표현
