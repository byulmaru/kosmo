## 1. PROD-470 PostgreSQL TLS 연결 경계

**Authority / Provenance**

- [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)

**Deliverable**

API, web, migration과 Drizzle 도구가 완전한 client certificate 설정에서는 검증 가능한 TLS로 연결하고, 설정이 없으면 기존 연결을 유지한다.

**Guardrails**

- 세 TLS 파일은 all-or-none으로 적용하고 일부 설정을 fallback하지 않는다.
- 서버 인증서 검증을 비활성화하지 않는다.
- TLS 설정이 없는 로컬 Docker test database 동작을 바꾸지 않는다.

**Verification**

- 완전한 설정, 설정 없음, 부분 설정과 읽기 실패를 단위 테스트한다.
- package typecheck와 기존 DB migration 검증을 실행한다.

- [x] 1.1 공통 PostgreSQL 연결이 표준 TLS 파일 세 개를 검증하고 API/web과 migration 경로에 동일하게 적용되도록 구현한다.
- [x] 1.2 Drizzle Kit 연결도 같은 TLS 계약을 사용하게 하고 TLS 설정 조합의 회귀 테스트를 추가한다.

## 2. PROD-470 로컬 Vault PKI 실행

**Authority / Provenance**

- [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)

**Deliverable**

로컬 개발 명령이 선택적으로 Vault PKI client certificate를 현재 명령 수명 동안만 사용한다.

**Guardrails**

- private key, Vault token, 실제 DB URL과 Vault JSON을 로그에 출력하지 않는다.
- 임시 private key는 소유자 전용 권한을 사용하고 자식 명령 종료 뒤 제거한다.
- PKI 설정이 없으면 기존 KV 주입 동작을 유지하고 부분 PKI 설정은 실패시킨다.

**Verification**

- fake Vault CLI를 사용해 KV-only, PKI 성공, 부분 설정, 발급 오류, 잘못된 응답과 자식 실패를 검증한다.
- 성공·실패 뒤 임시 인증서 파일이 남지 않고 자식 exit status가 보존되는지 확인한다.

- [x] 2.1 Vault wrapper가 설정된 PKI role에서 client certificate를 발급받아 제한된 임시 파일과 표준 TLS 환경변수로 자식 명령에 전달하고 정리하게 한다.
- [x] 2.2 secret을 출력하지 않는 성공·오류·정리 회귀 테스트와 로컬 사용 문서를 추가한다.

## 3. PROD-470 Kubernetes Vault PKI와 CNPG TLS

**Authority / Provenance**

- [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)

**Deliverable**

Helm chart가 선택적으로 같은 Vault PKI issuer의 server 인증서와 runtime/migration 및 CNPG replication client 인증서를 동기화하고 CNPG 및 consumer에 연결한다.

**Guardrails**

- 비활성 기본값은 기존 password manifest를 유지한다.
- server certificate는 내부 read-write Service와 설정된 Tailnet hostname을 SAN에 포함한다.
- API와 web client CN은 같은 runtime PostgreSQL role과 일치하고, migration만 별도 role을 사용한다.
- API와 web의 leaf Secret 및 private key는 공유하지 않는다.
- 첫 PKI sync에서 VSO와 CNPG가 준비되기 전에 PreSync migration이 certificate Secret을 요구하지 않는다.
- CA private key와 leaf private key 값은 chart source에 포함하지 않는다.
- API/web 인증서 회전 시 새 pool이 인증서를 읽도록 Rollout을 재시작한다.

**Verification**

- 비활성·활성 `helm template` 출력을 검증한다.
- 활성 출력에서 server/API/web/migration/replication PKI Secret, CNPG CA·server·replication TLS, runtime/migration 두 `pg_hba` 역할, API/web의 같은 username과 다른 Secret, workload별 read-only mount와 restart target을 확인한다.

- [x] 3.1 PKI 비활성 기본값과 server/runtime/migration/replication별 Vault role·DB role·TTL·Tailnet SAN values를 정의한다.
- [x] 3.2 활성화 시 API/web의 별도 leaf가 같은 runtime 로그인을 사용하고 migration만 별도 로그인인 VSO client/server/replication certificate, CNPG TLS·`cert` 인증과 workload별 TLS mount를 render하게 한다.
- [x] 3.3 비활성 호환성, password 준비 단계와 활성 PKI의 두 앱 로그인·workload별 leaf manifest 계약을 증명하는 Helm render 검증을 추가한다.

## 4. PROD-470 정합성 및 게시 준비

**Authority / Provenance**

- [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)

**Deliverable**

Linear 계약, OpenSpec, 코드와 문서가 같은 opt-in PKI 범위를 설명하고 PR이 독립적으로 검증 가능하다.

**Guardrails**

- PROD-369의 역할 분리·RLS·이번 사이클 scope와 관계를 변경하지 않는다.
- Vault PKI provisioning과 production 인증서 운영을 구현 완료로 주장하지 않는다.
- OpenSpec change는 전체 운영 scope가 완료되기 전 archive하지 않는다.

**Verification**

- OpenSpec strict validation, formatter, lint, typecheck와 관련 단위·Helm 테스트를 실행한다.
- diff와 Linear issue를 다시 대조하고 PR 본문에 미구현 인프라 선행조건을 명시한다.

- [x] 4.1 README와 관련 memory를 runtime/migration 로그인 및 workload별 leaf 동작과 외부 선행조건에 맞춘다.
- [x] 4.2 관련 검증을 통과시키고 Linear·OpenSpec·diff 정합성을 재확인한다.
- [x] 4.3 PROD-470 브랜치와 한국어 PR에 runtime/migration 결정, 검증과 남은 인프라 선행조건을 기록한다.
