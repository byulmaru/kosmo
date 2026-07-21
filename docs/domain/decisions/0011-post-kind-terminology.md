# ADR 0011: Post Kind Terminology

## 상태

Superseded by [ADR 0014](./0014-post-structure-relations.md)

## 날짜

2026-07-20

## 결정

[ADR 0014](./0014-post-structure-relations.md)가 Post 구조를 Content와 관계 조합으로 재정의하며 이 결정을
전체 대체했다. 아래 내용은 당시 결정의 이력을 보존한다.

- Post가 Original, Reply, Repost 또는 Quote 중 어떤 게시 형태인지 구분하는 상태 차원의 canonical term은
  `Post Kind`다.
- `Original`, `Reply`, `Repost`, `Quote`는 `Post Kind`의 상태 값이다.
- 기존 canonical 문서에서 같은 상태 차원을 가리키던 `Post Form`은 `Post Kind`로 대체한다.
- 이 용어 변경은 Post의 객체 정체성, 관계, 행동, 조회 정책을 변경하지 않는다.

## 이유

`Post Form`은 게시물을 제출하는 UI form과 혼동될 수 있다. `Post Type`은 GraphQL object type이나 프로그래밍
언어의 type과 의미가 겹칠 수 있으므로, 게시 형태를 구분하는 상태 차원에는 `Post Kind`를 사용한다.

## 문서 반영

- [Post](../objects/post.md)는 Original, Reply, Repost, Quote를 `Post Kind` 값으로 정의한다.
- 기존 accepted decision과 교차 객체 정책에서 같은 상태 차원을 가리키는 표기를 `Post Kind`로 통일한다.
