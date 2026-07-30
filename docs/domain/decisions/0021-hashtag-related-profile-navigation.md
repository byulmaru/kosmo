# ADR 0021: Hashtag 관련 Profile 목록 탐색 Contract

## 상태

Accepted

## 날짜

2026-07-29

## 대체 결정

2026-07-29 @HJSmiley 승인으로 PROD-524의 이전 승인 snapshot을 이 결정으로 대체한다. 이전 snapshot은 사람
검색의 `#` 모드와 TagChip이 `/search?tab=people&q=%23<normalized-name>` 상태를 공유하도록 했지만, 두 진입점은
결과 타입과 인증·pagination 책임이 다르므로 분리한다. 검색창의 Hashtag 검색은 별도 결과 계약으로 남기고,
TagChip은 정확한 Hashtag identity에서 관련 Profile 목록을 여는 탐색만 시작한다.

## 맥락

[PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)은 Profile Tag가
정규화된 Hashtag identity를 참조하고 공개 Profile과 함께만 노출되는 구조화 관계임을 확정했다. Profile Tag는
순서를 가지지 않고 개수 상한도 없으므로, 이미 알고 있는 Hashtag를 출발점으로 관계된 Profile을 탐색할 때의
공개 조건·인증·페이지 비용·실패 격리를 별도로 정해야 한다.

기존 사람 검색은 handle 입력과 `searchProfiles` 계약을 유지한다. 검색창에서 Hashtag 또는 Hashtag Name을 찾는
기능은 별도 계약이며 이 ADR에서 구현하거나 확정하지 않는다.

## 결정

- 공개 Profile의 TagChip은 이미 확인한 정확한 Hashtag identity를 전달하는 탐색 진입점이다. 선택하면 해당
  Hashtag와 Profile Tag 관계가 있는 공개 Profile 목록을 연다. 임의 입력의 `#` 접두사를 사람 검색의 별도 모드로
  해석하지 않는다.
- 기존 사람 검색의 handle 입력·결과·pagination과 `searchProfiles` 동작은 변경하지 않는다. 검색창에서 Hashtag
  또는 Hashtag Name 결과를 반환하는 기능은 별도 계약으로 보류하며 이 ADR의 범위가 아니다.
- Profile 목록 후보는 TagChip이 전달한 Hashtag identity와 정확히 관계되고, 공개 Profile 조회 조건을 통과한
  Active·Normal Local Profile로 한정한다. Hashtag 자체·Hashtag Name 목록·Remote Profile·원격 조회·refresh·새
  materialization은 반환하거나 수행하지 않는다.
- 탐색 요청은 인증된 Account만 허용한다. 인증되지 않은 요청은 Profile 후보를 조회하기 전에 기존 로그인 정책에
  따라 처리한다.
- 결과는 Profile 목록으로 반환하며 Profile마다 한 번만 나타난다. 관련도·알파벳순 정렬을 도입하지 않고, 안정적인
  immutable Profile cursor와 forward pagination을 사용한다. 한 요청의 페이지 크기는 최대 20개다. Profile Tag
  관계의 무순서·무상한을 표현 순서나 개수 제한으로 바꾸지 않는다.
- 첫 목록 또는 다음 페이지 요청이 실패해도 선택한 Hashtag 맥락과 이미 표시된 Profile을 지우지 않는다. 실패한
  요청만 독립적으로 재시도할 수 있다.
- navigation 구현은 PROD-529, API 계약 구현은 PROD-528, 종단 간 탐색 전달과 검증은 PROD-525가 소유한다. 이
  ADR은 구체 route path, canonical URL, GraphQL field명 또는 API 입력 타입을 정하지 않는다.

## 이유

정확한 Hashtag를 이미 보여 준 TagChip에서 시작하면 TagChip에서 선택된 Hashtag와 관계된 Profile만 탐색할 수
있고, 기존 사람 검색 입력과 모드를 섞지 않는다. Hashtag identity 정확 일치와 공개 Profile 조건을 함께 적용하면
비공개·정지·삭제 Profile이나 Remote Profile이 태그 관계만으로 노출되지 않는다.

무순서·무상한 관계를 그대로 두고 결과에만 안정적인 immutable cursor와 페이지 상한을 적용하면 저장 표현에
의존하지 않으면서 요청 비용을 예측할 수 있다. API와 navigation의 구체 이름은 후속 구현 이슈가 정하므로 이
도메인 계약에서 추측하지 않는다.

## 결과

- `searchProfiles`의 기존 handle 검색 동작과 Hashtag 관련 Profile 목록 탐색은 서로 다른 진입점과 상태로 유지된다.
- API와 클라이언트 구현은 Hashtag identity 정확 일치, Profile 공개 조건, Account 인증, 페이지 최대 20개,
  immutable Profile cursor를 함께 검증해야 한다.
- Profile Tag 저장·편집·공개 표시는 [PROD-522](https://linear.app/byulmaru/issue/PROD-522/프로필-태그를-편집-표시할-수-있게-한다)가
  소유한다.
- 탐색 navigation은 PROD-529, API는 PROD-528, 통합 검증은
  [PROD-525](https://linear.app/byulmaru/issue/PROD-525/프로필-태그에서-관련-프로필을-탐색할-수-있게-한다)가 소유한다.

## 근거

- [PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)
- [PROD-524](https://linear.app/byulmaru/issue/PROD-524/프로필-태그에서-관련-프로필을-탐색하는-계약을-확정한다)
- [PROD-504](https://linear.app/byulmaru/issue/PROD-504/사람-검색을-db-부분-일치-검색으로-전환한다)
- [Profile](../objects/profile.md)
- [Hashtag](../objects/hashtag.md)
- [ADR 0017: Profile Search Staged Visibility](./0017-profile-search-staged-visibility.md)

## 문서 반영

- [Profile](../objects/profile.md)은 Profile Tag 관계와 공개 조회 조건을 정의한다.
- [Hashtag](../objects/hashtag.md)은 공통 identity와 정규화를 정의하고 이 ADR을 탐색 계약으로 참조한다.
- [Profile Tag 편집·공개 표시](../../design/profile-tags.md)는 TagChip 표시와 navigation 경계를 정의한다.
- [Hashtag 관련 Profile 목록 탐색](../../design/hashtag-related-profiles.md)은 진입점·결과·상태·접근성
  경계를 정의한다.
