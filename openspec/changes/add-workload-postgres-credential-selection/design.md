## Context

현재 `apps/helm/templates/_helpers.tpl`의 database URL은 `kosmo` owner username, CloudNativePG read-write Service와 `$(DATABASE_PASSWORD)`를 고정한다. API와 Web Rollout은 모두 `<release>-postgres-app` Secret의 `password`를 `DATABASE_PASSWORD`로 주입하고 같은 URL helper를 사용한다. Web 프로세스는 login/logout 등 BFF의 직접 DB 경로와 Fedify system 경로를 함께 실행하며 둘 다 전역 DB singleton을 사용한다.

Production migration Job은 별도 `<release>-postgres-migration` basic-auth Secret과 `DATABASE_MIGRATION_ROLE=kosmo`를 사용하고, dev migration Job만 기존 owner `-app` fallback을 사용한다. `docs/operations/production-migrations.md`는 migration host/database/Secret을 release 입력으로 받지 않는 고정 경계를 소유한다. 사용자는 PROD-709에서 이 기존 migration 경계를 유지하고 runtime selector가 침범하지 않는 방식으로 확정했다.

PROD-706은 system action에 명시적 DB connection 객체를 전달할 기반을 소유하고, PROD-710/715는 Web 프로세스의 federation/system SQL과 credential 전환을 소유한다. 후속 PROD-470은 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT` file 환경을 제공하는 TLS 계약을 소유한다. 이 change는 역할별 password URL 입력만 추가하고 두 번째 connection/client 생성·사용이나 PKI resource/runtime TLS 동작을 가져오지 않는다.

## Goals / Non-Goals

**Goals:**

- 하나의 API PostgreSQL URL과 password Secret source를 API Rollout과 Web BFF 기본 연결에 공통 적용한다.
- Web 프로세스의 federation/system 전용 DB connection용 PostgreSQL URL과 password Secret source를 API 기본 연결과 별도로 제공한다.
- 비활성 기본값에서 현재 manifest와 runtime 연결을 보존한다.
- URL과 Secret name/key를 하나의 atomic 선택으로 검증해 custom 값과 owner fallback이 섞이지 않게 한다.
- Production/dev migration 연결을 runtime 선택과 독립된 기존 경계로 유지한다.
- image와 역할별 credential 선택을 각각 독립적으로 rollback할 수 있게 한다.
- 후속 file-based TLS 설정이 별도 Helm 입력과 env/volume으로 합성될 공간을 유지한다.

**Non-Goals:**

- 실제 Kubernetes Secret value, PostgreSQL role, membership, grant, default privilege 또는 RLS policy 생성.
- API 또는 system workload의 non-owner credential 실제 선택과 production 전환.
- Production migration host/database/Secret selector 또는 migration 실행 계약 변경.
- VaultPKISecret, certificate volume, PostgreSQL TLS client configuration 또는 client-certificate 인증.
- API와 Web BFF에 서로 다른 DB 인증 source 추가.
- API와 federation을 별도 Kubernetes workload로 분리.

## Implementation Guidance

### Current Constraints

- Kubernetes container env의 `DATABASE_URL` 안 `$(DATABASE_PASSWORD)` 확장은 앞서 선언된 같은 이름의 env를 참조한다. URL과 Secret selector 중 일부만 적용하면 custom endpoint와 owner password 또는 그 반대가 조합될 수 있다.
- `packages/core/db/index.ts`는 `process.env.DATABASE_URL`로 하나의 singleton Postgres.js client를 생성한다. 이번 변경은 runtime code나 connection factory를 늘릴 필요가 없다.
- Helm chart에는 values schema와 render regression test가 없어 unknown values가 조용히 무시된다. Default render와 각 opt-in 조합을 실행 가능한 검증으로 고정해야 한다.
- Chart의 실제 workload 이름은 `api`와 `web`이다. `kosmo_api` source는 두 Rollout의 기본 DB 경로가 공유하고, `kosmo_system` source는 Web 프로세스의 federation/system 전용 DB connection에만 대응한다.
- Production migration Job은 `DATABASE_URL`이 아니라 고정 PG environment와 migration Secret을 사용한다. Runtime helper를 migration template에 재사용하면 기존 운영 계약이 깨진다.

### Recommended Approach

`postgres.credentials.api`와 `postgres.credentials.system` 아래에 각각 빈 기본값의 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 둔다. 세 값이 모두 비어 있으면 기존 API/Web 기본 env를 그대로 렌더하고 system 전용 env는 추가하지 않는다. API 세 값이 모두 채워지면 API와 Web의 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 같은 source를 사용한다. System 세 값이 모두 채워지면 Web에만 `SYSTEM_DATABASE_URL`/`SYSTEM_DATABASE_PASSWORD`를 추가하고 기존 기본 env는 유지한다. 일부만 채워진 경우 template helper가 `fail`로 render를 거부한다.

API database URL은 secret value를 포함하지 않고 `$(DATABASE_PASSWORD)`를, system database URL은 `$(SYSTEM_DATABASE_PASSWORD)`를 참조하는 문자열로 받는다. API와 Web의 기본 env는 같은 API source helper를 사용하고 Web만 system env helper를 추가하되 migration template은 기존 helper/PG environment 분기를 그대로 유지한다. 값 구조와 helper는 후속 TLS enablement가 역할 기반 file env를 합성할 수 있도록 TLS resource나 file env를 소유하지 않는다.

Default dev/prod render를 변경 전 snapshot과 비교하고, API 공유 source, Web-only system source, 양쪽 custom, 불완전 입력 실패 및 각 selector 제거 rollback을 검사하는 Helm render regression을 추가한다. Production migration 부분은 모든 runtime opt-in 조합에서 동일하게 남아야 한다.

### Allowed Alternatives

동일한 values 공개 계약, atomic validation, default render 동일성 및 migration 비침범을 유지한다면 helper 내부 구현은 dict 전달 또는 workload별 작은 helper로 구성할 수 있다. 테스트는 shell 또는 Node 기반 render assertion 중 repository에서 유지하기 쉬운 형식을 사용할 수 있다.

### Known Traps

- `default`를 각 필드에 독립 적용해 URL과 Secret selector 일부를 owner fallback과 섞지 않는다.
- Secret value나 password가 포함된 완성 connection string을 values, rendered manifest, test fixture 또는 로그에 넣지 않는다.
- API와 Web에 별도 credential values를 만들어 같은 `kosmo_api` source가 drift할 수 있게 하지 않는다.
- System source로 Web의 기본 `DATABASE_URL`을 바꾸거나 API Rollout에 system env를 주입하지 않는다.
- Runtime selector를 dev migration의 owner fallback이나 production migration PG environment에 전달하지 않는다.
- PROD-470의 unmerged PKI helper/resource를 복사하거나 현재 change의 authority로 사용하지 않는다.

## Risks / Trade-offs

- [Values 공개 surface가 늘어남] → API와 system에 동일한 최소 세 필드만 제공하고 migration 및 TLS surface는 각 소유 계약에 남긴다.
- [사용자가 password 없는 URL을 전달함] → Helm은 Secret reference의 완전성만 검증할 수 있다. 실제 URL semantic과 credential 성공은 downstream transition smoke가 검증한다.
- [Default manifest의 공백/순서 변화] → 기존 values render를 byte comparison 또는 동등한 구조 비교로 회귀 검증한다.
- [후속 PKI mode가 `DATABASE_PASSWORD`를 제거함] → 이번 selector를 TLS enablement와 직교한 values 입력으로 유지하고 password mode와 PKI mode의 precedence는 PROD-470이 결정한다.

## Migration Plan

1. 새 chart와 빈 selector 기본값을 배포하고 기존 values render 및 workload database identity가 동일함을 확인한다.
2. PROD-369 등 별도 owner가 실제 roles/Secrets을 provision한다. 이 change는 해당 resource를 만들지 않는다.
3. PROD-715가 Web federation/system 전용 DB connection source를 opt-in하고 parity를 검증한다.
4. PROD-716이 같은 API source를 API Rollout과 Web BFF 기본 연결에 opt-in하고 parity를 검증한다.
5. Rollback은 해당 역할 source의 세 값을 함께 제거해 이전 경계로 돌아간다. Image와 다른 역할 selector는 유지한다.

## Open Questions

없음.
