## Context

PROD-499는 Local Profile의 Reaction application action이 commit한 결과를 Remote Post Author에게 전달하는 outbound
slice다. `packages/core/services/reaction.ts`의 transport-neutral `addReaction`은 local application action과
PROD-498 inbound materialization이 공유한다. 이 primitive에 outbound side effect를 붙이면 수신한 remote Reaction을
다시 발신하는 federation echo가 생긴다.

GraphQL resolver는 caller 인증과 Post 조회 가능 여부, GraphQL 입력·응답 mapping을 소유한다. domain transaction,
persistence, 멱등 결과와 post-commit side effect는 core application action의 책임이다. ActivityPub Post·actor·inbox
projection과 recipient eligibility, vocabulary 직렬화는 Fedify delivery 경계의 책임이다. 최신 main의 Local Repost
전달도 core action이 commit 뒤 Fedify를 호출하고 Fedify가 저장 projection을 조회하는 같은 의존 방향을 사용한다.

## Goals / Non-Goals

**Goals:**

- 여섯 built-in Type을 합의한 `Like`·`EmojiReact` content로 안정적으로 직렬화한다.
- local application action의 실제 create/delete에만 Remote Post Author direct delivery를 시작한다.
- 원본 activity와 exact `Undo`가 같은 immutable Reaction identity와 ordering key를 사용한다.
- delivery와 Notification 실패를 committed domain 결과에서 격리한다.
- API에 ActivityPub command, actor/inbox projection과 Fedify orchestration 책임을 두지 않는다.

**Non-Goals:**

- PROD-498 inbound Reaction lifecycle 변경
- custom emoji, legacy `EmojiReaction`·`_misskey_reaction`, `emojiReactions` collection
- followers fan-out, Reply·Repost 등 sibling interaction delivery
- NATS/Fedify MessageQueue, transactional outbox, worker, durable retry·history·status
- PostgreSQL/Drizzle schema 또는 migration 변경

## Implementation Guidance

### Current Constraints

- shared `addReaction`은 local action과 inbound handler가 함께 사용하므로 protocol delivery를 소유할 수 없다.
- GraphQL API는 protocol-specific command 타입이나 actor/inbox projection을 알지 않아야 한다.
- delete 이후 exact Undo를 만들려면 삭제된 Reaction의 ID, Type, 생성 시각과 actor/post identity를 보존해야 한다.
- Fedify는 저장된 actor와 Post projection만 사용하고 delivery 중 remote fetch/materialization을 하지 않아야 한다.
- Notification과 ActivityPub delivery는 post-commit best-effort side effect이며 실패가 application 결과를 바꾸지 않는다.

### Recommended Approach

GraphQL add resolver는 인증된 Profile과 Post 조회 가능 여부를 확인한 뒤 core의 `reactToPost` application action을
호출한다. 이 action은 transport-neutral `addReaction`으로 actual create와 멱등 결과를 commit한다. 실제 생성된 경우에만
Notification을 생성하고 Fedify의 create delivery를 호출한다. PROD-498 inbound handler는 계속 `addReaction(..., tx)`를
직접 사용하므로 outbound 경계를 통과하지 않는다.

core `deleteReaction`은 exact Type의 삭제 row를 transaction에서 반환받는다. 실제 삭제된 경우 Notification cleanup과
Fedify Undo를 각각 독립된 failure-isolation 경계에서 실행한다. 반복 delete는 삭제 row가 없으므로 side effect를 만들지
않는다.

Fedify create와 Undo delivery는 core transaction이 반환한 immutable Reaction row를 받는다. 따라서 create commit 직후
동시 delete가 일어나도 원본 activity를 잃지 않는다. 두 경로 모두 Fedify 내부에서 sender Local identity, target Remote ActivityPub Profile/Instance Active 상태, canonical
ActivityPub Post URI와 stored actor URI/inbox/shared inbox를 조회한다. 부적격 projection에는 전송하지 않는다.

Fedify는 `❤️`를 exact content의 `Like`, 나머지 허용 Type을 `EmojiReact`로 만든다. 원본 activity URI는 configured
local canonical origin과 Reaction ID로 만들고, Undo는 같은 데이터로 exact 원본 activity를 재구성해
`{originalActivityUri}#undo` ID를 사용한다. create와 Undo 모두 originalActivityUri를 ordering key로 전달한다.

### Allowed Alternatives

- core local action을 별도 파일로 둘 수 있지만 public contract는 transport-neutral domain input/result만 노출해야 한다.
- Fedify projection은 하나의 join 또는 분리된 조회로 구성할 수 있다. 어느 쪽이든 API로 projection 책임을 올리거나
  remote network fetch를 추가하지 않는다.

### Known Traps

- shared `addReaction`에 delivery를 추가해 inbound Reaction을 remote로 echo한다.
- GraphQL resolver가 Fedify command 타입, actor/inbox projection 또는 post-commit delivery를 직접 소유한다.
- transaction commit 전에 Fedify helper나 remote I/O를 호출한다.
- duplicate add나 repeated delete에서도 같은 activity를 다시 전달한다.
- `❤️`의 Like content를 생략하거나 나머지 Type을 모두 Like로 축약한다.
- Undo에 다른 Type 또는 현재 state에서 만든 새 identity를 넣는다.
- followers fan-out, actor fetch, retry worker를 함께 추가한다.

## Risks / Trade-offs

- [commit 뒤 process가 종료되면 activity가 유실될 수 있음] → durable handoff는 PROD-448에 남긴다.
- [commit과 Fedify projection 조회 사이에 target 상태가 바뀔 수 있음] → Fedify가 최신 stored eligibility를 적용해
  비활성 대상에는 전송하지 않는다. create lifecycle 멱등성은 core의 actual-created 결과가 보장한다.
- [동시 create/delete의 post-commit 호출 순서가 commit 순서와 다를 수 있음] → 동일 activity ordering key로 호출된
  delivery는 직렬화하지만 direct 호출만으로 DB commit 순서를 복구하지는 않는다. durable ordered intent는 PROD-448에
  남긴다.
- [저장된 remote inbox 또는 object URI가 stale할 수 있음] → stored projection만 사용하고 delivery 실패를 관측한다.
- [GraphQL 접근 확인과 core write 사이에 Post가 삭제될 수 있음] → core persistence primitive가 Post Active 상태를 다시
  확인한다. visibility는 entry가 인증된 caller 기준으로 확인한다.

## Migration Plan

1. schema 변경 없이 Fedify stored projection 조회와 activity construction/direct delivery를 구현한다.
2. core local create/delete action이 commit 뒤 Fedify를 호출하도록 연결하고 API의 protocol orchestration을 제거한다.
3. focused core/API/Fedify 회귀, TypeScript, formatting과 strict OpenSpec validation을 통과시킨다.
4. 배포 후 delivery failure log를 관측한다. 문제가 있으면 post-commit 호출만 제거해 발신을 중단할 수 있다.

## Open Questions

없음. 제품 mapping과 recipient 범위는 canonical 문서와 PROD-499에 확정됐고, 구현 책임은
`docs/architecture/core-services.md`의 API → core → Fedify 의존 방향에 맞춘다.
