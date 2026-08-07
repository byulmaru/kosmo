## Context

이 기록은 PROD-709의 역할별 PostgreSQL credential 선택 계약, API와 Web BFF가 별도 인증을 가져야 할 이유가 없다는 사용자 정정, Web 프로세스의 federation/system 전용 DB connection은 별도 보안 경계여야 한다는 결정 및 이를 반영해 갱신한 PROD-369/715/716/724/712와 PROD-470 댓글을 구현 선택으로 번역한다.

## Decision Records

### Workload 이름이 아니라 DB 실행 역할을 credential source 경계로 사용한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-369`, `PROD-706`, `PROD-715`, `PROD-716`
- Status: Active
- Context / Problem: API와 Web은 별도 Kubernetes Rollout이지만 Web은 user-facing BFF DB 경로와 federation/system DB 경로를 한 프로세스에서 함께 실행한다. Workload 이름대로 API/Web credential을 나누면 Web BFF가 API와 다른 인증을 갖고, 반대로 Web 전체에 system credential을 적용하면 BFF가 system 권한을 사용한다.
- Decision Outcome: `api` source는 API Rollout과 Web BFF 기본 DB 연결이 공유하고, `system` source는 Web 프로세스의 명시적 federation/system 전용 DB connection에만 제공한다. `web` credential source는 만들지 않는다.
- Alternatives Considered: API와 Web에 각각 credential source를 두는 방식은 동일한 user-facing 권한 경계가 drift할 수 있어 제외했다. Web 전체를 system source로 전환하는 방식은 BFF가 system role을 사용하므로 제외했다. API/system이 하나의 DB role을 공유하는 방식은 PostgreSQL이 system 권한을 API에서 격리할 수 없어 제외했다.
- Consequences: Web Rollout은 장기적으로 API 기본 연결과 federation/system 전용 connection 두 DB 입력을 가질 수 있다. 두 번째 connection 객체 생성·사용은 PROD-706/710/715가 소유하고 이 change는 설정 입력만 제공한다.
- Confirmation / Follow-up: Helm render에서 API source가 API와 Web 기본 env에 동일하게 나타나고 system source가 Web 전용 별도 env에만 나타나는지 검증한다.

### 역할별 URL과 password Secret reference를 atomic opt-in으로 받는다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-709`
- Status: Active
- Context / Problem: 현재 URL은 Kubernetes env expansion으로 Secret에서 주입한 password 변수를 참조한다. URL, Secret name과 key 중 일부만 custom으로 바꾸면 custom endpoint와 owner password가 섞이거나 그 반대가 될 수 있다.
- Decision Outcome: `postgres.credentials.api`와 `postgres.credentials.system`은 각각 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 함께 받는다. 세 값이 모두 비어 있으면 비활성이고 모두 채워지면 활성이다. 일부만 설정하면 Helm render를 실패시킨다.
- Alternatives Considered: 통합 env Secret은 허용되는 입력과 override가 불명확해 제외했다. `DATABASE_URL` 단일 Secret key는 password source와 후속 file-based TLS 입력을 분리하기 어려워 제외했다. 필드별 독립 fallback은 credential 혼합 위험 때문에 제외했다.
- Consequences: Secret value는 values와 manifest에 들어가지 않는다. 호출자는 URL 안에 API용 `$(DATABASE_PASSWORD)` 또는 system용 `$(SYSTEM_DATABASE_PASSWORD)` 변수를 사용할 책임이 있으며 실제 연결 성공은 transition smoke에서 확인한다.
- Confirmation / Follow-up: 완전한 API/system 입력과 모든 partial 조합의 성공/실패 render를 검증한다.

### System credential은 Web 전용 별도 환경으로만 노출한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-709`, `PROD-706`, `PROD-715`
- Status: Active
- Context / Problem: 현재 Web의 전역 `DATABASE_URL`은 BFF와 Fedify가 함께 사용한다. PROD-709가 system source로 이 값을 교체하면 아직 명시적 connection 객체로 이전되지 않은 BFF와 system SQL이 동시에 전환되어 downstream 경계를 침범한다.
- Decision Outcome: System source opt-in은 Web container에 `SYSTEM_DATABASE_PASSWORD`와 `SYSTEM_DATABASE_URL`만 추가한다. 기존 `DATABASE_PASSWORD`와 `DATABASE_URL`은 API/Web BFF 기본 경계로 유지한다. API Rollout에는 system 환경을 주입하지 않는다.
- Alternatives Considered: Web 기본 env를 system source로 교체하는 방식은 BFF 권한 경계를 위반해 제외했다. 이 change에서 두 번째 Postgres.js client를 생성하는 방식은 PROD-706/710의 connection 생명주기와 SQL 이전을 가져오므로 제외했다.
- Consequences: PROD-709 배포만으로는 system source에 새 연결이 열리지 않는다. 후속 system execution implementation은 정해진 환경 계약을 소비하되 기존 owner fallback과 transaction 생명주기를 자체 검증해야 한다.
- Confirmation / Follow-up: System opt-in manifest에 Web 전용 두 env만 추가되고 application source diff에 새 DB connection/client가 없는지 확인한다.

### Migration credential은 기존 고정 경계를 유지한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, Linear `PROD-709`, `PROD-564`
- Status: Active
- Context / Problem: PROD-709은 runtime과 migration credential을 구분해야 하지만 production migration 운영 계약은 host, database, Secret name/key를 release input으로 받지 않고 고정된 migration Secret과 role 전환을 사용한다.
- Decision Outcome: API/system selector는 dev와 production migration Job template에 전달하지 않는다. Production은 기존 PG environment와 `<release>-postgres-migration` Secret, dev는 기존 owner fallback을 그대로 사용한다.
- Alternatives Considered: Migration에도 URL/Secret selector를 추가하는 방식은 PROD-564와 운영 runbook의 고정 interface를 불필요하게 변경하므로 사용자 결정으로 제외했다. Runtime selector fallback을 migration에 재사용하는 방식은 credential 실패 시 runtime 우회를 만들 수 있어 제외했다.
- Consequences: PROD-709은 migration credential을 새로 선택하지 않지만 runtime source와 섞이지 않는 독립 경계를 보존한다. Migration interface 변경은 별도 authority가 필요하다.
- Confirmation / Follow-up: 모든 API/system opt-in render에서 migration Job의 env와 Secret refs가 baseline과 동일한지 검증한다.

### Password selector와 후속 file-based TLS는 별도 생명주기로 합성한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-709`, `PROD-470`
- Status: Active
- Context / Problem: 현재 범위는 password Secret selector이고 PROD-470은 Vault PKI file mount와 TLS client 구성을 별도로 소유한다. 두 변경을 한 values/workload 분기에서 상호 배타적으로 고정하면 독립 rollout이 어려워진다.
- Decision Outcome: 이 change는 URL/password source만 소유하고 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT`, certificate volume과 PKI resource를 생성하거나 제거하지 않는다. 후속 PKI는 같은 API/system 역할 축에 file 입력을 합성하고 password mode와의 precedence를 결정한다.
- Alternatives Considered: 현재 change에 PKI mount나 TLS enable flag를 미리 추가하는 방식은 Secret provisioning과 인증 활성화 scope를 가져오므로 제외했다.
- Consequences: Password selector 자체는 PKI mode 동작을 보장하지 않는다. PROD-470은 API/Web BFF 공유 source와 Web federation/system 전용 DB connection 경계를 최신 Linear comment에 맞춰 정렬해야 한다.
- Confirmation / Follow-up: Rendered diff에 PKI resource, volume 또는 PGSSL env가 없고 기존 공용 `envFrom`을 제거하지 않는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- OpenSpec 초기 초안의 `api`/`web` workload별 credential source 제안은 decision record로 채택되기 전에 사용자 정정으로 폐기했다. `Workload 이름이 아니라 DB 실행 역할을 credential source 경계로 사용한다`가 이를 대체한다.
