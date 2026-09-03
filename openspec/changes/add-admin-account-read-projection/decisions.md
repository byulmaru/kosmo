## Context

이 기록은 PROD-691의 Account 목록·상세 계약과 현재 SvelteKit Admin runtime, Account UUIDv7 schema를
대조해 구현 전에 확정한 선택을 정리한다.

## Decision Records

### Account ID keyset pagination

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/admin-console-read.md`, `docs/architecture/admin-console.md`,
  `PROD-691`
- Status: Active
- Context / Problem: Account 목록은 운영 중 row가 추가되어도 안정적인 순서와 페이지 경계가 필요하다.
- Decision Outcome: UUIDv7 Account ID를 역순 정렬과 opaque cursor 값으로 함께 사용하고 페이지 크기는 50개로
  고정한다.
- Alternatives Considered: offset pagination은 삽입 중 중복·누락 위험이 있고, 생성 시각 cursor는 ID와 별도
  tie-breaker가 필요해 선택하지 않았다.
- Consequences: 다음 페이지는 현재 cursor보다 작은 ID를 조회하고 이전 페이지도 ID keyset 경계로 계산한다.
- Confirmation / Follow-up: DB-backed query test에서 정렬, 50개 경계와 이전·다음 cursor를 확인한다.

### SvelteKit server loader에서 read query 직접 호출

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/admin-console.md`, `PROD-689`, `PROD-691`
- Status: Active
- Context / Problem: Admin 화면만 사용하는 read projection에 별도 transport나 state-changing service 경계가
  필요한지 정해야 한다.
- Decision Outcome: 목록·상세 loader가 공용 database handle을 사용하는 read query 계층을 직접 호출한다.
- Alternatives Considered: 별도 REST, GraphQL 또는 pass-through application service는 현재 단일 server-rendered
  consumer에 계약과 운영 경계를 추가하므로 선택하지 않았다.
- Consequences: query 결과가 곧 page data의 서버 입력이며 browser bundle에는 database code가 포함되지 않는다.
- Confirmation / Follow-up: production build와 loader test에서 server-only import 경계를 확인한다.

### 필요한 shadcn-svelte component source만 소유

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/admin-console.md`, `PROD-691`
- Status: Active
- Context / Problem: Account table과 상태 표시에 일관된 기본 UI가 필요하지만 Admin 전용 대형 component layer는
  필요하지 않다.
- Decision Outcome: 현재 화면이 사용하는 shadcn-svelte source component만 Admin package에 생성하고 직접
  조합한다.
- Alternatives Considered: 모든 component 설치와 공용 UI package는 사용하지 않는 코드와 결합을 늘리고,
  무스타일 직접 구현은 이후 화면의 기본 상호작용 일관성을 낮춰 선택하지 않았다.
- Consequences: Admin은 자체 Svelte UI source와 필요한 최소 styling dependency를 소유한다.
- Confirmation / Follow-up: 생성된 component와 runtime dependency가 실제 화면에서 사용되는지 diff review로
  확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
