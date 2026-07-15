## Why

기존 remote post ingestion change는 Linear 책임 구조보다 먼저 작성되어 unknown actor materialization, private audience, `post_mention`, process-local idempotency와 오래된 PostContent shape를 함께 소유한다. PROD-354는 이 legacy change를 source of truth로 삼지 않고 PROD-256, 구현 자식 이슈와 PROD-341에서 known actor의 public Note ingestion, PostgreSQL global receipt, versioned canonical document와 DB-only GraphQL read 계약을 다시 도출한다.

## What Changes

- actor-scoped/shared inbox의 verified typed `Create`를 Fedify listener에서 받되, 저장된 ACTIVE 또는 UNRESPONSIVE ActivityPub actor만 처리한다.
- non-null `Create.id.href`를 route·recipient·worker와 무관한 global activity identity로 사용하고 handler 진입 시 캡처한 `receivedAt`을 materialization input에 전달한다.
- object를 Fedify vocabulary로 hydrate한 뒤 attribution이 일치하는 PUBLIC/UNLISTED top-level `Note`만 materialization 대상으로 허용한다.
- remote content는 PROD-259가 PROD-341의 versioned canonical ProseMirror document와 Plain Text Content Warning으로 projection한다.
- PostgreSQL global receipt와 ActivityPub object mapping, `Post`, `PostContent`, `Post.currentContentId` side effect를 하나의 transaction으로 commit/rollback한다.
- GraphQL은 PR #212가 제공한 공통 authorization과 DB-only read path를 그대로 사용하고 PROD-262는 저장 fixture 기반 회귀 검증만 담당한다.
- unknown actor/mention materialization, Post-level mention relation, remote outbox fetch/backfill과 resolver/schema 변경은 포함하지 않는다. Reply/thread는 [PROD-358](https://linear.app/byulmaru/issue/PROD-358), FOLLOWERS audience는 [PROD-360](https://linear.app/byulmaru/issue/PROD-360), DIRECT recipient authorization은 [PROD-359](https://linear.app/byulmaru/issue/PROD-359)가 별도 계약으로 소유한다.

## Capabilities

### New Capabilities

- `activitypub-remote-post-ingestion`: known ActivityPub actor가 inbox로 전달한 public top-level Note의 검증, projection input, durable receipt와 atomic Post materialization을 다룬다.

### Modified Capabilities

- `data-model`: ActivityPub object URI mapping과 global inbox activity receipt 저장 요구사항을 추가한다.

## Impact

- Linear owner: [PROD-354](https://linear.app/byulmaru/issue/PROD-354)가 이 공유 change를 단독으로 갱신한다.
- Start gate: [PROD-341](https://linear.app/byulmaru/issue/PROD-341)의 versioned PostContent document 계약이 main에 병합된 뒤 이 spec-only change를 완료·병합한다.
- Implementation slices: PROD-255 schema, PROD-259 projection, PROD-260 inbox validation과 PROD-262 authorization regression을 진행한 뒤 PROD-261 transaction으로 통합하고 PROD-256이 integration/archive를 소유한다.
- Existing foundations: PROD-241의 activity-neutral actor/shared inbox route와 PR #212/PROD-257의 DB-only GraphQL read/authorization을 변경하지 않는다.
- Ownership: 구현 자식 PR은 이 공유 change를 수정하거나 archive하지 않고 각 이슈의 코드와 검증만 소유한다.
- Deferred contracts: PROD-256 통합 완료 후 PROD-358/360/359가 각각 Reply/thread, FOLLOWERS와 DIRECT ingestion을 Issue → OpenSpec → 구현 순서로 확장한다.
