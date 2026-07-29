# Hashtag 객체

## 정의

Hashtag는 정규화된 이름으로 Post와 Profile을 연결하는 공통 주제 식별자다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다.

## 속성

| 속성         | 타입/nullability | 검증 정책                                                                                                                                                       | 존재 조건 | 조회 조건      | 조회 권한 |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | --------- |
| Hashtag Name | 문자열, 필수     | 앞의 선택적 `#`와 바깥 공백을 제거하고 Unicode NFKC와 locale 비종속 case folding을 적용한 1-20자 문자·숫자·밑줄이다. 정규화된 이름은 대소문자를 구분하지 않는다 | 항상      | 공개 검색 정책 | 없음      |

## 관계

| 관계                | 대상                    | 방향               | cardinality | 존재 조건                             | 조회 조건              | 조회 권한 |
| ------------------- | ----------------------- | ------------------ | ----------- | ------------------------------------- | ---------------------- | --------- |
| 포함 Post           | [Post](./post.md)       | Hashtag <- Post    | 1 -> 0..N   | Post 본문에 Hashtag가 있을 때         | Post 조회 정책 통과    | 없음      |
| Profile Tag Profile | [Profile](./profile.md) | Hashtag <- Profile | 1 -> 0..N   | Profile이 Hashtag를 Tag로 선택했을 때 | Profile 조회 정책 통과 | 없음      |

정규화된 Hashtag Name마다 Hashtag가 하나만 존재한다.

## 행동

Hashtag는 독립 Mutation을 소유하지 않는다. Post/Reply/Quote 작성 결과에서 본문을 정규화하거나 Local Profile
Owner가 Profile Tag 목록을 편집한 결과로 Hashtag identity 관계를 만든다.

## 권한

이 객체가 직접 소유한 권한은 없다.

## 조회 정책

- Hashtag 검색은 공개 조회 가능한 Hashtag Name만 반환한다.
- Profile Tag 관계는 공개 조회 가능한 Profile만 반환하며 Profile과 독립적인 visibility를 가지지 않는다.
- Hashtag Post List 후보는 Post Visibility가 Public이고 Content가 있으며 Reply Parent가 없고 Post
  Eligibility를 통과한 Post다.
- Hashtag Mute Rule과 Domain Limit 정책은 viewer별 Hashtag Post List 결과에 적용한다.

## 확정 용어

- 해시태그: Hashtag
- 해시태그 이름: Hashtag Name

## 제외/보류

- Hashtag의 독립 운영 상태, alias, 자동완성, trend, 추천은 현재 범위에서 제외한다.
- Profile Tag 관계를 조건으로 Profile을 검색하는 query 문법, 일치, 정렬, pagination과 탐색 UI는
  [ADR 0021](../decisions/0021-profile-tag-search-contract.md)을 따른다.
- Hashtag 자체를 찾거나 Hashtag Name 목록을 반환하는 검색은 ADR 0021의 범위가 아니다.
