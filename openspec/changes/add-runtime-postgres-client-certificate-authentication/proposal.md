## Why

API/Web BFF와 trusted federation/Temporal Worker 경로는 아직 PostgreSQL owner credential을 사용한다. RLS 전환에는 `kosmo_api`와 `kosmo_worker`라는 비소유 identity가 먼저 필요하지만, 역할 생성과 실제 workload 인증 전환을 같은 배포 단위로 묶으면 rollback과 production 승인 경계가 커진다.

CloudNativePG 1.30은 standalone `DatabaseRole`마다 client certificate를 자동 발급·갱신할 수 있다. 따라서 PROD-369은 역할과 아직 소비하지 않는 인증서만 additive하게 준비하고, PROD-470은 그 인증서를 선택한 API/Worker 연결에만 사용하는 후속 인증 계약을 소유한다.

## What Changes

- PROD-369은 모든 Helm 배포 환경에 `kosmo_api`와 `kosmo_worker` DatabaseRole을 추가한다. 두 역할은 password를 비활성화하고 CNPG 역할별 client certificate 발급을 사용한다.
- CNPG는 `<DatabaseRole metadata.name>-client-cert` Secret의 `tls.crt`/`tls.key`와 `status.clientCertificate.expiration`을 관리한다. VaultStaticSecret, Vault password source와 `passwordSecret`은 만들지 않는다.
- API는 `BYPASSRLS=false`, Worker는 `BYPASSRLS=true`이며 두 역할 모두 owner/migration/상대 역할 membership과 상승 권한을 갖지 않는다.
- PROD-470은 같은 change 안에서 역할별 `pg_hba` 규칙, generated Secret과 Cluster CA mount, connection parameter와 회전 restart를 선택적으로 연결한다. 이 작업은 PROD-369 PR에서 구현하지 않는다.
- 기존 owner `kosmo`, `kosmo_migration` LOGIN→`SET ROLE kosmo`, CNPG replication, local/legacy password·SCRAM, 객체 ACL/RLS와 workload selector는 변경하지 않는다.
- PR merge와 CI 성공은 production apply 승인이 아니다. Production sync/apply는 사용자의 별도 명시적 승인 전에는 수행하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 제품 도메인 문서는 없다. 저장소 rollout 규칙은 `memory/database-migrations.md`, production migration identity는 `docs/operations/production-migrations.md`를 따른다.
- Linear Contracts: `PROD-369`, `PROD-470`
- Implementation ownership:
  - `PROD-369`: DatabaseRole, role attribute, password 비활성화, client certificate 발급과 provisioning 검증
  - `PROD-470`: 선택적 `pg_hba`, certificate/CA mount, connection 소비와 회전 검증
- Archive ownership: PROD-470 구현과 shared integration verification까지 완료한 담당자가 change 전체를 archive한다. PROD-369 PR은 archive하지 않는다.

## Capabilities

### New Capabilities

- `runtime-postgres-client-certificate-authentication`: API/Worker 비소유 역할의 CNPG client certificate 발급과 선택적 PostgreSQL certificate 인증 계약.

### Modified Capabilities

없음.

## Impact

- `apps/helm`: PROD-369은 두 standalone DatabaseRole만 추가하고 기존 runtime VaultStaticSecret을 제거한다. PROD-470은 후속 PR에서 Cluster와 workload certificate 소비 경계를 변경한다.
- PostgreSQL authorization: `kosmo_api`, `kosmo_worker` role attribute와 password 부재. 객체 GRANT/RLS는 포함하지 않는다.
- Kubernetes Secret: CNPG가 역할별 client certificate Secret을 생성·갱신·삭제한다. Helm이나 VSO가 해당 Secret data를 소유하지 않는다.
- Rollout: PROD-369은 기존 workload를 재시작하거나 인증 방식을 바꾸지 않는다. PROD-470까지 완료돼야 generated certificate가 실제 연결에 사용된다.
