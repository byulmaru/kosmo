## MODIFIED Requirements

### Requirement: Worker 역할별 DB 입력 seam

**Authority / Provenance:** `PROD-730`, `PROD-709`, `PROD-715` — 활성화된 Worker Deployment는 API/Web BFF 기본 역할의 완전하게 구성된 PostgreSQL credential values를 기존 `DATABASE_URL`/`DATABASE_PASSWORD`로, trusted Worker 실행 경계의 기존 owner/password fallback values를 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`로 각각 투영해야 한다(MUST). 부분 credential 설정은 chart render 단계에서 실패해야 하며(MUST), 이 fallback seam을 password가 없는 `kosmo_worker`의 실제 credential로 해석해서는 안 된다(MUST NOT). Foundation 자체는 business DB connection을 열거나 credential·권한을 생성·전환하지 않아야 한다(MUST NOT).

#### Scenario: 역할별 credential이 구성됨

- **WHEN** Worker component를 활성화하고 API와 Worker 역할의 URL·password Secret name·key를 완전하게 제공한다
- **THEN** Deployment는 `DATABASE_URL`/`DATABASE_PASSWORD`와 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`를 기본 연결과 Worker owner/password fallback 입력으로 가진다
- **AND** `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 Worker credential alias로 투영하지 않는다
- **AND** `WORKER_DATABASE_PASSWORD`를 `kosmo_worker` client-certificate 인증 입력으로 사용하지 않는다

#### Scenario: 역할별 credential이 부분 구성됨

- **WHEN** 역할별 URL·password Secret name·key 중 일부만 제공한다
- **THEN** chart render가 해당 `api` 또는 `worker` source를 식별하는 incomplete credential 오류로 실패한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 제공된 DB 입력으로 connection을 열지 않고 구성 오류로 종료한다
