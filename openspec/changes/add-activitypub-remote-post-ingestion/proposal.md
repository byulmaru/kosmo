## Why

기존 remote post ingestion change는 Linear 책임 구조보다 먼저 작성되어 unknown actor materialization, private audience, `post_mention`, activity receipt, duplicate `Create` revision 갱신과 오래된 PostContent shape를 함께 소유한다. PROD-354는 PROD-256 최종 통합 gate와 독립 구현 slice의 실제 첫 ingestion 범위에서 다시 출발해, known actor의 public Note를 object URI당 한 번만 existing Post model에 저장하는 최소 계약으로 정리한다.

## What Changes

- actor-scoped/shared inbox의 verified typed `Create`를 Fedify listener에서 받되 저장된 ACTIVE 또는 UNRESPONSIVE ActivityPub actor만 처리한다.
- object를 Fedify vocabulary로 hydrate한 뒤 attribution이 일치하는 PUBLIC/UNLISTED top-level `Note`만 materialization 대상으로 허용한다.
- `Note.id.href`의 unique object mapping을 remote Post identity와 durable duplicate 판정으로 사용한다.
- Fedify activity idempotency는 선택적인 조기 최적화로 사용할 수 있고 activity ID를 PostgreSQL receipt로 저장하지 않는다.
- 최초 mapping, `Post`, `PostContent`와 `Post.currentContentId`를 하나의 transaction으로 저장한다. 같은 object URI의 concurrent loser는 전체 rollback 후 no-op한다.
- duplicate `Create`는 first-write-wins로 기존 content, visibility와 timestamp를 변경하지 않는다. 원격 변경은 후속 PROD-365 `Update(Note)`/`Delete(Note)` lifecycle 계약으로 남긴다.
- remote content adapter/projection은 PROD-259가 소유하고 결과 document의 schema, canonicalization과 equality는 PROD-341 계약을 재정의하지 않고 참조한다.
- GraphQL은 PR #212가 제공한 공통 authorization과 DB-only read path를 그대로 사용한다. 각 구현 이슈는 자신의 결과를 검증하고 PROD-256은 실제 materializer가 만든 row와 post-materialization 상태 전환을 사용해 GraphQL authorization/connection matrix를 검증한다.
- unknown actor/mention materialization, Post-level mention relation, remote outbox fetch/backfill과 resolver/schema 변경은 포함하지 않는다. Reply/thread는 [PROD-358](https://linear.app/byulmaru/issue/PROD-358), FOLLOWERS audience는 [PROD-360](https://linear.app/byulmaru/issue/PROD-360), DIRECT recipient authorization은 [PROD-359](https://linear.app/byulmaru/issue/PROD-359)가 별도 계약으로 소유한다.

## Capabilities

### New Capabilities

- `activitypub-remote-post-ingestion`: known ActivityPub actor가 inbox로 전달한 public top-level Note의 검증, projection input과 object URI 기반 atomic first materialization을 다룬다.

### Modified Capabilities

- `data-model`: ActivityPub Note object URI와 Post identity mapping만 추가한다.

## Impact

- Linear owner: [PROD-354](https://linear.app/byulmaru/issue/PROD-354)가 이 공유 change를 단독으로 갱신한다.
- Completed foundations: [PROD-341](https://linear.app/byulmaru/issue/PROD-341)의 versioned PostContent document 계약, PROD-357의 activity-neutral inbox 책임 정렬과 PROD-366/PR #271의 PostgreSQL UUIDv7·GraphQL global ID 분리 계약이 main에 병합됐다.
- Implementation slices: PROD-255가 schema, PROD-259가 projection, PROD-260이 inbox validation부터 최초 materialization transaction까지 소유하고 PROD-256이 실제 materialized-row GraphQL compatibility matrix와 integration/archive를 소유한다.
- Existing foundations: PROD-241의 activity-neutral actor/shared inbox route와 PR #212/PROD-257의 DB-only GraphQL read/authorization을 변경하지 않는다.
- Ownership: parent-child 계층을 사용하지 않는다. 구현 slice PR은 이 공유 change를 수정하거나 archive하지 않고 각 이슈의 코드와 검증만 소유하며, Linear Block 관계가 전달 순서를 표현한다.
- Deferred contracts: `Update(Note)`/`Delete(Note)` lifecycle은 PROD-365가 별도 Issue → OpenSpec으로 소유한다. activity-level audit 또는 object와 무관한 side effect가 실제로 필요해질 때만 PostgreSQL activity receipt를 별도 계약으로 재검토한다. duplicate `Create` revision 갱신과 object conflict recovery lock은 first-write-wins 결정으로 대체되며 deferred scope가 아니다.
