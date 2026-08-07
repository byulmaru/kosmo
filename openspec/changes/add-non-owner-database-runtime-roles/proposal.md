## Why

현재 API와 federation/system runtime은 PostgreSQL database·table owner인 `kosmo` credential을 공유하므로 RLS를 적용해도 owner bypass를 막을 수 없다. PROD-369은 기존 workload와 rollback 경로를 건드리지 않는 Expand 단계로서, 후속 RLS policy가 참조할 안정적인 비소유 역할과 credential만 먼저 선언한다.

## What Changes

- API runtime용 비소유 LOGIN 역할과 별도 basic-auth credential Secret을 선언적으로 추가한다.
- federation/system runtime용 비소유 LOGIN 역할과 별도 basic-auth credential Secret을 선언적으로 추가한다.
- 두 runtime 역할의 LOGIN, role attribute, membership과 password credential만 선언하고 객체 권한은 부여하지 않는다.
- 기존 `kosmo` owner workload credential, `kosmo_migration` LOGIN→`SET ROLE kosmo` 계약과 workload의 Secret 선택은 그대로 유지한다.
- 공통 객체 GRANT/default privilege는 후속 PROD-724에, Post/PostContent RLS policy와 role별 grant는 PROD-713/714에 남긴다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. 저장소 rollout 규칙은 `memory/database-migrations.md`, production migration identity 보존 계약은 `docs/operations/production-migrations.md`를 따른다.
- Linear Contract: `PROD-369`
- Linear Implementations: 없음. `PROD-369`이 OpenSpec, 구현, 검증과 archive를 함께 소유한다.

## Capabilities

### New Capabilities

- `database-runtime-roles`: 기존 owner workload와 병행 가능한 API/system 비소유 PostgreSQL LOGIN 역할과 credential provisioning 계약.

### Modified Capabilities

없음.

## Impact

- `apps/helm`: production CloudNativePG `DatabaseRole`, Vault Secrets Operator basic-auth Secret projection과 관련 render 검증.
- PostgreSQL authorization: `kosmo_api`, `kosmo_system` role attribute와 membership 경계. 객체 GRANT는 포함하지 않는다.
- 후속 관계: PROD-724와 PROD-713/714가 이 change가 고정한 역할 이름을 참조한다. 이 change는 객체 privilege, workload credential 전환이나 RLS policy를 포함하지 않는다.
