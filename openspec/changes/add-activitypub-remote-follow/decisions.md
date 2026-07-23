## Context

이 기록은 [PROD-357](https://linear.app/byulmaru/issue/PROD-357), 부모 PROD-235와 구현 자식 이슈를 source of truth로 사용한다. 2026-06-29에 작성된 초기 active change는 이후 생긴 이슈 구조를 정의하지 않으며, 저장 count, core service, actor materialization, inbox route와 pending-only request 계약이 확정된 뒤의 구현 slice가 공유해야 할 선택을 기록한다.

## Decision Records

### Web follow action은 mutation의 established/pending 결과를 구분한다

- Decision Date: 2026-07-18
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-263](https://linear.app/byulmaru/issue/PROD-263)의 최신 본문에 정의된 NONE/PENDING/ESTABLISHED 상태 머신과 established unfollow의 optimistic cache/connection membership 경계에서 파생한다.
- Status: Active
- Context / Problem: 모든 follow를 임시 established `ProfileFollow`와 count 증가로 표현하면 `APPROVAL_REQUIRED` mutation이 pending `ProfileFollowRequest`를 성공적으로 반환한 뒤 버튼이 `팔로잉`에서 `팔로우`로 되돌아가고 서버의 pending 상태를 표시하거나 취소할 수 없다.
- Decision Outcome: FollowButton은 profile origin을 action surface 조건으로 사용하지 않고 local/remote에 같은 NONE/PENDING/ESTABLISHED 상태 머신을 적용한다. `ProfileViewerState.follow`은 established relation, `followRequest`는 current viewer→target pending request를 나타내며 둘은 상호배타적이다. `followPolicy`는 OPEN/APPROVAL_REQUIRED의 예상 optimistic state를 선택하는 데만 사용할 수 있고 `followProfile.result` union이 최종 권위다. established 결과만 양쪽 count를 변경하며 pending 생성·취소는 count를 유지한다. 완료된 PROD-378에 따라 `viewerState.follow`을 canonical relation field로 사용하고 제거된 `Profile.viewerFollow`를 복원하지 않으며, `Profile.viewerFollowRequest`도 추가하지 않는다. follow와 established unfollow mutation은 relation/request/count만 갱신하고 이미 열린 followers/following connection membership을 append/delete하지 않는다.
- Alternatives Considered: 모든 follow를 established로 optimistic 처리, mutation 완료까지 중립적인 loading 상태 유지, pending UX를 PROD-377에 계속 분리, `Profile.viewerFollowRequest` 대칭 필드 추가, follow 성공 시 열린 connection에 새 edge 삽입, established unfollow에서 connection edge를 optimistic하게 제거, established unfollow 성공 payload에서만 edge 제거.
- Consequences: `요청됨` 클릭은 `cancelProfileFollowRequest`, `팔로잉` 클릭은 `unfollowProfile`을 사용하고 실패하면 Relay optimistic layer가 이전 relation/count/button 상태로 rollback한다. established unfollow 성공 후에도 현재 connection row는 유지되고 그 안의 버튼과 count만 최신 상태를 표현하며, membership은 다음 server-backed connection query에서 정정된다. remote Accept/Reject는 subscription·push·polling 없이 현재 화면을 실시간 전환하지 않으며 다음 server-backed profile read에서 반영된다. relation/request cache는 `viewerState` 한 경로만 갱신한다.
- Confirmation / Follow-up: PROD-263은 exact-pair viewer request API, result union별 count/cache 전이, cancel/unfollow rollback, local/remote 동일 상태 머신과 API·Relay-backed component·Web E2E를 검증한다. PROD-361은 최종 통합과 archive를 소유한다.

### Linear 계약을 PROD-357 OpenSpec으로 먼저 구체화한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 기존 active change가 Linear 이슈 구조보다 먼저 만들어져 여러 구현 PR이 같은 change를 서로 다른 책임으로 해석했다.
- Decision Outcome: PROD-235와 구현 이슈가 source of truth이며, PROD-357의 spec-only PR이 이를 proposal/spec/design/decisions/tasks로 번역하고 남은 구현 자식을 merge 전까지 block한다.
- Alternatives Considered: 기존 OpenSpec을 source of truth로 두고 이슈를 맞추기, 각 구현 PR이 자기 task만 수정.
- Consequences: 구현 PR은 shared 계약을 재정의하지 않으며 PROD-235 전체 범위가 끝날 때까지 change를 archive하지 않는다.
- Confirmation / Follow-up: PROD-357 PR의 strict validation과 Linear dependency를 확인한다.

### Pending-only request lifecycle은 PROD-272가 소유한다

- Decision Date: 2026-07-15
- Status: Superseded
- Context / Problem: PROD-243과 PROD-272가 remote request 생성 책임을 중복 기술했다.
- Decision Outcome: PROD-272가 local/remote 공통 request 생성·조회·승인·거절·취소 domain lifecycle을 소유하고, PROD-243은 ActivityPub 검증과 correlation metadata 전달만 소유한다.
- Alternatives Considered: PROD-243이 remote request service를 별도로 구현, request 전체를 PROD-243에 흡수.
- Consequences: PROD-243은 PROD-272 boundary가 main에 병합될 때까지 blocked이며 request row에 terminal 상태를 저장하지 않는다.
- Confirmation / Follow-up: PROD-272와 PROD-243 통합 테스트에서 같은 pending-only invariant를 검증한다.

### Remote request 생성은 PROD-243이 소유하고 PROD-272와 병렬 구현한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: `profile_follow_request`의 pending-only row와 actor pair uniqueness가 이미 고정되어 있어 PROD-243이 PROD-272의 service 구현을 기다려야 할 데이터 계약 의존성이 없으며, Linear에서도 blocker 관계와 선행 문구를 제거했다.
- Decision Outcome: PROD-243은 ActivityPub 검증 뒤 remote pending request 생성을 소유한다. PROD-272는 local request 생성과 local/remote 공통 조회·승인·거절·취소 lifecycle을 소유하며 두 이슈는 병렬 구현한다. 이 결정은 같은 날짜의 이전 "Pending-only request lifecycle은 PROD-272가 소유한다" 결정을 대체한다.
- Alternatives Considered: PROD-272가 remote request 생성 service까지 먼저 제공, PROD-243이 전체 request lifecycle을 흡수.
- Consequences: PROD-243은 PROD-272를 기다리지 않고 구현할 수 있지만, 두 구현은 동일한 pending-only invariant를 지켜야 하며 최종 통합은 PROD-361이 검증한다.
- Confirmation / Follow-up: PROD-243은 remote request 생성·duplicate·Undo를, PROD-272는 local 생성과 local/remote 공통 처리 transition을 각자 검증한다.

### Inbound correlation과 generation 조건부 삭제는 PROD-243이 소유한다

- Decision Date: 2026-07-15
- Status: Superseded
- Context / Problem: 완료된 PROD-240에는 correlation/generation이 없고 PROD-243/244가 삭제 primitive 소유권을 다르게 기술했다.
- Decision Outcome: PROD-243이 inbound first-wins identity/response metadata, monotonic generation, exact-row·expected-generation relation/request 삭제와 relation count transaction을 제공한다. PROD-244는 이 primitive를 재사용한다.
- Alternatives Considered: PROD-240을 다시 열기, PROD-244가 primitive를 구현, 별도 foundation 이슈 추가.
- Consequences: PROD-244는 PROD-243을 기다리며 별도 삭제 로직을 만들지 않는다.
- Confirmation / Follow-up: delayed Undo와 stale Reject가 새 generation을 삭제하지 않는 concurrency test를 둔다.

### Outbound Follow correlation은 현재 저장 identity에서 파생한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 초기 change는 outbound actor/object/orderingKey를 별도 metadata로 저장하도록 요구했지만 현재 모델의 immutable identity로 같은 값을 결정할 수 있다.
- Decision Outcome: Follow URI는 canonical origin과 `ProfileFollow.id`, actor/object는 저장된 profile actor identity, generation은 `ProfileFollow.createdAt`, ordering key는 actor pair에서 파생한다.
- Alternatives Considered: outbound correlation column 추가, 별도 activity table.
- Consequences: outbound-only metadata를 중복 저장하지 않으며 retry/history가 필요하면 별도 capability에서 다룬다.
- Confirmation / Follow-up: PROD-242/244가 refollow identity와 actor/object 검증을 테스트한다.

### Outbound pending request도 immutable request identity를 사용한다

- Decision Date: 2026-07-18
- Status: Accepted
- Context / Problem: PROD-242의 optimistic established relation과 달리 APPROVAL_REQUIRED remote follow는 Accept 전까지 `ProfileFollowRequest`만 존재하므로 outbound Follow와 cancel Undo identity를 별도 저장할지 결정해야 한다.
- Decision Outcome: outbound pending Follow URI와 generation은 `ProfileFollowRequest.id`와 immutable `createdAt`에서 파생하고 actor/object와 ordering key는 저장 actor pair에서 파생한다. Accept는 exact request 삭제와 relation/count 생성을 원자적으로 수행하며, cancel과 Reject는 조회한 exact request/relation row에만 적용한다.
- Alternatives Considered: 별도 outbound activity table, request에 correlation/status column 추가, actor pair만으로 stable Follow URI 생성.
- Consequences: terminal state와 delivery history를 저장하지 않으며 Accept 후 relation은 새 identity를 갖는다. 늦은 request ID의 Reject/cancel은 새 relation/request를 삭제할 수 없다.
- Confirmation / Follow-up: PROD-244가 duplicate/concurrent Follow·cancel, Accept/Reject/cancel 경쟁과 refollow exact-row 보호를 검증한다.

### Inbound Follow/Undo core·Notification integration은 PROD-380이 소유한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: PROD-244 PR이 outbound APPROVAL_REQUIRED 왕복뿐 아니라 inbound Follow의 core entrypoint 전환과 Undo Notification cleanup까지 포함해, Follow Notification source lifecycle을 소유한 PROD-380과 runtime 및 테스트가 중복됐다.
- Decision Outcome: PROD-244는 local→remote pending request 생성·Follow 발송, pending cancel·Undo 발송, inbound Accept/Reject 검증과 exact-row transition만 소유한다. `handleInboundFollow`의 공통 core action 전환, `followProfile`의 ActivityPub→local 방향, inbound 전용 service 제거와 inbound Follow/Undo Notification 생성·정리는 PROD-380이 PROD-244 병합 후 구현한다.
- Alternatives Considered: PROD-244가 integration을 유지하고 PROD-380을 축소, 두 PR이 같은 runtime을 각각 구현.
- Consequences: PR #285는 기존 inbound Follow/Undo runtime을 회귀 대상으로만 유지한다. 공통 core entrypoint와 Notification source lifecycle의 최종 형태는 PROD-380에서 `add-in-app-notifications` 계약과 함께 검증한다.
- Confirmation / Follow-up: PROD-244는 inbound Follow/Undo 관련 runtime·Notification diff가 없는지 확인하고, PROD-380은 production listener → concrete handler → core lifecycle → DB/Notification integration test를 제공한다.

### Post-commit outbound delivery 실패는 committed mutation 결과와 분리한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: 현재 post-commit delivery 격리 계약은 [PROD-447](https://linear.app/byulmaru/issue/PROD-447)의 최신 본문·관계에서, 이 임시 경계를 대체하는 durable outbox·Fedify Queue 순서는 [PROD-448](https://linear.app/byulmaru/issue/PROD-448)의 최신 본문·관계에서 파생한다.
- Status: Active
- Context / Problem: remote OPEN/APPROVAL_REQUIRED follow, established unfollow와 pending cancel은 relation/request/count transaction을 먼저 commit하지만 이후 Follow/Undo delivery 오류를 throw해 GraphQL 실패와 실제 DB 상태가 어긋난다.
- Decision Outcome: PROD-447은 transaction-before-delivery 순서를 유지한다. Post-commit `sendProfileFollow`/`sendProfileUnfollow` 실패는 관측 가능하게 기록하고 application action 밖으로 전파하지 않으며, `followProfile`, `unfollowProfile`, `cancelProfileFollowRequest`는 transaction에서 확정한 payload를 반환한다.
- Alternatives Considered: delivery를 transaction 안으로 이동해 rollback, GraphQL 실패를 유지하고 Web에서 refetch, durable retry/outbox/history를 함께 도입.
- Consequences: 호출자는 committed relation/request/count와 일치하는 성공 payload를 받는다. delivery 보장은 추가되지 않으며 retry/outbox/history와 Web 오류 후 refetch workaround는 별도 범위다. 이 catch/log 처리는 application action이 Fedify delivery를 직접 호출하는 동안만 유지하는 임시 안전장치다.
- Confirmation / Follow-up: core service, GraphQL integration과 Web E2E에서 delivery 실패에도 성공 payload와 DB projection이 일치하는지 검증한다. PROD-263과 inbound Accept/Reject/Follow/Undo lifecycle은 변경하지 않는다. [PROD-448](https://linear.app/byulmaru/issue/PROD-448)는 domain state와 outbound delivery intent를 같은 PostgreSQL transaction에서 저장한 뒤 relay가 Fedify Queue에 handoff하도록 전환하고, mutation의 직접 delivery 호출과 이 catch/log 경계를 제거한다. PostgreSQL commit 전 NATS/Fedify Queue 직접 enqueue는 rollback된 state의 activity를 처리할 수 있으므로 대안으로 사용하지 않는다.

### Accept/Reject object 지원은 Fedify typed Follow 해석 범위로 제한한다

- Decision Date: 2026-07-18
- Status: Accepted
- Context / Problem: Fedify `getObject()`가 typed Follow를 제공하는 표준 경로 외에 kosmo가 IRI-only `objectId`를 직접 parse하고 저장 projection으로 역조회하는 호환 계층을 유지할지 결정해야 했다.
- Decision Outcome: Accept/Reject는 Fedify `getObject()`가 typed Follow로 제공한 object만 follow response로 처리한다. typed Follow의 actor/object/recipient와 optional id는 기존 계약대로 검증하지만, Fedify가 typed Follow로 제공하지 못한 IRI-only object를 kosmo가 별도 parser나 DB lookup으로 복원하지 않는다.
- Alternatives Considered: canonical kosmo Follow IRI를 직접 parse해 request/relation을 역조회, `/ap/follow/{id}` object dispatcher를 추가해 Fedify dereference 지원.
- Consequences: 별도 IRI-only 호환 코드와 공개 Follow object endpoint를 만들지 않는다. IRI-only Accept/Reject는 instance reachability 신호로 사용할 수 있지만 follow graph/request side effect 없이 무시하며, 실제 상호운용성 필요가 확인되면 별도 호환성 범위로 추가한다.
- Confirmation / Follow-up: Fedify typed embedded/resolved Follow는 처리되고 IRI-only 및 unsupported object는 projection/count를 변경하지 않는지 PROD-244와 PROD-361에서 검증한다.

### Accept/Reject object는 Fedify 기본 cross-origin 검증을 유지한다

- Decision Date: 2026-07-18
- Status: Accepted
- Context / Problem: remote Accept/Reject가 kosmo origin의 outbound Follow를 embedded object로 포함하면 parent activity와 object identity의 origin이 다르다. Fedify `crossOrigin: "trust"`는 이 object를 authoritative origin에서 확인하지 않고 반환하므로 content spoofing 방어를 우회한다.
- Decision Outcome: Accept/Reject handler는 `getObject()`에서 `crossOrigin: "trust"`를 사용하지 않고 Fedify 기본 origin 검증을 유지한다. ID 없는 embedded Follow와 parent activity와 같은 origin의 embedded Follow는 Fedify가 typed object로 제공할 수 있으며, cross-origin embedded 또는 IRI-only Follow는 Fedify document loader가 authoritative object를 조회해 typed Follow로 제공한 경우에만 처리한다.
- Alternatives Considered: 모든 embedded Follow에 `crossOrigin: "trust"` 사용, canonical kosmo Follow URI에만 조건부 trust, `/ap/follow/{id}` object dispatcher 추가.
- Consequences: kosmo outbound Follow ID를 embedded object로 돌려주는 구현도 authoritative document를 조회할 수 없으면 Accept/Reject side effect 없이 무시된다. 이번 capability는 object dispatcher를 추가하지 않으며 실제 상호운용성 요구가 확인되면 별도 보안·호환성 범위에서 다룬다.
- Confirmation / Follow-up: unverified cross-origin embedded Follow가 projection/count를 변경하지 않고, same-origin/id-less embedded 및 document loader가 resolve한 Follow만 기존 검증으로 처리되는지 PROD-244와 PROD-361에서 확인한다.

### Accept/Reject compatibility fallback도 outbound Follow generation을 검증한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-244](https://linear.app/byulmaru/issue/PROD-244)의 최신 Inbound Accept/Reject 계약과 [PROD-361](https://linear.app/byulmaru/issue/PROD-361)의 timestamp 범위 정정에서 파생한다.
- Status: Active
- Context / Problem: actor/object만 일치하는 ID-less 또는 non-kosmo Follow fallback은 이전 request R1을 취소하고 같은 pair의 R2를 만든 뒤 도착한 늦은 R1 Accept/Reject를 현재 R2에 잘못 적용할 수 있다.
- Decision Outcome: canonical kosmo Follow ID가 현재 projection ID와 정확히 일치하면 기존처럼 처리한다. ID-less 또는 non-kosmo Follow fallback은 embedded Follow의 `published`가 존재하고 현재 request/relation의 immutable `createdAt`과 정확히 일치할 때만 같은 outbound generation으로 인정한다. remote Accept/Reject activity의 `published`와 local 수신 시각은 generation 또는 freshness 판정에 사용하지 않는다. Reject는 exact generation 검증 뒤 `expectedRowId`가 여전히 현재 row인 경우에만 제거한다.
- Supersedes: 2026-07-22에 정한 local `receivedAt` freshness gate. application clock과 DB `createdAt` clock을 비교하면 clock skew로 현재 Reject를 무시할 수 있고, exact generation과 `expectedRowId` 재검증이 이미 replacement를 보호하므로 해당 gate는 불필요하다.
- Alternatives Considered: actor/object-only fallback 유지, compatibility fallback 전체 제거, terminal history나 correlation metadata 추가, remote `Reject.published` 사용, application local 수신 시각 비교, DB clock을 별도 조회해 비교하는 방식.
- Consequences: 원본 outbound Follow의 `published`를 보존하지 않는 구현의 ID-less/non-kosmo response는 side effect 없이 무시한다. 새 schema, history, lock 또는 reconciliation 흐름 없이 이전 generation response가 새 projection을 변경하지 못한다.
- Confirmation / Follow-up: PROD-361은 같은-generation fallback Reject가 remote `Reject.published` 및 application/DB clock skew와 무관하게 처리되고, missing/mismatched embedded Follow `published`와 cancel-refollow 뒤 늦은 fallback response는 새 projection을 변경하지 않는지 검증한다.

### Remote Follow ID는 advisory이고 generation은 단조 증가한다

- Decision Date: 2026-07-15
- Status: Superseded
- Context / Problem: remote 서버가 Follow ID를 누락·재사용할 수 있고 늦은 Undo가 새 관계를 삭제할 수 있다.
- Decision Outcome: actor/object/recipient가 canonical correlation 조건이며 ID는 hint로만 사용한다. first-wins metadata는 보존하고 verified duplicate Follow의 generation만 max 갱신한다.
- Alternatives Considered: Follow ID exact match 필수, 모든 activity ID를 durable log에 저장.
- Consequences: published가 없는 activity는 수신 시각 fallback을 사용하며 완전한 네트워크 순서 복원은 보장하지 않는다.
- Confirmation / Follow-up: duplicate Follow와 delayed Undo 순서를 테스트한다.

### Inbound Undo는 generation 없이 actor/object와 exact row로 처리한다

- Decision Date: 2026-07-15
- Status: Superseded
- Context / Problem: remote `published`는 clock skew와 누락 가능성이 있고, 누락 시 사용하는 local 수신 시각은 다른 시간 기준이다. 두 값을 관계 generation으로 혼합해 지연 Undo를 차단하는 것은 durable activity history가 없는 현재 projection에 비해 과도한 방어다.
- Decision Outcome: PROD-243은 inbound Follow activity identity와 actor/object response metadata만 first-wins로 저장하고 generation을 저장하지 않는다. 검증된 embedded Undo(Follow)는 actor/object/recipient가 일치하면 같은 pair의 현재 unfollow 의사로 처리하며, 처리 중 확인한 exact row id가 일치할 때 relation/request를 삭제한다. 이 결정은 "Inbound correlation과 generation 조건부 삭제는 PROD-243이 소유한다"와 "Remote Follow ID는 advisory이고 generation은 단조 증가한다"의 inbound generation 결정을 대체한다.
- Alternatives Considered: remote `published`와 수신 시각으로 monotonic generation 유지, durable activity log로 logical Follow generation 추적.
- Consequences: actor/object가 같은 지연 Undo가 현재 같은-pair 관계를 제거할 수 있으며 이를 remote actor의 현재 unfollow 의사로 받아들인다. exact-row 조건은 삭제 대기 중 새 row로 교체된 refollow를 보호하고, durable 순서 복원이 필요해지면 별도 activity log capability에서 다룬다.
- Confirmation / Follow-up: duplicate Follow/Undo idempotency, exact-row refollow race와 actor/object/recipient mismatch를 테스트한다.

### Inbound Follow correlation은 저장하지 않고 actor pair에서 파생한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: `ProfileFollow`/`ProfileFollowRequest`의 follower/followee FK와 저장된 `ActivityPubActor` identity가 이미 actor/object pair를 표현한다. remote 구현은 Undo(Follow)에서 원본 Follow id를 누락하거나 다른 id로 전달할 수 있어 저장 Follow id exact match를 요구하면 비호환이 커진다.
- Decision Outcome: PROD-243은 inbound Follow id, actor URI와 object URI를 relation/request에 저장하지 않으며 DB migration을 추가하지 않는다. Follow 수신 시 actor/object/recipient를 검증하고 pair projection을 생성·재사용한다. Undo는 embedded Follow의 actor/object/recipient를 검증한 뒤 저장 actor pair의 현재 relation/request를 exact-row 조건으로 삭제하며 Follow id를 저장하거나 비교하지 않는다.
- Alternatives Considered: nullable Follow id만 저장, Follow id/actor/object snapshot 저장, durable activity log에 원문 저장.
- Consequences: 승인 대기 중인 원본 Follow id를 이후 복원할 수 없고 후속 response는 저장 actor pair에서 Follow object를 구성해야 한다. 대신 remote Follow id 보존을 상호운용성 전제로 두지 않고 중복 schema와 migration을 제거한다. durable 원문/history가 필요하면 별도 capability에서 도입한다.
- Confirmation / Follow-up: schema migration이 없고 duplicate Follow/Undo, 다른 Follow id, actor/object/recipient mismatch와 exact-row refollow race가 actor pair 기준으로 동작하는지 검증한다.

### SUSPENDED 관계는 보존한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 초기 change와 PROD-242는 SUSPENDED target의 local unfollow 삭제를 허용했지만 현재 core service와 PROD-282 정책은 NotFound와 관계 보존이다.
- Decision Outcome: SUSPENDED remote profile은 follow/unfollow 조회에서 숨기고 기존 relation/count를 보존한다. inbound activity도 side effect 없이 무시한다.
- Alternatives Considered: local-only 삭제와 nullable payload, suspension 시 relation 삭제.
- Consequences: suspension 해제 뒤 기존 관계를 다시 사용할 수 있으며 PROD-282는 GraphQL 회귀 검증만 소유한다.
- Confirmation / Follow-up: relation 유무 두 경우의 NotFound와 저장 count 불변을 검증한다.

### Verified inbound activity는 object 지원 여부와 무관하게 reachability 신호다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: IRI-only 또는 지원하지 않는 object를 가진 Undo가 follow graph를 변경하지 않을 때, 저장된 `UNRESPONSIVE` actor의 instance 복구까지 금지해야 하는지가 불명확했다.
- Decision Outcome: Fedify가 저장된 actor의 verified inbound activity를 전달한 사실 자체를 remote server reachability 신호로 사용한다. 따라서 object가 IRI-only이거나 follow graph 검증을 통과하지 못해도 `UNRESPONSIVE → ACTIVE` compare-and-set 복구는 허용한다. unknown actor는 materialize하지 않으며, relation/request와 count는 기존 검증을 통과한 경우에만 변경한다.
- Alternatives Considered: embedded Follow의 actor/object/recipient 검증이 모두 통과한 뒤에만 instance 복구, IRI-only Undo의 모든 DB write 금지.
- Consequences: 지원하지 않는 verified activity도 instance를 ACTIVE로 복구할 수 있지만 follow graph/request side effect는 만들지 않는다. `SUSPENDED`는 계속 복구하지 않는다.
- Confirmation / Follow-up: 저장된 UNRESPONSIVE actor의 IRI-only Undo가 network lookup과 graph mutation 없이 instance만 ACTIVE로 복구하는지 검증한다.

### 기존 inbox route에 handler를 직접 등록한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PR #247이 actor-scoped/shared inbox route를 이미 병합했으며 추가 registry는 현재 소비자가 없다.
- Decision Outcome: 공통 actor-scoped/shared inbox route는 activity-neutral transport 경계로 유지하고, 각 activity 구현 slice는 중앙 싱글톤 federation의 기존 inbox listener에 typed handler를 등록한다. Follow change는 Follow/Undo/Accept/Reject 행동만 소유하며 다른 activity를 금지하거나 정의하지 않는다.
- Alternatives Considered: 별도 listener registry export, placeholder handler, slice별 federation instance.
- Consequences: 새로운 HTTP foundation을 만들지 않고 PROD-241 transport를 재사용하며, remote-post change와 동일 discovery requirement를 서로 덮어쓰지 않는다.
- Confirmation / Follow-up: actor-scoped/shared inbox 통합 테스트로 routing과 Follow handler 호출을 검증하고 unsupported activity가 follow side effect를 만들지 않는지 확인한다.

### Inbound Follow/Undo는 공통 core lifecycle의 Notification source integration을 보존한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: PROD-243의 verified handler가 relation/request/count를 변경하지만, Notification 계약이 ActivityPub ingress를 제외해 Local Recipient의 새 established source에 Follow Notification이 누락되고 Undo cleanup도 실행되지 않았다.
- Decision Outcome: concrete Follow/Undo handler는 기존 Activity 검증 뒤 공통 core public action을 호출한다. core action은 relation/request/count transaction commit 이후 `add-in-app-notifications`의 Notification create/delete를 await/catch하며, Fedify adapter는 relation mutation이나 Notification 호출을 중복 구현하지 않는다.
- Alternatives Considered: Fedify handler에서 Notification 직접 호출, 기존 ingress 제외 유지, Notification을 relation transaction에 포함.
- Consequences: OPEN 신규 established relation만 create lifecycle을 실행하고 APPROVAL_REQUIRED pending·duplicate/no-op은 실행하지 않는다. Undo도 established relation을 실제 삭제한 경우만 cleanup하며 Notification 오류는 ActivityPub 성공이나 source transaction을 rollback하지 않는다. Follow/Undo의 Activity 검증, correlation, actor materialization과 transport 계약은 바뀌지 않는다.
- Confirmation / Follow-up: PROD-380이 production listener부터 DB/Notification까지의 wiring, duplicate/concurrent idempotency, pending/no-op 제외와 create/delete 실패 격리를 검증하고 PROD-361 archive gate를 block한다.

### Follow flow는 저장된 Profile origin pair에서 파생한다

- Decision Date: 2026-07-21
- Status: Accepted
- Context / Problem: 공통 core action이 caller에게 `ACTIVITYPUB_INBOUND`/`LOCAL_OUTBOUND` direction을 받으면 DB에 저장된 Profile origin과 같은 사실을 중복 표현하고, 값과 실제 pair가 어긋나는 불가능한 조합을 추가한다. direction 문자열 자체는 Activity가 검증됐다는 증거도 아니다.
- Decision Outcome: `followProfile`과 `unfollowProfile`은 caller-supplied direction을 받지 않는다. core action은 저장된 Follower/Followee Profile과 Instance kind/state를 조회해 Local→Local, Local→ActivityPub outbound와 ActivityPub→Local inbound를 파생하고 ActivityPub→ActivityPub을 거부한다. verified Activity actor/object/recipient 판정은 계속 Fedify concrete handler가 소유한다.
- Alternatives Considered: public direction enum 유지, local/outbound/inbound별 public core entrypoint 분리.
- Consequences: GraphQL과 Fedify caller가 같은 profile-pair input을 사용하며 origin pair가 lifecycle과 delivery 분기의 단일 source of truth가 된다. 임의 core caller가 verified Activity를 증명하는 별도 token은 추가하지 않으며, Fedify 검증 경계는 production listener 통합 테스트로 고정한다.
- Confirmation / Follow-up: PROD-380이 origin pair matrix와 production listener → concrete handler → common core → DB/Notification 흐름을 검증한다.

### 최종 통합 검증과 archive는 PROD-361이 소유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 부모 PROD-235는 자체 PR이 없지만 기존 task는 통합 검증과 archive git 변경을 PROD-235에 할당했고, PROD-282와도 하나의 task group으로 묶었다.
- Decision Outcome: PROD-361을 최종 통합 검증·delta spec 동기화·archive PR 소유자로 두고, PROD-235는 모든 자식 완료 후 부모 계약의 완료 판단만 소유한다.
- Alternatives Considered: PROD-235 명의의 별도 PR 생성, PROD-282 또는 다른 마지막 구현 자식에 archive 흡수.
- Consequences: shared change는 모든 구현 자식이 끝날 때까지 active로 유지되며, PROD-361이 별도 branch/PR에서만 archive한다.
- Confirmation / Follow-up: PROD-361 blocker와 완료 기준, archive 후 전체 strict validation을 확인한다.

## Remaining Decisions

- authenticated shared-inbox document loader identity는 PROD-355가 소유한다.
- outbound delivery intent, transactional outbox와 Fedify Queue handoff는 PROD-448의 별도 OpenSpec에서 결정한다. Fedify retry/history와 durable activity log는 해당 소유 이슈가 별도로 결정한다.

## Superseded Decisions

- 초기 design의 “PROD-240이 correlation/generation과 조건부 삭제를 제공한다”는 가정은 PROD-243 소유 결정으로 대체한다. PROD-240의 실제 병합 범위는 저장 count와 relation/count transaction 기반이다. 이후 PROD-243의 inbound generation 및 correlation 저장 선택은 actor-pair 기반 exact-row 결정으로 다시 대체됐다.
- 초기 design의 SUSPENDED local-only deletion과 nullable unfollow payload는 SUSPENDED 관계 보존·NotFound 결정으로 대체한다.
- 초기 design의 outbound correlation metadata 저장 요구는 `ProfileFollow.id`/`createdAt`과 actor identity에서 파생하는 결정으로 대체한다.
