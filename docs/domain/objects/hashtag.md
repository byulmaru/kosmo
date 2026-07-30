# Hashtag 객체

## 정의

Hashtag는 정규화된 이름으로 Post와 Profile을 연결하는 공통 주제 식별자다. Hashtag Name 문법·정규화·유일성은
이 객체가 소유하는 canonical 규칙이다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다.

## 속성

| 속성                   | 타입/nullability | 검증 정책                                                                                                                                                                                                                           | 존재 조건 | 조회 조건      | 조회 권한 |
| ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | --------- |
| Canonical Hashtag Name | 문자열, 필수     | 바깥 공백 제거 → 앞의 선택적 `#` 하나 제거 → Unicode NFKC → locale 비종속 `toLowerCase()` 순서로 정규화한다. 정규화 결과는 Unicode code point 기준 1-20자의 문자·숫자·밑줄이어야 하며, 같은 결과는 하나의 Hashtag identity만 가진다 | 항상      | 공개 검색 정책 | 없음      |
| Display Hashtag Name   | 문자열, 필수     | 최초 유효 입력에서 바깥 공백과 선택적 앞 `#`를 제거하고 Unicode NFKC를 적용한 대소문자 표기를 보존한다. 같은 canonical identity의 후속 입력으로 갱신하지 않는다                                                                     | 항상      | 공개 검색 정책 | 없음      |

## 관계

| 관계                | 대상                    | 방향               | cardinality | 존재 조건                             | 조회 조건              | 조회 권한 |
| ------------------- | ----------------------- | ------------------ | ----------- | ------------------------------------- | ---------------------- | --------- |
| 포함 Post           | [Post](./post.md)       | Hashtag <- Post    | 1 -> 0..N   | Post 본문에 Hashtag가 있을 때         | Post 조회 정책 통과    | 없음      |
| Profile Tag Profile | [Profile](./profile.md) | Hashtag <- Profile | 1 -> 0..N   | Profile이 Hashtag를 Tag로 선택했을 때 | Profile 조회 정책 통과 | 없음      |

## 행동

Hashtag는 독립 Mutation을 소유하지 않는다. Post/Reply/Quote 작성 또는 Local Profile Owner의 Profile Tag 편집에서
받은 각 이름을 이 문서의 Hashtag Name 규칙으로 canonical Hashtag identity에 해석한다. 같은 정규화 결과의
identity가 없으면 생성하고, 있으면 해당 identity를 재사용한다. Post·Profile과의 관계 생성은 각 객체의 행동이
소유한다. 새 identity를 만들 때 최초 입력의 NFKC 표기를 Display Hashtag Name으로 함께 저장하고, 이후 다른
대소문자 표기가 들어와도 기존 Display Hashtag Name을 유지한다.

## 권한

이 객체가 직접 소유한 권한은 없다.

## 조회 정책

- Hashtag 검색은 공개 조회 가능한 Hashtag Name만 반환한다.
- 이 Hashtag 검색은 [ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)의 Hashtag 관련 Profile
  목록 탐색과 별도 계약이다.
- Profile Tag 관계는 공개 조회 가능한 Profile만 반환하며 Profile과 독립적인 visibility를 가지지 않는다.
- Hashtag Post List 후보는 Post Visibility가 Public이고 Content가 있으며 Reply Parent가 없고 Post
  Eligibility를 통과한 Post다.
- Hashtag Mute Rule과 Domain Limit 정책은 viewer별 Hashtag Post List 결과에 적용한다.

## 확정 용어

- 해시태그: Hashtag
- canonical 해시태그 이름: Canonical Hashtag Name
- 표시 해시태그 이름: Display Hashtag Name

## 제외/보류

- Hashtag의 독립 운영 상태, alias, 자동완성, trend, 추천은 현재 범위에서 제외한다.
- Hashtag 관련 Profile 목록 탐색의 정확한 identity 일치, 공개 조건, pagination과 탐색 UI는
  [ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)을 따른다.
- Hashtag 자체를 찾거나 Hashtag Name 목록을 반환하는 검색은 별도 계약이며 ADR 0021의 범위가 아니다.
