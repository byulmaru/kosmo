# Core 서비스 경계

## 목적과 의존 방향

`packages/core/services`는 GraphQL API, Web BFF, ActivityPub handler와 worker가 공유할 수 있는
transport-neutral state-changing application action 경계다. 현재 진입점이 하나뿐이어도 행동의 의미가
특정 transport에 한정되지 않으면 core에 둘 수 있다. 진입점이 달라도 같은 도메인 정책, transaction,
persistence와 멱등성 결과를 보장한다.

공유 가능한 action을 호출할 때 의존 방향은 진입점에서 core로 향한다. 특정 진입점에서만 의미가 있는
state change는 그 진입점이 query/persistence 계층을 직접 사용할 수 있다. 상태를 바꾸지 않는 조회는
application action이 아니므로 `packages/core/services`를 거치지 않는다.

```text
Shared state-changing entry -> packages/core/services -> packages/core/db
Entry-local state change -------------------------------> packages/core/db
Read query / loader ------------------------------------> packages/core/db
```

core는 GraphQL context·payload·Global ID, HTTP session, ActivityPub object처럼 특정 진입점에서만 의미가
있는 타입이나 표현을 알지 않는다.

`@kosmo/fedify` 같은 protocol/delivery package 호출 자체는 경계 위반이 아니다. core public contract가
protocol 전용 타입에 의존하는지를 기준으로 판단한다.

## 책임

| 계층                                                            | 책임                                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GraphQL resolver, HTTP route, ActivityPub handler, worker entry | transport 입력 해석, caller·actor 인증, 조회·loader, entry-local state change, 외부 ID와 응답·오류 mapping |
| `packages/core/services`                                        | 검증된 actor와 business input에 대한 공유 가능한 domain policy, transaction, persistence와 멱등성          |
| `packages/core/db`                                              | DB client, schema, migration 지원과 DB 전용 utility                                                        |

Account session이나 ActivityPub signature처럼 actor identity를 신뢰하기 위한 증거는 진입점이 검증한다.
Post.Author, Source visibility와 lifecycle처럼 검증된 actor와 domain object 사이의 공통 권한은 core가
검증한다.

current-session logout은 이 규칙의 의도적인 예외다. missing 또는 terminal Session credential은 검증된
Session identity를 만들 수 없지만, 로그아웃은 이 상태를 DB·네트워크 오류처럼 결과를 확정하지 못한 실패와
구분해야 한다. GraphQL과 Web BFF가 같은 판정을 공유하도록 transport-neutral logout action이 raw Kosmo
Session credential 확인과 조건부 revoke를 함께 소유한다. 이 예외는 다른 인증 action의 caller·actor 검증
책임을 core로 옮기는 근거가 아니다.

## Actor와 caller별 조건

기본 소셜 actor는 `Profile`이다. `Account`는 GraphQL caller의 인증 identity이며 selected Profile은
Account–Profile membership으로 정한다. selected Profile은 Local 또는 Remote일 수 있다. `Account`와
`InstanceKind.LOCAL`은 모든 소셜 action의 공통 조건이 아니며, Account 자체가 domain participant이거나
Locality가 action의 의미일 때만 core contract에 포함한다. 결과 객체의 Local/Remote 구분이나 저장 위치를
actor Profile의 Instance Type 조건으로 확장하지 않는다.

GraphQL `usingProfile` entry point가 Active Account, selected Profile membership과 Profile 조회 가능 상태를
보장하면 resolver와 core action은 같은 Account·membership·Profile visibility를 다시 조회하지 않는다.
core는 검증된 Profile identity를 받아 action에 고유한 상태, 관계, 대상과 persistence 조건만 검증한다.

현재 Repost caller인 Local mutation은 session과 selected Profile membership을 검증한 뒤 core action에
`actorProfileId`와 `sourcePostId`를 전달한다. 향후 ActivityPub Repost ingress가 생기면 signature와
Remote actor 검증 뒤 같은 action을 재사용할 수 있지만, ingress와 delivery는 현재 Repost 범위가 아니다.

## GraphQL authorization과 DB 경계

GraphQL 진입점은 caller 인증, Active Account, selected Profile Membership과 selected Profile 조회 가능
상태를 검증한다. Post visibility, owner 조건과 interaction 가능 여부는 중앙 application policy helper가
소유하며, resolver와 selector가 같은 조건을 별도로 만들지 않는다. 목록의 후보, 정렬과 pagination도
application query 계층이 계산한다.

GraphQL의 요청별 가시성·owner policy는 PostgreSQL RLS나 session actor state로 계산하지 않는다.
GraphQL application SQL은 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`로 구성한 process
shared DB access 경계를 사용하고, API, Web과 Worker는 하나의 shared non-owner runtime role을 사용한다.
GraphQL operation 전용 DB session, actor GUC, operation-scoped `ctx.db`와 `OPERATION_DATABASE_URL`은
target architecture에 포함하지 않는다.

Fedify MessageQueue의 별도 database/role과 migration owner 경계는 유지한다. Fedify inbound/delivery,
Temporal Workflow/Activity와 worker의 기능·policy는 이 GraphQL authorization 결정으로 변경하지 않는다.
세부 결정과 전환 경계는
[ADR 0024](../domain/decisions/0024-application-policy-and-runtime-db-boundary.md)를 따른다.

## Public contract

- input은 검증된 DB identity와 domain input으로 구성한다. caller별 인증 결과를 boolean, callback 또는
  protocol object로 전달하지 않는다.
- 반환값은 action의 transport-neutral domain 결과다. GraphQL payload, object ref, connection이나
  resolver 편의에만 필요한 조회 결과를 반환하도록 core contract를 바꾸지 않는다.
- GraphQL은 core 결과를 schema 타입과 payload로 mapping하고, presentation에만 필요한 값은
  resolver·loader에서 조합한다. 어떤 값이 모든 caller가 알아야 하는 domain outcome일 때만 core
  반환값에 포함한다.
- read-only query, lookup, list와 loader는 진입점의 query 계층에서 DB와 공유 조회 policy를 사용한다.
  계층을 맞추기 위한 pass-through core service를 만들지 않는다.
- 여러 DB 변경이 원자적이어야 하면 기본적으로 core action이 transaction 경계를 소유한다. 다만 capability가
  Temporal command의 durable admission과 DB commit을 하나의 실행으로 연결하도록 명시하면 같은 core domain
  policy와 transaction 구현을 Worker Activity가 호출할 수 있다. 이때 caller는 DB handle이나 callback을 넘기지
  않고 serializable command와 검증된 actor identity만 전달한다.
- 새로운 Post origin이나 lifecycle 계약을 transaction 인자의 존재 여부에서 추론하지 않는다.
  `createPost`처럼 origin별 lifecycle을 소유하는 action이 caller transaction과 합류하면서 commit 이후 side
  effect까지 보장해야 한다면 `tx` 유무만으로 side effect를 생략하거나 commit 전에 실행하지 말고, 실제
  요구가 생긴 시점에 명시적인 post-commit coordination 경계를 먼저 설계한다. capability 문서가
  caller-owned transaction 경로의 lifecycle 생략을 현재 제한으로 명시한 기존 계약은 그 결정이 변경될
  때까지 유지한다.
- 외부 delivery나 notification처럼 DB transaction에 포함되지 않는 side effect는 domain write가 commit된
  뒤 실행한다. side effect 실패가 이미 commit된 domain 결과를 되돌려서는 안 되는 계약이면 실패를 호출
  경계에서 격리하고 commit된 상태를 유지한다.
- Follow의 durable admission은 방향성을 가진 Profile pair Workflow가 소유한다. Workflow ID는
  `profile-follow-pair:{followerProfileId}:{followeeProfileId}`로 결정하며, caller는 인증·actor/object 검증 뒤
  `FOLLOW`를 Update-with-Start한다. Open policy면 transaction commit 결과를 Update handler가 즉시 반환하고,
  Workflow는 FIFO effects를 drain한 뒤 종료한다. Approval Required면 Follow Request를 commit하고 Pending으로
  남으며, `APPROVE`, remote `ACCEPT`, `REJECT`, `CANCEL`은 같은 pair Workflow의 Update로 처리한다.
- Pair Workflow는 한 번에 하나의 lifecycle command만 admission한다. in-flight guard와 DB uniqueness/exact-row
  조건으로 동시 명령을 제한하며, 승인·거절·취소와 관련된 protocol validation은 각각의 caller 경계에 남긴다.
  inbound Follow의 직접 Accept delivery와 Follow effect의 ActivityPub no-echo 조건도 core Workflow가 가져오지
  않는다.
- Update handler는 transaction Activity의 commit 결과를 effects보다 먼저 반환한다. Pending 중 Request effect가
  terminal failure가 되어도 실패를 Workflow state에 기록하고 terminal command 대기를 계속한다. terminal command가
  commit되면 queued effects를 선언된 FIFO 순서로 drain하고, drain 뒤 terminal failure를 기록한 상태로 Workflow를
  complete/fail한다. 이미 commit된 domain 결과는 side effect failure로 rollback하지 않는다.
- Follow의 outbound protocol eligibility는 transaction Activity가 각 시도에서 현재 participant와 remote target
  Instance 상태를 관찰해 반환할 effect plan에 기록한다. completion loss 뒤 retry가 `ACTIVE → UNRESPONSIVE`를
  관찰하면 delivery를 생략할 수 있고, `UNRESPONSIVE → ACTIVE`를 관찰하면 포함할 수 있다. Workflow는 반환된
  plan을 그대로 실행하며 effect Activity가 실행 시점의 mutable state로 delivery를 추가하거나 취소하지 않는다.
  Worker Activity는 stable create source 또는 exact deleted source ID와 directed pair를 실행하며 actor/inbox
  결손을 성공한 no-op으로 숨기지 않는다.
- Pair command에는 random `operationId`나 operation receipt를 두지 않는다. create transition은 Activity 전에
  candidate Follow/Request domain row ID를 Workflow history에 배정하고 그 exact ID를 insert한다. transaction Activity
  retry는 candidate/expected row와 Workflow가 보존한 source identity로 이미 commit된 결과를 재구성한다.
  candidate ID는 실제 domain entity identity이며 command identity가 아니다.
  Temporal Update ID는 RPC deduplication metadata이며 domain ledger가 아니다. 실행 중인 pair에는 `USE_EXISTING`을,
  완료된 lifecycle의 새 Follow에는 `ALLOW_DUPLICATE` reuse policy를 사용한다.
- 이 예외가 다른 capability의 retry 계약을 없애지는 않는다. 삭제 source identity나 effect plan을 DB 상태만으로
  재구성할 수 없는 별도 Temporal capability는 그 capability가 소유하는 최소 receipt를 같은 transaction에 기록할
  수 있지만, 이를 Follow pair Workflow의 공용 command ledger로 일반화하지 않는다.
- Unfollow는 Follow Relationship의 별도 짧은 Workflow가 소유한다. Profile pair Workflow가 다음 command를
  영구히 기다리거나 Unfollow까지 유지하는 entity/mutex로 확장하지 않는다.
- source와 함께 commit되어야 하는 Best Effort DB projection은 같은 transaction의 격리된 savepoint에서
  실행할 수 있다. projection 실패는 savepoint에서 rollback하고 source transaction은 유지하며, caller
  transaction의 commit 전에는 외부에 보이지 않고 outer rollback 뒤에는 함께 사라진다. transaction 인자의
  존재 여부로 projection lifecycle을 선택하거나 생략하지 않는다.
- rollback되어 존재하지 않는 domain transition의 Activity를 외부에 전달해서는 안 된다. 반대로 commit된
  transition의 post-commit Activity delivery 실패나 현재 direct-delivery 경계에서의 전달 누락을 수용하는지는
  각 capability가 명시적으로 결정할 수 있다.
- core는 공통 domain error를 반환하고 각 진입점이 외부 오류 표현으로 mapping한다.
- 실제 caller 없이 evaluator, callback, generic port나 대체 implementation을 미리 추가하지 않는다.

## 테스트와 계약

- 진입점 integration test는 session, membership, signature와 actor/object처럼 caller별 조건을
  검증한다.
- core test는 공통 domain policy, transaction rollback, persistence, uniqueness와 idempotency를
  검증한다.
- 테스트만을 위해 production에 없는 우회 가능한 public contract를 추가하지 않는다.

`docs/domain`은 도메인 계약, Linear는 전달 범위, OpenSpec은 구현 slice를 정의한다. 조건을 core로 옮기기
전에 모든 production caller에 공통인 domain invariant인지, 특정 caller의 인증 조건인지, core가
transport-specific 입력이나 반환값에 의존하게 되는지를 확인한다.
