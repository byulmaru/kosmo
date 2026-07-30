# Production migration gate

## 책임 경계

Production migration은 API/Web과 같은 immutable image digest를 사용하지만 database 권한은 분리한다.

- PROD-562는 production migration 전용 database identity와 Kubernetes Secret을 준비한다.
- PROD-564의 Helm Job은 그 Secret의 `url` key만 `DATABASE_URL`로 읽는다. Secret이 없으면 Job 생성이 실패하며 runtime database credential로 fallback하지 않는다.
- API/Web의 일반 runtime Secret을 migration용으로 복제하지 않고 migration Job에도 노출하지 않는다.
- PROD-563은 release pipeline에서 이 gate를 호출하고 migration 성공 전에는 API/Web을 활성화하지 않는다.
- PROD-565는 실제 첫 production release와 public smoke를 검증한다.

Migration database identity에는 schema migration에 필요한 권한과 contract restore point 생성을 위한 `pg_checkpoint` role만 부여한다. API/Web database identity에는 DDL 또는 `pg_checkpoint` 권한을 부여하지 않는다.

## Gate 입력

`scripts/production-migration-gate.mjs`는 secret이 없는 JSON document를 입력받는다. `releaseImage`, `migrationImage`, `apiImage`, `webImage`는 모두 같은 `repository@sha256:<digest>`여야 한다. `phase`는 `expand`, `transition`, `contract` 중 하나이고 `schemaAuthority`는 해당 schema change의 Linear issue 또는 승인 문서를 가리킨다.

```json
{
  "phase": "transition",
  "schemaAuthority": "PROD-700",
  "releaseImage": "ghcr.io/byulmaru/kosmo@sha256:...",
  "migrationImage": "ghcr.io/byulmaru/kosmo@sha256:...",
  "apiImage": "ghcr.io/byulmaru/kosmo@sha256:...",
  "webImage": "ghcr.io/byulmaru/kosmo@sha256:..."
}
```

```sh
node scripts/production-migration-gate.mjs preflight /path/to/gate-context.json
```

같은 release를 재시도할 때는 `retryOf.releaseImage`에 최초 digest를 넣는다. 다른 digest로 바뀌면 재시도가 아니라 새 release이므로 gate가 거부한다.

## Contract 입력과 실행 순서

Contract context는 일반 필드 외에 다음 비민감 evidence를 포함한다.

- Recovery window 안의 completed base backup과 이후 WAL chain의 연속성
- 성공했고 월간 주기가 overdue가 아닌 PROD-546 restore rehearsal reference
- migration 직전에 생성한 named restore point와 target/archived-through WAL
- Kubernetes에서 실행 직전에 조회한 active, preview, rollback workload 이름·역할·digest
- Schema authority가 승인한 compatible image allowlist와 rollback window 종료 시각

Production pipeline은 운영자가 작성한 workload 목록을 그대로 신뢰하지 않는다. `kubectl get rollout,replicaset,pod -n kosmo-prod -o json`과 active/preview Service selector를 같은 실행에서 조회해 `source: kubernetes-live`, `observedAt`과 함께 context를 생성한다. Retained ReplicaSet 중 rollback 후보도 빠짐없이 `rollback`으로 분류한다. Secret, connection string, backup object key와 database row 값은 context, artifact, log에 넣지 않는다.

순서는 다음과 같다.

1. Live workload와 PROD-546 evidence로 자동 preflight context를 만든다.
2. Migration image에서 `contract-restore-point`를 migration Secret으로 실행한다.
3. Command가 `targetWal`과 같거나 이후인 `archivedThroughWal`을 반환할 때까지 기다린다.
4. 결과를 contract context에 넣고 live workload를 다시 조회한 뒤 자동 gate를 실행한다. Workload observation이 restore point보다 오래되면 gate가 거부한다.
5. `.github/workflows/production-contract-approval.yml`을 호출한다.
6. Workflow가 `production-contract` Environment에 required reviewer가 실제로 설정되고 administrator bypass가 금지됐는지 확인한다.
7. Reviewer는 exact context SHA-256을 승인한다. 승인 후 같은 JSON을 재검증해 반환한 SHA-256이 달라지면 중단한다.
8. PROD-563 pipeline이 같은 digest의 migration Job을 실행하고 성공을 기다린다.
9. 성공 결과에 대해서만 `complete`를 실행하고 `workloadActivationAllowed: true`를 후속 활성화 조건으로 사용한다.

Restore point command는 WAL 전환을 강제하지 않는다. 실제 workload 또는 `archive_timeout`으로 target segment가 archive될 때까지 기본 10분 동안 기다린다.

```sh
RESTORE_POINT_NAME="contract-PROD-700-20260730T000000Z" \
  docker run --rm \
  --env-file /run/secrets/migration-database \
  "ghcr.io/byulmaru/kosmo@sha256:..." \
  contract-restore-point
```

실제 Kubernetes Job에서는 `--env-file`을 쓰지 않고 Helm의 migration Secret `secretKeyRef`를 사용한다. 위 예시는 command interface 설명용이며 credential 값을 shell history에 직접 쓰면 안 된다.

Migration 완료 후 pipeline은 다음 형태의 비민감 결과를 기록한다.

```json
{
  "status": "succeeded",
  "releaseImage": "ghcr.io/byulmaru/kosmo@sha256:...",
  "phase": "contract",
  "schemaAuthority": "PROD-700",
  "databaseRollbackAttempted": false
}
```

```sh
APPROVED_CONTRACT_CONTEXT_SHA256="PROTECTED_WORKFLOW_OUTPUT" \
  node scripts/production-migration-gate.mjs complete \
  /path/to/gate-context.json \
  /path/to/migration-result.json
```

`APPROVED_CONTRACT_CONTEXT_SHA256`는 `production-contract` protected workflow의 `approved-context-sha256` output만 사용한다. Contract context 파일의 byte가 하나라도 달라지면 completion gate가 실패한다. Expand/transition에는 이 output이 필요하지 않다.

## 실패와 복구

- Credential 또는 Secret 실패: SQL을 실행하지 않는다. Runtime credential로 우회하지 않는다.
- Preflight 실패: migration Job을 시작하지 않는다. Live evidence를 새로 조회한 뒤 같은 digest로 재시도한다.
- Advisory lock 실패: 다른 migration을 확인하고 종료된 뒤 같은 digest로 재시도한다.
- SQL 또는 timeout 실패: API/Web 활성화를 중단한다. Drizzle history를 수동 성공 처리하지 않는다.
- Contract approval 없음: migration을 시작하지 않는다. 일반 production approval을 대신 사용하지 않는다.
- 부분 적용: 자동 down migration이나 database rollback을 실행하지 않는다. 같은 digest 재시도, 새 forward migration, 또는 승인된 PITR restore 중 하나를 schema authority와 운영자가 선택한다.
- Restore 선택: [Production PostgreSQL backup과 복구](./postgres-backup.md)의 격리 restore 절차로 먼저 복구 가능성을 확인하고 승인된 rollback window 안에서 실행한다.

완료 여부와 Drizzle migration count/hash 같은 비민감 식별 정보만 감사 기록에 남긴다. Credential, row 값과 backup object key는 출력하지 않는다.
