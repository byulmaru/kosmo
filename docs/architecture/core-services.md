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

## Actor와 caller별 조건

기본 소셜 actor는 `Profile`이다. `Account`는 Local GraphQL caller의 인증 identity이고, 정상 제품 경로의
selected Profile은 membership 모델상 Local이다. `Account`와 `InstanceKind.LOCAL`은 모든 소셜 action의
공통 조건이 아니며, Account 자체가 domain participant이거나 Locality가 action의 의미일 때만 core
contract에 포함한다.

현재 Repost caller인 Local mutation은 session과 selected Profile membership을 검증한 뒤 core action에
`actorProfileId`와 `sourcePostId`를 전달한다. 향후 ActivityPub Repost ingress가 생기면 signature와
Remote actor 검증 뒤 같은 action을 재사용할 수 있지만, ingress와 delivery는 현재 Repost 범위가 아니다.

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
- 여러 DB 변경이 원자적이어야 하면 core action이 transaction 경계를 소유한다. 실제 caller
  transaction과 합류해야 할 때만 optional transaction을 받는다.
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
