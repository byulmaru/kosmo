# Reaction 객체

## 정의

Reaction은 Profile이 Post에 남기는 유니코드 이모지 반응이다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 현재 Reaction을 뜻한다.

## 속성

| 속성          | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건           | 조회 권한 |
| ------------- | ---------------- | ------------------------------ | --------- | ------------------- | --------- |
| Reaction Type | 문자열, 필수     | 허용 Reaction Type 중 하나     | 항상      | Post 조회 정책 통과 | 없음      |
| 생성 시각     | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Post 조회 정책 통과 | 없음      |

## 관계

| 관계    | 대상                    | 방향                | cardinality | 존재 조건 | 조회 조건           | 조회 권한 |
| ------- | ----------------------- | ------------------- | ----------- | --------- | ------------------- | --------- |
| Profile | [Profile](./profile.md) | Reaction -> Profile | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |
| Post    | [Post](./post.md)       | Reaction -> Post    | 1 -> 1      | 항상      | Post 조회 정책 통과 | 없음      |

같은 Profile/Post/Reaction Type 조합에는 Reaction이 하나만 존재한다.

## 허용 Reaction Type

초기 Reaction Type은 다음 Unicode 표현만 허용한다.

- `🥹` (`U+1F979`)
- `❤️` (`U+2764 U+FE0F`)
- `🎉` (`U+1F389`)
- `👀` (`U+1F440`)
- `☘️` (`U+2618 U+FE0F`)
- `🌈` (`U+1F308`)

이 목록의 나열 순서는 Reaction Type 개수가 같을 때의 표시 순서를 정의하지 않는다. 동률 표시에는 별도
순서 규칙을 두지 않는다.

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값              | 권한                               | 조건                                                                            | 결과                                                                                        |
| ------------- | ----------------- | --------- | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reaction 추가 | Profile           | Reaction  | Post, Reaction Type | `Account.Active`, `Profile.Member` | 행동 주체가 Active/Normal Local Profile이고 Post 조회 정책을 통과한다           | 같은 조합의 Reaction이 없으면 생성하고, 이미 있으면 기존 Reaction을 유지한 채 멱등 성공한다 |
| Reaction 삭제 | Profile           | Reaction  | 없음                | `Account.Active`, `Reaction.Owner` | Reaction이 존재하거나 행동 주체가 이미 제거한 동일 Reaction의 삭제를 재시도한다 | Reaction이 존재하면 제거하고, 이미 제거됐으면 상태를 바꾸지 않은 채 멱등 성공한다           |

Reaction 삭제의 멱등 재시도는 기존 Reaction에 대한 `Reaction.Owner` 검사를 우회하지 않는다. 다른 Profile이
소유한 Reaction 삭제는 거부한다.

## 권한

| 권한             | 종류      | 성립 조건                                  |
| ---------------- | --------- | ------------------------------------------ |
| `Reaction.Owner` | 객체 종속 | 행동 주체 Profile이 Reaction의 Profile이다 |

## 조회 정책

- Reaction은 대상 Post 조회 정책을 그대로 따른다.
- Post의 Reaction 조회 결과는 Reaction Type별 개수와 Reaction을 남긴 Profile 목록을 제공한다.
- Reaction Type별 개수는 대상 Post에 현재 존재하는 모든 Reaction을 포함하며, Post를 조회할 수 있는
  viewer 사이에서 달라지지 않는다.
- Profile 목록에는 viewer가 조회할 수 있는 Profile의 Reaction만 포함한다.
- Reaction Type은 개수가 많은 순서로 표시한다.
- Profile Block 생성 결과로 제거되는 Reaction 범위는 [Profile Block](./profile-block.md)이 정의한다.

## 확정 용어

- 반응: Reaction

## 제외/보류

- 좋아요, 부스트 같은 별도 canonical term은 사용하지 않는다.
