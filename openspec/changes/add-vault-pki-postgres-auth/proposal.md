## Why

Kosmo의 로컬 실행과 Kubernetes workload는 모두 dev CNPG에 접속할 수 있지만, 현재는 Vault KV와 CNPG가 제공하는 비밀번호에 의존한다. 후속으로 client certificate 인증을 도입할 때 CNPG가 만든 개인키를 Vault에 다시 복사하지 않으면서 두 실행 경로가 동일한 Vault PKI 발급·PostgreSQL `cert` 인증 계약을 사용하게 해야 한다.

## What Changes

- PostgreSQL client certificate 파일 세 개가 모두 제공된 환경에서 API, web과 migration runner가 서버 검증을 포함한 TLS 연결을 사용한다.
- 로컬 Vault wrapper가 선택적으로 Vault PKI 인증서를 발급받아 권한이 제한된 임시 파일로 자식 명령에 전달하고 종료 뒤 정리한다.
- Helm chart가 선택적으로 Vault PKI client/server 인증서 동기화, CNPG client CA와 `cert` 인증, 검증 가능한 server TLS, workload 인증서 mount와 회전 시 재시작을 구성한다.
- 인증서 설정이 없는 로컬 Docker PostgreSQL과 기존 배포는 현재 비밀번호 연결을 유지한다.
- Vault PKI engine·issuer·role·ACL provisioning, PostgreSQL 역할 분리와 production 인증서 운영은 변경하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음.
- Linear Contract: [PROD-470](https://linear.app/byulmaru/issue/PROD-470/vault-pki-인증서로-로컬kubernetes-postgresql-연결을-통합한다)
- Linear Implementations: 없음. PROD-470이 단일 계약·구현 이슈를 함께 소유한다.

## Capabilities

### New Capabilities

- `postgres-client-authentication`: 로컬과 Kubernetes 실행이 선택적으로 같은 Vault PKI issuer의 client/server certificate를 받아 검증 가능한 PostgreSQL TLS 연결에 사용하는 계약

### Modified Capabilities

없음.

## Impact

- `scripts/vault-run.mjs`의 Vault PKI 발급과 임시 파일 수명 주기
- `packages/core`의 Postgres.js 및 Drizzle migration 연결 설정
- `apps/helm`의 CNPG, Vault Secrets Operator와 workload volume/env 구성
- 로컬 개발 문서, 단위 테스트와 Helm render 검증
- 외부 선행조건인 Vault PKI issuer·client/server role·ACL
