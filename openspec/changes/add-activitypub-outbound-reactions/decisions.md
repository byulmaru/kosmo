## Context

이 기록은 PROD-499를 위해 canonical Reaction 발신 계약, Local Post identity, core post-commit side-effect 경계와
현재 shared Reaction application 구조를 대조해 확정한 durable 선택을 담는다. 제품 행동은 canonical 문서와 Linear
계약에서만 파생하고, federation echo를 피하는 application orchestration만 구현 선택으로 구분한다.

## Decision Records

### 기본 하트만 Like 호환 표현으로 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, PROD-499
- Status: Active
- Context / Problem: Kosmo의 여섯 Reaction Type을 FEP-c0e0 의미 보존과 Like-only 구현체 호환성 사이에서 어떻게
  나눌지 확정해야 한다.
- Decision Outcome: `❤️`만 exact `content`를 가진 `Like`로, 나머지 다섯 Type은 exact `content`를 가진
  `EmojiReact`로 발신한다. Like는 별도 domain 객체가 아니라 기본 Reaction의 호환 표현이다.
- Alternatives Considered: 모든 Type을 `Like`로 보내면 복수 Reaction 의미가 사라지고, `❤️`까지
  `EmojiReact`만 사용하면 Like-only 구현체 호환 목표를 놓친다.
- Consequences: 직렬화와 Undo는 삭제된 Type에 따라 원본 activity class를 정확히 재구성해야 한다. legacy와 custom
  emoji는 발신하지 않는다.
- Confirmation / Follow-up: 여섯 Type별 vocabulary serialization fixture와 unsupported Type no-delivery를 검증한다.

### Remote Post Author에게만 직접 전달한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, PROD-499
- Status: Active
- Context / Problem: Reaction의 대상 author와 행동 주체 followers 중 누가 이번 delivery recipient인지 경계를
  고정해야 한다.
- Decision Outcome: 조회 가능한 Remote Post의 저장 author actor를 `to`로 하여 inbox/shared inbox에 직접 전달하고
  행동 주체 followers에는 fan-out하지 않는다. sender는 Local actor identity를 가져야 하고 target Remote Instance는
  Active여야 한다.
- Alternatives Considered: Hackers’ Pub처럼 author와 followers에 모두 전달하는 방식은 federation 도달 범위를
  넓히고 PROD-499의 author-delivery 범위를 벗어난다. Local Post delivery는 remote recipient가 없다.
- Consequences: Local Post, non-local sender, Unresponsive target과 기존 조회 정책상 unavailable target은
  committed Reaction만 유지하고 Fedify delivery를 만들지 않는다.
- Confirmation / Follow-up: author inbox/shared inbox recipient, followers 부재와 각 eligibility no-delivery를
  integration test로 검증한다.

### Reaction ID를 원본과 Undo의 안정 identity로 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-499
- Status: Active
- Context / Problem: 같은 Profile/Post의 여러 Type과 add/delete lifecycle을 서로 혼동하지 않는 activity 및 ordering
  identity가 필요하다.
- Decision Outcome: 원본 URI는 immutable Reaction ID에서 `/ap/reaction/{reactionId}`로 파생하고, Undo URI는
  `{originalActivityUri}#undo`로 만든다. 원본과 Undo 모두 originalActivityUri를 ordering key로 쓰며 Undo는 같은
  데이터로 재구성한 exact 원본 activity를 내장한다.
- Alternatives Considered: Profile/Post 조합 identity는 여러 Type을 충돌시키고, 별도 outbound mapping identity는
  canonical Reaction ID 파생 계약과 불필요한 schema를 추가한다. Undo ID를 ordering key로 쓰면 같은 lifecycle의
  순서가 분리된다.
- Consequences: 같은 Reaction의 반복 직렬화는 안정적이고 서로 다른 Reaction row는 독립 activity가 된다. 별도 DB
  mapping이나 delivery record는 필요하지 않다.
- Confirmation / Follow-up: 반복 직렬화, 서로 다른 Type, exact embedded Undo, `#undo` ID와 동일 ordering key를
  검증한다.

### Commit 후 direct delivery 실패를 격리한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/architecture/core-services.md`, PROD-499
- Status: Active
- Context / Problem: Remote HTTP 실패와 process crash 가능성을 domain transaction 및 application 성공 의미와
  분리해야 한다.
- Decision Outcome: core local application action이 create/delete transaction을 commit한 뒤 기존 Fedify direct
  delivery를 호출한다. Fedify는 commit된 Reaction 결과와 저장된 Post·actor projection으로 eligibility와 activity를
  구성한다. 실패는 core 호출 경계에서 catch/log하고 committed create/delete 및 application 결과를 유지한다.
- Alternatives Considered: transaction 안 delivery는 remote I/O 실패와 지연을 domain commit에 결합한다.
  transactional outbox, MessageQueue와 durable retry는 PROD-499의 선행이 아니며 PROD-448 후속 migration이다.
- Consequences: commit 뒤 delivery 전 process 종료 시 activity 유실 가능성을 현재 계약으로 수용한다. 사용자용
  delivery status나 재시도 보장은 없다.
- Confirmation / Follow-up: commit/rollback 순서, 원본·Undo delivery failure와 committed 응답 보존을 검증하고
  후속 durable migration은 PROD-448에서 다룬다.

### Shared Reaction primitive와 local outbound orchestration을 분리한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/reaction.md`, PROD-499
- Status: Superseded
- Context / Problem: 현재 Reaction create primitive는 GraphQL local mutation과 PROD-498 inbound materialization이
  공유하므로 그 자체에 outbound delivery를 붙이면 remote activity가 다시 발신된다.
- Decision Outcome: transport-neutral shared persistence primitive에는 outbound side effect를 추가하지 않는다.
  core의 local Reaction application action과 delete action이 실제 create/delete를 commit한 뒤 Fedify 경계를 호출한다.
  Fedify가 protocol-specific Post·actor·inbox projection과 recipient eligibility를 소유한다. GraphQL API는 인증·입력·응답
  mapping과 Post 조회 가능 여부만 소유한다.
- Alternatives Considered: shared primitive의 caller flag는 protocol별 분기를 public contract에 누출하고 누락 시
  echo 위험이 있다. Fedify handler에서 global hook으로 Reaction row를 관찰하는 방식은 application intent 및 멱등
  결과와 분리된다.
- Consequences: inbound 경로는 기존 shared primitive만 사용하고 outbound 경로는 local application action에서만
  시작한다. API에는 Fedify command 타입이나 projection query가 노출되지 않는다. commit 뒤 저장 projection을
  조회하므로 transaction 시점 이후 target 상태가 바뀌면 최신 eligibility에 따라 delivery를 생략할 수 있다.
- Confirmation / Follow-up: inbound Reaction이 outbound helper를 호출하지 않는 회귀 test와 local duplicate
  add/repeated delete no-delivery를 검증한다.

### 단일 addReaction에서 실행 mode를 명시적으로 분기한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/reaction.md`, PROD-499,
  implementation review decision on 2026-07-28
- Status: Superseded
- Context / Problem: 별도 `reactToPost` wrapper는 같은 Reaction 추가 행동을 두 public action으로 나누고,
  transaction 인자 유무만으로 분기하면 caller intent와 post-commit 책임이 암시적으로 숨는다.
- Decision Outcome: 단일 `addReaction`이 `APPLICATION`과 `MATERIALIZATION` 실행 mode를 명시적으로 받는다.
  `APPLICATION`은 자체 transaction commit 뒤 실제 create에만 Notification과 Fedify delivery를 실행한다.
  `MATERIALIZATION`은 필수 caller transaction에 참여해 저장 결과만 반환하고, inbound caller가 mapping과 commit 후
  Notification을 소유한다.
- Alternatives Considered: 별도 `reactToPost` wrapper는 동일 행동의 public entry를 중복하고, optional transaction
  유무에 따른 분기는 호출 의미를 타입과 call site에서 드러내지 못한다. actor origin만 조회해 분기하면 outer
  transaction의 commit 소유권을 표현하지 못한다.
- Consequences: 모든 production caller가 mode를 선택해야 하며 materialization mode는 transaction 없이 호출할 수 없다.
  outbound eligibility와 ActivityPub 표현은 계속 Fedify가 소유하고 API에는 protocol detail이 노출되지 않는다.
- Confirmation / Follow-up: GraphQL production caller와 inbound materialization caller의 mode를 코드에서 확인하고,
  rollback·no-echo·post-commit failure isolation 회귀를 검증한다.

### 단일 addReaction에서 domain origin을 명시적으로 분기한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/reaction.md`, PROD-499,
  implementation review decision on 2026-07-28
- Status: Superseded
- Context / Problem: transaction 인자 유무에 따른 분기는 caller 의미를 숨기지만, `APPLICATION`·`MATERIALIZATION`은
  다른 core action이 사용하지 않는 기술적 실행 mode를 public contract에 추가한다. 기존 `createPost`는 같은 local/remote
  provenance를 `origin: 'LOCAL' | 'ACTIVITYPUB'`로 표현한다.
- Decision Outcome: 단일 `addReaction`이 domain input에서 `origin: 'LOCAL' | 'ACTIVITYPUB'`를 명시적으로 받는다.
  Local origin은 자체 transaction commit 뒤 실제 create에만 Notification과 Fedify delivery를 실행한다. ActivityPub
  origin은 필수 caller transaction에 참여해 저장 결과만 반환하고 inbound caller가 mapping과 commit 후 Notification을
  소유한다.
- Alternatives Considered: 별도 `reactToPost` wrapper는 동일 행동의 public entry를 중복한다. optional transaction
  유무만으로 분기하면 origin이 call site에 드러나지 않고, generic execution mode는 domain language와 기존 core input
  convention을 따르지 않는다.
- Consequences: Local origin은 caller transaction을 받을 수 없고 ActivityPub origin은 transaction 없이 호출할 수 없다.
  overload와 runtime validation이 이 조합을 고정한다. outbound eligibility와 ActivityPub 표현은 계속 Fedify가 소유한다.
- Confirmation / Follow-up: GraphQL과 inbound production caller의 origin, invalid origin/transaction 조합, rollback,
  no-echo와 post-commit failure isolation을 검증한다.

### 공개 addReaction과 internal transaction helper를 분리한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-499,
  implementation review decision on 2026-07-28
- Status: Superseded
- Context / Problem: `origin` overload도 공개 action type으로 transaction 소유권과 post-commit 실행 여부를 선택하므로
  기술적 execution mode를 domain-like 이름으로 바꾼 것에 불과하다. Local application과 inbound materialization은 같은
  저장 정책을 사용하지만 하나의 공개 action contract가 아니다.
- Decision Outcome: 공개 `addReaction(input)`은 origin, mode나 transaction을 받지 않고 자체 transaction과 실제 create의
  post-commit Notification/Fedify delivery를 소유한다. inbound handler만 같은 module의
  `addReactionInTransaction(input, tx)`을 호출해 validation·persistence·idempotency를 outer mapping transaction 안에서
  재사용한다. helper는 core package barrel에서 export하지 않는다.
- Alternatives Considered: `reactToPost` wrapper는 같은 local 행동의 공개 entry를 중복한다. optional transaction은
  호출 의미를 암시적으로 만들고, generic mode와 domain origin overload는 모두 내부 composition 선택을 공개 input으로
  누출한다.
- Consequences: GraphQL caller는 평범한 `addReaction`만 알고 transaction이나 federation provenance를 알지 않는다.
  inbound handler는 명시적인 internal helper 호출로 atomic mapping 책임을 드러내고 post-commit Notification을 계속
  소유하므로 outbound echo가 없다.
- Confirmation / Follow-up: package services index가 helper를 export하지 않는지, GraphQL caller input에 분기 값이 없는지,
  inbound rollback·no-echo와 local post-commit failure isolation 회귀를 검증한다.

### Reaction action의 origin과 transaction 참여를 독립적으로 다룬다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `packages/core/services/post.ts`, `docs/architecture/core-services.md`, PROD-499,
  implementation review decision on 2026-07-28
- Status: Active
- Context / Problem: origin별 overload로 transaction 조합을 제한하면 `LOCAL + tx`를 금지해 GraphQL이나 다른 local caller가
  더 큰 domain transaction에 참여할 수 없다. transaction 유무로 origin을 추론하면 provenance가 암시적이고, inbound
  Undo가 `Reactions`를 직접 삭제하면 add와 달리 공통 domain action을 우회한다.
- Decision Outcome: 단일 `addReaction(input, tx?)`과 `deleteReaction(input, tx?)`이
  `input.origin: 'LOCAL' | 'ACTIVITYPUB'`으로 Fedify outbound provenance를 분기하고 optional transaction에는 origin과
  독립적으로 참여한다. caller transaction이 없는 top-level actual create/delete는 origin과 무관하게 Notification을
  처리하고 Local origin에서만 Fedify delivery를 실행한다. caller transaction이 있으면 exact Reaction snapshot을 반환하고
  post-commit side effect는 outer caller가 소유한다. inbound Undo는 mapping의 Reaction ID를 exact-row guard로 전달한다.
- Alternatives Considered: origin별 transaction overload는 두 입력을 불필요하게 결속한다. transaction 유무에 따른
  암시적 분기와 generic execution mode는 provenance를 표현하지 못한다. 별도 transaction helper나 inbound 직접 삭제는
  사용자가 요구한 공통 action을 다시 분리한다.
- Consequences: `LOCAL + tx`, `ACTIVITYPUB + tx`, 두 origin의 top-level add/delete 호출이 모두 유효하다. inbound는
  ActivityPub origin과 mapping transaction을 함께 전달해 no-echo와 원자성을 유지한다. Local outer caller는 commit 뒤
  side effect를 직접 이어야 하며, 이는 `deletePost`·`repostPost`의 caller-owned transaction 계약과 같다.
- Confirmation / Follow-up: 두 origin의 add/delete caller transaction rollback, GraphQL Local top-level lifecycle,
  inbound mapping atomicity·exact-row delete·no-echo와 post-commit failure isolation을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
