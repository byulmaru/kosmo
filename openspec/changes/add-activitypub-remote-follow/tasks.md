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
- Follow identity/generation은 immutable request 또는 relation의 id/createdAt에서 파생한다.
- Fedify가 기본 cross-origin 검증을 통과한 typed Follow로 제공한 object만 처리하고 ID lookup 전에 actor/object를 검증하며, IRI-only object를 별도 역조회하지 않는다.
- Accept/Reject/cancel은 조회한 exact row에만 적용하고 relation count는 실제 relation 생성·삭제에서만 변경한다.
- UNRESPONSIVE에서는 local request lifecycle만 적용하고 delivery와 durable retry를 만들지 않는다.

**Verification**

- duplicate/concurrent Follow와 cancel, typed Follow의 kosmo/non-kosmo/missing ID, fallback Follow의 missing/mismatched/current `published`, malformed URI, 기본 origin 검증에서 무시되는 cross-origin embedded/IRI-only object, stale Accept/Reject와 transition race를 검증한다.

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

## 6. PROD-447 Post-commit Delivery Error Isolation

**Deliverable**

Remote OPEN/APPROVAL_REQUIRED follow, established unfollow와 pending cancel이 post-commit Follow/Undo delivery 실패에도 committed mutation payload를 반환한다.

**Guardrails**

- transaction-before-delivery 순서와 relation/request/count projection을 변경하지 않는다.
- delivery 오류를 관측 가능하게 기록하되 GraphQL 오류로 전파하지 않는다.
- retry/outbox/history, Web 오류 후 refetch workaround, Accept/Reject와 inbound Follow/Undo lifecycle을 구현하지 않는다.
- PROD-263 runtime과 PR #286을 수정하지 않는다.

**Verification**

- core service, GraphQL integration과 Web E2E에서 delivery 실패에도 성공 payload와 DB 상태가 일치하는지 검증한다.

- [x] 6.1 PROD-447이 post-commit Follow/Undo delivery 오류를 격리하고 committed 결과를 반환한다.

## 7. PROD-263 FollowButton Established/Pending Action

**Deliverable**

Local/remote profile의 FollowButton이 NONE/PENDING/ESTABLISHED 상태를 표시하고 normalized cache가 최신 relation/request와 count를 반영한다.

**Guardrails**

- PROD-242/244 mutation과 PROD-245 read 계약을 재사용한다.
- `ProfileViewerState.followRequest`만 추가하고 `Profile.viewerFollowRequest`는 만들지 않는다.
- 완료된 PROD-378의 canonical `viewerState.follow` 계약을 사용하고 제거된 `Profile.viewerFollow`를 복원하거나 이중 cache slot을 만들지 않는다.
- profile origin을 Web action 조건으로 사용하지 않고 `followPolicy`는 optimistic 결과 예측에만 사용할 수 있으며 실제 `followProfile.result` union을 최종 권위로 사용한다.
- Fedify handler, core follow lifecycle, DB schema와 follow 저장 모델을 수정하지 않는다.
- remote Accept/Reject의 refetch 없는 실시간 UI 전환을 구현하지 않는다.

**Verification**

- API exact viewer/target pair의 nullable `viewerState.followRequest`, 권한과 relation/request 상호배타성을 검증한다.
- local/remote의 NONE/PENDING/ESTABLISHED component behavior, OPEN established count +1, APPROVAL_REQUIRED pending count 불변, duplicate request 멱등, pending cancel과 established unfollow 및 각 오류 rollback을 검증한다.
- follow/unfollow 성공 시 열린 connection membership을 직접 append/delete하지 않는다. established unfollow는 relation/count/button만 optimistic 및 confirmed 상태로 전환하고 기존 row를 유지하며, 실패 시 같은 행에서 rollback 오류를 표시하는 경계를 Relay-backed Storybook과 Web E2E로 검증한다.
- self/viewer 없음/SUSPENDED 비노출과 UNRESPONSIVE action 허용, 다음 server-backed read의 Accept/Reject 상태 반영을 검증한다.

- [x] 7.1 PROD-263이 `ProfileViewerState.followRequest` exact-pair read 계약과 API 검증을 구현한다.
- [x] 7.2 PROD-263이 `followProfile.result` union, pending cancel과 relation/request/count cache 전이를 구현한다.
- [x] 7.3 PROD-263이 local/remote 3상태 component behavior와 Web E2E를 검증한다.

## 8. PROD-282 SUSPENDED 관계 보존 회귀 검증

**Deliverable**

SUSPENDED remote profile의 기존 관계와 count가 GraphQL action 실패에서 보존된다.

**Guardrails**

- handler, mutation service, nullable payload와 local-only 삭제를 새로 구현하지 않는다.

**Verification**

- existing/no-relation SUSPENDED unfollow의 NotFound와 relation/count 불변을 검증한다.

- [x] 8.1 PROD-282가 existing/no-relation SUSPENDED unfollow의 NotFound와 relation/count 불변을 GraphQL에서 검증한다.

## 9. PROD-380 Inbound Follow/Undo Notification Integration

**Deliverable**

Verified inbound Follow/Undo가 공통 core Follow lifecycle을 통해 Local Recipient의 established Follow Notification을 생성·정리한다.

**Guardrails**

- PROD-244의 outbound pending/cancel 또는 Accept/Reject protocol 동작을 재구현하지 않는다.
- 새 ActivityPub protocol 동작, actor materialization, transport나 correlation 저장을 추가하지 않는다.
- Fedify adapter에 relation mutation이나 Notification 호출을 중복 구현하지 않는다.
- caller-supplied direction을 public core 입력에 추가하지 않고 저장된 Profile origin pair에서 flow를 파생한다.
- pending request, duplicate/no-op에는 established Follow Notification side effect를 만들지 않는다.
- GraphQL/DB schema와 ActivityPub object 지원 범위를 변경하지 않는다.

**Verification**

- production Fedify listener → concrete handler → core action → relation/request/count → Notification 흐름을 검증한다.
- Local→Local, Local→ActivityPub, ActivityPub→Local과 거부되는 ActivityPub→ActivityPub origin pair matrix를 검증한다.
- Notification create/delete 실패가 committed relation/request/count를 rollback하지 않는지 검증한다.

- [x] 9.1 PROD-380이 verified inbound Follow/Undo를 origin-pair 기반 공통 core lifecycle과 Follow Notification source integration에 연결하고 scoped production-wiring integration test를 통과시킨다.

## 10. PROD-361 최종 통합 검증과 OpenSpec Archive

**Deliverable**

Remote follow 전체 흐름이 최종 계약과 일치하고 shared change가 active specs에 동기화·archive된다.

**Guardrails**

- 모든 구현 자식이 main에 병합되기 전에는 시작하거나 archive하지 않는다.
- 자식 이슈의 runtime 구현을 이 task에 흡수하지 않는다.
- 부모 PROD-235는 자체 PR 없이 이 task의 완료 근거로 전체 계약의 완료만 판단한다.

**Verification**

- 모든 child PR, requirement scenario, schema/type generation과 전체 strict validation을 확인한다.
- archive 이후 active specs와 현재 main이 일치하는지 검증한다.

- [ ] 10.1 PROD-361이 Follow/Undo/Accept/Reject, graph와 Web action 및 PROD-380 Notification integration evidence를 통합 검증한다.
- [ ] 10.2 PROD-361이 전체 task 완료 후 delta specs를 동기화하고 change를 archive한 뒤 `openspec validate --all --strict`를 통과한다.
