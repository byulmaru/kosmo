## 1. PROD-564 Production migration 실행 경계

**Authority / Provenance**

- `PROD-564`
- `PROD-269`
- `memory/database-migrations.md`

**Deliverable**

Production migration Job이 별도 database credential과 모든 활성화 workload와 같은 immutable digest로 기존 Drizzle migration을 실행하며, 실패 시 같은 release의 workload 활성화를 차단할 수 있는 명확한 Job 결과를 제공한다.

**Guardrails**

- 특정 schema migration, backfill 또는 generic destructive migration evidence gate를 추가하지 않는다.
- PROD-562 runtime/Secret provisioning, PROD-563 일반 release pipeline과 PROD-565 첫 release 검증을 구현하지 않는다.
- 기존 Drizzle history와 advisory lock을 유지하고 phase-aware runner나 별도 migration history를 만들지 않는다.
- Migration Job에 phase, schema authority, restore command 또는 gate JSON을 추가하지 않는다.
- Secret과 connection string을 repository, artifact 또는 workflow log에 남기지 않는다.

**Verification**

- Helm dev/prod render에서 별도 migration Secret, 동일 digest와 dev 회귀를 검증한다.
- Invalid digest가 render 단계에서 실패하고 migration Job이 고정된 Secret의 `username/password`만 참조하는지 검증한다.
- Production migration Job의 유일한 command가 `migrate`이고 gate/restore concern이 없는지 검증한다.
- OpenSpec strict validation과 repository format/lint를 통과한다.

- [x] 1.1 Production migration Job이 고정된 database target과 별도 migration Secret의 `username/password`만 사용하고 runtime credential로 fallback하지 않게 한다.
- [x] 1.2 Migration Job과 모든 활성화 workload가 동일한 immutable image digest를 렌더하게 한다.
- [x] 1.3 Migration Job을 기존 `migrate` command만 실행하는 단순 실행기로 유지하고 phase/schema-authority/restore 분기를 제거한다.
- [x] 1.4 Credential, lock, SQL과 timeout 실패 뒤 workload 차단·같은 release 재시도·forward recovery 경계를 운영 문서에 기록한다.
- [x] 1.5 Dev/prod render, invalid digest, missing Secret, lint/format과 OpenSpec strict validation을 통과하고 PR을 Ready로 갱신한다.
