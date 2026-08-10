## Context

이 기록은 PROD-709가 구현한 PostgreSQL selector 경계를 `api`/`fedify`/`migration`으로 설명한다. 여기서 `fedify`/`FEDIFY_DATABASE_*`는 구현 당시 Web inbound용으로 추가되고 후속 Worker foundation에도 연결된 legacy password selector seam이며 실제 role/certificate 이름 계약이 아니다. 최신 role identity와 generated certificate는 PROD-369의 `kosmo_worker` DatabaseRole이 provision하고, certificate selector 소비는 PROD-470, selector/env 명칭 migration과 실제 Worker principal cutover는 PROD-715가 소유한다. `migration`은 기존 `kosmo_migration` login에서 `SET ROLE kosmo`로 전환하는 경계를 유지한다.

## Decision Records

### Workload 이름이 아니라 실행 역할을 credential source 경계로 사용한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-369`, `PROD-715`, `PROD-716`
- Status: Active
- Context / Problem: API와 Web은 별도 Kubernetes Rollout이지만 Web은 user-facing BFF 기본 DB 경로와 inbound Fedify 경로를 함께 제공한다. Workload 이름대로 API/Web source를 나누면 Web BFF가 API와 다른 인증을 갖게 되고, 하나의 기본 source를 Fedify에 재사용하면 Fedify 역할 경계가 보이지 않는다.
- Decision Outcome: `api` source는 API Rollout과 Web BFF 및 활성화된 Worker의 기본 DB 입력이 공유한다. `fedify` source는 Web Rollout의 inbound Fedify와 활성화된 Worker에 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 입력 seam으로 제공한다. `web` 또는 `system` credential source는 만들지 않는다. `migration`은 selector가 없는 기존 역할로 남긴다.
- Alternatives Considered: API와 Web에 각각 credential source를 두는 방식은 같은 BFF 권한 경계를 drift시키므로 제외했다. Web 기본 `DATABASE_URL`을 Fedify source로 바꾸는 방식은 BFF 경계를 침범하므로 제외했다. API Rollout에 Fedify env를 주입하는 방식은 현재 Fedify consumer와 일치하지 않으므로 제외했다.
- Consequences: API, Web BFF와 활성화된 Worker는 하나의 API source를 계속 공유하고, Web과 Worker만 Fedify source 입력 seam을 추가로 받을 수 있다. 이 change는 source를 환경으로 전달할 뿐 실제 Fedify DB client/connection 생명주기를 생성하거나 전환하지 않는다.
- Confirmation / Follow-up: Helm render에서 API source가 API와 Web 및 활성화된 Worker 기본 env에 동일하게 나타나고 `FEDIFY_*`가 Web과 Worker에만 나타나는지 검증한다.

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
- Context / Problem: API outbound Fedify 경로와 Worker의 실제 DB connection 전환은 selector 입력 seam과 별도 생명주기를 갖는다. API에 Worker credential을 주입하거나 기존 Worker 입력 seam을 실제 credential cutover로 간주하면 소비자와 소유권이 뒤섞인다.
- Decision Outcome: `fedify` trio가 활성화되면 Web Rollout과 명시적으로 활성화된 Worker Deployment에 `FEDIFY_DATABASE_PASSWORD` SecretKeyRef와 `FEDIFY_DATABASE_URL`을 제공한다. API Rollout에는 `FEDIFY_DATABASE_*`를 절대 주입하지 않는다. 이 legacy seam의 `worker`/`WORKER_DATABASE_*` 명칭 migration과 실제 `kosmo_worker` connection cutover는 PROD-715, API outbound direct Fedify 호출 제거와 Temporal Workflow + Worker Activity 활성화는 PROD-448이 소유한다.
- Alternatives Considered: API에 Fedify env를 주입하는 방식은 consumer 범위를 넘어가므로 제외했다. Worker foundation이 이미 제공하는 입력 seam을 다시 구현하는 방식도 중복이므로 제외했다.
- Consequences: Worker Deployment에는 선택된 값을 전달할 seam이 이미 있지만 foundation은 DB connection을 열지 않는다. 이 change 배포만으로 API outbound direct Fedify 호출이나 Web/Worker의 실제 credential이 전환되지는 않는다.
- Confirmation / Follow-up: API Rollout manifest에 `FEDIFY_DATABASE_*`가 없고, Web Rollout과 활성화된 Worker Deployment에 두 환경이 additive로 나타나는지 검증한다.

### `kosmo_worker` BYPASSRLS와 권한 provisioning은 downstream이다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-369`, `PROD-715`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: Legacy `fedify` source가 후속에 가리킬 DB login은 최신 계약의 `kosmo_worker` 역할과 RLS 경계를 전제로 하지만, role 생성·membership·grant·policy provisioning은 별도 운영 계약이다.
- Decision Outcome: PROD-369은 `kosmo_worker`에 `BYPASSRLS`를 부여하고 CNPG generated client certificate를 provision한다. 이 selector change는 그 role, certificate, policy, grant 또는 certificate connection을 생성·변경하지 않는다. Certificate selector 소비는 PROD-470, `fedify` seam을 `worker`로 옮기고 실제 principal을 전환하는 일은 PROD-715가 소유한다.
- Alternatives Considered: Helm selector에서 role이나 RLS policy를 생성하는 방식은 database ownership과 운영 provisioning 경계를 chart에 끌어오므로 제외했다. `kosmo_worker` 권한을 API source와 공유하는 방식은 RLS 격리를 잃으므로 제외했다.
- Consequences: selector render가 성공해도 role/certificate provisioning과 실제 인증/RLS 동작은 별도 downstream 검증이 필요하다.
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
- `fedify` selector가 `kosmo_fedify` role/Secret을 전제로 한다는 2026-08-07 설명은 폐기됐다. `fedify`/`FEDIFY_DATABASE_*`는 PROD-709의 legacy password compatibility seam으로만 유지한다. 실제 identity/certificate는 PROD-369의 `kosmo_worker`, certificate selector 소비는 PROD-470, selector/env 명칭 migration과 principal cutover는 PROD-715가 소유한다.
