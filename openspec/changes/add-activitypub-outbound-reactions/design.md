## Context

PROD-499는 GraphQL의 Local Profile Reaction mutation이 만든 domain 결과를 Remote Post Author에게 전달하는
outbound slice다. 현재 `packages/core/services/reaction.ts`의 `addReaction`은 GraphQL과 PROD-498 inbound
ActivityPub materialization이 함께 호출한다. 따라서 이 shared primitive에 outbound side effect를 직접 붙이면
수신한 remote Reaction을 다시 발신하는 federation echo가 생긴다.

GraphQL add resolver는 Post 접근 검증과 outer transaction을 소유하고 `addReaction(..., tx)`를 호출한 뒤
Notification을 best-effort로 생성한다. delete core action은 transaction에서 exact Type을 삭제한 뒤 Notification을
best-effort로 정리한다. 기존 Profile Follow/Undo는 transaction 안에서 committed result와 private delivery command를
구성하고, commit 뒤 `@kosmo/fedify`를 동적 import하여 직접 전달한 다음 실패를 catch/log하는 PROD-447 패턴을
사용한다.

Fedify에는 local·remote Post의 canonical ActivityPub URI를 해석하는 경계와 stored actor inbox/shared inbox를
Recipient로 변환하는 직접 delivery 패턴이 이미 있다. PROD-499는 이를 Reaction에 적용하되 schema, queue와
delivery history는 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- 여섯 built-in Type을 합의한 `Like`·`EmojiReact` content로 안정적으로 직렬화한다.
- Local application action의 실제 create/delete에만 Remote Post Author direct delivery command를 만든다.
- 원본 activity와 exact `Undo`가 같은 immutable Reaction identity와 ordering key를 사용한다.
- delivery와 Notification 실패를 서로 및 committed domain 결과에서 격리한다.
- vocabulary serialization, recipient 선택, idempotency와 post-commit 실패를 테스트로 고정한다.

**Non-Goals:**

- PROD-498 inbound Reaction lifecycle 변경
- custom emoji, legacy `EmojiReaction`·`_misskey_reaction`, `emojiReactions` collection
- followers fan-out, Reply·Repost 등 sibling interaction delivery
- NATS/Fedify MessageQueue, transactional outbox, worker, durable retry·history·status
- PostgreSQL/Drizzle schema 또는 migration 변경

## Implementation Guidance

### Current Constraints

- shared `addReaction`은 GraphQL과 inbound handler가 함께 사용하므로 protocol delivery를 소유할 수 없다.
- add resolver의 outer transaction 밖에서 eligibility를 다시 추론하면 create 결과와 recipient snapshot 사이에 race와
  중복 조회가 생긴다.
- 현재 delete 결과는 Reaction ID만 반환하므로 exact 원본 activity를 재구성하려면 삭제 전에 Type, 생성 시각,
  actor·target projection을 transaction 안에서 확보해야 한다.
- Local sender actor URI는 Fedify context와 Profile ID로 파생하고, Remote recipient는 저장된 actor URI와
  inbox/shared inbox만 사용해야 한다. remote actor나 Post를 delivery 시점에 fetch/materialize하면 안 된다.
- Notification과 ActivityPub delivery는 모두 post-commit best-effort side effect이며 하나의 실패가 다른 하나의
  시도 또는 application 응답을 막아서는 안 된다.

### Recommended Approach

Local GraphQL mutation이 호출하는 Reaction application orchestration이 transaction을 소유하도록 정렬한다. 그
transaction에서 기존 Post 접근 정책과 exact create/delete 결과를 얻고, 실제 변화가 있으며 다음 조건을 모두
만족할 때만 private outbound command를 함께 반환한다.

- sender Profile의 Instance가 Local이다.
- target Post Author의 Instance가 ActivityPub이고 Active이다.
- target Post에 canonical remote URI가 있고 author actor URI와 inbox가 저장되어 있다.
- Reaction Type이 여섯 built-in Type 중 하나이다.

command에는 immutable Reaction row, sender Profile ID, remote object URI와 recipient actor projection만 담는다.
transaction이 반환된 후 Notification과 Fedify delivery를 각각 독립된 failure-isolation 블록에서 실행한다.
inbound handler는 계속 shared persistence primitive를 직접 사용하여 outbound orchestration을 통과하지 않는다.

Fedify delivery 경계는 command의 Reaction Type을 `❤️`이면 `Like`, 나머지 허용 Type이면 `EmojiReact`로 만들고
항상 exact content를 포함한다. 원본 activity URI는 configured local canonical origin과 Reaction ID로 만들며,
Recipient의 shared inbox가 있으면 기존 Fedify routing이 이를 사용할 수 있게 한다. delete는 동일 데이터로 원본
activity를 다시 구성해 `Undo.object`에 내장하고 `{originalActivityUri}#undo` ID를 부여한다. create와 Undo 모두
originalActivityUri를 ordering key로 전달한다.

### Allowed Alternatives

- GraphQL resolver가 직접 orchestration을 소유하거나, GraphQL 전용이 아닌 local Reaction application action을
  core에 둘 수 있다. 어느 쪽이든 shared inbound persistence primitive에는 outbound side effect를 붙이지 않고,
  transaction 안에서 command를 확정한 뒤 commit 이후 전달해야 한다.
- canonical Post URI는 transaction의 저장 projection에서 직접 구성하거나 기존 URI resolver의 transaction-aware
  형태를 재사용할 수 있다. delivery 시점의 remote network 조회 없이 같은 URI 계약을 만족해야 한다.

### Known Traps

- shared `addReaction`에 delivery를 추가해 inbound Reaction을 remote로 echo한다.
- resolver outer transaction이 commit되기 전에 Fedify helper를 호출한다.
- duplicate add나 repeated delete에서도 같은 activity를 다시 전달한다.
- `❤️`의 Like content를 생략하거나 나머지 Type을 모두 Like로 축약한다.
- Undo에 다른 Type 또는 현재 state를 재조회한 새 activity를 넣거나 ordering key를 Undo ID로 바꾼다.
- recipient followers collection fan-out, actor fetch, mapping table, retry worker를 함께 추가한다.
- Notification 실패 때문에 ActivityPub delivery를 건너뛰거나 그 반대 실패를 application 오류로 노출한다.

## Risks / Trade-offs

- [commit 뒤 process가 종료되면 activity가 유실될 수 있음] → 현재 Profile Follow와 같은 제한으로 명시적으로
  수용하고 durable handoff는 PROD-448에 남긴다.
- [저장된 remote inbox 또는 object URI가 stale할 수 있음] → PROD-499는 canonical stored projection만 사용하고
  delivery 실패를 관측한다. refresh/retry 정책은 범위를 넓히지 않는다.
- [application orchestration refactor가 GraphQL Reaction 회귀를 만들 수 있음] → 기존 local/remote Post 접근,
  duplicate add, exact Type delete, stale ID와 Notification integration test를 유지하고 outbound assertion을 추가한다.
- [같은 helper의 수동 반복 호출은 remote duplicate를 만들 수 있음] → stable activity URI와 ordering key를 보장하되
  application lifecycle에서는 실제 create/delete만 helper를 호출한다. durable delivery deduplication은 후속 범위다.

## Migration Plan

1. schema 변경 없이 Fedify activity construction/direct delivery와 vocabulary fixture를 추가한다.
2. Local Reaction application transaction에서 private delivery command를 확정하고 commit 후 호출한다.
3. focused core/API/Fedify 회귀, TypeScript, formatting과 strict OpenSpec validation을 통과시킨다.
4. 배포 후 delivery failure log를 관측한다. 문제가 있으면 post-commit 호출을 제거해 federation 발신만 중단할 수
   있으며 committed Reaction schema와 data rollback은 필요하지 않다.

## Open Questions

없음. `❤️`/Like 경계, 나머지 EmojiReact, author-only recipient, stable identity·Undo, Active eligibility와
post-commit direct delivery 제한은 canonical 문서와 PROD-499에 확정되었다.
