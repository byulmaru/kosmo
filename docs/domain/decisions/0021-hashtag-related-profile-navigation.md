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

기존 사람 검색은 handle 입력·검색 진입점·pagination 문법을 유지하되 후보 eligibility에 Profile Block 정책을
추가한다. 검색창에서 Hashtag 또는 Hashtag Name을 찾는 기능은 별도 계약이며 이 ADR에서 구현하거나 확정하지 않는다.

## 결정

- 공개 Profile의 TagChip은 이미 확인한 정확한 Hashtag identity를 전달하는 탐색 진입점이다. 선택하면 해당
  Hashtag와 Profile Tag 관계가 있는 공개 Profile 목록을 연다. 임의 입력의 `#` 접두사를 사람 검색의 별도 모드로
  해석하지 않는다.
- 기존 사람 검색의 handle 입력·검색 진입점·pagination 문법은 유지한다. 다만 `searchProfiles` 후보 eligibility에는
  selected Profile과 양방향 Active Block 관계인 Profile을 제외하는 정책을 추가한다. 검색창에서 Hashtag 또는
  Hashtag Name 결과를 반환하는 기능은 별도 계약으로 보류하며 이 ADR의 범위가 아니다.
- Profile 목록 후보는 TagChip이 전달한 Hashtag identity와 정확히 관계되고, 공개 Profile 조회 조건을 통과한
  이미 저장된 Local·Remote Active·Normal Profile로 한정한다. Hashtag 자체·Hashtag Name 목록은 반환하지
  않으며, 원격 조회·refresh·새 materialization은 수행하지 않는다.
- 탐색 요청은 인증된 Account만 허용한다. 인증되지 않은 요청은 Profile 후보를 조회하기 전에 기존 로그인 정책에
  따라 처리한다.
- 유효한 Account에 selected Profile이 있으면 그 Profile을 viewer로 사용해 양방향 Active Block 관계인 후보를
  pagination·cursor·limit 전에 제외한다. selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를
  유지하며 Profile Block predicate나 selected Profile을 새로 요구하지 않는다.
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
비공개·정지·삭제 Profile이 태그 관계만으로 노출되지 않는다.

무순서·무상한 관계를 그대로 두고 결과에만 안정적인 immutable cursor와 페이지 상한을 적용하면 저장 표현에
의존하지 않으면서 요청 비용을 예측할 수 있다. API와 navigation의 구체 이름은 후속 구현 이슈가 정하므로 이
도메인 계약에서 추측하지 않는다.

## 결과

- `searchProfiles`의 handle 입력·검색 진입점·pagination 구조와 Hashtag 관련 Profile 목록 탐색은 서로 다른 상태로
  유지되며, 두 탐색 후보에는 selected Profile 기준의 Profile Block 정책이 적용된다.
- API와 클라이언트 구현은 Hashtag identity 정확 일치, Profile 공개 조건, Account 인증, selected Profile 유무에
  따른 양방향 Active Block 후보 정책, 페이지 최대 20개, immutable Profile cursor를 함께 검증해야 한다.
- Profile Tag 저장·편집·공개 표시는 [PROD-522](https://linear.app/byulmaru/issue/PROD-522/프로필-태그를-편집-표시할-수-있게-한다)가
  소유한다.
- 탐색 navigation은 PROD-529, API는 PROD-528, 통합 검증은
  [PROD-525](https://linear.app/byulmaru/issue/PROD-525/프로필-태그에서-관련-프로필을-탐색할-수-있게-한다)가 소유한다.

## 추가 결정 — 2026-10-04: 태그 상세 페이지의 뮤트 진입점

PROD-735 검토 중 사용자가 프로필 화면이 아니라 프로필 태그 상세 페이지에서 태그를 뮤트하도록 확정했다.
이 결정은 기존 관련 Profile 목록 페이지를 태그 상세 페이지로 사용한다. 별도 상세 페이지나 알림 설정 화면을
새로 만들지 않는다.

- 사용자 흐름은 공개 Profile의 TagChip → 해당 Hashtag의 상세·관련 Profile 목록 → 태그 뮤트·해제다.
  TagChip은 탐색 링크로 유지하며, 프로필 화면에 태그 뮤트용 벨·메뉴·확인 진입점을 두지 않는다.
- 태그 상세 페이지의 뮤트 대상은 그 페이지의 canonical Hashtag다. 규칙 Owner는 현재 selected Profile이며,
  출발한 Profile이나 목록에 표시된 사람을 뮤트하는 동작과 구분한다. 기존 Profile 자체의 뮤트 기능은 유지한다.
- 기존 뮤트 확인·피드백 패턴을 재사용한다. 해당 태그를 프로필에 단 사람의 새 알림만 끄는 영구 뮤트를
  제공하며 범위·방식·기간 선택을 추가하지 않는다. 효과·권한·기존 규칙 보존은
  [Hashtag Mute Rule](../objects/hashtag-mute-rule.md)과 기존 계약을 따른다.
- 뮤트 권한·상태와 관련 Profile 목록 조회를 분리한다. selected Profile이 없어도 기존 Account 인증 아래의
  목록 탐색을 유지하며, 뮤트로 관련 Profile 목록을 숨기거나 후보 정책을 변경하지 않는다.
- PROD-735는 이 진입점 변경과 클라이언트 검증을 소유한다. 서버 규칙은 PROD-1029, 실제 Profile Tag 기반
  새 알림 억제는 PROD-1048이 소유한다.

태그에 관한 동작을 해당 태그의 상세 맥락에 모으고, 프로필 자체의 뮤트와 혼동되지 않게 하는 결정이다.
기존 문서의 “태그 맥락”은 프로필 화면의 새 벨·메뉴를 승인한 근거로 사용하지 않는다. 프로필 화면 진입점을
전제로 한 기존 구현·테스트 결과는 이 흐름의 완료 증거가 아니며, 태그 탐색부터 설정·해제까지 다시 검증한다.

## 근거

- 2026-10-04 사용자 결정 및 [PROD-735](https://linear.app/byulmaru/issue/PROD-735)

- [PROD-523](https://linear.app/byulmaru/issue/PROD-523/프로필-태그-도메인-계약을-확정한다)
- [PROD-524](https://linear.app/byulmaru/issue/PROD-524/프로필-태그에서-관련-프로필을-탐색하는-계약을-확정한다)
- [PROD-504](https://linear.app/byulmaru/issue/PROD-504/사람-검색을-db-부분-일치-검색으로-전환한다)
- [PROD-822](https://linear.app/byulmaru/issue/PROD-822)
- [Profile](../objects/profile.md)
- [Hashtag](../objects/hashtag.md)
- [ADR 0017: Profile Search Staged Visibility](./0017-profile-search-staged-visibility.md)

## 문서 반영

- [Profile](../objects/profile.md)은 Profile Tag 관계와 공개 조회 조건을 정의한다.
- [Hashtag](../objects/hashtag.md)은 공통 identity와 정규화를 정의하고 이 ADR을 탐색 계약으로 참조한다.
- [Profile Tag 편집·공개 표시](../../design/profile-tags.md)는 TagChip 표시와 navigation 경계를 정의한다.
- [Hashtag 관련 Profile 목록 탐색](../../design/hashtag-related-profiles.md)은 진입점·결과·상태·접근성
  경계를 정의한다.
