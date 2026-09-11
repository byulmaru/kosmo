# Coding Style: Core Services

## Core Services

- 여러 진입점이 공유할 수 있는 state-changing application action은 `packages/core/services`에 두고, core service는 `packages/core/db`에 의존한다. 특정 진입점에서만 의미가 있는 state change는 그 진입점의 query/persistence 계층에 둘 수 있다. read-only query와 loader는 service를 거치지 않고 query 계층에서 DB와 공유 조회 policy를 사용한다. core가 특정 진입점의 타입이나 표현에 의존하게 하지 않는다.
- 진입점은 transport·protocol의 인증과 actor context를 처리하고, core는 검증된 actor와 business input에 대한 공통 domain policy, transaction, persistence와 멱등성을 처리한다. 상세 책임은 `docs/architecture/core-services.md`를 따른다.
- Local GraphQL의 Account/session/selected Profile membership, ActivityPub의 signature/actor/object/recipient 검증처럼 caller마다 다른 권한 증거는 진입점이 소유한다. GraphQL의 selected Profile은 membership과 조회 가능 상태가 검증되지만 Instance 종류는 제한하지 않는다. core service에는 검증된 actor identity와 business input만 전달한다.
- 기본 소셜 행동 주체는 Profile이다. Account 자체가 domain participant이거나 commit 시점의 Account 권한 재검증이 명시된 불변식인 경우가 아니라면, GraphQL context 검증을 반복하기 위해 core public action에 `accountId`를 추가하지 않는다. 현재 caller가 Local이라는 이유만으로 공통 action에 `InstanceKind.LOCAL`을 강제하지 않는다.
- core service는 caller들이 공유하는 Profile/Post lifecycle, 관계 구조, visibility·eligibility, domain error, transaction, persistence, uniqueness와 idempotency를 소유한다.
- core는 transport-neutral domain 결과만 반환한다. GraphQL payload, object ref, connection이나 resolver 편의에만 필요한 조회 결과는 resolver·loader에서 조합하고, 모든 caller가 알아야 하는 domain outcome일 때만 core 반환값에 포함한다.
- core가 Fedify 같은 protocol/delivery package를 호출하는 사실만으로 경계 위반으로 판단하지 않는다. core public contract가 protocol 전용 타입에 의존하는지를 기준으로 판단한다.
- production DB composition은 process shared `Database`와 명시적인 secondary connection만 포함한다. GraphQL operation 전용 `Database`, actor GUC와 operation-scoped `ctx.db`는 target architecture에 포함하지 않는다. caller transaction에 합류하는 action만 `DatabaseHandle`(`Database | Transaction`)을 `getDatabaseConnection(handle)`로 선택해 transaction/savepoint 의미를 보존한다. `Transaction`은 post-commit·context 수명 경계로 전달하지 않고 test-only generic DB 추상화를 추가하지 않는다.
- 명시적 비관적 DB 락은 동시성 위반이 금전 거래처럼 심각하고 되돌리기 어려운 피해를 만드는 use case에만 사용한다. 팔로우 요청처럼 드문 race의 영향이 작고 복구 가능한 social interaction은 락으로 완전 직렬화하지 않으며, 상세 판단과 리뷰 근거는 `memory/database-design.md`의 Runtime Locking Policy를 따른다.
- `packages/core/db`는 DB client, schema, relation과 DB 전용 utility를 소유하고 account/session 생성 같은 application transaction은 소유하지 않는다.
- OIDC discovery와 code exchange처럼 transport 또는 protocol-specific 검증은 API/BFF 경계에 남기고, core service에는 검증된 identity와 business input만 전달한다.
