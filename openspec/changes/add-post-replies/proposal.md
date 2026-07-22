## Why

Kosmo는 Reply를 별도 Post Kind가 아니라 Content와 직접 Reply Parent 관계의 조합으로 저장하고, 직접 Parent·조상·하위 Reply 조회와 목록·상세 thread에서 같은 관계와 조회 정책을 적용해야 한다. [PROD-388](https://linear.app/byulmaru/issue/PROD-388)의 구현 자식들이 하나의 Reply 계약을 공유하므로 이를 단일 OpenSpec change로 구체화한다.

## What Changes

- Content가 있는 Post가 nullable Reply Parent를 직접 참조하고 Repost Source와 독립적으로 공존할 수 있게 한다.
- 일반 Post, Reply, Quote, Reply+Quote와 Content 없는 Repost의 허용 조합을 공통 구조 검증으로 판정한다.
- 조회 가능한 직접 Reply Parent, 조상 경로와 직접·간접 하위 Reply를 기존 단일 GraphQL `Post` 계약에 연결한다.
- Home Post List에는 승인된 Reply 후보를 포함하고 Profile·Hashtag Post List에서는 Reply를 제외한다.
- Post 상세에서 조회 가능한 조상·현재 Post·하위 Reply를 thread로 연결한다.
- Reply 작성 action·composer, Quote 작성 action, ActivityPub `inReplyTo`, Post Media와 Notification은 후속 계약으로 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`
- Linear Contract: [PROD-388](https://linear.app/byulmaru/issue/PROD-388)
- Linear Implementations: [PROD-393](https://linear.app/byulmaru/issue/PROD-393), [PROD-398](https://linear.app/byulmaru/issue/PROD-398), [PROD-399](https://linear.app/byulmaru/issue/PROD-399), [PROD-400](https://linear.app/byulmaru/issue/PROD-400), [PROD-429](https://linear.app/byulmaru/issue/PROD-429), [PROD-422](https://linear.app/byulmaru/issue/PROD-422)

## Capabilities

### New Capabilities

- `reply`: Reply Parent 관계, Post 구조 판별, 직접 Parent·조상·하위 Reply 조회와 목록 후보 계약
- `post-reply-ui`: Post 상세에서 조상·현재 Post·하위 Reply를 연결하는 thread 통합 계약

### Modified Capabilities

- `data-model`: Post Reply Parent self-reference와 구조 무결성 계약 추가
- `post`: Reply Parent·조상·하위 Reply GraphQL 조회와 Home/Profile/Hashtag Post List 후보 계약 확장

## Impact

- Linear: PROD-393, PROD-398, PROD-399, PROD-400, PROD-429, PROD-422와 부모 PROD-388
- Core/DB: Post Reply Parent self-reference, additive migration, Post 관계 조합·대상 검증과 직접·재귀 조회
- GraphQL/API: `Post.replyParent`, Reply 조상 경로와 하위 Reply connection
- Universal client: Post 상세 thread fragment·route integration과 Home/Profile/Hashtag 후보 정책 회귀 검증
- Dependency: 완료된 PROD-394와 `add-post-reposts`가 제공하는 nullable Repost Source 저장 기반을 재사용한다.
- Excluded systems: Reply 작성 mutation·composer, Quote/Reply+Quote 작성 action, ActivityPub `inReplyTo`, Post Media, Notification, 별도 Post Kind와 concrete GraphQL type
