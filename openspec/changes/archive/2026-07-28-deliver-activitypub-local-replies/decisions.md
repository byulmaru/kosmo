## Context

이 기록은 canonical Post·Instance·core service 계약, 완료된 Local Note identity 기반, 최신 PROD-497·447·448과
현재 Local Reply 생성·삭제 및 Fedify delivery 경계를 독립 확인한 결과를 반영한다. 구현자는 OpenSpec 자체를
상위 권위로 사용하지 않고 구현 전에 최신 canonical 문서와 Linear 계약을 다시 대조해야 한다.

## Decision Records

### Reply Create와 Delete는 기존 Local Note identity를 공유한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-497
- Status: Active
- Context / Problem: Reply delivery가 별도 object identity나 Tombstone 표현을 만들면 object dispatcher의
  `/ap/note/{postId}`와 remote server가 받은 Create/Delete 대상이 달라질 수 있다.
- Decision Outcome: Create는 PROD-494의 full Local Note projection을 object로 사용하고 Delete는 같은 canonical
  Note URI를 object IRI로 가리킨다. Delete를 위해 새 Tombstone object endpoint나 local Post mapping row를 만들지
  않는다.
- Alternatives Considered: delivery 전용 Note URI, Local Post mapping row, embedded Tombstone, Delete 이후
  Active-only Note dispatcher 허용.
- Consequences: Create의 content·summary·audience·`inReplyTo`는 object dispatcher와 같고, Tombstone Reply는
  직접 역참조할 수 없어도 Delete object identity가 유지된다.
- Confirmation / Follow-up: Local/Remote Parent Create와 Tombstone Delete가 같은 Note identity를 사용하는지
  Fedify integration test로 확인한다.

### Activity identity는 Note URI fragment에서 파생한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-497
- Status: Active
- Context / Problem: Fedify의 자동 activity ID를 사용하면 같은 committed Reply의 delivery 재호출마다 새 logical
  activity가 생기고, 별도 activity row를 추가하면 현재 범위를 넘어선다.
- Decision Outcome: Create activity ID는 `{noteUri}#create`, Delete activity ID는 `{noteUri}#delete`로 파생하고
  fragment 없는 canonical Note URI를 두 activity의 ordering key로 사용한다.
- Alternatives Considered: 자동 생성 URN UUID, 별도 `/ap/activity/{id}` row·route, Post UUID와 activity kind를
  포함한 별도 path.
- Consequences: DB schema나 activity dispatcher 없이 반복 호출 identity와 Create/Delete ordering domain이
  안정된다. 같은 Post에는 lifecycle별 logical Create와 Delete 하나만 표현한다.
- Confirmation / Follow-up: 반복 Create·Delete 호출의 ID와 ordering key를 검증한다.

### Recipient는 action 시점의 현재 저장 관계에서 계산한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-497
- Status: Superseded by "PROD-497은 원격 직접 Parent 작성자만 전달한다"
- Context / Problem: remote follower와 Parent Author가 겹칠 수 있고 Followers Only Reply가 follower가 아닌 Parent
  Author에게 전달되면 visibility를 우회한다. 반대로 과거 recipient를 보존하려면 명시적으로 제외된 delivery
  history가 필요하다.
- Decision Outcome: Public/Unlisted는 현재 established remote follower와 remote Parent Author를, Followers
  Only는 현재 established remote follower만 선택한다. Parent Author도 Followers Only에서는 established
  follower여야 한다. Active ActivityPub Instance와 usable actor endpoint만 허용하고 actor identity로 중복을
  제거한다. Create 당시 recipient snapshot은 저장하지 않는다.
- Alternatives Considered: visibility와 무관하게 Parent Author에게 항상 전달, Parent Author 제외, Create recipient
  snapshot 저장, Instance 상태와 무관한 delivery.
- Consequences: 삭제 시점 전에 unfollow한 과거 recipient는 Delete를 받지 못할 수 있다. 이 한계는 history가 없는
  현재 직접 delivery 범위에 남고, visibility와 Instance 정책은 현재 저장 상태에 일치한다.
- Confirmation / Follow-up: visibility·follower·Parent Author·Instance state·중복 actor matrix를 검증한다.

### 저장된 Recipient 배열을 Fedify에 직접 전달한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, PROD-497
- Status: Superseded by "PROD-497은 원격 직접 Parent 작성자만 전달한다"
- Context / Problem: Fedify의 special `"followers"` recipient는 followers collection dispatcher가 필요하지만
  현재 actor contract는 collection GET을 제공하지 않으며 remote Parent Author도 별도로 합쳐야 한다.
- Decision Outcome: 현재 DB 관계에서 usable remote actor를 조회해 Fedify `Recipient[]`로 전달하고 shared inbox를
  선호한다. 이번 change에서 followers collection dispatcher나 collection endpoint를 열지 않는다.
- Alternatives Considered: `"followers"` special recipient와 새 collection dispatcher, recipient별 개별
  `sendActivity()`, ActivityPub followers collection mirror.
- Consequences: 기존 저장 ProfileFollow와 ActivityPub Actor가 recipient source of truth로 유지된다. 동일 server
  delivery는 Fedify shared inbox 경계에서 묶을 수 있고 새 공개 collection API가 생기지 않는다.
- Confirmation / Follow-up: recipient 배열, actor 중복 제거, shared inbox option과 no-recipient no-op을 검증한다.

### 실제 outer commit 뒤 application entry에서 delivery를 orchestration한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-447, PROD-497
- Status: Superseded by "core Local Post application action이 post-commit lifecycle을 소유한다"
- Context / Problem: `createPost()`는 caller transaction에 합류할 수 있어 그 함수 반환만으로 실제 domain
  transaction commit을 알 수 없다. 그 안에서 delivery하면 rollback될 Reply를 remote inbox로 먼저 보낼 수 있다.
- Decision Outcome: 현재 production Local Reply entry인 GraphQL resolver가 가장 바깥 생성 transaction 또는
  `deletePost()` transaction의 성공 반환 뒤 Fedify delivery를 `await`하고 catch/log한다. Core Post public contract에
  protocol object, callback이나 delivery port를 추가하지 않는다.
- Alternatives Considered: `createPost(..., tx)` 내부 delivery, transaction callback 주입, fire-and-forget Promise,
  Parent access를 포함한 새 core orchestration action.
- Consequences: 현재 transaction ownership과 transport-neutral core contract를 유지하면서 실제 commit 이후에만
  전달한다. 향후 다른 Local Reply production entry가 생기면 같은 post-commit orchestration을 연결하거나 core가
  outer transaction 전체를 소유하도록 별도 정렬해야 한다.
- Confirmation / Follow-up: rollback에서 delivery zero-call, commit 뒤 delivery와 failure isolation을 API integration
  test로 확인한다.

### Direct delivery 실패는 committed Reply 결과와 분리한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-447, PROD-497, PROD-448
- Status: Active
- Context / Problem: 현재 Fedify federation에는 queue가 없어 remote HTTP 실패가 `sendActivity()`에서 throw된다.
  이 오류를 application 밖으로 전파하면 DB state는 commit됐지만 GraphQL은 실패하는 모순이 생긴다.
- Decision Outcome: Create/Delete delivery를 commit 뒤 직접 await하고 실패를 Reply identity와 함께 기록하되,
  create/delete application action은 committed payload를 성공으로 반환한다. `UNRESPONSIVE`에는 direct delivery나
  pending retry를 만들지 않는다.
- Alternatives Considered: delivery 실패 시 domain rollback, GraphQL 실패 유지와 client refetch, fire-and-forget,
  이번 change에서 outbox·queue를 선행 구현.
- Consequences: remote HTTP 지연은 API 응답 경로에 남고 commit과 delivery 사이 process 종료 시 유실될 수 있다.
  Durable intent와 queue handoff로 이 임시 경계를 대체하는 migration은 PROD-448이 별도로 소유한다.
- Confirmation / Follow-up: Create/Delete delivery rejection에서 로그, GraphQL 성공 payload와 committed DB state를
  함께 검증한다.

## Remaining Decisions

- 없음.

## Decision Amendments

### core Local Post application action이 post-commit lifecycle을 소유한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-447, PROD-497
- Status: Superseded by "통합 createPost action이 origin별 lifecycle을 소유한다"
- Context / Problem: commit 이후 실행해야 한다는 시점 제약을 이유로 GraphQL resolver가 Reply Notification과
  Fedify delivery를 직접 조립하면 Local Reply lifecycle이 transport entry에 누출되고 다른 production entry가
  같은 side effect를 빠뜨릴 수 있다.
- Decision Outcome: core `createLocalPost` application action이 Parent 정책과 outer transaction을 소유하고,
  commit 뒤 Reply Notification과 Create delivery를 best effort로 실행한다. `deletePost`는 삭제 commit 결과에서
  Reply를 판별해 Delete delivery를 best effort로 실행한다. GraphQL resolver는 인증된 Profile과 입력을 전달하고
  payload만 구성한다. ActivityPub ingress가 사용하는 low-level `createPost`에는 Local Reply lifecycle을 추가하지
  않는다.
- Alternatives Considered: GraphQL resolver의 개별 side effect 호출 유지, transaction callback 또는 delivery
  port 주입, low-level `createPost`의 모든 Local/Remote caller에 lifecycle 적용.
- Consequences: 실제 outer commit 뒤 실패 격리는 유지하면서 Notification과 protocol delivery의 필수 lifecycle을
  production core action이 소유한다. Remote Reply Notification은 이번 정정으로 추가되지 않으며 outbox·queue는
  PROD-448 범위로 남는다.
- Confirmation / Follow-up: GraphQL resolver에 Notification/Fedify 호출이 없고 core production 기본 경로가
  commit 뒤 Create/Delete와 실패 격리를 실행하는지 검증한다.

### 통합 createPost action이 origin별 lifecycle을 소유한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-447, PROD-497
- Status: Active
- Context / Problem: 별도 `createLocalPost` action은 Local GraphQL 전용 진입점을 추가해 GraphQL과 ActivityPub이
  같은 Post application action을 사용하도록 통일하는 core service 목적을 깨뜨린다.
- Decision Outcome: 단일 `createPost`가 Local/ActivityPub origin별 입력 정책과 transaction을 소유한다. Local
  Reply Notification은 같은 transaction에 참여시키고 Create delivery는 best effort로 실행한다. ActivityPub
  origin에는 outbound Local Reply delivery를 실행하지 않는다. `deletePost`는 기존 통합 action에서 Reply Delete
  lifecycle을 소유한다. transaction 인자의 존재 여부는 origin이나 lifecycle 실행 여부를 결정하는 신호로
  사용하지 않는다.
- Alternatives Considered: 별도 `createLocalPost`, GraphQL resolver orchestration, callback 또는 delivery port.
- Consequences: 모든 Post 생성 진입점이 `createPost`로 통일되고 public action 수가 늘지 않는다. 기존 optional
  caller transaction 계약을 보존하되 `tx` 유무로 lifecycle을 생략하지 않는다. caller transaction의 uncommitted
  Reply는 별도 delivery 조회에서 보이지 않으므로 rollback될 Activity를 전달하지 않지만, outer commit 뒤 delivery를
  재실행하지 않아 Activity가 누락될 수 있다. 존재하지 않는 Activity 전달은 허용하지 않고 commit 뒤 delivery 실패와
  누락은 PROD-448 전까지 수용한다. Remote Reply Notification과 durable delivery는 현재 범위에 추가하지 않는다.
- Confirmation / Follow-up: production GraphQL과 ActivityPub ingress가 모두 `createPost`를 사용하고, Local
  origin만 commit 뒤 Notification/Create를 실행하며 resolver에는 lifecycle 호출과 transaction 유무에 따른
  lifecycle 분기가 없는지 검증한다.

### PROD-497은 원격 직접 Parent 작성자만 전달한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, PROD-497,
  PROD-512
- Status: Active
- Context / Problem: 기존 결정은 각 interaction delivery가 `ProfileFollows`를 직접 조회해 follower fanout을
  구현하도록 해 공통 recipient expansion의 소유권을 중복했다. 또한 Reply의 `inReplyTo` object IRI는 thread
  relation일 뿐 delivery endpoint가 아니다.
- Decision Outcome: PROD-497은 Public/Unlisted Reply의 원격 직접 Parent 작성자만 direct recipient로 선택한다.
  Parent는 Active remote Profile, ACTIVE ActivityPub Instance와 유효한 HTTP(S) actor/personal
  inbox를 가져야 한다. 유효한 shared inbox는 보존하고 사용할 수 없으면 personal inbox로 fallback한다. Followers
  Only·Direct는 이 capability에서 전달하지 않으며 `ProfileFollows`를 조회하지 않는다. 공통 followers fanout과
  Repost migration은 PROD-512가 소유한다.
- Alternatives Considered: interaction마다 follower query 유지, `inReplyTo` IRI로 delivery, PROD-497에서 Fedify
  followers dispatcher까지 구현, 모든 visibility의 Parent Author에게 무조건 direct delivery.
- Consequences: PROD-512 전에는 Followers Only Reply와 일반 follower 배포가 없고, UNRESPONSIVE Parent에는
  direct delivery를 시도하지 않는다. Parent Author 직접 전달과 activity identity·post-commit failure isolation은
  독립적으로 완료된다. Queue/outbox는 계속 PROD-314·448의 후속 범위다.
- Confirmation / Follow-up: Parent endpoint·visibility·Instance state matrix와 follower query 부재를 PROD-497에서
  검증하고, `.authorize(() => false)`로 공개 collection을 막는 공통 dispatcher는 PROD-512에서 검증한다.

## Superseded Decisions

- "Recipient는 action 시점의 현재 저장 관계에서 계산한다"
- "저장된 Recipient 배열을 Fedify에 직접 전달한다"
- "실제 outer commit 뒤 application entry에서 delivery를 orchestration한다"
- "core Local Post application action이 post-commit lifecycle을 소유한다"

## Additional Active Decisions

### Fedify Context는 Reply Author의 Local Instance origin을 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`,
  `docs/domain/objects/post.md`, PROD-497
- Status: Active
- Context / Problem: configured Local Instance origin으로 Context를 고정하면 다른 Local Instance에 연결된 Profile의
  Reply actor와 Note identity가 잘못된 origin으로 전달된다.
- Decision Outcome: Create는 Active Reply의 Author Profile에서 Local Instance `canonicalOrigin`을 조회해 Context를
  만들고, Delete는 Tombstone source와 함께 같은 origin을 복원한다. actor URI, Note URI, Create/Delete activity와
  ordering domain은 모두 이 Context와 origin에서 파생한다.
- Alternatives Considered: deployment configured origin 고정, caller가 origin을 인자로 전달, Post UUID만으로 origin을
  추론.
- Consequences: Create/Delete가 각각 Author Instance origin을 조회하지만 caller가 identity를 지정하거나 configured
  deployment가 다른 Local Profile의 identity를 덮을 수 없다.
- Confirmation / Follow-up: configured origin과 다른 Local Instance의 Author로 Create/Delete를 실행해 Context,
  actor, Note, activity와 ordering key origin을 검증한다.
