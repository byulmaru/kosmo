## Context

이 기록은 최신 Linear PROD-369/470, CloudNativePG 1.30 DatabaseRole client certificate 계약과 2026-08-10 사용자 결정을 반영한다. PROD-369은 역할과 인증서 발급, PROD-470은 선택적 certificate 인증 소비를 소유하며 하나의 OpenSpec change를 공유한다.

## Decision Records

### API와 Worker database LOGIN을 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: API viewer와 trusted federation/Temporal Worker는 RLS와 rollout 경계가 다르다.
- Decision Outcome: API LOGIN은 `kosmo_api`, Worker LOGIN은 `kosmo_worker`, migration LOGIN은 기존 `kosmo_migration`으로 고정한다.
- Alternatives Considered: shared `kosmo_runtime`은 credential과 policy rollout을 결합하고, `kosmo_fedify`는 Temporal Worker 소비 경계를 표현하지 못하므로 선택하지 않았다.
- Consequences: API와 Worker 인증서도 DatabaseRole별로 독립 발급·회전된다.
- Confirmation / Follow-up: Render와 실제 `current_user`, `pg_roles`, `pg_auth_members`로 역할 분리를 확인한다.

### Worker만 BYPASSRLS를 사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: API viewer는 RLS를 적용받고 trusted federation/Worker는 애플리케이션 권한 검증을 사용하는 신뢰 경로다.
- Decision Outcome: `kosmo_api`는 `BYPASSRLS=false`, `kosmo_worker`는 `BYPASSRLS=true`로 선언한다. 둘 다 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION과 owner/migration/상대 membership을 갖지 않는다.
- Alternatives Considered: 둘 다 RLS 적용 또는 둘 다 우회하는 구성은 한쪽의 요구를 위반한다.
- Consequences: 공통 객체 ACL은 PROD-724, API policy는 PROD-713이 별도로 소유한다.
- Confirmation / Follow-up: Render와 live catalog에서 role attribute를 확인한다.

### Runtime credential은 CNPG가 역할별 client certificate로 자동 관리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-369`; 2026-08-10 사용자 결정; CloudNativePG 1.30 공식 계약
- Status: Active
- Context / Problem: 역할별 Vault password source는 환경마다 선행 secret 생성·회전·VSO sync를 요구한다. 현재 CNPG는 DatabaseRole별 client certificate를 직접 발급·갱신할 수 있다.
- Decision Outcome: 두 DatabaseRole에 `clientCertificate.enabled: true`, `disablePassword: true`를 사용하고 `passwordSecret`, runtime VaultStaticSecret과 Vault password source를 제거한다.
- Alternatives Considered: Vault basic-auth password는 추가 운영 의존성을 만든다. Helm random password는 안정적 rotation/ownership 계약이 없고 release 상태에 secret을 남길 수 있어 선택하지 않았다. Vault PKI는 현재 필요한 역할별 내부 인증보다 범위가 크다.
- Consequences: CNPG가 `<DatabaseRole metadata.name>-client-cert` Secret과 expiration을 관리한다. generated Secret은 DatabaseRole 삭제 시 정리되고 role만 retain된다.
- Confirmation / Follow-up: Secret의 `tls.crt`/`tls.key`, DatabaseRole status expiration과 password 부재를 확인한다.

### Provisioning과 선택적 certificate 소비는 하나의 change 안에서 분리 배포한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-470`; 2026-08-10 사용자 승인
- Status: Active
- Context / Problem: certificate identity/lifecycle은 발급과 소비가 공유하지만, `pg_hba`와 workload 연결을 역할 생성과 동시에 바꾸면 rollback과 production 승인 범위가 커진다.
- Decision Outcome: `add-runtime-postgres-client-certificate-authentication` change를 공유한다. PROD-369은 역할·certificate 발급 task만 구현하고, PROD-470은 `pg_hba`, mount, selector/connection 소비와 shared integration/archive를 소유한다.
- Alternatives Considered: 별도 OpenSpec은 공통 certificate 이름·lifecycle·rollback 계약을 중복한다. 한 PR에 모두 구현하면 독립 배포가 불가능하다.
- Consequences: PROD-369 PR이 merge돼도 workload 인증은 바뀌지 않으며 change는 active 상태로 남는다.
- Confirmation / Follow-up: PR별 task ownership과 미완료 PROD-470 task를 유지한다.

### API와 Worker manifest를 명시적으로 분리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: 두 역할은 BYPASSRLS와 이후 소비·lifecycle이 독립적으로 달라질 수 있다.
- Decision Outcome: API와 Worker DatabaseRole을 별도 YAML document로 선언하고 공통 release prefix 계산만 공유한다.
- Alternatives Considered: `range`는 차이가 늘 때 조건 분기를 누적시키므로 선택하지 않았다. 현재 두 caller만을 위한 helper도 만들지 않는다.
- Consequences: 공통 필드 중복보다 각 역할 diff의 독립성을 우선한다.
- Confirmation / Follow-up: Render에서 두 manifest의 이름·attribute·certificate 설정을 개별 확인한다.

### DatabaseRole은 retain하되 generated certificate lifecycle은 CNPG에 맡긴다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-369`; CloudNativePG 1.30 공식 계약
- Status: Active
- Context / Problem: 과거 chart rollback이 PostgreSQL identity를 자동 DROP해서는 안 되지만, private key Secret을 orphan으로 남겨서도 안 된다.
- Decision Outcome: DatabaseRole은 `databaseRoleReclaimPolicy: retain`, 리소스 prune은 `Prune=confirm`을 유지한다. Generated certificate Secret은 CNPG owner reference lifecycle을 따른다.
- Alternatives Considered: reclaim `delete`는 후속 ACL/소비 뒤 role을 제거할 위험이 있다. Secret 수동 retain은 CNPG rotation ownership을 깨뜨린다.
- Consequences: DatabaseRole 삭제 시 role은 남고 certificate Secret은 삭제된다. 소비 뒤 rollback은 workload를 먼저 이전 인증으로 되돌려야 한다.
- Confirmation / Follow-up: Render lifecycle과 live deletion 절차를 검증한다.

### Certificate 갱신은 대상 workload의 계획 재시작으로 소비한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-470`; 2026-08-10 사용자 승인
- Status: Active
- Context / Problem: CNPG는 역할별 certificate Secret을 자동 갱신하지만 기존 Postgres.js process와 connection pool을 재시작하거나 key를 다시 읽게 하지 않는다. 현재 cluster에는 Secret 갱신 전용 restart controller도 없다.
- Decision Outcome: DatabaseRole status expiration과 generated Secret 갱신을 관측하고 만료 전에 해당 certificate를 소비하는 API/Web/Worker workload만 계획 재시작한다. Application hot reload, pool hot swap과 새 restart controller는 구현하지 않는다.
- Alternatives Considered: Application hot reload는 pool drain과 동시성 실패 계약을 크게 만들고, restart controller는 별도 cluster-wide 운영·권한 범위를 추가하므로 선택하지 않았다.
- Consequences: 인증서 발급·갱신은 CNPG가, 갱신된 key의 process 반영은 운영 runbook이 소유한다. API와 Worker selector는 독립적이므로 한 역할의 재시작이 다른 workload로 불필요하게 확장되지 않아야 한다.
- Confirmation / Follow-up: 비운영에서 Secret 갱신 뒤 대상 workload만 재시작해 새 connection의 CN과 `current_user`를 재검증한다.

### PR merge와 production apply 승인을 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-369`, `PROD-470`; 2026-08-10 사용자 결정
- Status: Active
- Context / Problem: role/certificate와 후속 auth manifest는 production identity와 접근 경계를 변경한다.
- Decision Outcome: PR merge, manifest 준비 또는 CI 성공은 production apply 승인이 아니다. 사용자의 별도 명시적 승인 뒤에만 production sync/apply한다.
- Alternatives Considered: merge 기반 자동 승인은 live preflight와 rollback 확인을 건너뛴다.
- Consequences: 코드 준비와 live completion을 분리하고 production task는 승인 전 미완료로 남긴다.
- Confirmation / Follow-up: PR/Linear에 미실행 live gate를 명시한다.

## Remaining Decisions

없음.

## Superseded Decisions

- PROD-369의 Vault `api-database`/`worker-database` password source와 basic-auth Secret 결정은 CNPG 역할별 client certificate 결정으로 대체됐다.
- 이전 PROD-470의 shared `kosmo_runtime`, Vault PKI 기반 전체 연결·migration·replication 전환은 최신 선택적 API/Worker certificate 인증 경계로 대체됐다.
