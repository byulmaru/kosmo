## 1. PROD-240/241/248/281/323 완료된 Foundation

**Deliverable**

Remote follow 구현이 재사용할 저장 count, core action, actor materialization과 Fedify transport/inbox 기반이 main에 있다.

**Guardrails**

- 완료된 이슈에 correlation이나 handler 구현을 소급 귀속하지 않는다.
- 공통 inbox route를 Follow-only allowlist로 만들지 않고 activity별 handler가 자기 행동을 소유한다.

**Verification**

- 병합된 schema/service/route와 각 이슈의 완료 상태를 확인한다.

- [x] 1.1 PROD-240이 저장 followers/following count와 relation/count transaction을 제공한다.
- [x] 1.2 PROD-281이 follow/unfollow visibility와 저장 변경을 core service 책임으로 정렬한다.
- [x] 1.3 PROD-248이 canonical remote actor materialization 경계를 제공한다.
- [x] 1.4 PROD-241이 Fedify send helper와 actor-scoped/shared inbox route를 제공한다.
- [x] 1.5 PROD-323이 Follow Request를 pending-only 계약으로 정렬한다.
- [x] 1.6 PROD-241 공통 inbox route와 Follow activity handler 책임을 분리하고 remote-post handler를 금지하거나 재정의하지 않는다.

## 2. PROD-242 Remote Follow/Unfollow Mutation

**Deliverable**

저장된 active remote OPEN profile에 대한 follow/unfollow mutation과 outbound Follow/Undo를 제공한다.

**Guardrails**

- network lookup 없이 DB identity를 사용한다.
- UNRESPONSIVE는 local projection을 허용하고 delivery만 억제한다.
- SUSPENDED는 NotFound로 숨기고 기존 relation/count를 보존한다.

**Verification**

- idempotency, delivery 실패, UNRESPONSIVE와 SUSPENDED 차이를 검증한다.

- [x] 2.1 PROD-242가 remote follow/unfollow와 PROD-241 transport 연결을 구현한다.
- [x] 2.2 Follow URI/actor/object/generation/ordering key를 accepted decision대로 파생한다.
- [x] 2.3 relation/count commit 이후 delivery 실패가 projection을 rollback하지 않는지 검증한다.

## 3. PROD-243 Inbound Follow/Undo

**Deliverable**

Verified inbound Follow/Undo를 established relation 또는 remote pending request에 연결한다.

**Guardrails**

- local recipient를 먼저 검증한 뒤에만 unknown actor materialization을 허용한다.
- inbound Follow id/actor/object를 별도 저장하지 않고 actor pair projection을 재사용한다.
- unknown 또는 IRI-only Undo는 network lookup 없이 relation/request 변경을 무시하되, 저장된 actor의 verified activity는 instance reachability 복구에 사용할 수 있다.
- APPROVAL_REQUIRED remote request 생성은 기존 pending-only 저장 계약을 직접 따르고, 조회·승인·거절·취소 lifecycle은 PROD-272가 별도 구현한다.

**Verification**

- duplicate Follow/Undo, actor/object/recipient mismatch와 instance state race를 검증한다.

- [x] 3.1 inbound Follow correlation schema/migration 없이 profile FK와 저장 actor identity에서 actor pair를 파생한다.
- [x] 3.2 OPEN Follow의 relation/count transaction과 현재 수신 Follow object에 대한 Accept를 구현한다.
- [x] 3.3 APPROVAL_REQUIRED Follow의 remote pending request를 별도 correlation metadata 없이 생성한다.
- [x] 3.4 exact-row relation/request 삭제 primitive를 제공하고 relation이 삭제된 경우에만 count를 감소시킨다.
- [x] 3.5 기존 Fedify inbox listener에 Follow/Undo handler를 등록한다.
- [x] 3.6 duplicate Follow/Undo idempotency, unknown/IRI-only Undo zero-network/graph-write, SUSPENDED 무효와 verified activity의 UNRESPONSIVE CAS를 검증한다.

## 4. PROD-244 Remote APPROVAL_REQUIRED Round Trip

**Deliverable**

Remote APPROVAL_REQUIRED follow를 pending request로 발송·취소하고 verified Accept/Reject로 처리한다.

**Guardrails**

- request row의 존재만 Pending을 나타내며 terminal state, activity history 또는 retry metadata를 저장하지 않는다.
- Follow identity/generation은 immutable request 또는 relation의 id/createdAt에서 파생하며 Accept 승격은 request id/createdAt을 relation에 승계한다.
- Fedify가 기본 cross-origin 검증을 통과한 typed Follow로 제공한 object만 처리하고 ID lookup 전에 actor/object를 검증하며, IRI-only object를 별도 역조회하지 않는다.
- Accept/Reject/cancel은 조회한 exact row에만 적용하고 relation count는 실제 relation 생성·삭제에서만 변경한다.
- UNRESPONSIVE에서는 local request lifecycle만 적용하고 delivery와 durable retry를 만들지 않는다.

**Verification**

- duplicate/concurrent Follow와 cancel, Accept 승격 뒤 원본 identity의 Undo, typed Follow의 kosmo/non-kosmo/missing ID, fallback Follow의 missing/mismatched/current `published`, malformed URI, 기본 origin 검증에서 무시되는 cross-origin embedded/IRI-only object, stale Accept/Reject와 transition race를 검증한다.

- [x] 4.1 APPROVAL_REQUIRED remote follow를 pending request로 생성하고 새 ACTIVE request에만 Follow를 발송한다.
- [x] 4.2 remote pending cancel이 exact request를 삭제하고 ACTIVE에서만 원래 Follow identity의 Undo를 발송한다.
- [x] 4.3 verified Accept는 pending request를 relation/count로 원자적으로 승격하고 established relation에는 idempotent하다.
- [x] 4.4 verified Reject는 pending request 또는 optimistic established relation의 exact row만 삭제한다.
- [x] 4.5 actor/object/recipient/URI mismatch, duplicate/concurrent transition과 SUSPENDED/UNRESPONSIVE 상태를 검증한다.

## 5. PROD-245 Remote Follow Graph GraphQL API

**Deliverable**

DB-known local/remote follow graph를 GraphQL에서 읽을 수 있다.

**Guardrails**

- remote collection을 fetch/mirror하지 않는다.
- pending request는 established graph/viewer follow로 노출하지 않는다.

**Verification**

- DB-only GraphQL connection, stored count와 viewer state를 검증한다.

- [x] 5.1 PROD-245가 connection, stored count와 `viewerState.follow` read 계약을 검증한다.

## 6. PROD-263 Remote Profile Web Follow Action

**Deliverable**

Remote profile에서 follow action을 사용하고 normalized cache가 최신 관계와 count를 반영한다.

**Guardrails**

- PROD-242 mutation과 PROD-245 read 계약을 재사용한다.
- Fedify handler, GraphQL resolver와 follow 저장 모델을 수정하지 않는다.

**Verification**

- remote OPEN/APPROVAL_REQUIRED/established 상태와 양쪽 count/viewer cache 갱신을 검증한다.

- [ ] 6.1 PROD-263이 remote follow action과 양쪽 count/viewer state cache 갱신을 구현한다.

## 7. PROD-282 SUSPENDED 관계 보존 회귀 검증

**Deliverable**

SUSPENDED remote profile의 기존 관계와 count가 GraphQL action 실패에서 보존된다.

**Guardrails**

- handler, mutation service, nullable payload와 local-only 삭제를 새로 구현하지 않는다.

**Verification**

- existing/no-relation SUSPENDED unfollow의 NotFound와 relation/count 불변을 검증한다.

- [x] 7.1 PROD-282가 existing/no-relation SUSPENDED unfollow의 NotFound와 relation/count 불변을 GraphQL에서 검증한다.

## 8. PROD-380 Inbound Follow/Undo Notification Integration

**Deliverable**

Verified inbound Follow/Undo가 공통 core Follow lifecycle을 통해 Local Recipient의 established Follow Notification을 생성·정리한다.

**Guardrails**

- PROD-244의 outbound pending/cancel 또는 Accept/Reject protocol 동작을 재구현하지 않는다.
- pending request, duplicate/no-op에는 established Follow Notification side effect를 만들지 않는다.
- GraphQL/DB schema와 ActivityPub object 지원 범위를 변경하지 않는다.

**Verification**

- production Fedify listener → concrete handler → core action → relation/request/count → Notification 흐름을 검증한다.
- Notification create/delete 실패가 committed relation/request/count를 rollback하지 않는지 검증한다.

- [ ] 8.1 PROD-380이 inbound Follow/Undo와 Follow Notification lifecycle을 공통 core action에서 통합한다.

## 9. PROD-361 최종 통합 검증과 OpenSpec Archive

**Deliverable**

Remote follow 전체 흐름이 최종 계약과 일치하고 shared change가 active specs에 동기화·archive된다.

**Guardrails**

- 모든 구현 자식이 main에 병합되기 전에는 시작하거나 archive하지 않는다.
- 자식 이슈의 runtime 구현을 이 task에 흡수하지 않는다.
- 부모 PROD-235는 자체 PR 없이 이 task의 완료 근거로 전체 계약의 완료만 판단한다.

**Verification**

- 모든 child PR, requirement scenario, schema/type generation과 전체 strict validation을 확인한다.
- archive 이후 active specs와 현재 main이 일치하는지 검증한다.

- [ ] 9.1 PROD-361이 Follow/Undo/Accept/Reject, graph와 Web action 통합 검증을 수행한다.
- [ ] 9.2 PROD-361이 전체 task 완료 후 delta specs를 동기화하고 change를 archive한 뒤 `openspec validate --all --strict`를 통과한다.
