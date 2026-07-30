# ADR 0017: ActivityPub Local Post Identity and Note Representation

## 상태

Accepted

## 날짜

2026-07-27

## 후속 결정

Post Content Media node의 `Note.attachment` Image, Alt Text와 sensitive 투영은
[ADR 0022](./0022-post-content-revision-media-nodes.md)가 정의한다. 나머지 Local Note identity, HTML content,
summary, audience와 역참조 결정은 유지한다.

## 결정

- Content가 있는 Local Post의 ActivityPub identity는 Author Profile이 연결된 Local Instance의 canonical
  origin과 `/ap/note/{postId}`를 결합한 URI다. `postId`는 immutable DB UUID다. Activity를 실행하는
  deployment의 configured Local Instance가 다르더라도 Author Instance identity를 대체하지 않는다.
- Author handle이나 GraphQL global ID는 ActivityPub identity에 포함하지 않는다. Post의 canonical Web 공유
  참조는 ActivityPub identity와 구분해 Note의 `url`로 제공한다.
- PROD-255와 archived 원격 Post 수신 계약에 따라 ActivityPub Post mapping은 remote object URI와
  materialized Post의 관계만 소유한다. Local Post identity는 이 기존 경계를 유지하며 DB row를 추가하지 않고
  Post ID에서 파생한다.
- Note content는 기존 canonical PostContent Document 계약을 재정의하지 않고 그 의미를 안전한 HTML로 투영하며
  Content Warning은 `summary`로 제공한다. Author Profile, immutable 생성 시각과 canonical Web 공유 참조를 함께
  제공한다.
- Public은 ActivityStreams Public을 `to`, followers collection을 `cc`로 사용한다. Unlisted는 followers
  collection을 `to`, ActivityStreams Public을 `cc`로 사용한다. Followers Only는 followers collection만
  `to`로 사용하고 Author 또는 established Follower의 signed fetch에서만 역참조할 수 있다.
- Mentioned Profiles audience는 recipient identity가 canonical 관계로 구현되기 전까지 Local Note로 제공하지
  않는다.
- Reply Parent 관계가 있으면 requester의 Parent 조회 가능성과 무관하게 Parent의 ActivityPub Post identity를
  `inReplyTo`로 제공한다. Parent의 실제 표현은 Parent 자체의 역참조 권한으로 보호하며, Reply Parent 관계가
  없을 때만 `inReplyTo`를 생략한다. Parent의 Tombstone 전이는 저장 관계를 변경하지 않는다. 현재 physical
  delete 행동은 없지만 Reply Parent FK는 향후 실제 Parent row 제거 시 Reply를 유지한 채 관계만 `null`로
  만들도록 정의한다.
- Content가 없는 Repost는 Note로 표현하지 않는다. 후속 Announce와 Reaction delivery는 대상 Post의 같은
  ActivityPub Post identity를 재사용한다.
- unavailable Local Post는 존재를 노출하지 않는 응답을 사용한다. ActivityPub Tombstone과 Delete delivery는
  후속 lifecycle 계약이 소유한다.

## 이유

Post UUID에 기반한 별도 ActivityPub URI는 mutable handle과 API 전용 global ID에서 federation identity를
분리한다. Web 공유 URL은 사람이 탐색하는 canonical 참조이고 ActivityPub object URI는 protocol이 안정적으로
역참조하는 identity이므로 역할을 하나의 URL에 합치지 않는다.

Local Post의 federation identity를 Author Profile의 Local Instance에 결속하면 여러 Local Instance가 같은
저장 모델에 존재하더라도 Activity를 실행한 deployment에 따라 Author Profile과 object origin이 바뀌지 않는다.
해당 Local Instance를 운영하는 HTTP 경계는 그 origin에서 Author Profile과 Note를 역참조할 수 있어야 한다.

기존 remote mapping은 remote ingestion의 received/published metadata를 포함하며 Local Post를 저장 대상으로
정의하지 않는다. Local identity는 이 상위 계약을 변경하지 않고 파생 규칙만 추가한다. Visibility에서
audience를 직접 투영하면 후속 Reply, Repost와 Reaction delivery가 별도 규칙을 만들지 않고 같은 Post 계약을
재사용할 수 있다.

`inReplyTo`는 Reply가 참조하는 객체의 identity이지 그 객체의 Content가 아니다. Parent의 Content 접근은 Parent
Note 역참조 권한이 독립적으로 제한하므로, Reply를 조회한 requester에 따라 `inReplyTo`를 제거해 같은 Note의
표현을 가변적으로 만들 필요가 없다.

## 대안

- canonical Web 공유 URL을 Note `id`로 사용하는 방안은 handle과 GraphQL URL shape 변화가 federation identity에
  영향을 주므로 채택하지 않았다.
- Activity를 실행하는 deployment의 configured Local Instance origin을 사용하는 방안은 Author가 속한 Local
  Instance와 다른 Author Profile과 object identity를 만들 수 있으므로 채택하지 않았다.
- Author와 Post ID를 모두 path에 넣는 방안은 globally unique Post UUID에 중복 identity를 추가하고 Author
  경로 정합성을 별도로 검증해야 하므로 채택하지 않았다.
- 모든 Visibility를 anonymous dispatcher에서 반환하는 방안은 Followers Only와 Mentioned Profiles 조회 정책을
  우회하므로 채택하지 않았다.
- requester가 Parent를 조회할 수 있을 때만 `inReplyTo`를 제공하는 방안은 같은 Reply Note의 표현을 requester별로
  바꾸고 Parent identity와 Content 권한을 결합하므로 채택하지 않았다.

## 결과

- `packages/fedify`의 Local Note dispatcher와 후속 activity delivery는 하나의 Post URI resolver와 Note
  projection을 공유한다.
- Local Post의 Author Profile, Note와 후속 activity identity는 Author Profile이 연결된 Local Instance의
  canonical origin을 공유하며, 해당 Instance의 HTTP 경계에서 역참조할 수 있어야 한다.
- Followers Only 역참조는 서명으로 검증된 요청 Profile과 stored Follow 관계를 연결해야 한다.
- remote Parent와 대상 Post는 기존 ActivityPub Post mapping URI를 사용하고 local Parent와 대상 Post는 파생 URI를
  사용한다.
- Parent의 실제 표현이 requester에게 unavailable이어도 Reply Parent 관계가 유지되는 동안 `inReplyTo` identity는
  유지된다.
- Parent의 Tombstone 전이는 `inReplyTo`를 제거하지 않는다. 현재 physical delete 행동을 추가하지 않고 Reply
  Parent FK만 향후 실제 row 삭제에 대비해 `SET NULL`로 정의하며 Reply Post에는 cascade delete를 적용하지 않는다.
- Mentioned Profiles, custom emoji, Quote 전용 federation 표현과 실제 Activity delivery는 독립 후속 계약으로
  남는다. Media federation 표현은 [ADR 0022](./0022-post-content-revision-media-nodes.md)가 정의한다.

## 문서 반영

- [Post](../objects/post.md)는 local Note identity, serialization, audience와 unavailable lifecycle을 정의한다.
