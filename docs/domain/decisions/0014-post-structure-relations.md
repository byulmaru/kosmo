# ADR 0014: Post Structure Relations

## 상태

Proposed

## 날짜

2026-07-21

## 결정

- Post는 게시 형태를 나타내는 별도 Kind 상태 값을 가지지 않는다.
- 일반 Post, Reply, Repost와 Quote는 Content, Reply Parent, Repost Source 관계의 조합으로 정의한다.
- Content만 있으면 일반 Post다.
- Content와 Reply Parent가 있으면 Reply다.
- Content와 Repost Source가 있으면 Quote다.
- Content, Reply Parent와 Repost Source가 모두 있으면 Reply이면서 Quote다.
- Content와 Reply Parent 없이 Repost Source만 있으면 Repost다.
- Content와 Repost Source가 모두 없거나 Content 없이 Reply Parent가 있는 조합은 허용하지 않는다.
- Reply Parent와 Repost Source는 서로 독립적인 관계다. 두 관계의 대상은 Content가 있는 Post여야 한다.
- Repost와 Quote는 같은 Repost Source 관계를 사용한다. Quote Source를 별도 관계로 두지 않는다.
- Media-only 여부는 Post 구조를 구분하는 조건이 아니다. Content가 있는 Post의 본문/Media 제약은 별도로
  적용한다.

## 공개 API 호환성

- GraphQL은 기존 단일 `Post` Node, global ID, route, connection과 mutation payload를 유지한다.
- Content, Reply Parent와 Repost Source는 nullable field로 제공하며, 별도 Reply, Repost, Quote concrete
  object type을 만들지 않는다.
- client는 배타적인 typename이나 Kind 값이 아니라 필요한 Content와 관계 field를 사용한다.

## 이유

Reply와 Quote는 동시에 성립할 수 있으므로 배타적인 상태 값으로 모델링할 수 없다. Repost와 Quote도 같은
Source 관계를 사용하며 자체 Content의 존재 여부만 다르다. 관계 자체가 이미 필요한 정보를 보존하므로 같은
의미를 Kind 값으로 중복 저장하면 조합 불일치와 추가 검증 경계가 생긴다.

단일 `Post` Node를 유지하면 같은 durable identity, 권한, route와 connection을 모든 구조가 함께 사용한다는 현재
모델을 보존할 수 있다.

## 대체할 결정

- [ADR 0011](./0011-post-kind-terminology.md)의 Post Kind 상태 차원과 값 전체를 대체한다.
- [ADR 0010](./0010-post-interaction-contracts.md)의 Kind 기반 Reply/Repost 정의와 별도 Quote Source 전제를
  관계 조합 정의로 대체한다.
- [ADR 0002](./0002-pr-review-domain-adjustments.md)의 Kind 기반 Post List·Quote 판별을 관계 조합 판별로
  대체한다.
- [ADR 0001](./0001-core-ubiquitous-language.md)의 Repost/Quote를 Post Kind 값으로 설명한 용어 정의를
  대체한다.

## 문서 반영

- [Post](../objects/post.md)는 Content, Reply Parent와 Repost Source 조합 및 행동 조건을 정의한다.
- [Post List Policy](../policies/post-list.md)는 Kind 대신 관계 조합으로 후보를 판별한다.
- [Notification](../objects/notification.md)은 Source Repost를 관계 조합으로 판별한다.
- [Hashtag](../objects/hashtag.md)는 Content와 Reply Parent 존재 여부로 목록 후보를 판별한다.
