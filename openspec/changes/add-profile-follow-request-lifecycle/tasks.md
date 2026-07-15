## 1. PROD-272 Pending-only core lifecycle

**Deliverable**

Local follow policy가 `OPEN`이면 성립된 관계를, `APPROVAL_REQUIRED`이면 pending request를 멱등하게 만들고, local/remote request가 같은 승인·거절·취소 lifecycle을 사용한다.

**Guardrails**

- request row의 존재 자체가 Pending이며 terminal status/history를 저장하지 않는다.
- request 삭제, relation 생성과 저장 count 갱신은 caller transaction과 하나의 rollback 경계를 공유한다.
- 새 relation이 실제로 생성된 경우에만 count를 증가시키고 pending request는 count를 변경하지 않는다.
- 새 migration, ActivityPub correlation/generation·delivery와 Notification side effect를 추가하지 않는다.

**Verification**

- Local OPEN/APPROVAL_REQUIRED 분기, 중복 create, self-follow, inactive/SUSPENDED participant를 DB-backed service test로 검증한다.
- 승인·거절·취소 권한, 기존 relation 승인, 동시 create/approve와 caller rollback 뒤 request/relation/count를 함께 검증한다.

- [ ] 1.1 Local follow policy, pair 조회와 idempotent relation/request 생성의 실패·성공 테스트를 추가한다.
- [ ] 1.2 Local/Remote request가 공유하는 승인·거절·취소 lifecycle과 caller transaction 참여 동작을 구현한다.
- [ ] 1.3 participant 역할·상태 검증과 완료된 request 재처리의 오류 동작을 테스트하고 구현한다.
- [ ] 1.4 동시 create/approve, 기존 relation, Profile disable 경쟁과 caller rollback에서 relation/request/count 불변 조건을 검증한다.
- [ ] 1.5 Core service test와 관련 타입·포맷 check를 통과시킨다.

## 2. PROD-272 GraphQL request API

**Deliverable**

Participant가 pending request를 Relay Node와 자기 Profile 소유 connection으로 조회하고, follow 성공 결과를 구분하며 승인·거절·취소 결과로 Relay cache를 갱신할 수 있다.

**Guardrails**

- non-participant와 다른 Profile에는 request 존재를 노출하지 않는다.
- request connection은 시간순 의미나 물리 index shape를 공개 계약으로 고정하지 않고 opaque cursor와 결정적인 전체 순서를 사용한다.
- follow success union, mutation 이름과 payload field는 Accepted decisions 계약을 따른다.
- 삭제된 request Node를 payload로 반환하지 않고 opaque global ID와 영향받은 Profile을 반환한다.
- 기존 established follow graph와 `viewerState.follow`는 pending request를 관계로 노출하지 않는다.

**Verification**

- Schema test로 Node, union, Profile fields와 mutation payload shape를 고정한다.
- Integration test로 participant/non-participant access, 다른 Profile의 nullable connection, unavailable participant, pagination, mutation 권한과 삭제 ID를 검증한다.

- [ ] 2.1 `ProfileFollowRequest` Relay Node, participant loader/access와 follower/followee field의 schema·권한 테스트를 추가하고 구현한다.
- [ ] 2.2 자기 active Profile의 incoming/outgoing request connection과 중복·누락 없는 forward/backward pagination 테스트를 추가하고 구현한다.
- [ ] 2.3 `followProfile` 성공 union과 follower/followee Profile payload의 OPEN/request/idempotent 결과를 테스트하고 구현한다.
- [ ] 2.4 승인·거절·취소 mutation의 역할 검증, 삭제 request ID, relation/count 결과와 not-found 재처리를 테스트하고 구현한다.
- [ ] 2.5 API unit/schema/integration test와 관련 타입·포맷 check를 통과시킨다.

## 3. PROD-272 FollowButton union compatibility

**Deliverable**

현재 앱이 새 follow success union을 안전하게 소비하면서 기존 `OPEN` follow/unfollow Relay cache와 count 동작을 유지한다.

**Guardrails**

- requested 버튼 상태, 취소 action과 incoming 관리 화면을 추가하지 않는다.
- `ProfileFollow` 결과에서만 기존 relation connection과 count updater를 적용한다.
- `ProfileFollowRequest` 결과를 오류나 established relation으로 처리하지 않는다.
- Relay document는 소비 컴포넌트에 colocate하고 generated artifact를 commit하지 않는다.

**Verification**

- Relay compiler와 TypeScript check를 통과시킨다.
- Storybook/fixture에서 OPEN follow/unfollow와 request union 결과가 runtime 오류 없이 처리되는지 검증한다.

- [ ] 3.1 FollowButton operation과 updater가 승인된 union/payload 계약을 사용하도록 실패하는 Relay·타입 검증을 먼저 확인한다.
- [ ] 3.2 `__typename`과 inline fragment로 established relation과 pending request 결과를 분리해 처리한다.
- [ ] 3.3 OPEN follow/unfollow와 pending request 결과의 Storybook Relay fixture를 갱신한다.
- [ ] 3.4 Relay compiler, 앱 unit/type check와 Storybook 검증을 통과시키고 generated artifact가 diff에 포함되지 않았는지 확인한다.

## 4. PROD-272 Integrated verification and archive

**Deliverable**

승인된 OpenSpec 계약과 Core·GraphQL·앱 구현이 일치하고, 범위 밖 변경 없이 통합 검증된 상태로 change를 archive할 수 있다.

**Guardrails**

- OpenSpec PR에서 승인된 durable decision을 구현 PR에서 변경하지 않는다.
- Notification, Fedify handler/delivery, correlation/generation, 새 migration과 request 관리 UI를 포함하지 않는다.
- OpenSpec archive는 구현과 검증이 모두 완료된 뒤 수행한다.
- 이 change는 `add-activitypub-remote-follow`의 구현 자식 및 최종 archive보다 먼저 archive하며, remote follow 시나리오를 이 구현 범위에 흡수하지 않는다.

**Verification**

- OpenSpec strict validation, Core service, API unit/integration, Relay/app/Storybook, workspace lint/format을 통과시킨다.
- spec requirement와 task가 구현·테스트에 대응하는지 확인하고 archive 후 validation을 다시 실행한다.
- sibling remote-follow change의 PROD-272 선행 gate와 PROD-361 누적 delta 동기화 책임이 이 change의 archive 순서와 일치하는지 확인한다.

- [ ] 4.1 Core, API, app의 관련 전체 검증과 workspace lint/format을 실행하고 실패를 수정한다.
- [ ] 4.2 PROD-243·PROD-321 경계, migration 부재, GraphQL breaking rollout, PROD-272 선행 archive와 PROD-361 최종 누적 동기화를 독립 리뷰한다.
- [ ] 4.3 모든 requirement scenario와 task의 구현·검증 근거를 확인하고 task checkbox를 실제 상태와 일치시킨다.
- [ ] 4.4 구현 완료 뒤 remote-follow 구현·최종 archive보다 먼저 이 change를 archive하고, active profile spec의 local request/union 계약과 archive 후 OpenSpec strict validation을 확인한다.
