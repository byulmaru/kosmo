# Decisions

이 기록은 PROD-715의 Worker credential transition을 role/password provisioning(PROD-369), object GRANT(PROD-724), explicit connection/SQL boundary(PROD-710), API cutover(PROD-716)와 분리한다.

## Decision Log

### credential selector는 프로토콜이 아니라 Worker 역할 이름을 사용한다

- Status: Active
- Authority / Provenance: Linear `PROD-709`, `PROD-715`
- Decision Outcome: `postgres.credentials.worker`와 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`를 사용한다. Web trusted ingress와 Worker에만 투영하고 API에는 주입하지 않는다.
- Alternatives Considered: `fedify`는 Temporal Worker Activity를 포함하지 못한다. 두 이름의 병행 지원은 production 미소비 seam에 불필요하다.
- Consequences: legacy key/env는 Worker source로 소비하지 않는다.

### 기존 CloudNativePG PgBouncer와 SCRAM 인증을 유지한다

- Status: Active
- Authority / Provenance: Linear `PROD-369`, `PROD-715`; canceled `PROD-470`
- Decision Outcome: workload는 기존 PgBouncer에 TLS로 연결하고, Vault/VSO가 공급해 CNPG DatabaseRole이 조정한 역할별 password로 인증한다. Worker source는 실제 `kosmo_worker` credential이다.
- Alternatives Considered: 인증서 때문에 PostgreSQL `-rw` Service로 직접 연결하는 방식은 pooling 경계를 깨므로 제외했다. 전용 Pooler/custom certificate authentication은 현재 필요보다 복잡해 제외했다.
- Consequences: `WORKER_DATABASE_PASSWORD`와 atomic password Secret selector를 유지한다. Client-certificate selector, cert mount와 `pg_hba` 변경은 구현하지 않는다.

### 역할별 source는 atomic trio로 검증한다

- Status: Active
- Authority / Provenance: Linear `PROD-709`, `PROD-715`
- Decision Outcome: URL, password Secret name과 key가 모두 비어 있거나 모두 채워져야 한다. 일부만 설정하면 role 이름을 포함한 render 오류로 실패한다.
- Alternatives Considered: 부분 값을 owner fallback과 합치는 방식은 principal 혼합을 숨기므로 제외했다.
- Consequences: 이 validation fail은 보안 경계이므로 유지한다.

### legacy fedify 입력은 별도 validation 없이 제거한다

- Status: Active
- Authority / Provenance: Linear `PROD-715`
- Decision Outcome: legacy key/env는 alias로 소비하지 않지만, unknown Helm value 자체를 별도 `fail`로 거부하지 않는다.
- Alternatives Considered: explicit legacy fail은 Helm template을 복잡하게 하고 production 미소비 내부 key에 불필요하다.
- Consequences: 검증은 rendered Worker env 부재로 수행한다.

### selector-off rollback과 인증 실패를 구분한다

- Status: Active
- Authority / Provenance: Linear `PROD-710`, `PROD-715`
- Decision Outcome: 배포자가 Worker selector를 비활성화하면 명시적 Worker handle은 승인된 기존 owner connection을 사용한다. 활성 Worker source의 인증 실패 중에는 owner로 자동 fallback하지 않는다.
- Alternatives Considered: 자동 fallback은 권한 전환 실패를 숨기므로 제외했다.
- Consequences: rollback은 명시적 configuration 변경이며 API selector, image와 migration은 고정한다.

### blocker와 production 승인을 독립 gate로 유지한다

- Status: Active
- Authority / Provenance: Linear `PROD-369`, `PROD-724`, `PROD-710`, `PROD-715`
- Decision Outcome: role/password Secret, 최소 GRANT와 explicit connection/SQL boundary가 완료되기 전에는 actual cutover를 완료하지 않는다. 그 뒤에도 별도 사용자 승인 전에는 production sync/apply를 수행하지 않는다.
- Consequences: PR과 CI는 code/spec 준비만 증명한다.

### Vault 동적 credential은 후속 capability다

- Status: Deferred
- Authority / Provenance: Linear `PROD-744`
- Decision Outcome: 현재 cutover는 VaultStaticSecret 기반 SCRAM credential을 사용한다. Vault lease, 임시 login role과 PgBouncer session 만료 정렬은 PROD-744에서 별도 설계한다.
- Consequences: PROD-744는 PROD-715 완료 조건이나 현재 production 범위가 아니다.
