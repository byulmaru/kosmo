## Context

이 기록은 PROD-470이 승인한 Vault PKI 기반 PostgreSQL client/server 인증서 경계와, 현재 Vault wrapper·Postgres.js·CNPG Helm 구조에서 이를 선택적으로 구현하기 위한 결정을 반영한다. 제품 도메인 또는 UI canonical 문서는 적용되지 않는다.

## Decision Records

### Vault PKI를 client와 server 인증서의 공통 발급자로 사용한다

- Decision Date: 2026-07-24
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Status: Active
- Context / Problem: CNPG가 만든 client private key를 로컬에 전달하려면 Kubernetes Secret을 Vault KV에 역동기화해야 하고, Tailnet hostname으로 접속하는 로컬 client는 별도의 검증 가능한 server certificate도 필요하다.
- Decision Outcome: Vault PKI의 같은 issuer chain에서 제한된 client/server role로 인증서를 발급하고, CNPG는 공개 CA와 server leaf certificate만 받는다. 로컬과 Kubernetes client는 같은 CA로 server chain을 검증한다.
- Alternatives Considered: CNPG 발급 private key를 Vault KV에 복사하면 발급·회전 source가 둘이 되고, client certificate만 Vault에서 발급하면서 CNPG 기본 server CA를 별도로 배포하면 로컬 신뢰 경로가 이원화된다.
- Consequences: Vault role은 client/server key usage, CN과 SAN을 각각 제한해야 한다. production CA hierarchy와 폐기 정책은 별도 후속 범위다.
- Confirmation / Follow-up: Helm render에서 server/client PKI role과 CA 참조를 확인하고, 실제 dev 적용 시 Tailnet hostname 검증을 smoke test한다.

### 인증서 연결은 opt-in이고 password 연결을 기본으로 보존한다

- Decision Date: 2026-07-24
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Status: Active
- Context / Problem: 현재 Vault PKI role과 VSO ACL은 외부 인프라에 아직 존재하지 않고 PROD-369의 이번 사이클 password 역할 분리를 방해하면 안 된다.
- Decision Outcome: 로컬 PKI 설정과 Helm PKI flag가 없으면 기존 KV/password 연결과 manifest를 유지한다. 일부만 설정된 상태는 조용히 fallback하지 않고 오구성으로 실패한다.
- Alternatives Considered: 즉시 PKI를 기본값으로 활성화하면 기존 dev 배포가 실패하고, 부분 설정에서 password fallback을 허용하면 운영자가 인증서 보호가 적용됐다고 오인할 수 있다.
- Consequences: PR merge만으로 인증 방식은 바뀌지 않으며 인프라 선행 구성과 명시적 dev enable 단계가 필요하다.
- Confirmation / Follow-up: 비활성·활성 Helm render와 로컬 PKI 설정 없음·부분 설정 test를 각각 둔다.

### PostgreSQL TLS 입력은 표준 파일 환경변수 세 개로 통일한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Status: Active
- Context / Problem: API/web, migration, Drizzle Kit과 로컬 wrapper가 서로 다른 인증서 옵션을 사용하면 연결 경로별 검증 차이가 생긴다.
- Decision Outcome: 모든 경로는 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT`를 입력으로 사용하며 세 값을 모두 읽어 Postgres.js TLS 옵션에 전달하고 서버 검증을 활성화한다.
- Alternatives Considered: 인증서 PEM을 환경변수에 직접 넣으면 multiline secret이 process env에 남고, URL query만 사용하면 현재 Postgres.js/Drizzle 경로에서 파일 읽기와 검증 동작을 일관되게 통제하기 어렵다.
- Consequences: 각 실행 환경은 인증서를 파일로 제공해야 하고, 세 값 중 일부만 있으면 시작 전에 실패한다.
- Confirmation / Follow-up: 공통 helper unit test와 API/migration/Drizzle 구성의 재사용 여부를 검증한다.

### Kubernetes에서는 runtime과 migration 로그인만 분리하고 leaf key는 workload별로 발급한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Status: Active
- Context / Problem: API와 web/federation은 동일한 애플리케이션 runtime 권한 경계를 공유하고 federation은 web 프로세스의 공통 DB pool을 사용한다. 프로세스마다 PostgreSQL 로그인을 만들 필요는 없지만 leaf private key를 공유하면 한 workload의 Secret 노출 범위가 다른 workload로 커진다. Postgres.js는 시작 시 인증서를 Buffer로 읽는다.
- Decision Outcome: Helm은 API와 web에 서로 다른 VaultPKISecret을 만들되 둘 다 같은 runtime Vault role과 `kosmo_runtime` common name을 사용한다. migration만 별도 로그인과 VaultPKISecret을 사용한다. 외부 client CA private key를 CNPG에 주지 않으므로 `streaming_replica` 인증서도 Vault에서 발급해 `replicationTLSSecret`으로 지정한다. API와 web 인증서 회전은 VSO의 Argo Rollout restart target으로 새 pool을 만들고, migration hook Job은 생성 시 최신 Secret을 읽는다.
- Alternatives Considered: API와 web에 별도 DB 로그인을 만들면 실제 권한 경계보다 자격 증명과 `pg_hba`가 늘어난다. 하나의 runtime client Secret을 공유하면 계정 수는 줄지만 private key와 회전 실패 범위가 결합된다. file watch로 singleton pool을 교체하는 방식은 현재 전역 Drizzle client 수명 주기에 복잡성을 추가한다.
- Consequences: 앱 PostgreSQL 로그인은 runtime과 migration 두 개만 유지하면서 API와 web의 private key·회전 경계는 분리된다. Vault client role도 runtime과 migration만 필요하다.
- Confirmation / Follow-up: 활성 Helm render에서 다섯 PKI Secret, 두 앱 `pg_hba` 역할, API/web의 같은 common name과 DATABASE_URL, 다른 Secret, CNPG replication TLS와 두 Rollout restart target을 확인한다.

### PKI resource 준비와 client 인증 활성화를 두 sync로 나눈다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다), [PR #353 review](https://github.com/byulmaru/kosmo/pull/353#discussion_r3643443210)
- Status: Active
- Context / Problem: dev migration은 Argo CD PreSync hook이므로 같은 sync의 일반 VSO와 CNPG resource보다 먼저 실행된다. 첫 PKI 활성화에서 migration이 아직 생성되지 않은 certificate Secret이나 아직 적용되지 않은 `cert` 인증을 사용하면 sync가 실패한다.
- Decision Outcome: `postgresTls.enabled`는 VSO PKI Secret과 CNPG TLS·`pg_hba`를 준비하고, 별도 `clientAuthEnabled`가 API·web·migration의 certificate 연결을 활성화한다. 첫 sync는 client 인증을 끈 채 기존 password 연결로 migration을 실행하고, 준비 완료 뒤 두 번째 sync에서 client 인증을 켠다.
- Alternatives Considered: migration을 Sync/PostSync로 옮기면 기존의 migration-before-rollout 계약이 바뀐다. PKI resource를 PreSync hook으로 만들면 CNPG와 VSO의 비동기 준비까지 안전하게 보장하기 어렵다. 첫 활성화 실패 가능성을 문서에만 남기는 방식은 배포 flag가 이를 강제하지 못한다.
- Consequences: PKI 활성화에는 두 번의 sync가 필요하지만 준비 단계와 rollback이 명시적이며 기존 PreSync 순서를 보존한다.
- Confirmation / Follow-up: 준비 render에서 PKI resource와 CNPG TLS는 존재하지만 세 consumer가 password를 유지하고, 활성 render에서 세 consumer가 certificate 파일을 사용하는지 확인한다.

### 로컬 client private key는 명령 수명의 임시 파일로만 유지한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Status: Active
- Context / Problem: Postgres.js는 TLS key 파일 내용을 필요로 하지만 발급된 private key를 repository, 고정 사용자 경로나 Vault KV에 저장하면 수명과 정리 책임이 불명확해진다.
- Decision Outcome: wrapper가 OS 임시 디렉터리에 mode `0600` 파일을 만들고 자식 프로세스 종료 뒤 디렉터리를 제거한다. Vault JSON과 PEM은 로그에 출력하지 않는다.
- Alternatives Considered: 고정 `~/.postgresql` 경로는 병렬 실행과 stale key 정리 문제가 있고, PEM 환경변수는 process 환경 노출과 도구별 변환이 필요하다.
- Consequences: 갑작스러운 프로세스 강제 종료에서는 OS 임시 파일이 다음 정리 주기까지 남을 수 있으므로 짧은 인증서 TTL과 소유자 전용 권한이 필요하다.
- Confirmation / Follow-up: 자식 성공·실패와 PKI 발급 오류 test에서 임시 파일 정리 및 secret 비출력을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-24의 API, web, migration별 PostgreSQL 로그인 분리 결정은 같은 날 사용자가 프로세스 수가 아니라 실제 권한 경계만 로그인으로 나누기로 확정해 위 runtime/migration 결정으로 대체했다.
