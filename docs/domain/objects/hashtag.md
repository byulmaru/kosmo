# Hashtag 객체

## 정의

Hashtag는 Post 본문에서 식별되는 주제 표식이며 Hashtag Post List와 연결된다.

## 상태

명시된 Hashtag 상태 차원은 없다.

## 속성

| 속성         | 타입/nullability | 검증 정책                  | 상태별 존재 조건 | 조회 권한          |
| ------------ | ---------------- | -------------------------- | ---------------- | ------------------ |
| Hashtag Name | 문자열, 필수     | 대소문자를 구분하지 않는다 | 항상             | `Search.SafeScope` |

## 관계

| 관계              | 대상                                              | 조건                         | 조회 권한                 |
| ----------------- | ------------------------------------------------- | ---------------------------- | ------------------------- |
| 포함 Post         | [Post](./post.md)                                 | 본문에 Hashtag가 포함된 Post | `Post.Visible`            |
| Hashtag Post List | [Post List Definition](./post-list-definition.md) | Public 원본 Post만 후보      | `PostList.PublicExplorer` |

## 행동

| 행동              | 행동 주체 | 대상 객체 | 입력값 | 권한                      | 결과                   |
| ----------------- | --------- | --------- | ------ | ------------------------- | ---------------------- |
| Hashtag 검색      | viewer    | Hashtag   | 질의   | `Search.SafeScope`        | Hashtag 검색 결과 반환 |
| Hashtag 목록 조회 | viewer    | Hashtag   | Cursor | `PostList.PublicExplorer` | Hashtag Post List 반환 |

## 권한

- 이 객체가 직접 소유한 권한은 없다. 조회 조건은 [Search Index](./search-index.md), [Post List Definition](./post-list-definition.md), [Post](./post.md)가 정의한다.

## 불변 조건

- Hashtag Post List는 Public 원본 Post만 대상으로 한다.
- Hashtag Post List는 Post Form이 Reply 또는 Repost인 Post를 포함하지 않는다.

## 확정 용어

- 해시태그: Hashtag

## 제외/보류

- 해시태그 자동완성과 trend는 현재 범위에서 제외한다.
