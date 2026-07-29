# ADR 0021: Profile Tag Search Contract

## 상태

Accepted

## 날짜

2026-07-29

## 맥락

[PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)은 Profile Tag가
정규화된 Hashtag identity를 참조하고 공개 조회 가능한 Local Profile과 함께만 노출된다는 기반을 확정했다.
기존 사람 검색은 handle 부분 일치만 제공하므로, 태그 검색을 추가할 때 입력 모드·일치·노출·페이지 비용과
기존 검색 호환성을 별도로 정해야 한다.

## 결정

- 사람 검색의 `people` 모드에서 입력이 정규화 전 `#`로 시작하면 Profile Tag 모드로 해석한다. `#`가 없는
  입력은 기존 handle 검색 모드로 유지하며, 두 결과 집합을 섞지 않는다.
- Profile Tag query는 [ADR 0020](./0020-profile-tag-shared-hashtag-identity.md)의 Hashtag 입력 정규화를
  그대로 적용한다. 정규화 결과가 1-20자의 문자·숫자·밑줄이 아니면 검색을 실행하지 않고 입력 오류를
  반환한다.
- Profile Tag는 정규화된 Hashtag Name의 정확 일치만 지원한다. 부분 일치, 자동완성, 추천, trend와 관련도
  랭킹은 별도 계약 없이는 제공하지 않는다.
- 검색 후보는 공개 조회 정책을 통과한 Active·Normal Local Profile의 Profile Tag 관계로 한정한다.
  Remote Profile, 원격 조회, refresh, 새 materialization과 ActivityPub 표현은 포함하지 않는다.
- Profile Tag 검색은 로그인 사용자만 호출할 수 있다. 인증되지 않은 요청은 검색 후보 DB 조회 전에
  거부하며, 인증 정책은 [PROD-517](https://linear.app/byulmaru/issue/PROD-517/searchProfiles를-로그인-사용자로-제한한다)과
  일치해야 한다.
- 결과는 Profile 목록으로 반환하고 Profile마다 한 번만 나타난다. 관련도·알파벳순 정렬은 도입하지 않으며,
  기존 사람 검색 connection과 호환되는 안정적인 immutable Profile 순서와 forward cursor를 사용한다.
  한 요청의 페이지 크기는 최대 20개다.
- Profile Tag 선택과 직접 입력은 같은 검색 상태를 사용한다. canonical URL은
  `/search?tab=people&q=%23<normalized-name>`이며, 검색 화면은 보호 라우트의 로그인 정책을 따른다.
  공개 Profile의 TagChip은 PROD-529가 navigation을 전달할 때 이 URL로 이동하는 링크 또는 버튼으로 활성화된다.
- 기존 handle 검색의 입력·결과·pagination 의미는 변경하지 않는다. 태그 query 실패나 다음 페이지 실패는
  기존 결과와 handle 모드를 지우지 않고 해당 상태만 재시도할 수 있게 한다.

## 이유

`#` 접두사는 기존 handle 입력과 충돌하지 않으면서 태그 모드를 직접 표현하고, 공개 Profile의 TagChip과
직접 검색을 동일한 URL 상태로 연결한다. Hashtag identity의 정확 일치만 허용하면 선택한 태그가 가리키는
동일한 주제만 탐색할 수 있고, 부분 문자열 스캔·중복 관계·관련도 정의를 이번 계약에 끌어들이지 않는다.
Local 공개 Profile과 인증·페이지 상한을 함께 적용하면 현재 Profile visibility와 PROD-517의 API 보안 경계를
재사용하면서 원격 조회와 예측하기 어려운 검색 비용을 막을 수 있다.

## 결과

- `searchProfiles`의 기존 handle 동작과 Profile Tag 검색 동작은 같은 people 화면 안에서 입력 모드로 구분된다.
- API와 클라이언트 구현은 정규화된 tag identity, Local visibility, login scope, cursor/page cap을 함께 검증해야 한다.
- Profile Tag 저장·편집·공개 표시 자체는 [PROD-522](https://linear.app/byulmaru/issue/PROD-522/프로필-태그를-편집-표시할-수-있게-한다)가 소유한다.
- 검색 구현과 종단 간 통합 검증은 [PROD-525](https://linear.app/byulmaru/issue/PROD-525/프로필-태그로-프로필을-검색할-수-있게-한다)가 소유하며,
  API는 PROD-528, 화면·navigation은 PROD-529가 담당한다.

## 근거

- [PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)
- [PROD-524](https://linear.app/byulmaru/issue/PROD-524/프로필-태그-검색-계약을-확정한다)
- [PROD-504](https://linear.app/byulmaru/issue/PROD-504/사람-검색을-db-부분-일치-검색으로-전환한다)
- [PROD-517](https://linear.app/byulmaru/issue/PROD-517/searchProfiles를-로그인-사용자로-제한한다)
- [Profile](../objects/profile.md)
- [Hashtag](../objects/hashtag.md)
- [ADR 0017: Profile Search Staged Visibility](./0017-profile-search-staged-visibility.md)

## 문서 반영

- [Profile](../objects/profile.md)은 Profile Tag 관계와 공개 조회 조건을 정의한다.
- [Hashtag](../objects/hashtag.md)은 공통 identity와 정규화를 정의하고 이 ADR을 검색 계약으로 참조한다.
- [Profile Tag 편집·공개 표시](../../design/profile-tags.md)는 TagChip navigation을 이 계약과 연결한다.
- [Profile Tag 검색 디자인](../../design/profile-tag-search.md)은 입력·URL·상태·접근성 경계를 정의한다.
