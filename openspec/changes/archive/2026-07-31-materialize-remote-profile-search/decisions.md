## Context

이 기록은 PROD-573의 승인된 canonical·Linear 계약과 현재 `searchProfiles`, Fedify materializer, PostgreSQL
connection 제약을 반영한다. 제품 행동은 상위 권위에서 파생하고, 인증·SSRF·identity·관측·rollback을 여러
구현 지점에서 일관되게 지키기 위해 필요한 구현 선택만 별도로 기록한다.

## Decision Records

### 인증된 명시적 qualified handle만 원격 준비 단계를 연다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-573`
- Status: Active
- Context / Problem: 기존 remote partial 검색 문법도 `handle@domain`으로 파싱되므로 모든 remote parse 결과에 lookup을 연결하면 일반 검색의 network surface가 넓어진다.
- Decision Outcome: 유효한 Account 인증 뒤 원문이 명시적인 leading `@` qualified handle 전체이고 remote handle로 유효하게 파싱되는 경우에만 원격 actor 준비 단계를 실행한다. 그 밖의 local·일반·불완전한 remote 검색과 `profileByHandle`/프로필 route는 DB-only로 유지한다.
- Alternatives Considered: 모든 remote-domain 검색에서 lookup하는 방식은 승인된 narrow trigger와 DDoS 완화 경계를 위반한다. 프로필 route에서 materialize하는 방식은 익명 fetch surface를 다시 연다.
- Consequences: UI나 schema 변경 없이 exact remote account discovery만 확장된다. trigger의 auth-before-fetch와 no-fetch negative matrix를 통합 테스트로 고정해야 한다.
- Confirmation / Follow-up: 비인증, invalid session, local, 일반·불완전 remote, LIKE 메타문자, `profileByHandle`와 nested route에서 lookup 호출이 0인지 확인한다.

### 기존 Fedify public boundary와 API workspace dependency를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-573`
- Status: Active
- Context / Problem: API에는 현재 federation context가 없지만 새 WebFinger/document loader를 만들면 기존 private-address, Instance 상태와 actor identity 검증을 우회한다.
- Decision Outcome: `@kosmo/api`는 public `@kosmo/fedify` workspace export의 `federation.createContext`와 `findOrMaterializeRemoteProfileActor`를 사용한다. 필요한 manifest 변경은 `pnpm`으로 기존 workspace dependency를 추가하며 새 외부 protocol client를 추가하지 않는다.
- Alternatives Considered: API 전용 WebFinger client나 내부 `packages/fedify/src/**` import는 보안·package 경계를 분기하므로 선택하지 않는다. Web BFF에서 materialize하면 API 인증·DB connection 경계와 분리된다.
- Consequences: API가 federation package에 runtime 의존하지만 기존 Fedify SSRF, actor projection, Instance와 idempotent 저장 계약을 그대로 재사용한다.
- Confirmation / Follow-up: package typecheck, dependency manifest·lockfile와 `allowPrivateAddress: false`를 사용하는 public federation context 경계를 확인한다.

### 검색은 저장 actor의 stale refresh를 비활성화한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-573`
- Status: Active
- Context / Problem: 기존 `findOrMaterializeRemoteProfileActor`는 저장 actor가 stale이면 background refresh를 예약하지만 PROD-573은 저장 Profile 검색을 zero-network로 유지한다.
- Decision Outcome: 검색 호출은 materializer의 refresh scheduler를 비활성화한다. 저장 actor는 stale 여부와 관계없이 DB identity만 반환하고, 다른 federation 소비자의 기본 refresh 정책은 바꾸지 않는다.
- Alternatives Considered: 검색에서도 stale refresh를 허용하면 명시적 no-refresh 계약을 위반한다. materializer의 전역 TTL 정책을 제거하면 다른 federation 흐름의 기존 계약을 회귀시킨다.
- Consequences: 검색 결과는 저장 snapshot을 사용하며 최신 actor refresh는 기존 federation 내부 소비자가 계속 소유한다.
- Confirmation / Follow-up: stale 저장 actor 검색에서 WebFinger/object lookup과 예약 callback이 0회인지 검증하고 기존 Fedify stale-refresh test를 유지한다.

### materializer가 반환한 canonical Profile identity로 DB connection을 고정한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-573`; 기존 canonical actor identity 계약 `PROD-248`
- Status: Active
- Context / Problem: 요청 alias domain과 canonical actor URI domain이 다르면 materializer는 canonical Instance의 Profile을 반환하므로 요청 domain 기반 DB 검색만 반복하면 성공한 actor를 누락한다.
- Decision Outcome: explicit remote 준비가 성공하면 materializer가 반환한 Profile ID를 connection DB query의 anchor로 사용하고 기존 cursor와 visibility predicate를 함께 적용한다. 별도 alias Profile을 만들거나 materialized row를 GraphQL connection 밖에서 직접 반환하지 않는다.
- Alternatives Considered: 요청 domain으로 재조회하는 방식은 canonical actor를 누락한다. materializer 결과 객체를 DB visibility 없이 직접 반환하면 staged visibility와 Relay connection 계약을 우회한다.
- Consequences: alias lookup도 canonical `relativeHandle`을 가진 하나의 Profile edge로 수렴하며 pagination/visibility 검증을 유지한다.
- Confirmation / Follow-up: alias domain lookup, suspended/unavailable visibility와 `Profile.id` cursor edge를 PostgreSQL integration test로 확인한다.

### materialization 실패는 빈 결과로 격리하고 unexpected 오류는 관측한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-573`
- Status: Active
- Context / Problem: 원격 네트워크와 identity 검증 실패가 GraphQL 검색 전체를 5xx로 만들면 명시된 검색 결과 없음 fallback을 지킬 수 없고, 모든 오류를 조용히 삼키면 운영 원인을 잃는다.
- Decision Outcome: lookup 없음, unavailable Instance, identity 충돌·검증 실패와 예상하지 못한 materialization 오류는 모두 성공한 빈 connection으로 fallback한다. 예상하지 못한 오류는 fallback 전에 기존 API 관측 경계에 기록한다.
- Alternatives Considered: expected 오류를 GraphQL error로 노출하는 방식은 상위 fallback 계약을 위반한다. unexpected 오류를 기록하지 않는 방식은 운영 진단을 잃는다.
- Consequences: 원격 실패는 사용자에게 결과 없음으로 보이며 내부 unexpected 원인은 관측할 수 있다.
- Confirmation / Follow-up: expected error matrix는 관측 없이 빈 결과, unexpected error는 관측 1회와 빈 결과인지 검증한다.

### 원격 준비 단계만 catch하고 기존 DB 검색 오류는 유지한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-573`
- Status: Active
- Context / Problem: fallback catch가 connection DB query까지 감싸면 PostgreSQL 장애와 기존 검색 회귀도 원격 lookup 실패처럼 빈 결과로 숨겨진다.
- Decision Outcome: 오류 격리 범위는 explicit remote lookup/materialization 준비 단계로 한정한다. 준비가 성공하거나 필요 없으면 기존 DB connection을 실행하고, 이 DB query 오류는 기존 GraphQL error·관측 경계를 따른다.
- Alternatives Considered: resolver 전체 catch는 단순하지만 데이터 조회 장애를 숨기므로 선택하지 않는다.
- Consequences: 원격 dependency 실패만 격리되고 기존 DB 검색의 운영 신호와 오류 semantics는 유지된다.
- Confirmation / Follow-up: materializer 오류와 DB query 오류를 분리한 unit/integration test로 각각 빈 connection과 기존 GraphQL error를 확인한다.

### schema 없는 rollout과 비파괴 rollback을 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-573`
- Status: Active
- Context / Problem: 변경은 기존 actor materialization row를 사용하며 새 API/data contract를 도입하지 않는다.
- Decision Outcome: GraphQL schema와 DB schema·migration을 추가하지 않는다. rollback은 검색의 원격 준비 단계만 제거하고 이미 materialize된 유효 Remote Profile과 actor metadata는 유지한다.
- Alternatives Considered: 별도 search cache/alias table은 승인된 범위와 기존 identity model을 불필요하게 확장한다. rollback 시 row 삭제는 다른 federation 소비자의 유효 identity를 훼손할 수 있다.
- Consequences: 배포·rollback은 API code와 workspace dependency에 한정되며 data cleanup이 없다.
- Confirmation / Follow-up: schema diff·migration 없음과 rollback 뒤 기존 DB-only 검색 및 federation 소비자 호환성을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
