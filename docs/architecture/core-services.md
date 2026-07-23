# Core 서비스 경계

## 존재 이유

`packages/core`는 특정 transport나 protocol의 요청을 처리하기 위한 계층이 아니다. GraphQL API, Web BFF,
ActivityPub handler와 worker처럼 서로 다른 진입점이 같은 Kosmo business use case를 실행할 때, 도메인
불변식과 transaction 동작이 진입점마다 달라지지 않도록 공유하는 server business logic 경계다.

이 경계의 목적은 코드를 단순히 재사용하는 것이 아니라 다음을 한곳에서 보장하는 것이다.

- 같은 행동이 어느 진입점에서 호출돼도 동일한 도메인 결과를 만든다.
- 여러 DB 변경이 하나의 transaction으로 commit되거나 rollback된다.
- uniqueness, idempotency와 concurrency 결과가 caller마다 달라지지 않는다.
- transport, session 또는 federation protocol이 바뀌어도 domain action의 public contract는 유지된다.

## 책임 구분

| 계층                                                            | 소유하는 책임                                                                                                                                          | 소유하지 않는 책임                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| GraphQL resolver, HTTP route, ActivityPub handler, worker entry | transport input 해석, 인증된 caller와 actor 확인, protocol별 권한 증거 검증, 외부 ID 변환, 응답·오류 mapping                                           | 공통 domain transaction을 직접 복제하는 일                                                 |
| `packages/core/services`                                        | 검증된 actor identity와 business input을 받는 application action, 공통 domain policy, transaction, persistence orchestration, uniqueness와 idempotency | GraphQL context, HTTP session, OIDC exchange, ActivityPub signature나 Activity object 해석 |
| `packages/core/db`                                              | DB client, schema, migration 지원과 DB 전용 utility                                                                                                    | application use case와 transport별 authorization                                           |

진입점은 core service를 호출하기 전에 자기 protocol에서만 의미가 있는 사실을 검증한다.

- Local GraphQL mutation은 Active Account, selected Profile membership과 Local actor context를 검증한다.
- ActivityPub ingress는 서명, remote actor, Activity actor/object/recipient와 federation 수신 정책을 검증한다.
- Worker는 job provenance와 실행 권한을 검증한다.

core service는 이렇게 검증된 actor와 business input을 받아 모든 caller가 공유하는 Profile/Post lifecycle,
관계 구조, visibility·eligibility, 저장과 멱등성 규칙을 적용한다.

이 구분은 core가 authorization을 하지 않는다는 뜻이 아니다. Account session, ActivityPub signature처럼
actor identity를 신뢰하기 위한 caller별 증거는 진입점이 검증하고, Post.Author, 관계 Owner, Source
visibility처럼 검증된 actor와 domain object 사이의 공통 권한은 core가 검증한다.

## Actor와 Account

기본 소셜 행동 주체는 `Profile`이다. `Account`는 Local 요청에서 Profile을 선택하고 그 Profile의
Owner/Member임을 증명하는 인증·권한 사실이지, 모든 소셜 action의 보편적인 actor가 아니다. Remote
ActivityPub Profile에는 Kosmo Account membership이 없다.

따라서 public core action에 `accountId`를 추가해도 되는 것은 Account 자체가 domain participant이거나,
transaction commit 시점의 Account 권한을 다시 확인하는 것이 그 action의 명시된 불변식일 때뿐이다. 현재
GraphQL caller의 session 검증을 core에서 반복하기 위한 목적으로 `accountId`를 요구하지 않는다.

`InstanceKind.LOCAL`도 같은 원칙을 따른다. 현재 caller가 Local GraphQL이라는 이유만으로 공통 action이
Local Profile만 허용하면, 검증된 Remote Profile이 같은 domain action을 수행해야 할 때 공통 경계를 재사용할
수 없다. Locality가 action 자체의 의미인 경우에만 core contract에 포함하고, 그렇지 않으면 각 진입점이
자기 actor origin을 검증한다. Profile이나 Instance의 공통 lifecycle·safety 정책은 caller 종류와 무관하게
적용되는 범위에서 core가 계속 검증할 수 있다.

## 공통 action 흐름

같은 domain action에 Local과 ActivityPub 진입점이 있다면 다음 형태를 사용한다.

```text
Local GraphQL
  -> Account/session/selected Profile/Locality 검증
  -> verified actor Profile + business input
                                      \
                                       -> core service
                                      /   -> 공통 domain policy
ActivityPub                          /    -> transaction/persistence
  -> signature/actor/object 검증    /     -> uniqueness/idempotency
  -> verified actor Profile + input
```

예를 들어 Repost 생성의 Local mutation은 Account와 membership을 검증하고, ActivityPub ingress는
`Announce`와 Remote actor를 검증한다. 두 진입점은 검증된 `actorProfileId`와 `sourcePostId`를 같은 core
action에 전달하며, core는 Repost 구조, Source 정책, derived visibility와 멱등 저장을 공유한다.

이번 slice가 한 진입점만 구현한다는 사실은 공통 action을 그 진입점 전용으로 만들어도 된다는 뜻이 아니다.
반대로 실제 공유 책임이 아직 확인되지 않았다면 미래 caller를 가정한 evaluator, callback, generic port나
대체 implementation을 선제 추가하지 않는다.

## Public contract 규칙

- core service input에는 DB identity와 domain input을 사용한다. GraphQL global ID, HTTP request/session,
  ActivityPub Activity object를 그대로 전달하지 않는다.
- caller별 인증 결과를 boolean이나 강제 allow/deny callback으로 전달하지 않는다. 진입점은 자기 책임을
  완료한 뒤 검증된 identity를 전달한다.
- 여러 DB 작업이 원자적이어야 하면 service가 transaction 경계를 소유한다.
- 기존 caller transaction과 조합해야 하는 concrete 요구가 있으면 optional transaction을 받아 savepoint로
  합류할 수 있다.
- 공통 domain 오류는 core가 반환하고, GraphQL error extension이나 ActivityPub 응답 같은 외부 표현은
  진입점이 mapping한다.
- action이 의도적으로 Local-only이거나 특정 protocol에 종속된다면 upstream contract에 그 이유와 실제
  caller를 명시한다.

## 테스트 책임

- 진입점 integration test는 Account/session/membership, Locality, ActivityPub signature와 actor/object처럼
  caller별 인증·protocol 조건을 검증한다.
- core service test는 검증된 actor 입력에서 공통 domain policy, transaction rollback, persistence,
  uniqueness와 idempotency를 검증한다.
- core test를 위해 production에 없는 authorization callback이나 대체 implementation을 public contract에
  추가하지 않는다.
- 여러 production 진입점이 같은 action을 사용할 때는 각 진입점이 같은 core default wiring을 호출하는지
  확인한다.

## 계약 문서와의 관계

`docs/domain`은 행동 주체, 권한, 조건과 결과 같은 제품·도메인 계약을 정의한다. Linear issue는 전달 범위와
검증 책임을 정하고, OpenSpec은 이를 구현 slice로 번역한다. Local GraphQL 행동에 필요한 조건이 적혀 있다는
이유만으로 OpenSpec이 그 조건을 공통 core action의 caller 제한으로 옮겨서는 안 된다.

OpenSpec에서 core 책임을 정할 때는 다음을 확인한다.

1. 이 조건이 모든 현재·예정 production caller에 공통인 domain invariant인가?
2. 아니면 특정 transport, session 또는 protocol이 actor를 신뢰하기 위한 증거인가?
3. core public input이 caller-specific identity나 protocol object를 요구하게 되지는 않는가?
4. 후속 caller가 같은 action을 사용하려면 가짜 Account를 만들거나 검증을 우회해야 하지는 않는가?

두 번째 또는 네 번째에 해당하면 해당 검증은 진입점이 소유하고, core에는 검증된 actor identity와 business
input만 전달한다.
