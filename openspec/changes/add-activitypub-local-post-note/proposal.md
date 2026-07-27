## Why

Kosmo의 Local Post는 GraphQL과 Web 공유 참조는 있지만 외부 ActivityPub 서버가 안정적으로 식별하고 역참조할
수 있는 object identity와 Note 표현이 없다. 후속 Reply·Repost·Reaction delivery가 각자 URI와 audience 규칙을
만들기 전에 PROD-494에서 공통 Local Note 경계를 먼저 제공한다.

## What Changes

- Content가 있는 Local Post의 ActivityPub identity를 configured Local Instance의 canonical origin과
  `/ap/note/{postId}`에서 파생한다.
- Local Post를 별도 remote ActivityPub Post mapping 없이 Fedify `Note`로 직렬화하고 같은 URI에서 역참조한다.
- PROD-341이 정의한 canonical PostContent schema·validation을 재정의하지 않고 기존 ProseMirror document를
  ActivityPub HTML `content`와 Content Warning `summary`로 export한다.
- Public·Unlisted audience와 익명 역참조, Followers Only audience와 verified signed fetch 권한을 제공한다.
- Reply Parent identity를 requester별 Parent 가시성과 무관한 `inReplyTo`로 제공하고 Parent 객체의 내용은 Parent
  자체의 역참조 권한으로 보호한다.
- Parent Tombstone에는 Reply Parent 관계를 유지하고, 현재 존재하지 않는 physical delete 흐름을 새로 만들지
  않으면서 Reply Parent FK만 향후 실제 row 삭제에 대비해 `SET NULL`로 변경한다.
- Tombstone·contentless Repost·unavailable Author/Instance·Mentioned Profiles와 권한 없는 Followers Only Post는
  존재를 노출하지 않는 unavailable 결과로 처리한다.
- Reply·Repost·Reaction activity delivery와 ActivityPub Tombstone/Delete delivery는 이 변경에서 구현하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`,
  `docs/domain/decisions/0015-post-share-reference.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-494
- Existing Content Contract: PROD-341
- Linear Implementations: PROD-502가 PostContent ProseMirror HTML serialization을 소유한다. PROD-494는 Fedify
  Local Note, FK 변경, 통합 검증과 OpenSpec archive를 소유한다. 두 구현은 병행할 수 있지만 Note `content` 연결과
  PROD-494 완료는 PROD-502 serializer 결과가 필요하다.

## Capabilities

### New Capabilities

- `activitypub-local-post-note`: Local Post의 ActivityPub identity, Note 직렬화, audience, authorized fetch,
  `inReplyTo`와 unavailable 경계를 정의한다.

### Modified Capabilities

- `data-model`: 현재 physical delete 행동을 추가하지 않고 Reply Parent FK의 delete action만 향후 row 삭제 시
  nullable 관계를 제거하도록 정렬한다.

## Impact

- `packages/fedify`: Local Note object dispatcher, signed fetch authorization, local/remote Post URI resolver와
  PROD-502가 제공하는 Note HTML export의 사용
- `packages/core`: Local Post·Content·Author·Follow 저장 조회와 Reply Parent FK 선언
- PostgreSQL/Drizzle: `post.reply_parent_id` FK delete action을 additive forward migration으로 정렬
- `apps/web`: 기존 federation-first 요청 routing에서 `/ap/note/{postId}` 응답과 미처리 BFF 회귀 검증
- 후속 PROD-358·495·496·497·498·499는 이 변경의 Post URI resolver와 Note identity를 재사용하지만 실제 activity
  delivery는 각 이슈가 소유한다.
