## 1. PROD-240/241/248/281/323 완료된 Foundation

**Deliverable**

Remote follow 구현이 재사용할 저장 count, core action, actor materialization과 Fedify transport/inbox 기반이 main에 있다.

**Guardrails**

- 완료된 이슈에 correlation/generation이나 handler 구현을 소급 귀속하지 않는다.

**Verification**

- 병합된 schema/service/route와 각 이슈의 완료 상태를 확인한다.

- [x] 1.1 PROD-240이 저장 followers/following count와 relation/count transaction을 제공한다.
- [x] 1.2 PROD-281이 follow/unfollow visibility와 저장 변경을 core service 책임으로 정렬한다.
- [x] 1.3 PROD-248이 canonical remote actor materialization 경계를 제공한다.
- [x] 1.4 PROD-241이 Fedify send helper와 actor-scoped/shared inbox route를 제공한다.
- [x] 1.5 PROD-323이 Follow Request를 pending-only 계약으로 정렬한다.

## 2. PROD-272 Pending-only Follow Request

**Deliverable**

Local/remote 공통 request 생성·조회·승인·거절·취소 domain boundary를 제공한다.

**Guardrails**

- request row 존재 자체만 Pending을 뜻하며 terminal state/history를 저장하지 않는다.
- ActivityPub parsing과 inbound generation 정책은 PROD-243이 소유한다.

**Verification**

- local/remote create와 approve/reject/cancel이 같은 invariant와 transaction을 사용한다.

- [ ] 2.1 PROD-272 OpenSpec과 구현 PR을 현재 main/pending-only canonical 계약에서 다시 작성한다.
- [ ] 2.2 검증된 remote request input이 correlation metadata와 함께 공통 create boundary로 전달될 수 있게 한다.
- [ ] 2.3 approve/reject/cancel의 원자 전이와 권한·중복 요청을 검증한다.

## 3. PROD-242 Remote Follow/Unfollow Mutation

**Deliverable**

저장된 active remote OPEN profile에 대한 follow/unfollow mutation과 outbound Follow/Undo를 제공한다.

**Guardrails**

- network lookup 없이 DB identity를 사용한다.
- UNRESPONSIVE는 local projection을 허용하고 delivery만 억제한다.
- SUSPENDED는 NotFound로 숨기고 기존 relation/count를 보존한다.

**Verification**

- idempotency, delivery 실패, UNRESPONSIVE와 SUSPENDED 차이를 검증한다.

- [ ] 3.1 PROD-242가 remote follow/unfollow와 PROD-241 transport 연결을 구현한다.
- [ ] 3.2 Follow URI/actor/object/generation/ordering key를 accepted decision대로 파생한다.
- [ ] 3.3 relation/count commit 이후 delivery 실패가 projection을 rollback하지 않는지 검증한다.

## 4. PROD-243 Inbound Follow/Undo

**Deliverable**

Verified inbound Follow/Undo를 established relation 또는 PROD-272 pending request boundary에 연결한다.

**Guardrails**

- local recipient를 먼저 검증한 뒤에만 unknown actor materialization을 허용한다.
- first-wins identity/response metadata와 monotonic generation을 보존한다.
- unknown 또는 IRI-only Undo는 network lookup 없이 무시한다.

**Verification**

- duplicate Follow, delayed Undo, actor/object/recipient mismatch와 instance state race를 검증한다.

- [ ] 4.1 inbound Follow correlation metadata와 generation 저장 경계를 relation/request에 추가한다.
- [ ] 4.2 OPEN Follow의 relation/count transaction과 현재 수신 Follow object에 대한 Accept를 구현한다.
- [ ] 4.3 APPROVAL_REQUIRED Follow를 PROD-272 request boundary로 전달한다.
- [ ] 4.4 exact-row·expected-generation relation/request 삭제 primitive를 제공하고 relation이 삭제된 경우에만 count를 감소시킨다.
- [ ] 4.5 기존 Fedify inbox listener에 Follow/Undo handler를 등록한다.
- [ ] 4.6 `Follow(t1) → duplicate Follow(t3) → delayed Undo(t2)`, unknown/IRI-only Undo zero-network/write, SUSPENDED 무효와 UNRESPONSIVE CAS를 검증한다.

## 5. PROD-244 Inbound Accept/Reject

**Deliverable**

PROD-242 outbound Follow projection에 대한 verified Accept/Reject를 처리한다.

**Guardrails**

- typed embedded Follow는 ID lookup 전에 actor/object를 검증한다.
- Reject는 PROD-243 conditional-delete primitive를 재사용한다.
- rejected state나 activity history를 새로 저장하지 않는다.

**Verification**

- kosmo/non-kosmo/missing ID, malformed URI, stale Reject와 refollow race를 검증한다.

- [ ] 5.1 Accept를 optimistic established relation에 idempotent하게 연결한다.
- [ ] 5.2 Reject를 exact row와 expected generation 조건으로 삭제한다.
- [ ] 5.3 actor/object/recipient mismatch와 SUSPENDED/UNRESPONSIVE 상태를 검증한다.

## 6. PROD-245/263 Graph와 Web Action

**Deliverable**

DB-known local/remote follow graph를 읽고 remote profile에서 follow action을 사용할 수 있다.

**Guardrails**

- remote collection을 fetch/mirror하지 않는다.
- pending request는 established graph/viewer follow로 노출하지 않는다.
- Web은 PROD-242 mutation과 normalized cache 응답을 재사용한다.

**Verification**

- DB-only GraphQL read와 remote OPEN/APPROVAL_REQUIRED/established Web behavior를 검증한다.

- [ ] 6.1 PROD-245가 connection, stored count, viewerFollow/viewerState read 계약을 검증한다.
- [ ] 6.2 PROD-263이 remote follow action과 양쪽 count/viewer state cache 갱신을 구현한다.

## 7. PROD-282와 PROD-235 통합 Gate

**Deliverable**

SUSPENDED 관계 보존 회귀와 remote follow 전체 흐름이 최종 계약과 일치한다.

**Guardrails**

- 개별 PR 완료만으로 shared change를 archive하지 않는다.

**Verification**

- 모든 child PR, requirement scenario, schema/type generation과 전체 strict validation을 확인한다.

- [ ] 7.1 PROD-282가 existing/no-relation SUSPENDED unfollow의 NotFound와 relation/count 불변을 GraphQL에서 검증한다.
- [ ] 7.2 PROD-235가 Follow/Undo/Accept/Reject, graph와 Web action 통합 검증을 수행한다.
- [ ] 7.3 전체 task 완료 후 delta spec을 동기화하고 `openspec validate --all --strict`를 통과한 뒤 change를 archive한다.
