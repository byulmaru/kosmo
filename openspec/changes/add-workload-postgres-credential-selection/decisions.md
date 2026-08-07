## Context

이 기록은 PROD-709의 PostgreSQL runtime 역할 경계를 `api`/`fedify`/`migration`으로 정정하고, API Rollout·Web BFF·현재 Web inbound Fedify가 서로 다른 생명주기의 credential source를 섞지 않도록 하는 사용자 결정과 Linear 계약을 구현 선택으로 번역한다. `api` source는 API Rollout과 Web BFF 기본 DB 연결이 공유하고, `fedify` source는 현재 Web inbound Fedify의 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 입력에만 추가한다. `migration`은 기존 `kosmo_migration` login에서 `SET ROLE kosmo`로 전환하는 경계를 유지한다.

## Decision Records

### Workload 이름이 아니라 실행 역할을 credential source 경계로 사용한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-369`, `PROD-715`, `PROD-716`
- Status: Active
- Context / Problem: API와 Web은 별도 Kubernetes Rollout이지만 Web은 user-facing BFF 기본 DB 경로와 inbound Fedify 경로를 함께 제공한다. Workload 이름대로 API/Web source를 나누면 Web BFF가 API와 다른 인증을 갖게 되고, 하나의 기본 source를 Fedify에 재사용하면 Fedify 역할 경계가 보이지 않는다.
- Decision Outcome: `api` source는 API Rollout과 Web BFF 기본 DB 연결이 공유한다. `fedify` source는 Web Rollout의 현재 inbound Fedify 전용 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 환경에만 제공한다. `web` 또는 `system` credential source는 만들지 않는다. `migration`은 selector가 없는 기존 역할로 남긴다.
- Alternatives Considered: API와 Web에 각각 credential source를 두는 방식은 같은 BFF 권한 경계를 drift시키므로 제외했다. Web 기본 `DATABASE_URL`을 Fedify source로 바꾸는 방식은 BFF 경계를 침범하므로 제외했다. API Rollout에 Fedify env를 주입하는 방식은 현재 Fedify consumer와 일치하지 않으므로 제외했다.
- Consequences: API와 Web BFF는 하나의 API source를 계속 공유하고, Web만 inbound Fedify source를 추가로 받을 수 있다. 이 change는 source를 환경으로 선택할 뿐 실제 Fedify DB client/connection 생명주기를 생성하거나 전환하지 않는다.
- Confirmation / Follow-up: Helm render에서 API source가 API와 Web 기본 env에 동일하게 나타나고 `FEDIFY_*`가 Web에만 나타나는지 검증한다.

### 역할별 URL과 password Secret reference를 additive atomic trio로 받는다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-709`
- Status: Active
- Context / Problem: URL, Secret name과 key 중 일부만 custom으로 바꾸면 custom endpoint와 owner password가 섞이거나 그 반대가 될 수 있다.
- Decision Outcome: `postgres.credentials.api`와 `postgres.credentials.fedify`는 각각 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key` 세 값을 하나의 atomic trio로 받는다. 세 값이 모두 비어 있으면 비활성이고 모두 채워지면 활성이다. 일부만 설정하면 Helm render를 실패시킨다. API URL은 `$(DATABASE_PASSWORD)`, Fedify URL은 `$(FEDIFY_DATABASE_PASSWORD)`를 참조하는 문자열을 받으며 Secret value 자체는 values나 manifest에 넣지 않는다.
- Alternatives Considered: 통합 env Secret은 source와 허용되는 override가 불명확해 제외했다. 필드별 독립 fallback은 credential 혼합 위험 때문에 제외했다.
- Consequences: 호출자는 각 역할에 이미 provision된 Secret을 가리키는 세 값을 함께 제공해야 한다. 실제 연결 성공, role 전환과 smoke는 이 change가 소유하지 않는다.
- Confirmation / Follow-up: 완전한 API/Fedify 입력, API-only/Fedify-only/양쪽 입력, 각 trio rollback과 모든 partial 조합의 render를 검증한다.

### Fedify credential은 현재 Web inbound consumer에만 노출한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-719`, `PROD-448`
- Status: Active
- Context / Problem: API는 현재 outbound Fedify를 직접 호출하는 경로를 장기적으로 제거하고 Temporal durable intent/workflow로 전환한다. 아직 Worker Deployment가 없으므로 API에 Fedify env를 미리 주입하거나 Worker credential 계약을 이 change에 끌어오면 소비자와 소유권이 뒤섞인다.
- Decision Outcome: `fedify` trio가 활성화되면 Web Rollout에만 `FEDIFY_DATABASE_PASSWORD` SecretKeyRef와 `FEDIFY_DATABASE_URL`을 추가한다. API Rollout에는 `FEDIFY_DATABASE_*`를 절대 주입하지 않는다. API outbound direct Fedify 호출 제거와 Temporal Workflow + Worker Fedify Activity 전환은 PROD-448이 소유하고, 아직 없는 Worker Deployment의 credential 소비·주입은 PROD-719/448이 소유한다.
- Alternatives Considered: API와 Web 양쪽에 Fedify env를 주입하는 방식은 현재 inbound consumer 범위를 넘어가므로 제외했다. Worker Deployment와 Temporal env를 이 chart에 미리 추가하는 방식은 downstream rollout과 credential 소유권을 침범하므로 제외했다.
- Consequences: 이 change 배포 후에도 API의 outbound direct Fedify 호출이나 Worker가 자동으로 전환되지 않는다. Web inbound Fedify만 후속 consumer가 읽을 수 있는 환경 경계를 얻는다.
- Confirmation / Follow-up: API Rollout manifest에 `FEDIFY_DATABASE_*`가 없고, Web Rollout에만 두 환경이 additive로 나타나는지 검증한다.

### `kosmo_fedify` BYPASSRLS와 권한 provisioning은 downstream이다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-369`, `PROD-715`
- Status: Active
- Context / Problem: Fedify source가 가리킬 DB login은 `kosmo_fedify` 역할과 RLS 경계를 전제로 하지만, role 생성·membership·grant·policy provisioning은 별도 운영 계약이다.
- Decision Outcome: downstream provisioning은 `kosmo_fedify`에 `BYPASSRLS`를 부여하는 방향을 소유한다. 이 change는 그 role, `BYPASSRLS`, policy, grant 또는 Secret을 생성·변경하지 않고 이미 provision된 source를 selector로만 참조한다.
- Alternatives Considered: Helm selector에서 role이나 RLS policy를 생성하는 방식은 database ownership과 운영 provisioning 경계를 chart에 끌어오므로 제외했다. `kosmo_fedify` 권한을 API source와 공유하는 방식은 RLS 격리를 잃으므로 제외했다.
- Consequences: selector render가 성공해도 role/Secret provisioning과 RLS 동작은 별도 downstream 검증이 필요하다.
- Confirmation / Follow-up: manifest/source diff에 `DatabaseRole`, Secret value, grant, policy 또는 `BYPASSRLS` SQL이 없음을 확인한다.

### Migration credential은 기존 `kosmo_migration` → `SET ROLE kosmo` 경계를 유지한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-564`
- Status: Active
- Context / Problem: runtime selector와 migration credential은 서로 다른 운영 생명주기를 갖는다. Production migration은 `kosmo_migration` login/Secret으로 인증한 뒤 runner가 `SET ROLE kosmo`를 수행하는 기존 계약을 사용한다.
- Decision Outcome: `api`/`fedify` trio는 dev 또는 production migration Job template에 전달하지 않는다. Production은 기존 migration login/Secret과 `kosmo_migration` → `SET ROLE kosmo`를, dev는 기존 owner fallback을 그대로 사용한다.
- Alternatives Considered: migration에 runtime URL/Secret selector를 재사용하는 방식은 credential 실패 시 우회를 만들고 `PROD-564` 운영 계약을 바꾸므로 제외했다.
- Consequences: PROD-709은 migration credential을 선택하지 않으며 runtime source와 migration source는 독립적으로 rollback된다.
- Confirmation / Follow-up: 모든 runtime selector 조합에서 migration Job env, Secret ref와 role transition이 baseline과 byte-identical인지 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 초기 초안의 `api`/`web` workload별 source와 `system`/`federation-system` 경계 표현은 사용자 정정으로 폐기했다. `api`/`fedify`/`migration` 실행 역할과 Web inbound Fedify 전용 env 결정이 이를 대체한다.
