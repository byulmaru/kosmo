## 1. PROD-715 Worker credential selector/env migration

**Authority / Provenance**

- `PROD-715`
- 완료된 `PROD-709`
- 완료된 `PROD-730`
- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`

**Deliverable**

Helm runtime 설정이 Web trusted federation ingress와 Temporal Worker에 하나의 `worker` credential source를 `WORKER_DATABASE_*`로 제공하고, 기존 `fedify` selector/env seam을 혼동 없이 제거한다.

**Guardrails**

- `worker` URL·Secret name·key는 모두 채우거나 모두 비워야 하며 partial source는 render를 실패시킨다.
- 명시된 legacy `fedify` selector는 조용히 owner fallback하지 않고 render를 실패시킨다. `FEDIFY_DATABASE_*`를 Worker alias로 유지하지 않는다.
- API Rollout에는 Worker env를 주입하지 않고 API Rollout/Web BFF 기본 `DATABASE_*`를 바꾸지 않는다.
- Dev/production migration credential, `DATABASE_MIGRATION_ROLE`과 `kosmo_migration` login → `SET ROLE kosmo` 경계를 바꾸지 않는다.
- PROD-709 active change의 historical selector 계약을 직접 다시 쓰지 않는다. 해당 owner가 sync/archive한 active baseline 위에 이 change의 modified delta를 적용한다.

**Verification**

- Default/API-only/Worker-only/양쪽 selector render, Worker rollback source와 Web+Worker의 동일 Secret/URL 투영을 검증한다.
- 대표 partial API/Worker trio와 legacy `fedify` input이 식별 가능한 render 오류로 실패하는지 검증한다.
- API manifest의 `WORKER_DATABASE_*`/`FEDIFY_DATABASE_*` 부재, Web/Worker의 legacy env 부재, API/Web BFF 기본 env와 dev/prod migration document 불변을 확인한다.
- Helm lint, 관련 test, Prettier, OpenSpec strict validation과 diff check를 통과한다.

- [ ] 1.1 PROD-709 active capability spec이 sync/archive되어 modified delta baseline이 존재하는지 확인한다.
- [ ] 1.2 `worker` atomic trio와 legacy `fedify` input fail-fast 계약을 구현한다.
- [ ] 1.3 Web trusted ingress와 기본 비활성 Worker component에만 `WORKER_DATABASE_*` source를 투영하고 legacy env를 제거한다.
- [ ] 1.4 selector 조합·rollback·partial/legacy failure·API/migration 음성 경계를 검증하고 관련 정적 check를 통과한다.

## 2. PROD-715 Web trusted ingress Worker credential wiring

**Authority / Provenance**

- `PROD-710`
- `PROD-715`

**Deliverable**

Web의 trusted federation ingress가 PROD-710이 제공한 명시적 Worker connection/SQL 경계에서 `WORKER_DATABASE_*`가 선택한 source를 사용한다.

**Guardrails**

- PROD-710이 명시적 Worker connection과 trusted ingress SQL callsite 이전을 완료하기 전에는 이 group을 시작하거나 완료하지 않는다.
- Web BFF 기본 `DATABASE_URL`이나 전역 owner/API singleton으로 fallback하지 않는다.
- API outbound Fedify, 직접 delivery, Fedify MessageQueue runtime과 Web BFF query/mutation은 변경하지 않는다.
- 새로운 평행 database abstraction을 만들지 않고 PROD-710의 public execution seam을 사용한다.

**Verification**

- Inbound federation request의 read/write가 전달된 Worker handle 안에서 실행되고 성공·실패 시 transaction/connection 경계가 보존되는지 검증한다.
- 같은 Web process의 BFF 기본 DB 작업은 기존 `DATABASE_*` connection을 유지하고 Worker source를 사용하지 않는지 검증한다.
- Direct outbound/MessageQueue 경로가 현재 동작을 유지하는지 영향 범위를 확인한다.

- [ ] 2.1 PROD-710의 merged explicit Worker connection과 trusted ingress SQL callsite evidence를 독립 확인한다.
- [ ] 2.2 Web trusted federation ingress의 기존 Worker connection seam에 `WORKER_DATABASE_*` source를 wiring한다.
- [ ] 2.3 Inbound trusted path의 Worker handle 사용과 BFF/outbound 음성 경계를 검증한다.

## 3. PROD-715 Temporal Worker DB Activity credential wiring

**Authority / Provenance**

- `PROD-710`
- `PROD-715`
- 완료된 `PROD-730`

**Deliverable**

실제 등록된 Temporal Worker DB Activity가 PROD-710의 명시적 Worker connection/SQL 경계와 `WORKER_DATABASE_*` source를 사용한다.

**Guardrails**

- PROD-710이 Worker Activity가 재사용할 explicit connection/SQL seam을 완료하기 전에는 이 group을 시작하거나 완료하지 않는다.
- 검증을 위해 smoke Workflow/Activity 또는 task queue를 새로 만들지 않는다. 현재 business capability가 등록한 DB Activity에만 wiring한다.
- Temporal domain Workflow, Post/Reaction/Follow transition과 Fedify MessageQueue runtime(PROD-448)을 변경하지 않는다.
- Worker process의 기본 `DATABASE_*`를 Worker source로 덮어쓰지 않고 Activity가 explicit handle을 사용하게 한다.

**Verification**

- 등록된 DB Activity의 core/Fedify 작업이 전달된 Worker handle을 사용하고 전역 `DATABASE_URL`로 fallback하지 않는지 검증한다.
- Worker startup 실패와 정상/graceful shutdown에서 명시적 DB resource lifecycle이 누수 없이 종료되는지 검증한다.
- 기존 Worker health/readiness/SIGTERM foundation 회귀 검증을 통과한다.

- [ ] 3.1 PROD-710의 merged Worker Activity용 explicit connection/SQL seam과 실제 대상 DB Activity를 독립 확인한다.
- [ ] 3.2 대상 DB Activity bootstrap에 `WORKER_DATABASE_*` source를 wiring하고 explicit handle을 전달한다.
- [ ] 3.3 Activity DB handle 사용, resource lifecycle과 Worker foundation 회귀를 검증한다.

## 4. PROD-715 production cutover와 rollback 검증

**Authority / Provenance**

- `PROD-369`
- `PROD-724`
- `PROD-710`
- `PROD-715`

**Deliverable**

승인된 production에서 Web trusted federation ingress와 Temporal Worker DB connection만 `kosmo_worker` LOGIN + `BYPASSRLS` credential을 사용하고 Worker source만 독립 rollback할 수 있다.

**Guardrails**

- PROD-369의 `kosmo_worker` role/Secret readiness, PROD-724의 최소 객체 GRANT와 PROD-710의 explicit connection/SQL evidence가 완료되기 전에는 production cutover를 수행하지 않는다.
- PR merge, CI, manifest 준비를 production sync/apply 승인으로 간주하지 않는다. 사용자의 별도 명시적 승인 없이는 Argo sync, 직접 apply, Secret sync나 workload cutover를 수행하지 않는다.
- API Rollout에 Worker credential/trusted execution을 추가하지 않고 API/Web BFF 기본 connection과 migration을 변경하지 않는다.
- Rollback은 Worker source만 승인된 owner source로 되돌리며 API selector, image와 migration을 함께 변경하지 않는다.

**Verification**

- 적용 전 role collision, Vault source/Secret readiness, object ACL과 rollback 입력을 검증한다.
- 적용 뒤 Web trusted ingress와 실제 Worker DB Activity connection 각각에서 `current_user = 'kosmo_worker'`, `rolbypassrls = true`와 대표 최소권한 query를 검증한다.
- API Rollout의 Worker env/credential/trusted execution 부재, API/Web BFF 기본 principal과 migration 불변을 검증한다.
- Worker source rollback 뒤 두 explicit connection이 승인된 owner source로 돌아가고 API/migration이 바뀌지 않는지 검증한다.

- [ ] 4.1 PROD-369/724/710 completion evidence와 production preflight·rollback 계획을 재확인한다.
- [ ] 4.2 사용자에게 exact production diff, Secret source, 검증 query와 rollback을 제시하고 별도 sync/apply 승인을 받는다.
- [ ] 4.3 승인된 범위에서만 production Worker source cutover를 수행하고 Web/Worker live role·ACL과 API 음성 경계를 검증한다.
- [ ] 4.4 Worker source-only rollback을 실행·검증하거나, 실행 승인이 없다면 검토된 절차와 독립 rollback 가능 evidence를 기록한다.

## 5. PROD-715 completion과 archive

**Authority / Provenance**

- `PROD-715`

**Deliverable**

PROD-715의 selector/env migration, 두 runtime wiring, 승인된 production cutover·rollback evidence가 모두 최신 계약과 일치하고 change가 active spec에 동기화된다.

**Guardrails**

- 일부 Helm seam이나 한 runtime만 완료됐다는 이유로 change를 archive하거나 PROD-715를 Done 처리하지 않는다.
- 제외된 Temporal Workflow, MessageQueue, API credential transition을 completion evidence로 요구하거나 현재 change에 포함하지 않는다.

**Verification**

- 모든 requirement scenario, task evidence와 최신 Linear 본문·관계·댓글을 독립 대조한다.
- Delta spec sync, archive 전 change strict validation과 archive 후 전체 strict validation을 통과한다.

- [ ] 5.1 모든 task와 requirement scenario의 code/render/runtime evidence를 최신 Linear authority와 대조한다.
- [ ] 5.2 Active specs를 동기화하고 change를 archive한 뒤 전체 OpenSpec strict validation을 통과한다.
- [ ] 5.3 Ready PR의 merge와 production completion evidence가 모두 확인된 뒤 PROD-715 완료 상태를 갱신한다.
