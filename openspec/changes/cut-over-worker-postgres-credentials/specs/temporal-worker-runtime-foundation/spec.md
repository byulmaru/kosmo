## MODIFIED Requirements

### Requirement: Worker 역할별 DB 입력 seam

**Authority / Provenance:** `PROD-730`, `PROD-709`, `PROD-715` — 활성화된 Worker Deployment는 API/Web BFF 기본 connection을 기존 `DATABASE_URL`/`DATABASE_PASSWORD`로 유지하고, 완전하게 구성된 trusted Worker credential을 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`로 별도 투영해야 한다(MUST). 부분 credential 설정은 chart render 단계에서 실패해야 한다(MUST). Foundation 자체는 business DB connection을 열거나 credential·권한을 생성·전환하지 않아야 한다(MUST NOT).

#### Scenario: 역할별 credential이 구성됨

- **WHEN** Worker component를 활성화하고 API와 Worker 역할의 URL·password Secret name·key를 완전하게 제공한다
- **THEN** Deployment는 기본 `DATABASE_*`와 별도 `WORKER_DATABASE_*` 입력을 가진다
- **AND** `FEDIFY_DATABASE_*`를 alias로 투영하지 않는다

#### Scenario: 역할별 credential이 부분 구성됨

- **WHEN** 역할별 URL·password Secret name·key 중 일부만 제공한다
- **THEN** chart render가 해당 `api` 또는 `worker` source를 식별하는 incomplete credential 오류로 실패한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 제공된 DB 입력으로 connection을 열지 않는다
