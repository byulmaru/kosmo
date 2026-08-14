## Context

Runtime image에는 `drizzle/`과 `migrate` entrypoint가 포함돼 있고 runner는 Drizzle history와 PostgreSQL advisory lock을 사용한다. 현재 Helm migration Job은 dev에서만 렌더되고 application credential과 mutable `main` image를 사용한다.

PROD-564는 production migration의 공통 실행 경계만 만든다. PROD-269의 expand → transition → contract 정책은 유지되지만 실제 destructive migration의 safety 조건은 구체 schema change에 따라 달라지므로 해당 migration 이슈·PR·release가 소유한다.

## Goals / Non-Goals

**Goals:**

- Production migration이 별도 database credential을 사용하게 한다.
- Migration Job과 모든 활성화 workload가 같은 immutable release digest를 사용하게 한다.
- Migration 실패가 새 workload 활성화를 차단하도록 PROD-563이 소비할 명확한 Job success barrier를 제공한다.
- Dev migration 동작과 기존 Drizzle runner를 유지한다.

**Non-Goals:**

- Generic phase/schema-authority metadata 또는 gate JSON.
- Backup/restore, target LSN, workload compatibility와 rollback-window collector.
- 특정 schema migration, backfill 또는 destructive contract 실행.
- Production runtime/Secret provisioning, 일반 release workflow와 첫 release 검증.

## Implementation Guidance

### Recommended Approach

1. Production에서 migration이 명시적으로 enabled일 때만 기존 Helm Job을 렌더한다.
2. Production render는 `imageDigest=sha256:...`를 요구하고 모든 활성화 workload와 같은 `image@digest` helper를 사용한다.
3. Job은 migration 전용 Secret의 `username`과 `password`만 읽는다. Host, port와 database는 현재 Helm release의 production PostgreSQL로 고정하고 `migrate`를 실행한다.
4. Credential, advisory lock, SQL 또는 timeout 실패는 Job failure로 반환한다. PROD-563은 이 Job 성공 뒤에만 workload 활성화를 진행한다.
5. 실제 destructive migration은 별도 이슈와 release에서 repository migration policy에 따른 구체 evidence gate를 구현한다.

### Known Traps

- Migration 장애를 runtime credential 재사용으로 우회하지 않는다.
- Database URL, host, database 또는 Secret 이름/key를 release 입력으로 열지 않는다.
- Mutable tag, SemVer tag 또는 Git SHA tag를 immutable digest와 동일하게 취급하지 않는다.
- Phase, schema authority, restore command와 generic evidence JSON을 Helm migration Job에 추가하지 않는다.
- Generic gate가 모든 destructive migration의 안전 조건을 대신한다고 가정하지 않는다.
- Contract SQL을 transition image에 미리 포함하지 않는다.

## Risks / Trade-offs

- Generic contract gate를 제공하지 않으므로 실제 destructive migration 이슈가 backup/restore, workload compatibility와 rollback window를 빠뜨리지 않아야 한다. 이 책임은 `memory/database-migrations.md`의 issue/PR/release 분리 정책과 해당 migration 리뷰에서 검증한다.
- Migration Job은 image의 pending Drizzle migration을 모두 실행하므로 phase별 SQL 선택은 release/image 분리로 보장해야 한다.
- 자동 database rollback을 제공하지 않으므로 실패 후 같은 release 재시도 또는 forward migration을 사용한다.

## Migration Plan

1. Production Helm render와 전용 Secret/digest 경계를 추가한다.
2. Dev/prod render, invalid digest와 missing Secret failure를 검증한다.
3. PROD-563이 migration Job success를 workload activation barrier로 연결한다.
4. PROD-565가 실제 첫 release에서 통합 동작을 검증한다.

이미 적용된 migration은 자동으로 되돌리지 않는다.

## Open Questions

없음.
