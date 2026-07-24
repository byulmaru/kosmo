## ADDED Requirements

### Requirement: PostgreSQL 연결은 완전한 client certificate 설정만 사용한다

**Authority / Provenance:** [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다) — Kosmo의 PostgreSQL client는 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT`가 모두 제공되면 client certificate와 신뢰할 CA를 사용하고 서버 인증서 검증을 활성화해야 한다(MUST). 세 값이 모두 없으면 기존 비밀번호 또는 로컬 연결을 유지해야 하며(MUST), 일부만 있으면 네트워크 연결 전에 실패해야 한다(MUST).

#### Scenario: 완전한 TLS 파일 설정

- **WHEN** 세 TLS 파일 경로가 모두 제공된다
- **THEN** API, web과 migration runner는 해당 certificate, private key와 CA로 서버 인증서를 검증하며 PostgreSQL에 연결한다

#### Scenario: TLS 설정 없음

- **WHEN** 세 TLS 파일 경로가 모두 제공되지 않는다
- **THEN** 기존 `DATABASE_URL` 기반 연결이 TLS client certificate 없이 유지된다

#### Scenario: 부분 TLS 설정

- **WHEN** 세 TLS 파일 경로 중 일부만 제공된다
- **THEN** 시스템은 누락된 설정을 식별하는 오류로 PostgreSQL 네트워크 연결 전에 실패한다

### Requirement: 로컬 명령은 Vault PKI 인증서를 일시적으로 사용한다

**Authority / Provenance:** [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다) — 로컬 Vault wrapper는 PKI role과 common name이 설정된 경우 현재 Vault 인증으로 client certificate를 발급받고, certificate·private key·CA를 현재 명령만 접근할 수 있는 임시 파일로 렌더링해 자식 프로세스에 표준 PostgreSQL TLS 파일 환경변수로 전달해야 한다(MUST). wrapper는 명령의 성공·실패와 무관하게 임시 파일을 정리해야 하며(MUST), PKI 설정이 없으면 기존 KV 환경변수 주입만 수행해야 한다(MUST).

#### Scenario: 로컬 PKI 실행 성공

- **WHEN** 인증된 개발자가 PKI role과 PostgreSQL role에 대응하는 common name으로 Vault wrapper를 실행한다
- **THEN** 자식 명령은 발급된 인증서를 가리키는 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT`를 받고 원래 exit status를 반환한다

#### Scenario: PKI 발급 실패

- **WHEN** Vault가 인증서 발급 요청을 거부하거나 유효한 인증서 응답을 반환하지 않는다
- **THEN** wrapper는 자식 명령을 실행하지 않고 비밀 값을 출력하지 않은 채 실패한다

#### Scenario: 자식 명령 종료

- **WHEN** 인증서를 받은 자식 명령이 성공하거나 실패하여 종료한다
- **THEN** wrapper는 임시 인증서 디렉터리를 제거하고 자식 명령의 exit status를 보존한다

#### Scenario: PKI를 사용하지 않는 로컬 실행

- **WHEN** PKI role과 common name이 설정되지 않는다
- **THEN** wrapper는 임시 인증서를 발급하지 않고 현재 Vault KV 값을 자식 명령에 전달한다

### Requirement: Kubernetes workload는 Vault PKI 인증서를 회전 가능하게 소비한다

**Authority / Provenance:** [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다) — Helm chart는 명시적으로 활성화된 환경에서 Vault Secrets Operator가 같은 issuer의 PostgreSQL client/server certificate를 발급·동기화하고, client certificate를 API와 web workload에 읽기 전용 파일로 마운트하며 server certificate를 CNPG에 제공하도록 구성해야 한다(MUST). API와 web은 서로 다른 leaf Secret을 사용하되 같은 `kosmo_runtime` common name과 PostgreSQL 로그인을 사용해야 하며(MUST), migration은 별도 로그인과 leaf Secret을 사용해야 한다(MUST). server certificate는 CNPG 내부 read-write 서비스와 설정된 로컬 Tailnet 접속 hostname을 SAN에 포함해야 한다(MUST). client certificate가 회전되면 시작 시 TLS 파일을 읽는 workload가 새 인증서를 사용하도록 Rollout을 재시작해야 한다(MUST). VSO Secret과 CNPG TLS 준비와 workload client 인증 활성화는 별도 sync로 수행할 수 있어야 하며(MUST), 준비 단계의 PreSync migration과 workload는 기존 password 연결을 유지해야 한다(MUST). 기능이 비활성화된 기본값에서는 기존 password Secret manifest를 유지해야 한다(MUST).

#### Scenario: Kubernetes PKI 활성화

- **WHEN** Helm values가 Vault PKI mount, server/runtime/migration/replication role, PostgreSQL role과 TTL을 설정한다
- **THEN** render 결과는 client/server/replication `VaultPKISecret`, CNPG server 및 replication TLS 참조, 대상 Secret, API/web TLS volume과 표준 TLS 파일 환경변수 및 두 Rollout의 restart target을 포함한다

#### Scenario: runtime 로그인 공유와 leaf key 분리

- **WHEN** API와 web workload의 client certificate가 발급된다
- **THEN** 두 인증서는 별도 Secret과 private key를 사용하지만 common name과 DATABASE_URL username은 동일한 `kosmo_runtime` 역할을 사용한다

#### Scenario: 첫 PKI 준비 sync

- **WHEN** PKI resource provisioning은 활성화했지만 client 인증 활성화는 보류한다
- **THEN** server와 client VaultPKISecret 및 CNPG TLS·`pg_hba`는 render되고 API·web·PreSync migration은 기존 password URL과 Secret을 계속 사용한다

#### Scenario: 준비 이후 client 인증 활성화

- **WHEN** 이전 sync에서 VSO destination Secret과 CNPG TLS가 준비된 뒤 client 인증을 활성화한다
- **THEN** PreSync migration과 뒤따르는 API·web workload가 각 client certificate를 사용한다

#### Scenario: 인증서 회전

- **WHEN** Vault Secrets Operator가 destination Secret의 인증서를 갱신한다
- **THEN** API와 web Rollout이 재시작되어 새 프로세스와 커넥션 풀이 갱신된 인증서를 읽는다

#### Scenario: Kubernetes PKI 비활성화

- **WHEN** PKI Helm values가 활성화되지 않는다
- **THEN** render 결과는 PKI 리소스와 TLS volume을 추가하지 않고 현재 password 기반 DB 연결을 유지한다

### Requirement: CNPG는 Vault PKI로 client와 server TLS를 검증한다

**Authority / Provenance:** [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다) — PKI가 활성화된 Helm 구성은 CNPG가 Vault PKI CA의 공개 인증서를 신뢰하고 runtime과 migration database role에 한정된 `hostssl ... cert` 규칙을 사용하며, 같은 issuer가 서명하고 실제 접속 hostname을 SAN에 포함한 server certificate를 제공하도록 해야 한다(MUST). client certificate common name은 요청하는 PostgreSQL role과 일치해야 하며(MUST), API와 web을 프로세스 단위의 별도 PostgreSQL 로그인으로 늘려서는 안 된다(MUST NOT). CA private key를 CNPG 또는 repository에 복제해서는 안 된다(MUST NOT).

#### Scenario: 올바른 역할 인증서

- **WHEN** 신뢰된 Vault PKI CA가 PostgreSQL role과 같은 common name으로 발급한 인증서가 연결에 사용된다
- **THEN** PostgreSQL은 대상 `hostssl` 규칙에서 비밀번호 없이 `cert` 인증을 허용한다

#### Scenario: 다른 역할의 인증서

- **WHEN** 인증서 common name과 요청한 PostgreSQL role이 일치하지 않는다
- **THEN** PostgreSQL은 해당 연결을 인증하지 않는다

#### Scenario: 제한된 앱 로그인 집합

- **WHEN** PKI 활성 CNPG `pg_hba`가 render된다
- **THEN** 앱 규칙은 공유 runtime과 별도 migration 역할만 포함하고 API·web·federation별 역할을 추가하지 않는다

#### Scenario: 로컬 Tailnet 서버 검증

- **WHEN** 로컬 프로세스가 설정된 Tailnet hostname으로 CNPG에 연결한다
- **THEN** client는 같은 Vault PKI issuer CA로 server certificate chain과 hostname SAN을 검증한다

#### Scenario: CA 공개 인증서 배포

- **WHEN** Vault PKI CA가 CNPG에 구성된다
- **THEN** CNPG에는 검증용 CA 공개 인증서와 별도 server leaf certificate·key만 제공되고 CA private key는 제공되지 않는다

### Requirement: 인증 자료는 저장소와 로그에 노출되지 않는다

**Authority / Provenance:** [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다) — 시스템은 client certificate private key, Vault token과 실제 database connection URL을 repository 또는 명령 로그에 기록해서는 안 된다(MUST NOT). 로컬 private key 파일은 소유자만 읽을 수 있어야 하며(MUST), Kubernetes에서는 Secret volume을 읽기 전용으로 마운트해야 한다(MUST).

#### Scenario: 로컬 인증서 렌더링

- **WHEN** Vault wrapper가 client certificate 응답을 파일로 렌더링한다
- **THEN** private key는 소유자 전용 권한을 가지며 stdout과 stderr에 출력되지 않는다

#### Scenario: Kubernetes 인증서 마운트

- **WHEN** API 또는 web Pod가 VSO destination Secret을 소비한다
- **THEN** 인증서 volume은 읽기 전용으로 마운트되고 manifest에는 실제 인증서나 개인키 값이 포함되지 않는다
