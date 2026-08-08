## ADDED Requirements

### Requirement: 환경별 Temporal namespace desired state

**Authority / Provenance:** `PROD-695`, `PROD-719`. Kosmo는 self-hosted Temporal에 `kosmo-dev`와 `kosmo-prod` logical namespace를 준비해야 한다(MUST). `kosmo-dev`의 Workflow History retention은 3일, `kosmo-prod`는 30일이어야 하며(SHALL), 두 namespace의 owner email은 `dev@byulmaru.co`여야 한다(SHALL).

#### Scenario: dev namespace 선언

- **WHEN** dev Helm chart를 render한다
- **THEN** namespace name은 `kosmo-dev`이고 retention은 3일이다
- **AND** owner email은 `dev@byulmaru.co`이다

#### Scenario: prod namespace 선언

- **WHEN** prod Helm chart를 render한다
- **THEN** namespace name은 `kosmo-prod`이고 retention은 30일이다
- **AND** owner email은 `dev@byulmaru.co`이다

### Requirement: In-cluster PreSync provisioning

**Authority / Provenance:** `PROD-695`, `PROD-719`. 각 환경은 자신의 Kubernetes namespace에서 Argo CD PreSync Job을 실행해 `temporal-frontend.temporal.svc.cluster.local:7233`에 연결해야 한다(MUST). 이 provisioning을 위해 Terraform provider/resource, Tailscale frontend endpoint, 외부 runner port-forward 또는 전용 runner를 추가해서는 안 된다(MUST NOT).

#### Scenario: Cluster-internal 연결

- **WHEN** Argo CD가 Kosmo environment를 sync한다
- **THEN** PreSync Job이 cluster-internal frontend address로 Temporal CLI를 실행한다
- **AND** 외부 ingress나 Terraform runner를 경유하지 않는다

### Requirement: 멱등 create/update 수렴

**Authority / Provenance:** `PROD-719`. PreSync Job은 대상 namespace가 없으면 선언된 name·owner·retention으로 생성해야 하고(MUST), 이미 있으면 owner와 retention을 선언값으로 갱신해야 한다(MUST). 같은 선언으로 반복 실행해도 성공해야 한다(MUST).

#### Scenario: Namespace 최초 생성

- **WHEN** 대상 Temporal namespace가 존재하지 않는다
- **THEN** Job은 선언된 name·owner·retention으로 namespace를 생성한다

#### Scenario: 동일 선언 재실행

- **WHEN** 대상 namespace의 owner와 retention이 이미 선언과 일치한다
- **THEN** Job은 성공하고 namespace 값을 유지한다

#### Scenario: Owner 또는 retention drift

- **WHEN** 대상 namespace의 owner 또는 retention이 선언과 다르다
- **THEN** Job은 두 값을 선언된 상태로 갱신한다

### Requirement: PreSync 실패 경계

**Authority / Provenance:** `PROD-719`. Frontend 연결, namespace describe/create/update 또는 CLI 실행이 실패하면 Job은 실패해야 하고(MUST), Argo CD는 후속 workload sync를 진행해서는 안 된다(MUST NOT). Job은 bounded timeout과 retry 경계를 가져야 한다(MUST).

#### Scenario: Frontend 연결 실패

- **WHEN** Job이 Temporal frontend에 연결할 수 없다
- **THEN** Job은 제한된 시간 안에 실패한다
- **AND** 후속 workload sync는 진행되지 않는다

#### Scenario: Namespace 명령 실패

- **WHEN** namespace create 또는 update 명령이 성공하지 못한다
- **THEN** Job은 성공으로 가장하지 않고 실패한다
- **AND** 실패 원인을 Job log에서 확인할 수 있다

### Requirement: Namespace 삭제 제외

**Authority / Provenance:** `PROD-719`. Provisioning Job은 Temporal namespace 삭제를 수행하거나 자동 폐기 경로를 제공해서는 안 된다(MUST NOT).

#### Scenario: Helm release 제거 또는 재동기화

- **WHEN** Helm release가 제거되거나 chart가 다시 sync된다
- **THEN** provisioning 경로는 기존 Temporal namespace를 삭제하지 않는다

### Requirement: Worker runtime과 분리된 readiness 경계

**Authority / Provenance:** `PROD-719`, `PROD-730`. Namespace provisioning은 Temporal Worker 코드와 business Workflow 없이 독립적으로 render·sync·검증할 수 있어야 한다(MUST). PROD-730 Worker runtime은 대상 환경의 PreSync provisioning이 성공한 뒤에만 rollout해야 한다(MUST).

#### Scenario: Namespace provisioning 단독 배포

- **WHEN** Worker runtime이 아직 구현 또는 배포되지 않았다
- **THEN** PreSync Job은 독립적으로 namespace를 생성·갱신하고 완료된다

#### Scenario: Worker 선행 조건

- **WHEN** 대상 환경의 namespace provisioning이 실패한다
- **THEN** Worker runtime rollout은 시작되지 않는다
