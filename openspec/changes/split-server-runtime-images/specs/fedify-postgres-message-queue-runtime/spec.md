## MODIFIED Requirements

### Requirement: 독립 Fedify queue consumer runtime

**Authority / Provenance:** PROD-448, PROD-709, PROD-715 PR #564, PROD-831. 시스템은 Web/API request runtime과 Temporal Worker 없이도 Fedify inbox/outbox/fan-out queue를 소비할 수 있는 별도 runtime을 제공해야 한다(MUST). 이 runtime은 독립적으로 배포·확장·재시작·rollback할 수 있고(MUST), process 생존과 queue listen 실행 상태를 구분하는 health/readiness와 graceful shutdown을 제공해야 한다(MUST). Queue consumer는 같은 source full SHA와 build identity에서 생성·검증된 runtime release set의 지정된 `fedify-consumer` image를 사용해야 하며(MUST), Web/API producer는 같은 release set의 지정된 `web`/`api` image를 사용해야 한다(MUST).

#### Scenario: consumer 단독 시작

- **WHEN** Fedify PostgreSQL credential과 queue 구성이 유효하고 release set의 지정된 `fedify-consumer` image로 queue consumer runtime만 시작한다
- **THEN** runtime은 Web listener나 Temporal task queue를 시작하지 않고 Fedify inbox/outbox/fan-out consumer를 시작한다
- **AND** liveness는 process 생존을, readiness는 consumer가 종료 중이 아니고 Fedify queue listen을 실행 중임을 나타낸다

#### Scenario: 잘못된 consumer 구성

- **WHEN** 필수 Fedify PostgreSQL queue URL·credential 또는 runtime 구성이 누락되거나 부분 설정된다
- **THEN** runtime은 queue consumer를 시작하지 않고 명확한 구성 오류로 readiness를 제공하지 않는다
- **AND** API 역할 credential이나 owner fallback으로 조용히 전환하지 않는다

#### Scenario: API outbound producer transport credential

- **WHEN** 같은 release set의 지정된 `api` image로 API runtime을 Helm으로 배포한다
- **THEN** API는 domain `DATABASE_URL` 및 trusted Worker execution credential과 분리된 완전한 Fedify queue transport URL·credential을 사용한다
- **AND** derived transport credential으로 연결할 수 없으면 owner/API/Worker credential 또는 direct delivery로 조용히 fallback하지 않고 adapter 오류를 반환한다

#### Scenario: producer와 consumer의 release set image

- **WHEN** Web/API producer와 Fedify queue consumer를 같은 release로 배포한다
- **THEN** Web은 `web`, API는 `api`, consumer는 `fedify-consumer`로 지정된 image를 하나의 source full SHA·build identity release set에서 사용한다
- **AND** producer와 consumer는 범용 application image를 공유하거나 서로 다른 release set의 image를 섞어 사용하지 않는다

#### Scenario: graceful shutdown

- **WHEN** queue consumer runtime이 종료 신호를 받는다
- **THEN** readiness를 먼저 내리고 새 작업 수락을 중단한 뒤 Fedify queue listener와 PostgreSQL connection을 정리한다
- **AND** 종료 중인 작업을 완료된 것으로 잘못 확인하거나 Temporal Worker drain과 결합하지 않는다

#### Scenario: 독립 확장과 rollback

- **WHEN** 운영자가 Fedify queue backlog에 맞춰 consumer replica 수를 바꾸거나 consumer Deployment를 rollback한다
- **THEN** Web/API와 Temporal Worker replica 또는 배포 상태를 함께 바꿀 필요가 없다
- **AND** 같은 PostgreSQL queue의 ordering과 다중 worker 안전성은 Fedify adapter가 유지한다

### Requirement: Production 활성화 승인 경계

**Authority / Provenance:** PROD-448, PROD-722, PROD-831. chart는 queue 전용 환경·실행 여부 분기 없이 Fedify queue database와 credential을 선언하고, 동일 source full SHA와 build identity에서 생성·검증된 immutable runtime release set의 지정된 `web`, `api`, `fedify-consumer` image가 전달되면 API/Web producer connection과 consumer를 application workload와 함께 render해야 한다(MUST). Chart-wide 또는 Worker별 workload activation key는 queue producer/consumer resource 존재를 제어해서는 안 된다(MUST NOT). Production Argo sync/apply는 queue database·credential 준비, adapter의 최초 table initialization, consumer rollout과 트래픽 cutover의 현재 검증 증거를 제시한 뒤 별도 사용자 승인을 받아야 한다(MUST).

#### Scenario: queue runtime을 단일 구성으로 렌더함

- **WHEN** dev 또는 production에서 동일 source full SHA와 build identity를 가진 유효한 immutable runtime image release set으로 Helm runtime을 render한다
- **THEN** chart는 queue 전용 실행 flag 없이 API/Web queue connection과 독립 consumer Deployment를 함께 렌더한다
- **AND** API, Web과 consumer는 release set의 지정된 `api`, `web`, `fedify-consumer` image reference를 사용한다
- **AND** Database/DatabaseRole/VSO와 runtime은 namespace와 Vault source path 외에 동일한 구조를 사용한다

#### Scenario: production release render

- **WHEN** production release가 승인된 build run의 유효한 immutable runtime image digest set과 source full SHA를 함께 전달해 Helm을 render한다
- **THEN** chart는 queue Database/DatabaseRole과 VSO Secret 선언 및 API/Web/consumer workload를 release set의 지정 image로 함께 렌더한다
- **AND** queue 전용 enable flag나 credential selector를 요구하지 않는다

#### Scenario: runtime image release set 불일치

- **WHEN** API, Web 또는 consumer image가 서로 다른 source full SHA·build identity release set에서 전달되거나 지정 image가 누락된다
- **THEN** Helm render 또는 Argo CD sync는 producer·consumer workload activation 전에 실패한다
- **AND** queue credential을 다른 workload credential로 대체하거나 일부 image만 조용히 활성화하지 않는다

#### Scenario: legacy workload activation values are inert

- **WHEN** 유효한 immutable runtime image release set과 함께 과거 workload activation 값을 추가해 Helm을 render한다
- **THEN** API/Web/consumer workload와 queue declarations가 모두 render되고 과거 값이 resource 존재를 바꾸지 않는다

#### Scenario: producer mode의 derived queue connection

- **WHEN** Web 또는 API workload를 배포한다
- **THEN** Helm은 release에서 파생한 전용 Secret과 기존 CloudNativePG direct read-write Service의 queue URL을 runtime에 주입하고 official adapter가 첫 enqueue에서 connection 대상 database의 queue table/index를 idempotent하게 초기화하게 한다
- **AND** 별도 queue selector나 environment 분기가 없으며 adapter 오류는 direct delivery나 owner/API DB fallback으로 우회하지 않는다

#### Scenario: dev queue database 격리

- **WHEN** dev Fedify queue runtime을 배포한다
- **THEN** 기존 CloudNativePG cluster 안의 별도 `kosmo_fedify_queue` database와 전용 login/Secret을 사용한다
- **AND** official adapter가 해당 database 안의 queue table/index implicit DDL을 소유하며 domain database schema, `search_path` helper 또는 custom queue migration을 추가하지 않는다
- **AND** queue connection은 API/domain DB와 Worker trusted execution credential을 재사용하거나 fallback하지 않는다
- **AND** chart는 queue database 준비 flag나 configurable queue URL 없이 같은 전용 role·direct read-write Service·database connection을 파생한다

#### Scenario: production queue database 선언

- **WHEN** production Helm을 render한다
- **THEN** chart는 environment 분기 없이 production namespace의 CloudNativePG cluster 안에 별도 `kosmo_fedify_queue` Database/DatabaseRole과 `kubernetes/kosmo/prod/fedify-queue` source의 release-derived queue 전용 basic-auth Secret 동기화를 선언한다
- **AND** runtime이 활성화될 때 사용할 queue URL은 production CloudNativePG direct read-write Service의 전용 role과 `kosmo_fedify_queue` database에서 파생되며 domain/API/Worker database 또는 다른 Secret selector를 받을 수 없다
- **AND** 이 선언은 resource apply, Vault value write, adapter initialization, consumer rollout 또는 producer cutover를 시작하지 않는다

#### Scenario: 구현 PR 완료

- **WHEN** 코드, chart, 격리 database의 adapter initialization과 비production 검증이 완료되어 PR이 review-ready 상태가 된다
- **THEN** production declaration 외의 Argo CD sync/apply, Vault value write, database apply와 live traffic cutover는 실행하지 않는다
- **AND** PR completion evidence와 dev live verification, production activation 상태를 각각 구분해 보고한다

#### Scenario: 별도 production 승인

- **WHEN** 사용자가 정확한 production queue database·credential 준비, 최초 adapter initialization, rollout 또는 cutover 대상을 별도로 승인한다
- **THEN** 승인된 작업만 현재 production 상태를 다시 확인한 뒤 수행한다
- **AND** 승인되지 않은 다른 production mutation으로 범위를 넓히지 않는다
