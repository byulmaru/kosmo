## Context

현재 main에는 pending-only `profile_follow_request` 테이블과 pair unique/FK/index, 성립된 `ProfileFollow` 관계와 저장 count를 갱신하는 core service, `ProfileFollow` GraphQL Node와 follow/unfollow mutation이 있다. `followProfile`은 `LOCAL` `OPEN` 대상만 처리하고 `APPROVAL_REQUIRED` 대상은 conflict로 거부하며, request를 조회·승인·거절·취소하는 service와 GraphQL API는 없다.

PROD-323은 request row의 존재 자체가 Pending이며 승인 시 삭제+relation 생성, 거절·취소 시 삭제하고 terminal state/history를 저장하지 않는 계약을 확정했다. PROD-272는 local 생성과 local/remote 공통 lifecycle을 소유하고, PROD-243은 ActivityPub actor/object/recipient 검증, materialization, correlation/generation과 exact-row 조건부 삭제를 소유한다. Notification과 request 관리 UI는 후속 작업이다.

## Goals / Non-Goals

**Goals:**

- Local follow policy를 우회하지 않고 OPEN relation 또는 APPROVAL_REQUIRED request를 멱등 생성한다.
- Local/Remote request가 재사용하는 pair 조회와 승인·거절·취소 transaction 경계를 제공한다.
- request/relation/count 전이를 원자적으로 처리하고 caller transaction rollback에 참여한다.
- participant에게만 보이는 Relay Node, Profile 소유 connection과 처리 mutation을 제공한다.
- FollowButton의 기존 OPEN Relay cache/count 갱신을 유지하면서 새 success union을 안전하게 처리한다.

**Non-Goals:**

- 새 DB migration, terminal request history와 별도 status를 추가하지 않는다.
- requested 버튼 상태, 취소 UX와 incoming 관리 화면을 구현하지 않는다.
- Notification Item 또는 Follow/Follow Request Notification을 생성·삭제·표시하지 않는다.
- Fedify inbox parsing, Accept/Reject delivery, remote target follow/unfollow를 구현하지 않는다.
- PROD-243의 inbound correlation/generation과 exact-row·expected-generation 삭제 primitive를 구현하지 않는다.

## Implementation Guidance

### Current Constraints

- `profile_follow_request`는 pair unique, immutable `createdAt`과 kosmo UUID 및 participant별 index를 이미 가지므로 이번 lifecycle과 connection을 schema 변경 없이 제공한다.
- 기존 `profile-follow` service는 자체 transaction에서 relation 생성·삭제와 count를 처리하지만 caller transaction 입력을 받지 않는다. request 승인에서 이 service를 그대로 중첩 호출하면 request 삭제와 relation/count가 하나의 rollback 경계를 공유한다는 보장이 흐려진다.
- production database implementation은 하나이며 core service는 `getDatabaseConnection(tx)`로 shared DB 또는 caller transaction을 선택한다. 여러 write를 수행하는 action은 선택된 connection의 transaction에 참여해야 한다.
- 관계와 request 모두 pair unique이므로 사전 조회만으로 동시 실행을 직렬화할 수 없다. unique violation과 실제 insert/delete 결과를 기준으로 count를 한 번만 갱신해야 한다.
- request 승인 뒤 row가 삭제되므로 성공 payload에서 request Node를 다시 load할 수 없다. 클라이언트 cache 제거에는 삭제 전에 확보한 opaque global ID가 필요하다.
- connection에는 시간순 제품 의미가 요구되지 않는다. 구현은 저장소의 기존 Relay connection 관례를 따르되 opaque cursor와 결정적인 전체 순서로 변경되지 않은 결과 집합의 중복·누락을 방지해야 한다.
- GraphQL resolver는 profile 기능 모듈 아래의 ref, access, loader, field, mutation 책임 분리를 따르며 object 소유 관계에 맞는 Profile field를 우선한다.
- Relay document는 실제 `FollowButton.tsx`에 colocate한다. generated artifact는 검증 과정에서 생성하되 저장소 정책에 따라 commit하지 않는다.

### Recommended Approach

1. Established relation 생성·count 갱신의 현재 동작을 유지하면서 request service가 같은 connection/transaction 안에서 호출할 수 있는 core 경계로 정리한다. caller transaction이 있으면 그 경계 안에 합류하고, 없으면 shared DB에서 transaction을 시작한다.
2. request service는 pair lookup, local policy 기반 생성, approve, reject, cancel action을 소유한다. 각 action은 participant profile/instance 상태와 actor 역할을 write 직전에 검증한다.
3. local follow action은 established relation을 먼저 확인하고, 없으면 pending request를 확인한 뒤 target policy에 따라 relation 또는 request를 생성한다. concurrency는 pair unique와 insert 결과로 수렴시키고 기존 row를 반환한다.
4. approve action은 request와 participant를 조회·검증한 뒤 relation 생성 또는 기존 relation 확인, request 삭제와 새 relation의 count 증가를 하나의 transaction에서 처리한다. relation이 이미 있으면 request만 삭제하고 count를 증가시키지 않는다.
5. reject/cancel action은 각각 followee/follower 권한을 검증한 뒤 request를 삭제하며 count를 변경하지 않는다. 이미 삭제된 request ID는 not found로 처리한다.
6. GraphQL은 `ProfileFollowRequest` loadable Node와 participant access를 추가하고, 현재 active Profile과 동일한 Profile에서만 incoming/outgoing connection을 반환한다. connection은 기존 API의 Relay pagination 관례를 재사용하고 시간순 필드나 정렬 방향을 공개 계약으로 고정하지 않는다.
7. `followProfile`은 `FollowProfilePayload.result`의 `ProfileFollowResult` union을 반환한다. approve/reject/cancel mutation은 삭제된 request ID와 영향받은 Profile을 반환하고 삭제된 request Node는 반환하지 않는다.
8. FollowButton은 `__typename`과 inline fragment로 union을 처리한다. `ProfileFollow`일 때만 기존 connection/count updater를 적용하고 `ProfileFollowRequest`는 타입/runtime 오류 없이 성공으로 소비하되 requested UI 상태는 만들지 않는다.
9. Core DB-backed 테스트가 transaction/concurrency/count를, API schema/integration 테스트가 Node/visibility/connection/payload를, app Relay/Storybook 검증이 기존 OPEN 호환을 소유한다.

### Allowed Alternatives

- request action을 별도 service 파일에 두거나 기존 profile-follow service 안의 명확한 하위 책임으로 둘 수 있다. 공개 core 계약과 transaction/동시성 동작이 같고 파일 책임이 과도하게 커지지 않아야 한다.
- GraphQL request field 파일은 profile 모듈의 파일 수에 따라 `field/follow/` 하위 폴더 또는 기존 `field/`에 둘 수 있다. ref/index는 조립과 등록만 소유해야 한다.
- caller transaction 참여는 기존 service 관례에 맞는 savepoint 또는 동등한 Drizzle transaction 합류 방식을 사용할 수 있다. caller rollback이 모든 side effect를 되돌려야 한다.

### Known Traps

- approval-required target에 임시 `ProfileFollow`를 만들면 follow policy와 count를 우회한다.
- request를 삭제한 뒤 request Node를 payload로 반환하면 loader/auth scope가 실패한다.
- participant access를 field resolver에만 적용하고 Node loader/connection에 적용하지 않으면 request 존재가 유출된다.
- cursor가 사용하는 정렬과 before/after 비교 방향이 다르면 페이지 사이에서 request가 중복되거나 누락될 수 있다.
- 사전 존재 확인 뒤 무조건 count를 증가시키면 concurrent insert나 기존 relation 승인에서 count가 중복된다.
- PROD-243의 correlation/generation column을 예상해 request row를 update하거나 ActivityPub delivery port를 임의로 고정하면 병렬 구현 경계를 침범한다.
- Relay union 전환과 API schema를 따로 배포하면 기존 FollowButton operation이 깨질 수 있다.

## Risks / Trade-offs

- [GraphQL success field 교체가 기존 클라이언트에 breaking change다] → dev 서버만 운용하므로 compatibility transition 없이 API와 현재 앱 operation을 같은 구현 PR에서 갱신·검증하고 함께 배포한다.
- [동시 approve/create에서 relation과 count가 어긋날 수 있다] → pair unique, 실제 insert/delete 결과와 DB-backed concurrency test로 한 번만 count를 변경한다.
- [Profile disable 또는 instance suspension과 request 전이가 경쟁할 수 있다] → write transaction 안에서 participant 가용성을 다시 검증하고 경쟁 테스트를 추가한다.
- [active remote-follow change와 같은 저장 경계를 수정한다] → 이 change는 공통 lifecycle만 소유하고 correlation/generation/exact-row 조건부 삭제는 PROD-243에 남긴다.
- [두 active change가 같은 `Follow profile mutation` requirement를 서로 다른 단계의 계약으로 수정한다] → 이 change를 먼저 구현·archive하고, 이후 PROD-361이 remote-follow 최종 delta를 현재 active spec에 rebase해 union/request와 remote follow 계약을 함께 보존한다.
- [rollback 뒤 생성된 pending row가 남을 수 있다] → caller transaction 참여와 rollback 통합 테스트를 완료 조건으로 둔다.
- [requested UI 없이 request가 생성되면 사용자가 현재 상태를 확인하기 어렵다] → 이번 변경은 기존 화면 호환만 제공하며 requested/cancel/incoming UI는 명시적으로 후속 범위로 남긴다.

## Migration Plan

1. `prod-272/openspec`의 spec-only PR을 먼저 strict validation하고 리뷰·병합한다.
2. 병합된 main에서 `prod-272` 구현 브랜치를 만들고 Core, GraphQL, app 변경을 하나의 Draft PR로 제공한다.
3. 기존 테이블과 discriminator를 사용하므로 DB migration은 실행하지 않는다.
4. Core DB-backed 테스트, API schema/integration 테스트, Relay compiler와 Storybook 검증을 통과한 뒤 API와 앱 변경을 함께 배포한다.
5. `add-profile-follow-request-lifecycle`을 `add-activitypub-remote-follow`의 구현 자식 및 최종 archive보다 먼저 archive하고, archive 후 active `profile` spec에 local request와 follow result union 계약이 반영됐는지 검증한다.
6. 이후 PROD-361은 `add-activitypub-remote-follow`의 `Follow profile mutation` delta를 당시 active spec에 rebase해 이 change의 local request/union 계약과 remote `OPEN` follow 계약을 누적한 뒤 최종 archive한다.
7. rollback은 구현 PR을 되돌린다. 이미 생성된 pending request row는 기존 schema에서 안전하게 보존되지만 구버전 API에서 조회·처리되지 않으므로 재배포 전 운영상 pending 상태임을 감수한다.
