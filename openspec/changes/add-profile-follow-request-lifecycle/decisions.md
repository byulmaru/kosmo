## Context

이 결정 기록은 PROD-272, PROD-323에서 확정한 pending-only 계약, `add-profile-follow-request-lifecycle` proposal과 data-model/profile/api-platform delta spec 및 design을 반영한다. Local request 생성과 local/remote 공통 lifecycle, GraphQL/Relay 공개 계약, PROD-243·PROD-321과의 경계를 구현 전에 고정하는 것이 목적이다.

## Decision Records

### Local과 Remote request는 하나의 pending-only core lifecycle을 사용한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: Local approval request와 inbound remote Follow request가 같은 `profile_follow_request` 테이블을 사용하지만 생성 이후 조회·승인·거절·취소 책임이 없으면 transport별로 lifecycle과 권한 정책이 중복될 수 있다.
- Decision Outcome: request row의 존재 자체를 Pending으로 해석하고 pair 조회, 승인, 거절과 취소를 local/remote 공통 core lifecycle로 제공한다. 승인하면 request를 삭제하고 relation을 생성하며, 거절·취소하면 request를 삭제한다. terminal status, 처리 시각과 처리 이력은 저장하지 않는다.
- Alternatives Considered: Local/Remote service를 분리하면 같은 저장 불변 조건과 권한 검증이 중복된다. terminal status를 추가하면 PROD-323의 canonical 계약과 충돌한다.
- Consequences: ActivityPub handler는 검증된 participant pair를 공통 lifecycle에 전달할 수 있지만 correlation/generation과 delivery는 계속 별도 port가 소유한다.
- Confirmation / Follow-up: Core DB-backed test에서 local/remote participant 조합의 동일 전이와 terminal column/migration 부재를 확인한다.

### Request·relation·count 전이는 caller transaction과 하나의 rollback 경계를 공유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 승인 중 request 삭제와 relation/count 갱신이 분리되거나 기존 follow service가 독립 transaction을 열면 부분 성공과 caller rollback 누락이 생길 수 있다.
- Decision Outcome: core action은 optional caller transaction을 받아 선택된 connection에서 모든 write를 수행한다. 새 relation이 실제로 생성된 경우에만 count를 증가시키고, 기존 relation이면 request만 삭제한다. caller rollback은 request/relation/count 변경을 모두 되돌린다.
- Alternatives Considered: 단계별 독립 transaction과 사후 보상은 실패 창과 복구 복잡도를 만든다. 사전 존재 조회만으로 count를 결정하면 동시 insert를 안전하게 처리하지 못한다.
- Consequences: service 경계가 caller transaction 참여를 지원해야 하고 concurrency/savepoint/rollback DB test가 필수다.
- Confirmation / Follow-up: 중복 create, 동시 approve, 기존 relation 승인과 caller rollback에서 relation 수와 저장 count를 함께 검증한다.

### Participant 가용성은 승인에서만 요구한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 승인은 새 관계를 생성하므로 두 participant의 가용성과 차단 상태가 필요하지만, 거절·취소까지 같은 검사를 적용하면 unavailable 상대가 포함된 pending row를 정리할 수 없다.
- Decision Outcome: approve는 두 participant가 active/normal이고 remote instance가 `SUSPENDED`가 아니어야 한다. reject는 active followee와 request 존재만, cancel은 active follower와 request 존재만 요구하며 다른 participant의 가용성을 요구하지 않는다.
- Alternatives Considered: 모든 transition에 participant 가용성을 요구하면 pair unique stale row가 남는다. unavailable request를 자동 삭제하면 actor의 명시적 거절·취소 권한과 transaction 경계를 우회한다.
- Consequences: 승인 불가 request도 올바른 active participant가 명시적으로 제거할 수 있으며 relation과 count는 변경되지 않는다.
- Confirmation / Follow-up: inactive follower reject, inactive followee cancel과 `SUSPENDED` remote counterpart cleanup을 DB-backed test로 검증한다.

### Request 조회는 participant와 Profile 소유 경계로 제한한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: pending request는 공개 follow graph가 아니며 Node ID나 다른 Profile의 connection을 통해 존재가 노출되면 관계 의도와 계정 활동이 유출된다.
- Decision Outcome: `ProfileFollowRequest` Node는 현재 active Profile이 follower 또는 followee일 때만 반환한다. incoming/outgoing connection은 현재 active Profile과 동일한 Profile field에서만 반환하고 다른 Profile에서는 `null`을 반환한다. 다른 participant가 비활성이거나 remote instance가 `SUSPENDED`여도 request는 active participant에게 보이며 unavailable Profile 필드만 Profile visibility 계약에 따라 `null`일 수 있다.
- Alternatives Considered: 인증 사용자 전체에 공개하거나 root Query로 제공하면 object 소유권과 Relay actor cache 경계가 흐려진다. unavailable participant가 있다는 이유로 request 전체를 숨기면 active counterpart가 거절·취소할 cleanup 경로가 사라진다. field resolver에서만 권한을 확인하면 Node loader와 connection을 통한 우회가 남는다.
- Consequences: Node access와 connection은 participant predicate를 공유하고, participant Profile field는 각 Profile visibility를 별도로 적용해야 한다.
- Confirmation / Follow-up: non-participant global ID와 다른 Profile connection은 존재를 노출하지 않고, unavailable counterpart가 있는 request는 active participant에게 보이되 해당 Profile field만 숨겨지는지 API integration test로 확인한다.

### Follow 성공 결과는 명시적인 GraphQL union과 result 필드를 사용한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: `followProfile`은 앞으로 성립된 `ProfileFollow` 또는 pending `ProfileFollowRequest`를 반환할 수 있어 기존 `FollowProfilePayload.profileFollow: ProfileFollow!` 계약으로 두 결과를 표현할 수 없다.
- Decision Outcome: `ProfileFollowResult = ProfileFollow | ProfileFollowRequest` union을 추가하고 `FollowProfilePayload.result`에서 non-null로 반환한다. 기존 `profileFollow` 필드는 교체하며 현재 앱 operation과 API schema를 같은 구현 PR에서 전환한다.
- Alternatives Considered: `profileFollow` 필드의 타입만 union으로 바꾸면 이름이 request 결과를 오해하게 하고 기존 selection도 그대로 호환되지 않는다. `profileFollow`과 `profileFollowRequest` nullable 필드를 함께 두면 불가능한 조합과 클라이언트 분기가 늘어난다. compatibility alias를 유지해도 approval-required 결과에서 기존 non-null 계약을 만족시킬 수 없다.
- Consequences: dev 서버만 운용하므로 구버전 native client compatibility transition 없이 API와 현재 앱을 같은 구현 PR에서 함께 전환한다.
- Confirmation / Follow-up: Relay compiler와 기존 OPEN FollowButton 동작을 검증하고 API schema와 앱 operation이 같은 배포 단위에 포함됐는지 확인한다.

### Request 처리 mutation은 transition별 최소 cache payload를 반환한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 승인·거절·취소 뒤 request row가 삭제되므로 Node를 성공 payload로 반환하면 loader/auth가 실패하고 Relay cache에서 제거할 정확한 ID가 필요하다.
- Decision Outcome: 공개 mutation 이름은 `approveProfileFollowRequest`, `rejectProfileFollowRequest`, `cancelProfileFollowRequest`로 한다. 승인은 `ProfileFollow`, 삭제된 request global ID와 follower/followee Profile을 반환한다. 거절·취소는 relation/count를 변경하지 않으므로 삭제된 request global ID만 반환한다. 삭제된 request Node는 반환하지 않는다.
- Alternatives Considered: boolean success는 cache에서 정확한 request를 제거할 수 없다. 삭제된 Node 반환은 존재하지 않는 row를 다시 load해야 한다. 거절·취소에서 Profile을 필수 반환하면 unavailable counterpart cleanup을 payload 가용성에 결합한다. 하나의 범용 transition mutation은 actor 역할과 허용 transition을 input 값에 숨긴다.
- Consequences: mutation별 payload와 권한 테스트가 추가되며 앱은 삭제 ID로 request Node/connection을 제거할 수 있다. Profile과 count 갱신은 승인 payload에만 필요하다.
- Confirmation / Follow-up: 공개 이름과 payload field를 schema snapshot과 integration test로 고정한다.

### Request connection은 시간순을 공개 계약으로 고정하지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PROD-272는 participant가 자기 incoming/outgoing pending request를 Relay connection으로 조회할 수 있어야 하지만 오래된 요청 우선 또는 최신 요청 우선이라는 제품 의미는 정하지 않았다. 특정 column tuple을 공개 계약으로 고정하면 근거 없는 정렬 의미와 index migration을 함께 끌어들일 수 있다.
- Decision Outcome: connection은 opaque cursor와 결정적인 전체 순서를 사용해 변경되지 않은 결과 집합을 페이지 이동할 때 중복·누락 없이 반환한다. 시간순 필드, 오름차순·내림차순과 물리 index shape는 공개 계약으로 고정하지 않고 기존 API connection 관례를 따른다.
- Alternatives Considered: `(createdAt, id)` 오름차순은 요청 대기열 의미를 임의로 추가한다. 내림차순은 활동 목록 의미를 임의로 추가한다. 어느 쪽도 현재 Linear 요구사항이나 제품 UI에서 요구되지 않는다.
- Consequences: 이번 change는 기존 `profile_follow_request` schema와 index를 사용하며 새 migration을 추가하지 않는다. 향후 제품이 시간순 의미를 요구하거나 query-plan 근거로 성능 index가 필요해지면 별도 범위 승인 후 계약과 migration을 추가한다.
- Confirmation / Follow-up: API integration test에서 동일한 변경 없는 결과 집합의 forward/backward pagination이 모든 visible request를 정확히 한 번 반환하는지 검증한다.

### PROD-243과 Notification은 lifecycle 밖의 별도 책임으로 유지한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 공통 request lifecycle을 구현하면서 ActivityPub correlation/delivery나 Notification source까지 포함하면 병렬 이슈 경계와 독립 리뷰가 무너진다.
- Decision Outcome: PROD-272는 local 생성과 이미 저장된 local/remote request의 공통 lifecycle만 소유한다. PROD-243은 inbox 검증·materialization·correlation/generation·exact-row 조건부 삭제를, PROD-321은 Follow Request Notification을 소유한다.
- Alternatives Considered: 하나의 구현에서 federation과 notification을 함께 제공하면 범위가 커지고 transport·policy·UI 검증을 독립적으로 배포할 수 없다.
- Consequences: core action은 ActivityPub 타입이나 Notification side effect에 의존하지 않고 검증된 profile ID와 transaction 경계만 소비한다.
- Confirmation / Follow-up: 구현 diff와 tests에 Fedify handler, correlation schema, Notification 변경이 포함되지 않는지 검토한다.

### 겹치는 Follow profile mutation은 PROD-272를 먼저 archive한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: `add-profile-follow-request-lifecycle`과 active `add-activitypub-remote-follow`은 같은 `Follow profile mutation` requirement를 서로 다른 단계의 계약으로 수정한다. archive 순서와 최종 누적 동기화가 없으면 나중에 archive한 delta가 local request/union 또는 remote follow 계약을 덮어쓸 수 있다.
- Decision Outcome: PROD-272의 spec-only PR, 구현과 `add-profile-follow-request-lifecycle` archive를 remote follow 구현 자식 및 `add-activitypub-remote-follow` 최종 archive보다 먼저 완료한다. PROD-361은 remote-follow 최종 archive 전에 해당 profile delta를 당시 active spec에 rebase해 PROD-272의 `FollowProfileResult`, local `APPROVAL_REQUIRED` request와 payload 계약을 보존하면서 remote `OPEN` follow 계약을 누적한다.
- Alternatives Considered: 이 change에 remote follow 시나리오를 복사하면 PROD-272가 구현하지 않는 ActivityPub delivery를 자기 완료 계약으로 소유하게 된다. 순서를 암묵적으로만 두면 독립 archive가 마지막 delta로 requirement를 덮어쓸 수 있다.
- Consequences: PROD-272가 archive될 때까지 remote target follow는 현재처럼 지원되지 않으며, remote follow 구현은 archive된 pending-only boundary를 소비한다. 최종 remote contract 병합과 archive 책임은 계속 PROD-361에 있다.
- Confirmation / Follow-up: 이 change archive 후 active profile spec의 local request/union을 검증하고, PROD-361 archive 전에는 그 계약과 remote follow 시나리오가 같은 최종 requirement에 함께 존재하는지 검증한다.

### 이번 앱 변경은 union 호환에 한정한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 새 request 결과를 앱이 처리해야 하지만 requested 상태·취소와 incoming 관리 UI는 별도 제품 흐름과 Notification 계약이 필요하다.
- Decision Outcome: FollowButton은 union을 안전하게 소비하고 `ProfileFollow` 결과의 기존 Relay cache/count 갱신을 유지한다. `ProfileFollowRequest` 결과는 runtime/type 오류 없이 성공으로 처리하되 새 버튼 상태, 취소 action과 관리 화면은 제공하지 않는다.
- Alternatives Considered: pending UI를 함께 구현하면 조회·취소·탐색 UX와 copy 결정을 이 spec에 추가해야 한다. request 결과를 오류로 처리하면 API의 성공 계약과 충돌한다.
- Consequences: 사용자는 새 request가 생성돼도 현재 버튼에서 지속 상태를 확인하지 못하며 후속 UI 이슈가 필요하다.
- Confirmation / Follow-up: Relay compiler, OPEN follow/unfollow Storybook과 request union fixture를 검증한다.

## Remaining Decisions

없음.

## Superseded Decisions

- 2026-07-06 `split-profile-follow-requests`의 “승인 필요 프로필 follow는 request flow 제공 전까지 conflict로 거부한다” 결정은 이 change가 request flow를 제공하는 시점부터 `APPROVAL_REQUIRED` 대상에 pending `ProfileFollowRequest`를 생성하거나 기존 request를 반환하는 계약으로 대체한다.
