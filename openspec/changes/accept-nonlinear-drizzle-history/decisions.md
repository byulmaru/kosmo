## Context

이 결정 기록은 PR #495 병합 뒤 dev PreSync 실패, 현재 dev DB와 main의 30개 migration name/hash 대조, 수정된 `PROD-656`, `docs/operations/production-migrations.md`와 `memory/database-migrations.md`를 반영한다. 파일별 transaction 경계는 유지하되 기존 Drizzle history를 strict prefix로 해석한 결정을 교정한다.

## Decision Records

### 적용된 history를 name과 hash의 집합으로 검증한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`
- Status: Active
- Context / Problem: Drizzle migration folder의 timestamp 정렬은 생성 순서이고 DB history `id`는 실제 적용 순서다. 병렬 branch가 timestamp와 다른 순서로 merge·배포되면 두 순서는 정상적으로 다를 수 있다. PROD-656의 strict prefix 검증은 name/hash가 모두 같은 dev history를 거부했다.
- Decision Outcome: 적용된 각 DB history row의 name이 local migration에 존재하고 hash가 같은지 검증한다. DB와 local의 순서 일치는 요구하지 않는다. Local에 없는 history, 같은 name의 hash 변경, 중복 name/history는 SQL 실행 전에 거부한다.
- Alternatives Considered: Strict prefix 검증은 정상적인 비선형 merge history를 거부해 제외했다. Name-only 검증은 적용 SQL 변조를 감지하지 못해 제외했다. DB history를 local 순서로 재작성하는 방식은 실제 적용 증거를 훼손하므로 제외했다.
- Consequences: 이미 적용된 파일의 무결성은 name/hash로 유지되지만 실제 적용 순서는 validation invariant가 아니다. Migration 작성과 review는 branch merge 순서와 무관하게 새 pending 파일 자체의 dependency를 검토해야 한다.
- Confirmation / Follow-up: 실제 dev의 6개 순서 역전 쌍을 포함한 fixture에서 no-op과 추가 pending 적용을 검증하고, dev PreSync 성공 뒤 history가 바뀌지 않았는지 확인한다.

### Pending migration은 적용된 name을 제외해 선택한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-656`
- Status: Active
- Context / Problem: `history.length`로 local migration 배열을 자르면 DB 적용 순서가 local 정렬과 다를 때 이미 적용된 파일을 다시 실행하거나 미적용 파일을 건너뛸 수 있다.
- Decision Outcome: 검증된 DB name 집합에 없는 local migration만 pending으로 선택하고 `readMigrationFiles()`가 제공한 version-control 순서를 유지해 파일별 transaction으로 실행한다.
- Alternatives Considered: History의 마지막 row 또는 최대 timestamp 뒤 suffix만 실행하는 방식은 나중에 merge된 오래된 timestamp migration을 놓쳐 제외했다. 전체 local migration을 재실행하고 idempotency에 의존하는 방식은 기존 SQL이 재실행 안전하지 않아 제외했다.
- Consequences: 정상적인 비선형 history에서 no-op과 incremental 실행이 가능하다. Pending 선택 전 전체 적용 history의 name/hash 검증이 필수다.
- Confirmation / Follow-up: 비선형 applied set 뒤에 중간 timestamp와 최신 timestamp pending을 둔 integration에서 둘 다 한 번만 local 순서로 적용되는지 확인한다.

### Legacy history는 timestamp와 hash로 migration name에 대응한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-656`
- Status: Active
- Context / Problem: Name column이 없는 legacy Drizzle history는 DB row 위치와 local 정렬을 비교해서는 비선형 적용 이력을 안전하게 승격할 수 없다.
- Decision Outcome: 기존 Drizzle beta.22 승격 의미와 호환되게 timestamp 후보를 먼저 찾고 필요한 경우 hash로 대응한다. 모든 DB row가 고유한 local migration에 대응된 뒤에만 name/applied_at shape를 같은 transaction에서 승격한다.
- Alternatives Considered: Row index 기반 backfill은 이번 dev 실패와 같은 순서 차이에서 잘못된 name을 기록해 제외했다. History를 버리고 다시 baseline하는 방식은 실제 적용 schema를 증명하지 못해 제외했다.
- Consequences: Legacy history의 기존 적용 순서를 보존하면서 current name/hash 검증으로 전환할 수 있다. 대응하지 않는 row가 있으면 운영 판단 전까지 migration이 차단된다.
- Confirmation / Follow-up: 비선형 legacy fixture, 동일 timestamp hash 구분, 알 수 없는 hash와 승격 transaction rollback을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `openspec/changes/archive/2026-08-03-run-drizzle-migrations-per-file/decisions.md`의 **적용된 history를 순서 prefix와 hash로 검증한다** 결정을 2026-08-04의 **적용된 history를 name과 hash의 집합으로 검증한다** 결정이 대체한다. Strict prefix가 기존 Drizzle beta.22의 name 기반 history와 실제 dev의 정상적인 비선형 적용 순서를 거부한다는 운영 증거가 확인됐기 때문이다.
