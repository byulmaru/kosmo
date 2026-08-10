# Tasks

## 1. Worker selector/env migration

### Deliverable

Helm이 `worker` 역할명 URL/password Secret source를 Web trusted ingress와 Worker Deployment에만 `WORKER_DATABASE_*`로 제공하고 legacy Fedify seam을 소비하지 않는다.

### Guardrails

- API/Web BFF 기본 `DATABASE_*`, migration과 PgBouncer manifest를 변경하지 않는다.
- URL/password Secret name/key partial source만 render 실패시킨다.
- legacy `fedify` key 전용 fail이나 alias를 추가하지 않는다.
- Secret value를 values나 manifest에 넣지 않는다.

### Verification

- default, API-only, Worker-only, 양쪽과 rollback render를 비교한다.
- Web/Worker에만 Worker env가 있고 API와 migration은 불변인지 확인한다.
- API/Worker partial trio가 source 이름을 포함해 실패하는지 확인한다.
- legacy input이 Worker env로 소비되지 않는지 확인한다.

- [x] 1.1 PROD-709 capability spec이 sync/archive되어 modified delta baseline이 존재하는지 확인한다.
- [x] 1.2 `worker` atomic trio를 구현하고 legacy `fedify` 전용 validation을 제거한다.
- [x] 1.3 Web trusted ingress와 기본 비활성 Worker component에만 `WORKER_DATABASE_*`를 투영하고 legacy env를 제거한다.
- [x] 1.4 selector 조합·rollback·partial failure·legacy 비소비·API/migration 음성 경계를 검증한다.

Evidence (2026-08-10): Helm 4.2.2 dev/prod lint, default render identity, selector matrix와 rollback, partial API/Worker failure, legacy 비소비, Web+Worker `WORKER_DATABASE_*`, API env 부재와 migration document 불변을 확인했다. 최신 SCRAM 계약 정렬 뒤 change strict validation과 전체 OpenSpec strict validation 94/94를 통과했다.

## 2. Web trusted ingress Worker connection

### Required predecessor

- `PROD-369`
- `PROD-724`
- `PROD-710`

### Deliverable

Web trusted federation ingress가 `WORKER_DATABASE_*`로 만든 별도 connection과 PROD-710의 explicit handle을 사용한다.

### Guardrails

- 선행 issue의 role/passwordSecret, GRANT와 explicit SQL 경계가 완료되기 전에는 시작하거나 완료하지 않는다.
- Web BFF 기본 connection과 API Rollout을 변경하지 않는다.
- 인증 실패 중 owner connection으로 자동 fallback하지 않는다.
- outbound delivery/MessageQueue 경로로 범위를 넓히지 않는다.

### Verification

- trusted inbound SQL이 Worker handle만 사용하는지 확인한다.
- URL이 기존 PgBouncer Service이고 password가 Secret input에서만 오는지 확인한다.
- BFF와 outbound 경로가 기본 connection을 유지하는지 확인한다.

- [ ] 2.1 PROD-369/724/710 merged evidence와 exact Worker connection interface를 독립 확인한다.
- [ ] 2.2 Web trusted ingress bootstrap에 Worker SCRAM source를 wiring한다.
- [ ] 2.3 inbound handle 사용과 BFF/outbound 음성 경계를 검증한다.

## 3. Temporal Worker DB Activity connection

### Required predecessor

- `PROD-369`
- `PROD-724`
- `PROD-710`
- 실제 등록된 대상 DB Activity

### Deliverable

실제 Temporal Worker DB Activity가 같은 Worker source로 만든 explicit handle을 core/Fedify 작업에 전달한다.

### Guardrails

- domain Workflow, command orchestration과 Fedify MessageQueue를 구현하지 않는다.
- foundation-only Worker는 DB connection을 열지 않는다.
- process lifecycle에서 connection close를 누락하지 않는다.

### Verification

- Activity가 global/default database singleton을 사용하지 않는지 확인한다.
- Worker startup 실패, shutdown과 handle close를 검증한다.
- API package/runtime에 Worker credential이 유입되지 않는지 확인한다.

- [ ] 3.1 선행 issue와 실제 대상 DB Activity evidence를 독립 확인한다.
- [ ] 3.2 Activity bootstrap에 Worker SCRAM source를 wiring하고 explicit handle을 전달한다.
- [ ] 3.3 Activity handle 사용, resource lifecycle과 Worker foundation 회귀를 검증한다.

## 4. Production cutover와 rollback

### Required predecessor

- `PROD-369`
- `PROD-724`
- `PROD-710`
- task groups 2–3

### Deliverable

승인된 production에서 Web trusted ingress와 Temporal Worker DB Activity만 기존 PgBouncer를 통해 `kosmo_worker` SCRAM credential을 사용하고 독립 rollback할 수 있다.

### Guardrails

- 별도 사용자 승인 전에는 Vault source sync, Argo sync/apply 또는 workload cutover를 수행하지 않는다.
- password value를 출력·로그·diff에 포함하지 않는다.
- rollback은 Worker selector만 변경하며 API selector, image와 migration을 함께 바꾸지 않는다.
- Vault Dynamic Secret은 `PROD-744` 후속 범위다.

### Verification

- 적용 전 Vault source metadata, VSO destination/basic-auth shape, CNPG passwordSecret readiness, ACL과 rollback 입력을 확인한다.
- 적용 뒤 두 Worker connection의 Pooler endpoint, `current_user = 'kosmo_worker'`, `rolbypassrls = true`와 대표 최소권한 query를 검증한다.
- API Rollout의 Worker env/Secret 부재와 API/Web BFF 기본 connection·migration 불변을 검증한다.
- rollback 뒤 Worker handle이 승인된 owner source로 돌아가고 API/migration이 바뀌지 않는지 확인한다.

- [ ] 4.1 PROD-369/724/710 completion evidence, legacy env 부재와 production preflight·rollback 계획을 재확인한다.
- [ ] 4.2 사용자에게 exact production diff, Vault source metadata, 검증 query와 rollback을 제시하고 별도 sync/apply 승인을 받는다.
- [ ] 4.3 승인된 범위에서만 production Worker source cutover를 수행하고 live Pooler route·role·ACL과 API 음성 경계를 검증한다.
- [ ] 4.4 Worker selector rollback을 실행·검증하거나, 승인이 없다면 검토된 절차와 독립 rollback 가능 evidence를 기록한다.

## 5. Integration과 completion

### Guardrails

- PR readiness와 OpenSpec 전체 완료를 분리한다.
- blocker 또는 production evidence가 없으면 change를 archive하거나 PROD-715를 Done으로 바꾸지 않는다.

- [ ] 5.1 모든 task/requirement evidence를 최신 Linear authority와 대조한다.
- [ ] 5.2 Active specs를 동기화하고 change를 archive한 뒤 전체 OpenSpec strict validation을 통과한다.
- [ ] 5.3 Ready PR merge와 production completion evidence를 모두 확인한 뒤 PROD-715 완료 상태를 갱신한다.
