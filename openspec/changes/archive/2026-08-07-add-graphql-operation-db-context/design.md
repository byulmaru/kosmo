## Context

Hono middleware의 `deriveContext`는 현재 인증 SQL뿐 아니라 DataLoader registry까지 만들어 HTTP request에 저장한다. Yoga는 batch item마다 parse/validate 뒤 context factory와 execute pipeline을 따로 호출하고 Pothos cache는 새로 만들지만, context에 spread된 loader closure와 `$loaders` map은 request에서 만든 같은 객체를 가리켜 batch operation 사이에 공유된다. Resolver SQL은 전역 `db`를 직접 사용한다.

PROD-708은 이 구조를 인증 identity와 operation 실행 context로 분리하고, 후속 이슈가 소비할 DB handle과 검증된 transaction seam을 추가한다. 다만 기존 resolver가 같은 pool의 전역 DB를 계속 사용하므로 production wrapper는 PROD-726의 전체 consumer 정렬 뒤에만 활성화한다.

## Goals / Non-Goals

**Goals:**

- Query/Mutation transaction seam이 actor setting, `ctx.db`와 결과 lifecycle을 같은 primary transaction에 묶을 수 있음을 검증한다.
- batch operation마다 Pothos/DataLoader cache를 새로 만든다.
- 일반 결과와 AsyncIterable의 성공·오류·취소 수명에 transaction을 맞춘다.
- subscription은 장기 connection을 점유하지 않는다.
- 현재 resolver와 GraphQL 응답을 그대로 유지한다.
- production Yoga가 전역 DB resolver보다 먼저 connection을 선점하지 않는다.

**Non-Goals:**

- Post 또는 다른 도메인의 SQL을 `ctx.db`로 이전하지 않는다.
- RLS schema, policy, grant, application predicate와 workload credential을 바꾸지 않는다.
- sibling mutation field 전체의 새로운 원자성 의미를 정의하지 않는다.
- `@defer`나 subscription 기능을 새로 활성화하지 않는다.

## Implementation Guidance

### Current Constraints

- Yoga 5는 batch item별로 `contextFactory`를 호출하므로 인증 identity만 request에서 재사용하고 loader/cache 생성은 이 factory 안으로 옮길 수 있다.
- Envelop `onExecute`는 validation 이후 호출되고 현재 execute 함수를 교체할 수 있어 Query/Mutation transaction을 여는 위치로 적합하다. Subscription은 `onSubscribe` 경로이므로 execute plugin만 감싸면 장기 transaction을 피할 수 있다.
- Drizzle transaction callback이 AsyncIterable을 그대로 반환하면 callback이 즉시 끝나 transaction이 stream보다 먼저 commit된다. 반대로 callback에서 stream 완료를 기다린 뒤 iterable을 반환하면 consumer가 iterable을 받지 못해 교착된다.
- 현재 `Transaction` 타입은 core DB package에 이미 있고, query/mutation별 `accessMode` 설정을 지원한다.

### Recommended Approach

request middleware는 session identity만 파생한다. Yoga context factory는 batch item마다 그 identity를 복사하고 새 Pothos cache, loader registry와 기본 DB handle을 구성한다.

별도 Yoga execution plugin은 Query/Mutation의 execute 함수를 Drizzle transaction으로 감쌀 수 있는 dormant seam으로 제공한다. transaction 시작 직후 parameterized `set_config(..., true)` 호출로 account/profile 값을 설정하고 context의 `db`를 transaction handle로 교체한 다음 원래 execute 함수를 호출한다. Query에는 `read only`, Mutation에는 `read write` access mode를 사용한다. PROD-708 production Yoga plugin 목록에는 등록하지 않는다.

일반 결과는 transaction promise가 끝난 뒤 반환한다. AsyncIterable은 execute 결과 종류를 판별하는 deferred signal과 source iterator를 전달하는 proxy를 사용한다. transaction callback은 proxy consumer가 완료할 때까지 열려 있고, 정상 `done`에서 commit한다. source 오류, `return`, `throw` 또는 abort는 source를 정리하고 callback을 reject해 rollback한다. 마지막 `done`은 commit/rollback 완료까지 기다려 connection 반환을 결과 수명과 맞춘다.

### Allowed Alternatives

- 동일한 spec을 지키면서 Yoga의 공식 plugin helper가 일반 결과와 AsyncIterable transaction 수명을 직접 조합할 수 있다면 custom proxy 대신 사용할 수 있다.
- transaction-local setting은 parameterized `set_config`와 동등하게 transaction 밖으로 누출되지 않는 PostgreSQL `SET LOCAL` 실행을 사용할 수 있다.

### Known Traps

- request에서 만든 loader closure를 얕게 복사하면 `$loaders` map만 새로 보여도 실제 cache가 공유될 수 있다.
- transaction callback에서 AsyncIterable 객체를 즉시 반환하면 connection이 stream 전에 풀로 돌아간다.
- subscription stream 전체를 transaction callback 안에서 기다리면 장기 connection 점유가 생긴다.
- `ExecutionResult.errors`를 throw로 바꾸면 기존 GraphQL 부분 실행 의미와 sibling mutation 동작을 바꾼다.
- actor 값을 문자열 보간한 raw SQL로 설정하면 안전성과 설정명 검증이 흐려진다.

## Risks / Trade-offs

- [operation wrapper가 먼저 pool connection을 잡고 전역 DB resolver가 두 번째 connection을 기다리면 pool 크기만큼의 동시 요청에서 교착한다] → PROD-708에서는 production 등록을 금지하고, PROD-726이 모든 GraphQL DB consumer 인벤토리와 pool-size 이상 stress 검증 뒤 활성화한다.
- [AsyncIterable proxy가 iterator protocol의 `next`/`return`/`throw` 중 하나를 빠뜨리면 transaction이 누출될 수 있다] → 각 종료 경로와 abort를 독립 테스트하고 종료 뒤 새 operation에서 pool/context 누출을 확인한다.
- [기존 resolver는 전역 DB를 사용하므로 이 단계의 operation transaction과 원자성을 공유하지 않는다] → `ctx.db`는 additive seam으로만 배포하고 실제 SQL 이전은 PROD-371에 남긴다.

## Migration Plan

1. 인증 identity와 operation cache 생성을 분리하고 호환 테스트를 통과시킨다.
2. Yoga transaction plugin seam과 `ctx.db` 타입을 owner credential 상태로 배포하되 production plugin 목록에는 등록하지 않는다.
3. lifecycle, batch cache, actor setting과 pool 누출 검증 뒤 PROD-371의 점진 SQL 이전을 unblock한다.
4. PROD-726에서 전체 GraphQL DB consumer 정렬과 동시성 stress를 통과한 뒤 production wrapper를 활성화한다.
5. PROD-708 rollback은 context/transaction seam 추가만 되돌린다. schema, credential과 기존 resolver SQL이 변하지 않아 data rollback은 없다.

## Open Questions

없음.
