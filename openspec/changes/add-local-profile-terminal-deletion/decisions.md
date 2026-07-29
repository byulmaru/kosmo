## Context

이 기록은 canonical Profile lifecycle·suspension 계약, PROD-532 Issue Gate와 PROD-542·543·544 구현 경계에 따라 여러 release가 공유해야 할 durable choice를 정리한다. 구현자는 각 Authority를 OpenSpec과 독립적으로 다시 확인하고, authority가 바뀌면 해당 decision을 먼저 갱신해야 한다.

## Decision Records

### Profile lifecycle와 suspension을 독립 상태로 유지한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-532
- Status: Active
- Context / Problem: legacy `ProfileState`는 Deactivated lifecycle와 Suspended suspension을 같은 차원에 두어 Deactivated+Suspended 조합과 terminal Deleted를 표현하지 못한다.
- Decision Outcome: Profile lifecycle는 `ACTIVE | DEACTIVATED | DELETED`, suspension은 `NORMAL | SUSPENDED`의 독립 상태로 저장·판정한다. Deleted는 terminal이며 Profile row 물리 삭제와 구분한다.
- Alternatives Considered: legacy 단일 enum에 `DELETED`만 추가하는 방식은 두 canonical 상태 차원을 계속 혼합하므로 제외했다. Profile row delete는 terminal identity와 관계 보존 계약을 깨뜨리므로 제외했다.
- Consequences: 모든 state predicate는 두 차원을 함께 판정해야 하며 legacy state는 contract 전까지만 compatibility projection으로 남는다.
- Confirmation / Follow-up: schema·core·GraphQL·session·관계 소비자 test에서 Active/Deactivated/Deleted × Normal/Suspended matrix를 검증한다.

### 상태 전환을 세 migration release로 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: PROD-532, PROD-542, PROD-543, PROD-544
- Status: Active
- Context / Problem: PG enum rename·drop 또는 단일-release 의미 변경은 구버전 workload와 rollback 대상을 깨뜨리고, 현재 runner는 image 안의 contract migration을 선택적으로 건너뛸 수 없다.
- Decision Outcome: PROD-542는 additive expand, PROD-543은 compatibility read/write·action·backfill, PROD-544는 workload drain·rollback window·backup/restore·명시적 승인 뒤 contract 제거를 각각 독립 PR·release로 전달한다.
- Alternatives Considered: 한 migration에서 rename/backfill/drop을 수행하는 방식과 transition image에 contract SQL을 미리 넣는 방식은 구버전 공존·rollback을 보장하지 못해 제외했다.
- Consequences: shared OpenSpec은 세 구현 slice가 끝날 때까지 active로 남고, 각 branch는 자기 issue task만 구현한다.
- Confirmation / Follow-up: 각 phase handoff에 migration compatibility와 다음 gate evidence를 남기고 PROD-532가 최종 통합·archive를 소유한다.

### Legacy ProfileState mapping을 고정한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-532, PROD-542, PROD-543
- Status: Active
- Context / Problem: mixed workload와 기존 row를 canonical 두 상태로 손실 없이 해석할 일관된 mapping이 필요하다.
- Decision Outcome: legacy `ACTIVE`는 lifecycle `ACTIVE`/suspension `NORMAL`, `DISABLED`는 `DEACTIVATED`/`NORMAL`, `SUSPENDED`는 `ACTIVE`/`SUSPENDED`로 mapping한다. canonical `DELETED`는 legacy 값보다 우선하며 backfill이 덮어쓰지 않는다.
- Alternatives Considered: `SUSPENDED`를 lifecycle로 유지하면 canonical suspension 차원을 만들 수 없고, legacy `DISABLED`를 Deleted로 mapping하면 현재 비활성 Profile을 비가역 삭제하므로 제외했다.
- Consequences: transition dual-write는 terminal Deleted를 legacy DISABLED로 숨기면서 canonical Deleted를 별도 보존해야 한다. 예상 밖 값은 rollout을 실패시킨다.
- Confirmation / Follow-up: 기존 세 값, null canonical column, old-writer disable, terminal Deleted와 재실행 backfill case를 migration test로 검증한다.

### Lifecycle GraphQL action을 별도 이름으로 제공한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-532, PROD-543, PROD-544
- Status: Active
- Context / Problem: legacy `deleteProfile`은 실제로 deactivation을 수행하므로 같은 field를 terminal 의미로 바꾸면 구버전 caller가 비가역 삭제를 실행할 수 있다.
- Decision Outcome: 새 public action은 `deactivateProfile`, `reactivateProfile`, `deleteDeactivatedProfile`로 분리한다. legacy `deleteProfile`은 transition 동안 deactivation compatibility alias로만 유지·deprecate하고 PROD-544에서 제거하며 terminal 의미로 재사용하지 않는다.
- Alternatives Considered: legacy field를 즉시 terminal action으로 repurpose하는 방식은 데이터 손실 위험 때문에 제외했다. terminal action 없이 내부 service만 추가하는 방식은 PROD-532의 production API 경계를 전달하지 못해 제외했다.
- Consequences: transition 동안 mutation 표면이 일시적으로 중복되며 generated SDL과 caller migration이 필요하다.
- Confirmation / Follow-up: legacy field가 Deleted를 만들지 않는 integration test와 contract schema에서 legacy field가 제거된 snapshot을 검증한다.

### Terminal 삭제는 Owner 재시도에 멱등한 상태 전이로 구현한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, PROD-532
- Status: Active
- Context / Problem: Deactivated Profile은 공개 visibility로 조회되지 않고 network retry가 있을 수 있으므로 최초 action과 이미 완료된 재시도를 구분해야 한다.
- Decision Outcome: Active Account Owner의 Deactivated·Normal Local Profile은 한 transaction에서 Deleted가 되고, 같은 Owner의 Deleted 재시도는 side effect를 반복하지 않고 같은 Profile ID를 반환한다. Profile row와 Owner Membership은 보존한다.
- Alternatives Considered: non-Active를 모두 NotFound로 처리하면 성공 응답 유실 뒤 안전하게 재시도할 수 없다. 물리 delete는 idempotent authorization과 terminal identity를 잃으므로 제외했다.
- Consequences: resolver는 public visibility가 아니라 Membership·Locality·현재 상태를 조회해야 하며 Deleted row에 대한 Owner retry authorization이 가능해야 한다.
- Confirmation / Follow-up: 최초 성공, retry, Active/Remote/non-Owner/inactive Account/Suspended 거부와 transaction rollback을 검증한다.

### Lifecycle action transaction을 core 한 곳에 유지한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-532, PROD-543
- Status: Active
- Context / Problem: 비활성화 state write, Follow count, Session 해제와 downstream cleanup이 분산되면 부분 commit이나 비활성화에 잘못 연결된 cleanup이 생길 수 있다.
- Decision Outcome: transport-neutral core lifecycle action이 state transition과 lifecycle-owned DB side effect의 transaction을 소유한다. PROD-526은 terminal transaction 본문에 Profile Tag cleanup을 직접 통합하며 generic callback registry·event bus·plugin interface를 선제 도입하지 않는다.
- Alternatives Considered: GraphQL resolver가 여러 DB write를 조립하는 방식은 다른 entry point 재사용과 원자성을 해친다. generic cleanup registry는 현재 한 downstream consumer를 위해 불필요한 실행·오류 계약을 추가하므로 제외했다.
- Consequences: terminal action은 downstream integration의 안정된 단일 수정 지점이 되고 core public contract는 GraphQL 타입에 의존하지 않는다.
- Confirmation / Follow-up: core transaction rollback test와 PROD-526 통합 뒤 state+Profile Tag cleanup 원자성 test를 수행한다.

### 재활성화는 Follow count만 대칭 복구하고 Session 선택을 복원하지 않는다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-532, PROD-543
- Status: Active
- Context / Problem: 현재 deactivation은 Follow row를 보존하고 Active 상대의 stored count에서 제외하며 Session 선택을 해제한다. Reactivation의 대칭 결과를 정하지 않으면 count가 계속 낮거나 과거 Session actor가 예기치 않게 복원될 수 있다.
- Decision Outcome: Reactivation은 보존된 Follow 중 현재 Active 상대와의 count만 중복 없이 복구한다. 비활성화 때 해제한 Session selected Profile은 자동 복원하지 않는다.
- Alternatives Considered: Follow row를 재생성하는 방식은 identity와 timestamp를 바꾸므로 제외했다. Session 자동 복원은 사용자의 현재 선택과 권한 context를 추정하므로 제외했다.
- Consequences: 사용자는 재활성화 뒤 Profile을 명시적으로 다시 선택해야 하며 concurrent deactivate/reactivate count test가 필요하다.
- Confirmation / Follow-up: active·inactive 상대 조합, 반복/경합 전이, Session 미복원과 stored count를 검증한다.

### 저장 enum을 공개 GraphQL 상태 field로 자동 승격하지 않는다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, PROD-532, PROD-544
- Status: Active
- Context / Problem: canonical state를 DB에 추가해도 현재 public Profile object에는 상태 field 사용 사례가 없고 Owner action payload만 필요하다.
- Decision Outcome: lifecycle·suspension enum은 승인된 public field/input 소비자가 생기기 전까지 GraphQL enum으로 등록하지 않는다. 사용되지 않는 legacy `ProfileState` registration은 contract에서 제거한다.
- Alternatives Considered: DB enum을 그대로 GraphQL에 노출하는 방식은 제품 사용 사례와 조회 권한 없이 API surface를 고정하므로 제외했다.
- Consequences: caller는 mutation outcome과 Profile visibility를 사용하며 상태 조회 API가 필요하면 별도 canonical·Linear 계약을 거친다.
- Confirmation / Follow-up: transition·contract SDL snapshot과 enum registration test를 검증한다.

## Remaining Decisions

- PROD-544가 요구하는 정확한 rollback 보장 기간과 production contract 실행 시점은 PROD-543 관측 evidence를 본 뒤 Contract Gate 승인자가 정한다. PROD-542·543 구현에는 필요하지 않으며 승인 전에는 PROD-544 contract task를 실행하지 않는다.
- PR #394 head가 `904c41ce`에서 바뀌거나 `main` merge 결과가 달라지면 ADR 0020·Profile Tag lifecycle authority를 다시 대조하고 관련 artifact digest를 갱신한다.

## Superseded Decisions

- 없음.
