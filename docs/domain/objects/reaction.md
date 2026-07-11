# Reaction 객체

## 정의

Reaction은 Profile이 Post에 남기는 유니코드 이모지 반응이다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 현재 Reaction을 뜻한다.

## 속성

| 속성          | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건           | 조회 권한 |
| ------------- | ---------------- | ------------------------------ | --------- | ------------------- | --------- |
| Reaction Type | 문자열, 필수     | 하나의 유니코드 이모지         | 항상      | Post 조회 정책 통과 | 없음      |
| 생성 시각     | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Post 조회 정책 통과 | 없음      |

## 관계

| 관계    | 대상                    | 방향                | cardinality | 존재 조건 | 조회 조건           | 조회 권한 |
| ------- | ----------------------- | ------------------- | ----------- | --------- | ------------------- | --------- |
| Profile | [Profile](./profile.md) | Reaction -> Profile | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |
| Post    | [Post](./post.md)       | Reaction -> Post    | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |

같은 Profile/Post/Reaction Type 조합에는 Reaction이 하나만 존재한다.

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값      | 권한             | 조건                                                                                              | 결과                |
| ------------- | ----------------- | --------- | ----------- | ---------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| Reaction 추가 | Profile           | Reaction  | Post, Emoji | `Profile.Member` | 행동 주체가 Active/Normal Local Profile이고 Post 조회 정책을 통과하며 같은 조합의 Reaction이 없다 | Reaction이 생성된다 |
| Reaction 삭제 | Profile           | Reaction  | 없음        | `Reaction.Owner` | Reaction이 존재한다                                                                               | Reaction이 제거된다 |

## 권한

| 권한             | 종류      | 성립 조건                                  |
| ---------------- | --------- | ------------------------------------------ |
| `Reaction.Owner` | 객체 종속 | 행동 주체 Profile이 Reaction의 Profile이다 |

## 조회 정책

- Reaction은 대상 Post 조회 정책을 그대로 따른다.
- Profile Block 생성 결과로 제거되는 Reaction 범위는 [Profile Block](./profile-block.md)이 정의한다.

## 확정 용어

- 반응: Reaction

## 제외/보류

- 좋아요, 부스트 같은 별도 canonical term은 사용하지 않는다.
