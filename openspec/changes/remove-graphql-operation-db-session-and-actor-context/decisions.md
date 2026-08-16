## Context

이 기록은 ADR 0024의 application policy/shared DB 경계, PROD-779의 operation session·actor context 제거 범위, 현재 `ctx.db`/operation client/actor helper/Helm 구조와 사용자의 Pooler 유지 결정을 반영한다. 구현은 GraphQL 권한이나 결과를 재설계하지 않고 RLS 전용 기반만 제거한다.

## Decision Records

### GraphQL application SQL은 process shared DB access를 사용한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear PROD-776, Linear PROD-779
- Status: Active
- Context / Problem: 병합된 GraphQL RLS consumer가 제거됐지만 runtime은 operation별 connection, actor GUC와 `ctx.db` 전달 경계를 계속 유지한다.
- Decision Outcome: GraphQL application SQL은 표준 `PG*`로 구성한 process shared DB access를 사용한다. Operation별 database client, actor GUC, `ctx.db`와 `OPERATION_DATABASE_URL` consumer는 제거한다.
- Alternatives Considered: operation plugin을 no-op으로 유지하거나 `OPERATION_DATABASE_URL`을 direct Service로 바꾸는 방식은 사용하지 않는 lifecycle과 seam을 남기므로 제외한다. Request/operation별 actor state를 유지하는 방식은 ADR 0024와 충돌한다.
- Consequences: resolver/loader의 DB 접근과 core action handle 전달을 정렬해야 하지만 GraphQL operation마다 별도 connection을 열거나 닫지 않는다. Runtime role 통합은 PROD-780에 남는다.
- Confirmation / Follow-up: production source에서 operation client/plugin, actor setting, `ctx.db`와 operation URL consumer가 없는지 정적 확인하고 GraphQL/Core/Helm 회귀를 통과시킨다.

### Operation별 session snapshot과 cache 격리는 유지한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, Linear PROD-779
- Status: Superseded
- Context / Problem: `ctx.db` 제거가 HTTP batch sibling 사이 session snapshot, DataLoader registry와 Pothos cache 격리까지 제거하는 근거는 아니다.
- Decision Outcome: operation context는 인증된 session identity를 독립 snapshot으로 가지고 operation별 cache/loader를 계속 소유하되 DB handle은 포함하지 않는다. `selectProfile`은 같은 Mutation operation의 snapshot을 갱신하므로 이후 직렬 top-level field는 새 Profile을 관찰하지만 별도 batch sibling snapshot은 변경하지 않는다.
- Alternatives Considered: request 전체가 하나의 mutable context/cache를 공유하는 방식은 batch sibling 격리와 기존 실행 계약을 바꾸므로 제외한다. 기존 context에 optional `db`를 남기는 방식은 제거 완료를 모호하게 하므로 제외한다.
- Consequences: operation-context 회귀 테스트는 DB identity/GUC assertion을 제거하되 session/cache/loader 격리 assertion을 유지해야 한다.
- Confirmation / Follow-up: 사용자의 후속 결정으로 아래의 "HTTP array batching과 operation context clone을 함께 제거한다" 결정이 이 기록을 대체한다.

### HTTP array batching과 operation context clone을 함께 제거한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear PROD-779
- Status: Active
- Context / Problem: 저장소 client는 HTTP request마다 하나의 GraphQL operation만 보내지만 API는 JSON array batching을 활성화하고 operation마다 session identity와 loader/cache state를 복제한다. Clone만 제거하고 batching을 유지하면 동시 sibling operation이 mutable identity와 loader state를 공유해 결과가 비결정적일 수 있다.
- Decision Outcome: GraphQL HTTP JSON array batching과 별도 operation context clone을 함께 제거한다. Request마다 하나의 operation이 인증된 request context와 request-scoped DataLoader를 직접 사용한다. `selectProfile` 성공은 request context의 profile ID를 갱신해 같은 Mutation의 이후 직렬 top-level field에 반영하고, 다음 HTTP request는 저장된 선택을 인증 경계에서 다시 검증한다.
- Alternatives Considered: batching과 operation별 격리를 함께 유지하는 방식은 사용하지 않는 기능을 위해 lifecycle과 테스트를 남기므로 제외한다. Batching만 유지하고 격리를 제거하는 방식은 concurrent sibling 사이 mutable state 공유가 발생하므로 제외한다.
- Consequences: JSON array batch는 더 이상 지원하지 않는다. Request context의 identity와 DataLoader lifetime은 HTTP request와 일치하며, 한 request 안의 단일 operation을 위한 별도 snapshot이나 cache registry가 없다.
- Confirmation / Follow-up: array request body가 batch로 실행되지 않고, 단일 operation이 request context를 직접 사용하며, 같은 Mutation의 `selectProfile` 이후 field가 새 Profile을 관찰하고 다음 request가 저장된 선택을 재인증함을 검증한다.

### Actor helper는 새 forward migration으로 제거한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear PROD-779
- Status: Active
- Context / Problem: Account/Profile helper는 과거 SQL migration으로 생성돼 Drizzle table metadata에 없고, 현재 병합 schema/policy에는 두 함수를 소비하는 RLS가 없다. 이미 적용된 migration을 수정할 수 없다.
- Decision Outcome: operation actor setting call-site를 제거하고 dependency 부재를 확인한 뒤 별도의 forward migration에서 두 함수를 drop한다. 기존 migration과 snapshot은 수정하지 않는다. Canonical sync에서는 retired `rls-actor-context` capability 파일을 제거하고 빈 active stub을 남기지 않는다.
- Alternatives Considered: 함수를 사용하지 않은 채 존치하면 PROD-779의 actor helper 제거 조건을 충족하지 못한다. 과거 migration 편집은 migration name/hash 불변 계약을 깨뜨린다. 파일별 migration behavior test 추가는 명시적 제외 범위다.
- Consequences: migration은 schema contract 제거를 포함하지만 old operation plugin은 helper를 호출하지 않고 GUC만 설정하므로 구버전 workload의 SQL call path를 깨뜨리지 않는다. Rollback이 함수를 다시 요구하는 별도 전환이라면 새 forward restore migration과 승인이 필요하다.
- Confirmation / Follow-up: disposable 전체 migration replay와 catalog query로 dependency 없이 두 함수가 제거되고 unrelated schema/migration history가 유지됨을 확인한다. Archive 뒤 active capability 목록과 `openspec/specs/rls-actor-context/spec.md` 부재도 확인한다.

### 기존 PgBouncer Pooler는 유지하고 GraphQL consumer만 제거한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear PROD-779
- Status: Active
- Context / Problem: 초기 범위는 operation consumer와 함께 전용 Pooler resource도 retire하려 했으나, 사용자는 현재 리소스 제거가 필요하지 않다고 결정했다.
- Decision Outcome: API의 `OPERATION_DATABASE_URL`과 operation session consumer는 제거하지만 기존 CloudNativePG Pooler template, values, resource와 historical 운영 기록은 유지한다. 향후 재사용 또는 retirement는 별도 결정과 이슈가 소유한다.
- Alternatives Considered: 같은 revision에서 Pooler까지 제거하는 방식은 불필요한 resource lifecycle 변경이며 rollout/prune ordering 위험을 만든다. 별도 retirement 이슈를 지금 생성하는 방식도 현재 필요가 없어 제외한다.
- Consequences: 사용되지 않는 Pooler의 resource cost와 운영 surface는 남지만 PROD-779의 application 전환과 Worker/Fedify/Temporal/direct `PG*` 경계는 단순해진다.
- Confirmation / Follow-up: Helm render에서 API `OPERATION_DATABASE_URL`은 없고 기존 Pooler CR/values는 유지되며 다른 workload의 표준 `PG*`와 Secret ref가 변하지 않음을 확인한다.

### 반대 방향의 active change는 history-only archive한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear PROD-776, Linear PROD-779
- Status: Active
- Context / Problem: `activate-graphql-operation-db-sessions`에는 현재 canonical 방향과 반대인 activation/live gate task 네 개가 미완료로 남아 있고 delta spec을 sync하면 제거 목표를 되돌린다.
- Decision Outcome: 13/17 task 상태와 incident/live history를 보존해 `--skip-specs` history-only archive하고 canonical spec에는 sync하지 않는다. 과거 완료 change들은 수정하지 않는다.
- Alternatives Considered: 남은 live task를 완료하는 방식은 ADR 0024와 충돌한다. 일반 archive/sync는 obsolete operation session 요구사항을 canonical spec에 반영하므로 제외한다. active로 방치하면 구현 authority가 충돌한다.
- Consequences: archive에는 incomplete task 경고가 남지만 이는 의도적으로 abandoned된 과거 rollout 기록이다. 새 removal change가 현재 계약과 완료 책임을 소유한다.
- Confirmation / Follow-up: archive 경로에 전체 artifact와 미완료 task가 보존되고 active change 목록에서는 사라지며, canonical spec은 새 removal delta만 반영하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 초기 OpenSpec 초안의 "GraphQL consumer와 전용 Pooler resource를 함께 제거한다" 선택은 사용자의 2026-08-16 결정과 이에 맞춰 갱신한 ADR 0024/PROD-779에 의해 supersede되었다. 현재 Active 결정은 Pooler resource를 유지하고 GraphQL consumer만 제거하는 것이다.
- 초기 OpenSpec Gate의 "HTTP batch sibling별 session snapshot과 DataLoader/Pothos cache 격리를 유지한다" 선택은 사용자의 2026-08-16 후속 결정과 갱신한 ADR 0024/PROD-779에 의해 supersede되었다. 현재 Active 결정은 batching과 operation context clone을 함께 제거하고 요청당 단일 operation이 request context를 직접 사용하는 것이다.
