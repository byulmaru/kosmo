# Hashtag 객체

## 정의

Hashtag는 정규화된 이름으로 여러 Post를 연결하는 주제 식별자다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다.

## 속성

| 속성         | 타입/nullability | 검증 정책                                          | 존재 조건 | 조회 조건      | 조회 권한 |
| ------------ | ---------------- | -------------------------------------------------- | --------- | -------------- | --------- |
| Hashtag Name | 문자열, 필수     | `#`를 제외해 정규화하며 대소문자를 구분하지 않는다 | 항상      | 공개 검색 정책 | 없음      |

## 관계

| 관계      | 대상              | 방향            | cardinality | 존재 조건                     | 조회 조건           | 조회 권한 |
| --------- | ----------------- | --------------- | ----------- | ----------------------------- | ------------------- | --------- |
| 포함 Post | [Post](./post.md) | Hashtag <- Post | 1 -> 0..N   | Post 본문에 Hashtag가 있을 때 | Post 조회 정책 통과 | 없음      |

정규화된 Hashtag Name마다 Hashtag가 하나만 존재한다.

## 행동

Hashtag는 독립 Mutation을 소유하지 않는다. Post/Reply/Quote 작성 결과에서 본문을 정규화해 기존 Hashtag와
연결하거나 새 Hashtag를 생성한다.

## 권한

이 객체가 직접 소유한 권한은 없다.

## 조회 정책

- Hashtag 검색은 공개 조회 가능한 Hashtag Name만 반환한다.
- Hashtag Post List 후보는 Post Visibility가 Public이고 Content가 있으며 Reply Parent가 없고 Post
  Eligibility를 통과한 Post다.
- Hashtag Mute Rule과 Domain Limit 정책은 viewer별 Hashtag Post List 결과에 적용한다.

## 확정 용어

- 해시태그: Hashtag
- 해시태그 이름: Hashtag Name

## 제외/보류

- Hashtag의 독립 운영 상태, alias, 자동완성, trend, 추천은 현재 범위에서 제외한다.
