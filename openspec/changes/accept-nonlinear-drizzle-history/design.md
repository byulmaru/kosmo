## Context

PR #495는 Drizzle의 공개 migration reader와 Kosmo의 파일별 transaction executor를 결합했다. 그러나 history 검증과 pending 선택을 DB `id` 순서와 로컬 timestamp 정렬의 prefix 비교로 구현했다. Dev DB에는 현재 main의 30개 migration name/hash가 모두 존재하지만 병렬 브랜치 merge·배포 때문에 6쌍의 적용 순서가 로컬 정렬과 다르며, PreSync Job은 첫 순서 차이에서 SQL 실행 전에 실패했다.

Drizzle ORM 1.0.0-beta.22의 PostgreSQL migrator는 적용된 `name` 집합으로 pending을 고르고, legacy history 승격은 timestamp와 hash로 각 DB row를 로컬 migration에 대응시킨다. Kosmo runner는 이 history 의미를 유지하면서 각 pending 파일의 SQL과 history insert만 독립 transaction으로 실행해야 한다.

## Goals / Non-Goals

**Goals:**

- 정상적인 비선형 적용 순서를 기존 Drizzle history로 인식한다.
- 적용된 migration의 name/hash 변조, 누락된 로컬 파일과 중복 history는 실행 전에 차단한다.
- pending 파일의 version-control 순서와 파일별 schema/history atomicity를 유지한다.
- dev의 실제 순서 역전과 동등한 비선형 history fixture를 검증하고 PreSync/no-op 운영 증거를 남긴다.

**Non-Goals:**

- Dev 또는 production history row를 재정렬하거나 수동 성공 처리하지 않는다.
- Drizzle dependency를 업데이트하거나 upstream migrator로 전환하지 않는다.
- 파일별 transaction, advisory lock, migration role, Helm command interface를 재설계하지 않는다.
- Follow Request Notification 기능을 이 변경에 포함하지 않는다.

## Implementation Guidance

### Current Constraints

- `readMigrationFiles()`는 로컬 migration을 timestamp/name 순서로 제공하지만 DB `id`는 실제 적용 순서를 나타내므로 둘은 병렬 브랜치에서 일치하지 않을 수 있다.
- 현재 validator는 동일 index의 name/hash를 비교하고 `history.length`로 pending suffix를 자르므로 순서 차이가 있는 정상 history를 거부한다.
- 현재 fresh-DB smoke는 스스로 만든 정렬 history만 재실행해 existing DB 호환성을 검증하지 않는다.
- Legacy history는 name이 없을 수 있으므로 단순 name 집합만으로는 승격할 수 없다.

### Recommended Approach

- 로컬 migration을 name으로 색인하고 중복 local name을 먼저 거부한다.
- Current history의 각 row에 대해 name 존재, local 대응과 hash 일치를 검증하고 DB 중복 name을 거부한다. DB row 순서는 검증 조건으로 사용하지 않는다.
- Pending 목록은 local migration 중 적용된 name 집합에 없는 항목으로 계산한다. 이 목록은 `readMigrationFiles()`가 제공한 version-control 순서를 유지한다.
- Legacy history는 Drizzle beta.22와 같은 timestamp 후보 및 hash fallback으로 각 row의 name을 식별하고, 모든 row를 고유하게 대응한 뒤 같은 transaction에서 history shape를 승격한다.
- 실제 dev의 name 순서처럼 local 정렬과 다른 applied history를 구성해 no-op과 추가 pending 적용을 모두 검증한다.

### Allowed Alternatives

- Legacy 매핑은 동일한 observable 결과를 제공한다면 timestamp 우선 뒤 hash fallback 대신 고유 hash 직접 매핑을 사용할 수 있다. 다만 같은 hash 중복과 기존 Drizzle 승격 호환성을 별도 fixture로 증명해야 한다.
- Pending 계산은 local 배열 filter 또는 검증된 name map iteration 중 하나를 사용할 수 있으나 local reader 순서를 보존해야 한다.

### Known Traps

- DB history를 local 정렬에 맞게 update/reinsert하면 실제 적용 순서와 감사 증거를 훼손한다.
- Name만 비교하고 hash를 생략하면 적용된 SQL 변조를 놓친다.
- `history.length`로 local 배열을 slice하면 비선형 history에서 이미 적용된 파일을 재실행하거나 pending을 건너뛸 수 있다.
- Fresh DB replay만 성공시키면 이번 dev 회귀를 다시 놓친다.
- Private Drizzle subpath helper에 의존하면 dependency update 시 runtime image가 깨질 수 있다.

## Risks / Trade-offs

- [적용 순서를 무결성 조건에서 제외하면 의존 순서 오류를 놓칠 수 있음] → 이미 적용된 migration은 name/hash로 실제 SQL identity를 검증하고, 새 pending 파일은 계속 local version-control 순서로만 실행한다.
- [Legacy row의 timestamp가 오래된 Drizzle 기록 방식과 다를 수 있음] → hash fallback을 유지하고 대응하지 않는 row가 하나라도 있으면 history 변경 전에 실패한다.
- [현재 dev에 pending이 없어 파일 transaction 실실행을 다시 증명하지 못함] → disposable PostgreSQL integration에서 비선형 existing history 뒤의 pending 파일과 enum add/use를 검증하고, dev에서는 first no-op PreSync와 후속 no-op sync를 관찰한다.

## Migration Plan

1. Active specs, runbook과 database migration memory의 prefix 표현을 name/hash 집합 계약으로 수정한다.
2. Runner와 regression suite를 수정하고 fresh replay, 비선형 existing history, pending resume와 enum add/use를 실행한다.
3. 후속 PR을 merge해 최신 main Docker Build와 Deploy Dev PreSync Job 성공을 확인한다.
4. 같은 release 또는 후속 sync에서 migration command가 history/schema 변경 없이 no-op 성공하는지 확인한다.
5. 실패하면 workload restart를 진행하지 않고 새 forward fix를 배포한다. Dev history를 수동 변경하지 않는다.

## Open Questions

없음.
