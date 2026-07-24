## Context

현재 `scripts/vault-run.mjs`는 Vault KV를 환경변수로만 주입하고, `packages/core/db/index.ts`와 migration runner는 `DATABASE_URL`만 Postgres.js에 전달한다. Helm chart는 CNPG가 만든 하나의 password Secret으로 API, web과 migration Job을 연결하며 dev CNPG를 Tailscale LoadBalancer로 노출한다.

PROD-470은 이 password 경로를 기본값으로 보존하면서, PROD-369가 분리할 일반 runtime과 migration DB 역할이 동일한 Vault PKI issuer의 client certificate를 사용할 수 있는 선택적 경로를 추가한다. API와 web/federation은 별도 leaf key를 사용하지만 하나의 `kosmo_runtime` 로그인 경계를 공유한다. 로컬 client가 Tailnet hostname을 검증하려면 CNPG server certificate도 같은 issuer에서 발급되고 해당 hostname과 내부 read-write Service 이름을 SAN으로 가져야 한다.

## Goals / Non-Goals

**Goals:**

- Postgres.js, migration runner와 Drizzle Kit에 일관된 all-or-none TLS 파일 설정을 제공한다.
- 로컬 명령이 Vault PKI client certificate를 일시적으로 발급받고 흔적 없이 정리한다.
- Helm이 workload 및 CNPG replication client certificate와 CNPG server certificate를 VSO로 동기화하고 회전을 반영한다.
- 비활성 기본값에서 현재 password 및 로컬 Docker 연결을 보존한다.

**Non-Goals:**

- Vault PKI engine, issuer, client/server role과 ACL을 이 저장소에서 provision하지 않는다.
- PROD-369의 DB 역할·grant·RLS 또는 이번 사이클 배포 순서를 변경하지 않는다.
- 테스트 PostgreSQL을 인증서 방식으로 전환하지 않는다.
- production CA hierarchy, CRL/OCSP와 production rollout을 결정하지 않는다.

## Implementation Guidance

### Current Constraints

- Postgres.js client가 모듈 import 시 생성되므로 인증서 파일은 프로세스 시작 시 읽힌다. Secret volume만 갱신하면 기존 pool은 새 인증서를 사용하지 않는다.
- migration runner와 Drizzle Kit도 별도 connection 생성 경로를 가져 공통 TLS helper를 사용하지 않으면 로컬 schema 작업과 runtime 동작이 갈라진다.
- `VaultPKISecret`은 `kubernetes.io/tls` destination에서 Vault 응답을 `tls.crt`와 `tls.key`로 변환할 수 있고 destination transformation으로 `issuing_ca`를 `ca.crt`에 추가할 수 있다.
- CNPG의 `clientCASecret`, `serverCASecret`과 `serverTLSSecret`은 같은 namespace Secret을 참조한다. CA private key는 필요하지 않다.
- VSO rollout restart target은 Argo Rollout을 지원하지만 Job은 지원하지 않는다. migration Job은 Argo CD hook이 새로 생성될 때 최신 Secret을 읽는다.
- 현재 chart는 하나의 `kosmo` owner 연결만 가진다. PKI values는 runtime, migration과 CNPG replication의 role 및 Vault role을 표현하되, 비활성 기본값에서는 기존 manifest를 바꾸지 않아야 한다. API와 web은 같은 runtime 설정에서 각각 leaf certificate를 발급받는다.

### Recommended Approach

DB package에 세 TLS 경로를 함께 검증하고 파일 내용을 Postgres.js `ssl` 옵션으로 만드는 작은 공통 helper를 둔다. 세 경로가 없으면 `undefined`를 반환하고 일부만 있거나 파일을 읽지 못하면 client 생성 전에 실패하게 한다. API/web singleton, migration runner와 Drizzle Kit가 이 helper를 재사용한다.

로컬 wrapper는 기존 KV 조회 뒤 `DATABASE_PKI_ROLE`과 `DATABASE_PKI_COMMON_NAME`이 함께 있으면 `DATABASE_PKI_MOUNT`의 `issue/<role>`을 호출한다. 반환된 `certificate`, `private_key`, `issuing_ca`를 `mkdtemp`로 만든 디렉터리에 mode `0600`으로 쓰고 표준 `PGSSL*` 경로를 자식 env에 추가한다. 자식 명령 종료 뒤 `finally` 성격의 정리 경계에서 디렉터리를 제거한다. PKI 설정 두 값 중 하나만 있으면 오구성으로 실패한다.

Helm values는 PKI resource provisioning과 client 인증 활성화를 분리하는 기본값과 server, runtime, migration 및 CNPG replication별 PKI role/DB role을 제공한다. `postgresTls.enabled` 활성화 시 server `VaultPKISecret` 하나, API와 web의 별도 runtime client `VaultPKISecret`, migration client `VaultPKISecret`, `streaming_replica` client `VaultPKISecret`을 만들고 모두 같은 mount/issuer chain을 사용한다. server destination Secret은 `tls.crt`, `tls.key`, `ca.crt`를 가져 CNPG의 server/client CA와 server TLS에 사용한다. 외부 client CA에는 private key를 포함하지 않으므로 replication 인증서도 Vault에서 발급해 `replicationTLSSecret`으로 지정한다. API와 web client Secret은 서로 다른 key를 가지지만 같은 runtime Vault role과 common name을 사용하며 각 consumer에만 mount한다. API와 web certificate에는 해당 Rollout restart target을 지정한다.

첫 sync에서는 `postgresTls.enabled=true`, `clientAuthEnabled=false`로 PKI Secret과 CNPG TLS·`pg_hba`를 준비하면서 API·web·PreSync migration은 기존 password URL을 유지한다. VSO destination Secret과 CNPG TLS가 준비된 다음 sync에서 `clientAuthEnabled=true`로 바꾸면 workload의 `DATABASE_URL`에서 password를 제거하고 API와 web에는 runtime role, migration에는 migration role을 사용한다. server certificate 요청에는 `<cluster>-rw`, namespace-qualified Service 이름, cluster-local FQDN과 설정된 Tailnet hostname을 SAN으로 포함한다.

### Allowed Alternatives

- 공통 TLS helper가 동일한 all-or-none 검증과 서버 검증을 보장한다면 함수명과 파일 위치는 달라도 된다.
- VSO destination transformation 대신 동일한 `tls.crt`, `tls.key`, `ca.crt` Secret shape를 안전하게 생성하는 VSO 공식 기능을 사용할 수 있다.
- Helm test를 별도 플러그인 대신 `helm template` 출력 assertion으로 구현할 수 있다.

### Known Traps

- `rejectUnauthorized: false`나 `sslmode=require`만 사용하면 Tailnet 경로의 서버 identity를 검증하지 못한다.
- client 발급 응답의 `issuing_ca`를 server root로 쓰려면 server/client role이 같은 issuer chain을 사용해야 한다.
- CNPG가 만든 client private key를 Vault KV로 복사하면 발급 source와 rotation source가 둘이 된다.
- Secret volume 갱신만 믿으면 시작 시 Buffer로 읽은 Postgres.js pool은 인증서를 다시 읽지 않는다.
- private key나 Vault JSON을 오류 진단 목적으로 출력하면 안 된다.
- PKI 기능을 기본 활성화하면 아직 Vault role이 없는 기존 dev 배포가 즉시 깨진다.

## Risks / Trade-offs

- [VSO destination transformation 또는 CRD 버전 불일치] → 현재 설치된 VSO CRD와 공식 `v1beta1` schema를 배포 전 확인하고 Helm render test로 manifest shape를 고정한다.
- [인증서 회전 중 workload 재시작] → Argo Rollout restart target으로 새 Pod를 만들고 현재 blue/green availability 경계를 사용한다.
- [Vault PKI 또는 VSO 장애로 신규 인증서 발급 실패] → 기존 유효 인증서가 만료되기 전에 관측하고, 기능 flag를 내려 기존 password manifest로 rollback할 수 있게 한다.
- [PreSync migration이 첫 활성화에서 아직 없는 Secret을 참조] → resource 준비와 client 인증 활성화를 두 sync로 나누고 준비 단계에서는 migration과 workload가 password 연결을 유지한다.
- [같은 issuer가 client/server 용도를 함께 서명] → Vault role에서 각각 client/server key usage와 허용 CN/SAN을 제한한다. CA hierarchy 분리는 production 후속 범위다.
- [workload별 Secret 증가] → API와 web이 DB 로그인을 공유해도 private key와 회전 실패 범위를 분리하는 비용으로 수용한다.

## Migration Plan

1. 이 PR을 PKI 비활성 기본값으로 배포해 기존 manifest와 runtime 동작을 보존한다.
2. 인프라 저장소에서 Vault PKI issuer와 제한된 server/runtime/migration/replication role 및 VSO ACL을 만든다.
3. dev values에 runtime·migration role, TTL과 Tailnet hostname을 설정하고 `postgresTls.enabled=true`, `clientAuthEnabled=false`로 sync해 VSO destination Secret과 CNPG TLS 준비를 확인한다.
4. 준비 완료 뒤 `clientAuthEnabled=true`로 두 번째 sync하고 `current_user`, server hostname 검증과 API/web smoke를 확인한다.
5. 로컬 Vault KV에 `DATABASE_URL`, `DATABASE_PKI_MOUNT`, `DATABASE_PKI_ROLE`, `DATABASE_PKI_COMMON_NAME`, 선택적 TTL을 설정하고 Tailnet 연결을 확인한다.
6. rollback은 PKI flag를 비활성화하고 기존 password Secret 기반 manifest와 workload를 함께 복원한다.

## Open Questions

없음. production CA 분리와 폐기 정책은 PROD-470의 제외 범위다.
