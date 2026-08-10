## Context

이 기록은 PROD-715의 Web trusted federation ingress·Temporal Worker DB credential transition을 완료된 PROD-709 selector foundation, PROD-710 explicit Worker connection/SQL boundary, PROD-369 role/client-certificate provisioning, PROD-470 certificate authentication과 PROD-724 object GRANT에서 분리한다. 최신 계약은 `fedify`라는 프로토콜 이름을 `worker` 신뢰 실행 역할로 정정하며 API/Web BFF 기본 connection, migration, Temporal domain Workflow와 Fedify MessageQueue를 현재 범위에서 제외한다.

## Decision Records

### PROD-710 execution boundary에 PROD-715 credential source를 wiring한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-710`, `PROD-715`
- Status: Active
- Context / Problem: PROD-710과 PROD-715 본문 모두 명시적 Worker connection을 언급하지만, connection/SQL execution boundary와 실제 credential transition의 배포·검증 생명주기가 다르다.
- Decision Outcome: PROD-710은 Web trusted federation ingress와 Worker Post/PostContent SQL의 명시적 Worker connection/handle과 callsite 이전을 소유한다. PROD-715는 그 선행 결과에 `WORKER_DATABASE_*` source를 wiring하고 `kosmo_worker` credential로 cutover·rollback하는 결과만 소유한다.
- Alternatives Considered: PROD-715에서 두 번째 connection abstraction이나 SQL 이전을 다시 구현하는 방식은 선행 이슈와 소유권을 중복하므로 제외했다. PROD-710에 credential cutover까지 포함하는 방식은 role/GRANT와 production approval gate가 다른 transition을 결합하므로 제외했다.
- Consequences: PROD-710이 완료되기 전에는 Helm selector/env migration만 독립 구현할 수 있고 runtime cutover task는 완료할 수 없다.
- Confirmation / Follow-up: PROD-710의 merged public seam과 SQL callsite evidence를 재확인한 뒤 PROD-715 wiring diff가 별도 execution abstraction이나 outbound 경로를 추가하지 않는지 검토한다.

### credential source 이름은 프로토콜이 아니라 Worker 실행 역할을 따른다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-715`
- Status: Active
- Context / Problem: PROD-709의 `fedify` selector는 Web inbound Fedify만 준비하던 시점의 이름이지만 최신 소비자는 Web trusted federation ingress와 Temporal Worker DB Activity다.
- Decision Outcome: credential selector 역할명은 `postgres.credentials.worker`, runtime env 역할명은 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`를 사용한다. 이 password trio는 rename-only 단계에서 Web trusted ingress와 Worker Deployment의 기존 owner/password fallback source를 보존하며 API Rollout에는 이를 주입하지 않는다. Password가 없는 `kosmo_worker`의 실제 credential로 사용하지 않는다.
- Alternatives Considered: `fedify` 이름을 유지하면 Temporal Worker의 신뢰 DB Activity까지 포함하는 역할 경계가 드러나지 않는다. Web/Temporal별 source를 나누면 같은 `kosmo_worker` principal의 cutover·rollback이 drift할 수 있다.
- Consequences: PROD-709의 내부 Helm/env seam은 breaking rename되고 current active Worker foundation spec도 새 이름으로 수정된다.
- Confirmation / Follow-up: Web/Worker manifest에는 `WORKER_DATABASE_*`가 같은 source로 나타나고 API에는 Worker env가 없으며 기본 `DATABASE_*`는 그대로인지 검증한다.

### 실제 kosmo_worker 인증은 PROD-470 client certificate input을 사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-470`, `PROD-715`
- Status: Active
- Context / Problem: PROD-369은 `kosmo_worker`를 `disablePassword: true`로 provision하고 CNPG generated client certificate만 발급한다. 기존 password selector/env seam은 실제 Worker role에 로그인할 수 없다.
- Decision Outcome: 실제 Worker principal cutover는 PROD-470이 제공하는 role-specific certificate selector, client cert/key/CA mount와 Postgres.js TLS connection input을 사용한다. PROD-715는 이 input을 PROD-710의 명시적 Worker connection에 wiring하며 certificate 인증 실패를 `kosmo_worker` password로 fallback하지 않는다.
- Alternatives Considered: 기존 `WORKER_DATABASE_PASSWORD`로 `kosmo_worker`를 인증하는 방식은 password가 없는 역할 계약과 충돌한다. Certificate selector·mount·`pg_hba`를 PROD-715에서 다시 구현하는 방식은 PROD-470 소유권을 중복한다.
- Consequences: PROD-470은 PROD-715의 필수 blocker다. 현재 PR의 password-only rename seam은 owner/password fallback 준비로만 독립 merge할 수 있고 actual cutover evidence가 아니다.
- Confirmation / Follow-up: PROD-470 merged interface를 확인한 뒤 Web/Worker가 같은 Worker certificate source를 사용하고 API에 Worker certificate가 없는지 검증한다.

### legacy Fedify selector와 env는 dual-read 없이 fail-fast로 제거한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-715`
- Status: Active
- Context / Problem: Helm values schema가 없어 제거된 `fedify` key가 조용히 무시되면 운영자는 Worker credential을 설정했다고 생각하지만 runtime은 owner fallback을 사용할 수 있다. 아직 production credential cutover 전이라 호환 기간을 유지할 외부 consumer는 없다.
- Decision Outcome: 새 chart/runtime은 `fedify` selector와 `FEDIFY_DATABASE_*`를 Worker credential alias로 읽지 않는다. 명시적으로 제공된 legacy selector는 render 단계에서 식별 가능한 오류로 거부하고 `worker` key 사용을 요구한다.
- Alternatives Considered: 한 release 동안 dual-read하면 어떤 source가 우선하는지와 rollback 기준이 모호해진다. Legacy key를 조용히 무시하면 privileged fallback 오인을 만들 수 있다. Values schema 전체 도입은 현재 rename에 비해 범위가 크므로 작은 helper validation을 우선한다.
- Consequences: 저장소·배포 설정은 chart와 같은 release에서 새 key로 갱신해야 한다. Default values에 legacy key를 남기지 않으며 legacy key가 없는 기존 values는 계속 렌더할 수 있다.
- Confirmation / Follow-up: complete Worker trio 성공, partial Worker trio 실패, 명시적 legacy `fedify` input 실패와 rendered env의 `FEDIFY_DATABASE_*` 부재를 검증한다.

### Worker cutover와 rollback은 API·migration과 독립적이다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-715`, `PROD-716`, `PROD-564`
- Status: Active
- Context / Problem: Web는 BFF 기본 connection과 trusted federation connection을 함께 호스팅하고 Worker Deployment도 foundation 호환을 위해 기본 `DATABASE_*`를 가진다. Worker source가 기본 source를 덮어쓰면 API/Web BFF에 BYPASSRLS가 전파될 수 있다.
- Decision Outcome: `WORKER_DATABASE_*` 역할명 seam과 PROD-470 Worker certificate input은 Web trusted federation ingress와 Temporal Worker DB Activity의 explicit connection에만 사용한다. API Rollout과 Web BFF 기본 `DATABASE_*`, production migration login → `SET ROLE kosmo`는 변경하지 않는다. Rollback은 Worker certificate selector만 승인된 owner/password source로 되돌린다.
- Alternatives Considered: Web/Worker process의 기본 `DATABASE_URL`을 `kosmo_worker`로 교체하는 방식은 BFF/API 경계를 침범한다. API source를 Worker fallback으로 사용하는 방식은 RLS와 BYPASSRLS 역할을 섞는다.
- Consequences: 같은 process에 두 database source가 존재하므로 explicit handle 전달이 필수이며 전역 singleton fallback은 trusted 경로에서 허용되지 않는다.
- Confirmation / Follow-up: API/Web BFF 기본 connection과 migration render 불변, API Worker env 부재, Worker-only cutover/rollback을 검증한다.

### 실제 credential 전환은 모든 선행 결과와 별도 production 승인을 기다린다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-470`, `PROD-724`, `PROD-710`, `PROD-715`
- Status: Active
- Context / Problem: LOGIN+BYPASSRLS role만 존재해도 객체 ACL이 없으면 query가 실패하고, explicit connection 없이 env만 주입해도 실제 principal은 바뀌지 않는다. PR merge나 CI는 production change 승인이 아니다.
- Decision Outcome: PROD-369 role/client certificate, PROD-470 certificate authentication, PROD-724 최소 GRANT와 PROD-710 connection/SQL boundary가 완료·검증되기 전에는 Worker runtime cutover를 수행하거나 완료 처리하지 않는다. 이후에도 사용자의 별도 명시적 승인 전에는 production sync/apply를 수행하지 않는다.
- Alternatives Considered: 선행 조건 일부만 갖춘 canary는 query 실패 또는 owner singleton 유지로 잘못된 성공 신호를 만들 수 있어 제외했다. PR merge를 apply 승인으로 간주하는 방식은 Linear의 수동 gate를 위반한다.
- Consequences: Helm seam migration은 먼저 배포할 수 있지만 live `current_user`/`rolbypassrls` evidence와 OpenSpec completion은 후속 gate까지 남는다.
- Confirmation / Follow-up: 승인된 production rollout 뒤 Web trusted ingress와 실제 Worker DB Activity connection 각각에서 `current_user = 'kosmo_worker'`, `rolbypassrls = true`를 확인하고 API 음성 경계를 함께 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- PROD-709의 `fedify` selector/`FEDIFY_DATABASE_*` 명칭은 완료 시점의 준비 seam으로서 유효했지만, 최신 PROD-715 계약의 `worker`/`WORKER_DATABASE_*` 실행 역할 명칭이 이를 대체한다. PROD-709 historical artifact는 당시 계약을 보존하고 active capability spec은 PROD-715 delta가 수정한다.
