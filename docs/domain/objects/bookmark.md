# Bookmark 객체

## 정의

Bookmark는 Profile이 Post를 개인적으로 저장한 결과다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 현재 Bookmark를 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건        | 조회 권한        |
| --------- | ---------------- | ------------------------------ | --------- | ---------------- | ---------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 저장한 Profile만 | `Bookmark.Owner` |

## 관계

| 관계    | 대상                    | 방향                | cardinality | 존재 조건 | 조회 조건        | 조회 권한        |
| ------- | ----------------------- | ------------------- | ----------- | --------- | ---------------- | ---------------- |
| Profile | [Profile](./profile.md) | Bookmark -> Profile | 1 -> 1      | 항상      | 저장한 Profile만 | `Bookmark.Owner` |
| Post    | [Post](./post.md)       | Bookmark -> Post    | 1 -> 1      | 항상      | 저장한 Profile만 | `Bookmark.Owner` |

같은 Profile/Post 조합에는 Bookmark가 하나만 존재한다.

## 행동

| 행동          | 행동 주체 Profile | 대상 객체 | 입력값 | 권한                               | 조건                                                                                              | 결과                |
| ------------- | ----------------- | --------- | ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| Bookmark 추가 | Profile           | Bookmark  | Post   | `Account.Active`, `Profile.Member` | 행동 주체가 Active/Normal Local Profile이고 Post 조회 정책을 통과하며 같은 조합의 Bookmark가 없다 | Bookmark가 생성된다 |
| Bookmark 삭제 | Profile           | Bookmark  | 없음   | `Account.Active`, `Bookmark.Owner` | Bookmark가 존재한다                                                                               | Bookmark가 제거된다 |

## 권한

| 권한             | 종류      | 성립 조건                                       |
| ---------------- | --------- | ----------------------------------------------- |
| `Bookmark.Owner` | 객체 종속 | 행동 주체/요청 Profile이 Bookmark의 Profile이다 |

## 조회 정책

- Bookmark는 저장한 Profile에게만 보인다.
- Profile의 Bookmark 목록은 생성 시각이 최신인 Bookmark부터 표시한다.
- 대상 Post가 Tombstone이거나 저장한 Profile이 대상 Post 조회 정책을 통과하지 못하면 Bookmark를 목록에서 숨기되
  Bookmark 관계는 유지한다.
- Bookmark 생성은 Post Author에게 Notification을 만들지 않는다.
- Profile Block이 생성되어도 Bookmark는 제거하지 않는다. Block 조회 정책 때문에 대상 Post를 볼 수 없는 동안은
  저장 관계만 유지한다.

## 확정 용어

- 북마크: Bookmark

## 제외/보류

- Collection은 현재 도메인 범위에서 제외한다.
- 공개 Bookmark 수와 Bookmark를 만든 Profile 목록은 현재 범위에서 제외한다.
