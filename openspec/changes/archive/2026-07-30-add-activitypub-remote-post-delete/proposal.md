## Why

known remote actor의 public Note가 최초 materialize된 뒤 원격에서 삭제되어도 Kosmo의 remote Post가 Active로
남아 홈·프로필 목록과 상세 조회에 계속 노출된다. PROD-579는 기존 ActivityPub Post mapping과 canonical Post
삭제 lifecycle을 연결해 `Delete(Note)`만 독립적으로 전달하고, remote `Update(Note)`는 PROD-365의 후속
slice로 남긴다.

## What Changes

- personal/shared inbox에서 verified typed `Delete`를 수신하고 직접 object IRI와 동일 identity의 embedded
  Tombstone을 해석한다.
- 저장된 eligible ActivityPub actor, object URI mapping과 remote Post Author ownership이 모두 일치할 때만
  기존 canonical Post 삭제 행동으로 Active Post를 Tombstone으로 전환한다.
- PostContent, current Content pointer와 ActivityPub Post mapping을 보존해 terminal identity와 duplicate
  Create first-write-wins를 유지한다.
- repeated, missing, out-of-order와 concurrent Delete의 no-op/전이 결과를 고정하고 미저장 object receipt,
  placeholder, fetch와 lock을 추가하지 않는다.
- 삭제 결과가 기존 GraphQL DB-only Post/PostContent authorization과 home/profile list policy에 반영되는지,
  최초·duplicate Create가 회귀하지 않는지 검증한다.
- remote `Update(Note)`, Local outbound Delete, 물리 삭제와 restore는 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`,
  `docs/architecture/core-services.md`
- Linear Contract: PROD-579, PROD-365
- Linear Implementations: PROD-579

## Capabilities

### New Capabilities

- `activitypub-remote-post-delete`: known remote actor의 inbound `Delete(Note)`/Tombstone 검증, canonical Post
  Tombstone 전이, mapping 보존, 멱등·동시성 결과와 GraphQL/Create 회귀 계약

### Modified Capabilities

없음.

## Impact

- `packages/fedify`: typed Delete listener, protocol validation과 remote mapping/author 조회
- `packages/core/services`: 기존 Post 삭제 action을 remote ingress에서 재사용할 때 origin별 post-commit side
  effect를 정확히 분리하는 lifecycle 경계
- `apps/api` GraphQL integration tests: Post/PostContent 상세와 home/profile connection의 Tombstone 결과
- PostgreSQL schema와 공개 GraphQL schema에는 변경이 없다.
