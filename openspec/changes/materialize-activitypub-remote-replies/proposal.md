## Why

현재 ActivityPub `Create(Note)` 수신은 공개 top-level Note만 저장하므로, 이미 알고 있는 Post에 대한 원격 Reply도 canonical `Reply Parent` 관계를 잃는다. PROD-494·445·393·256이 Post identity, 관계 조합, Reply Parent 저장과 remote ingestion 기반을 제공했으므로, 이제 해석 가능한 `inReplyTo`를 기존 Post 관계로 materialize할 수 있다.

## What Changes

- PUBLIC/UNLISTED 원격 `Note`의 단일 HTTP(S) `inReplyTo`를 검증한다.
- 저장된 Local 또는 Remote ActivityPub Post identity를 Content가 있는 Parent Post로 해석한다.
- 원격 Note의 Content, ActivityPub mapping과 `replyParentId`를 기존 ingestion transaction에서 함께 저장한다.
- Parent를 현재 저장 상태에서 해석할 수 없으면 이 slice에서는 Reply materialization을 보류하고, Parent fetch나 재귀 materialization은 수행하지 않는다. 이는 장기 Parent 해석 정책을 확정하지 않는다.
- duplicate Create가 이미 저장된 Reply Parent 관계를 변경하지 않게 한다.
- 기존 단일 GraphQL `Post` Node와 nullable `replyParent` 조회 계약을 그대로 사용한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-358
- Linear Implementations: PROD-494, PROD-445, PROD-393, PROD-256

## Capabilities

### New Capabilities

- `activitypub-remote-reply-ingestion`: 이미 저장된 Parent identity를 참조하는 공개 원격 Reply의 검증과 원자적 materialization

### Modified Capabilities

- 없음.

## Impact

- `packages/fedify`의 ActivityPub Post identity 해석과 inbound `Create(Note)` 처리
- `@kosmo/core/services`의 기존 ActivityPub `createPost` transaction 사용
- Fedify unit/DB integration test와 OpenSpec 계약
- GraphQL schema 변경, DB migration, 새 protocol dependency는 없다.
