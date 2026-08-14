## MODIFIED Requirements

### Requirement: Worker workload 기본 DB source

**Authority / Provenance:** `PROD-730`, `PROD-709`, `PROD-715` — 활성화된 Worker Deployment는 완전하게 구성된 Worker credential을 process 기본 `DATABASE_URL`/`DATABASE_PASSWORD`로 사용해야 한다(MUST). 부분 credential 설정은 chart render 단계에서 실패해야 한다(MUST). 별도 `WORKER_DATABASE_*` application connection을 만들거나 foundation 자체가 business DB connection을 열어서는 안 된다(MUST NOT).

#### Scenario: 역할별 credential이 구성됨

- **WHEN** Worker component를 활성화하고 Worker 역할의 URL·password Secret name·key를 완전하게 제공한다
- **THEN** Deployment의 기본 `DATABASE_*`는 Worker source를 참조한다
- **AND** `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않는다

#### Scenario: 역할별 credential이 부분 구성됨

- **WHEN** 역할별 URL·password Secret name·key 중 일부만 제공한다
- **THEN** chart render가 해당 `api` 또는 `worker` source를 식별하는 incomplete credential 오류로 실패한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 기본 DB 입력이 존재해도 connection을 열지 않는다
