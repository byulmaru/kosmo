## Context

이 기록은 canonical Post·Profile·Instance·core service 계약, 완료된 PROD-494 Local Note 기반, 최신 PROD-512
본문과 범위 정정 댓글, 현재 PROD-497 구현과 기존 Reply 전용 OpenSpec을 독립 확인한 결과를 반영한다. 구현자는
이 기록을 상위 권위로 사용하지 않고 구현 전에 canonical 문서와 Linear 계약을 다시 대조해야 한다.

## Decision Records

### Reply는 별도 outbound Activity lifecycle이 아니다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-512
- Status: Active
- Context / Problem: 기존 PROD-497은 Reply를 별도 Create/Delete interaction으로 분리했지만, Local Note
  projection이 이미 Reply Parent를 `inReplyTo`로 제공하고 Activity envelope는 Root Post와 같다.
- Decision Outcome: 모든 Local content Post가 같은 Create/Delete lifecycle을 사용한다. Reply의 표현 차이는
  Note의 `inReplyTo`이고 Public/Unlisted remote Reply의 target 차이는 Parent author Profile 추가뿐이다.
- Alternatives Considered: Reply 전용 builder·delivery helper 유지, Root Post delivery와 Reply delivery를 서로
  다른 capability로 유지.
- Consequences: PROD-497은 PROD-512의 Duplicate이며 active Reply delivery capability와 helper는 일반 Local
  Post delivery로 대체한다.
- Confirmation / Follow-up: Root Post와 Local/Remote Parent Reply가 같은 builder를 사용하고 wire-level Note
  차이가 `inReplyTo`뿐인지 검증한다.

### 공통 dispatcher가 recipient 해석과 실제 delivery를 소유한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`, PROD-512
- Status: Active
- Context / Problem: activity별 helper가 followers, actor, personal/shared inbox와 Instance eligibility를 직접
  조회하면 동일한 recipient 정책과 remote delivery가 interaction마다 복제된다.
- Decision Outcome: activity별 lifecycle은 이미 구성된 Activity와 direct Profile·followers target만 제공한다.
  공통 dispatcher가 저장 관계를 `Recipient`로 확장하고 eligibility·URI 검증·deduplication과 Fedify
  `sendActivity`를 소유한다.
- Alternatives Considered: interaction별 DB recipient query, Parent object URI를 endpoint로 사용, caller가 완성된
  `Recipient[]`를 제공.
- Consequences: dispatcher는 Activity 종류, visibility 또는 Reply Parent를 알지 않는다. 후속 interaction은
  동일 target 계약을 재사용할 수 있다.
- Confirmation / Follow-up: Local Post integration에 actor/inbox/follower 조회와 `sendActivity`가 남지 않고
  direct/followers target 중복이 제거되는지 검증한다.

### dispatcher와 Local Post 첫 integration을 한 change에서 전달한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: PROD-512
- Status: Active
- Context / Problem: Create/Delete envelope만 별도 이슈로 분리해도 dispatcher 없이는 독립 배포 결과가 없고
  PROD-494 Note를 얇게 감싸는 것 외에 별도 도메인 계약이 없다.
- Decision Outcome: PROD-512가 공통 dispatcher와 Local Post Create/Delete 첫 consumer를 함께 구현·검증한다.
  envelope 구성만을 위한 별도 issue, capability 또는 public helper 경계를 만들지 않는다.
- Alternatives Considered: PROD-497을 일반 Post activity builder 이슈로 유지, dispatcher만 먼저 배포하고 consumer를
  후속 이슈로 연기.
- Consequences: 하나의 OpenSpec이 두 capability를 함께 소유한다. Repost migration은 PROD-534 sibling 후속으로
  남는다.
- Confirmation / Follow-up: tasks와 최종 통합 검증이 dispatcher와 Local Post delivery를 모두 완료해야 archive한다.

### 발신 identity는 Post Author의 Local Instance를 따른다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`,
  `docs/domain/objects/post.md`, PROD-512
- Status: Active
- Context / Problem: deployment configured origin을 고정 사용하면 다른 Local Instance에 속한 Author의 actor,
  Note, activity와 HTTP signature key identity가 서로 다른 origin을 가리킨다.
- Decision Outcome: Local Post Create/Delete의 context, actor, Note, activity identity와 signing key를 Author
  Profile이 연결된 Local Instance에서 파생한다.
- Alternatives Considered: configured singleton federation 사용, request Host에서 origin 추론.
- Consequences: outbound federation context가 Author Local Instance identity를 입력받아야 하고 request-facing
  fixed-origin federation의 보호 계약은 변경하지 않는다.
- Confirmation / Follow-up: configured origin과 다른 Author Instance fixture에서 actor·Note·activity·key ID가
  같은 origin을 사용하는지 검증한다.

### Activity identity와 ordering은 canonical Note URI에서 파생한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-512
- Status: Active
- Context / Problem: 자동 activity ID는 같은 committed lifecycle의 재호출마다 새 logical activity를 만들고,
  별도 activity row는 현재 저장 계약에 필요하지 않다.
- Decision Outcome: Create와 Delete ID는 canonical Note URI에서 lifecycle kind를 구분하는 stable fragment로
  파생하고, fragment 없는 Note URI를 같은 Post의 ordering key로 사용한다.
- Alternatives Considered: 자동 URN UUID, 별도 activity table과 public endpoint, lifecycle별 별도 path.
- Consequences: DB migration 없이 반복 호출 identity와 Create/Delete ordering domain을 유지한다. public activity
  dereference를 새로 제공하지 않는다.
- Confirmation / Follow-up: Root Post와 Reply의 반복 Create/Delete에서 ID와 ordering key 안정성을 검증한다.

### 현재 direct delivery 실패는 committed Post 결과와 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-447, PROD-512, PROD-533
- Status: Active
- Context / Problem: MessageQueue가 없는 현재 Fedify delivery는 remote HTTP 실패를 application process에서
  throw하지만, 이미 commit된 Post 결과를 mutation 실패로 바꾸면 persistence와 응답이 모순된다.
- Decision Outcome: top-level transaction 단계가 끝난 뒤 dispatcher를 await하고 실패를 기록하되 committed
  application 결과를 유지한다. caller-owned transaction에서는 rollback될 Activity를 먼저 보내지 않고
  committed-read no-op 뒤 delivery 누락을 현재 제한으로 수용한다.
- Alternatives Considered: commit 전 delivery, delivery 실패 시 domain rollback, fire-and-forget, 이번 change에서
  durable outbox 선행 구현.
- Consequences: mutation latency와 process 종료·caller transaction delivery 유실 구간이 남지만 존재하지 않는
  transition의 Activity를 외부에 보내지 않는다.
- Confirmation / Follow-up: top-level success/failure, rollback zero-call과 caller transaction no-op을 검증한다.

### followers expansion은 내부 delivery 경계로 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-512
- Status: Active
- Context / Problem: internal fanout 구현이 외부 followers collection 공개 범위까지 암묵적으로 열면 별도 제품·권한
  결정을 우회한다.
- Decision Outcome: established remote followers를 내부 recipient expansion에 사용하되 외부 followers collection
  조회와 목록 API를 추가하지 않는다.
- Alternatives Considered: public followers collection dispatcher와 내부 expansion을 동시에 제공, interaction별
  direct follower DB 조회.
- Consequences: Fedify 구현은 내부 expansion과 HTTP collection exposure를 분리해야 한다.
- Confirmation / Follow-up: fanout 검증과 함께 외부 followers collection route가 새로 열리지 않았음을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archived `deliver-activitypub-local-replies`의 Reply 전용 Create/Delete·Parent recipient·delivery ownership 결정은
  "Reply는 별도 outbound Activity lifecycle이 아니다"와 "공통 dispatcher가 recipient 해석과 실제 delivery를
  소유한다"로 대체한다. 당시 PROD-497 범위에는 맞았지만 PROD-497이 PROD-512에 흡수되어 현재 권위를 잃었다.
- 기존 PROD-512의 followers-only dispatcher 결정은 direct Profile target과 followers target을 함께 처리하는 공통
  dispatcher 결정으로 대체한다. direct Parent author inbox 처리를 activity별 helper에 남기지 않기 위함이다.
