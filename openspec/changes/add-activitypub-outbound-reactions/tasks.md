## 1. PROD-499 Reaction Activity 직렬화와 직접 전달

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-499

**Deliverable**

여섯 built-in Reaction이 stable identity의 `Like`·`EmojiReact`와 exact `Undo`로 직렬화되어 저장된 Remote Post
Author inbox/shared inbox에 직접 전달된다.

**Guardrails**

- `❤️`만 exact content의 `Like`, 나머지 다섯 Type은 exact content의 `EmojiReact`로 만든다.
- 원본 URI는 immutable Reaction ID, Undo URI는 원본 URI의 `#undo`에서 파생하고 둘은 원본 URI ordering key를
  공유한다.
- actor는 Local Profile actor, object는 canonical ActivityPub Post URI, `to`는 Remote Post Author actor이다.
- followers fan-out, custom·legacy emoji, remote fetch/materialization과 queue/outbox를 추가하지 않는다.

**Verification**

- 여섯 Type의 vocabulary JSON-LD, stable URI, canonical object, recipient actor, shared inbox routing, exact embedded
  Undo와 동일 ordering key를 Fedify test로 검증한다.
- unsupported Type, inbox 부재와 malformed stored URI의 delivery 거부를 검증한다.

- [x] 1.1 여섯 Type의 원본 activity identity와 `Like`·`EmojiReact` 직렬화를 구현한다.
- [x] 1.2 exact 원본 activity를 내장하는 `#undo` identity와 공통 ordering lifecycle을 구현한다.
- [x] 1.3 Remote Post Author inbox/shared inbox direct delivery와 직렬화 fixture를 검증한다.

## 2. PROD-499 Local Reaction post-commit lifecycle 연결

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- `docs/architecture/core-services.md`
- PROD-499

**Deliverable**

Local application Reaction의 실제 create/delete만 transaction commit 후 Fedify delivery를 시도하고, 부적격 target과
멱등 no-op에는 delivery를 만들지 않는다.

**Guardrails**

- shared Reaction persistence primitive는 inbound materialization에 outbound side effect를 일으키지 않는다.
- transaction 안에서 actual 변화와 sender/target eligibility 및 delivery projection을 확정하고 commit 전에는 remote
  I/O를 하지 않는다.
- Local Post, non-local sender, Active가 아닌 Remote Instance와 unsupported Type에는 delivery를 시도하지 않는다.
- duplicate add, repeated delete는 새 delivery를 만들지 않고 삭제한 exact Type만 Undo한다.
- Notification과 ActivityPub delivery 실패는 서로 및 committed application 결과에서 독립적으로 격리한다.

**Verification**

- API/core DB-backed test로 eligible create/delete, duplicate add, repeated delete, multi-Type exactness, Local Post,
  non-local sender, Unresponsive/Suspended target과 inbound no-echo를 검증한다.
- delivery spy에서 호출이 transaction commit 이후 발생하고 rollback 시 발생하지 않음을 검증한다.

- [x] 2.1 Local Reaction create transaction이 실제 생성과 eligibility에 따라 post-commit delivery를 시작하도록 연결한다.
- [x] 2.2 Local Reaction delete transaction이 실제 삭제한 Reaction projection으로 exact post-commit Undo를 시작하도록 연결한다.
- [x] 2.3 멱등 lifecycle, eligibility no-delivery와 inbound no-echo 회귀를 DB-backed test로 검증한다.

## 3. PROD-499 Failure isolation과 범위 회귀 검증

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/architecture/core-services.md`
- PROD-499

**Deliverable**

remote delivery 실패에도 committed Reaction application 결과가 유지되고, PROD-499의 narrow scope와 기존 Reaction
동작이 전체 검증에서 보존된다.

**Guardrails**

- delivery 실패는 관측 가능하게 기록하되 GraphQL 성공 payload를 실패로 바꾸지 않는다.
- transactional outbox, NATS/Fedify MessageQueue, durable retry/history/status, followers fan-out,
  `emojiReactions` collection과 sibling interaction을 구현하지 않는다.
- PROD-499 완료만으로 PROD-448·PROD-500 또는 전체 Reaction OpenSpec을 완료 처리하지 않는다.

**Verification**

- 원본 activity와 Undo HTTP failure에서 DB create/delete와 GraphQL payload가 유지되고 실패 log가 발생함을 검증한다.
- 관련 API/core/Fedify test, package TypeScript, formatting, strict OpenSpec validation과 `git diff --check`를 통과한다.
- 변경 diff에 DB migration, queue/outbox와 sibling interaction 구현이 없는지 확인한다.

- [x] 3.1 원본·Undo delivery failure isolation과 독립 Notification side effect를 검증한다.
- [x] 3.2 관련 API/core/Fedify focused test와 기존 Reaction 회귀 test를 통과시킨다.
- [x] 3.3 TypeScript, formatting, strict OpenSpec validation, diff integrity와 제외 범위를 최종 확인한다.
