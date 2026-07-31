## ADDED Requirements

### Requirement: 운영 alert allowlist v0

**Authority / Provenance:** `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31). 시스템은 monitoring 전달 경로의 `AlertmanagerFailedToSendAlerts`, `AlertmanagerClusterDown`, `PrometheusNotConnectedToAlertmanagers`, `PrometheusErrorSendingAlertsToAnyAlertmanager`, `PrometheusBadConfig`, `PrometheusNotIngestingSamples`, `PrometheusRuleFailures`; Kubernetes API와 node 가용성의 `KubeAPIDown`, `KubeAPIInstanceUnreachable`, `KubeAPIErrorBudgetBurn`, `KubeNodeNotReady`, `KubeNodeUnreachable`, `KubeNodeEviction`, `KubeletDown`, `KubeletInstanceUnreachable`; 핵심 workload 가용성의 `KubePodNotReady`, `KubePodCrashLooping`, `KubeDeploymentReplicasMismatch`, `KubeDeploymentRolloutStuck`, `KubeStatefulSetReplicasMismatch`, `KubeStatefulSetUpdateNotRolledOut`, `KubeDaemonSetRolloutStuck`, `KubeJobFailed`; 데이터·storage·보안 기반의 `KubePersistentVolumeErrors`, `NodeFilesystemAlmostOutOfSpace`, `VaultSealed`, `VaultTelemetryDown`; 기존 운영 alert `KarpenterSpotInterruption`만 Slack `#monitoring` 운영 receiver의 allowlist v0로 취급해야 한다(MUST). 새 alert를 v0에 추가하려면 사용자 요청 경로, 프로덕션 데이터 또는 monitoring 전달 경로의 중단·임박한 손실을 나타내고, 운영자가 수분 내 실행할 구체적인 조치와 owner·runbook이 있어야 하며, root-cause alert의 단순 파생 신호나 용량 계획용 진단 신호가 아니어야 한다(MUST).

#### Scenario: allowlist alert 수신

- **WHEN** allowlist v0의 alert가 firing 상태가 된다
- **THEN** 시스템은 해당 alert를 `#monitoring` 운영 receiver의 routing 후보로 선택해야 한다

#### Scenario: severity만 일치하는 alert 제외

- **WHEN** warning 또는 critical alert가 firing하지만 이름이 allowlist v0에 없거나 선정 기준을 충족하지 않는다
- **THEN** 시스템은 해당 alert를 `#monitoring` 운영 receiver로 보내지 않아야 한다

### Requirement: 핵심 workload namespace 제한

**Authority / Provenance:** `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, Linear PROD-530 (2026-07-31). 핵심 workload 가용성 alert는 `kosmo-prod`, `prometheus`, `vault`, `argocd`, `argo-rollouts`, `cnpg-system`, `kube-system`, `tailscale`, `cert-manager`, `vault-secrets-operator` namespace에 속할 때만 Slack routing 대상으로 삼아야 한다(MUST). 다른 범주의 allowlist alert는 alert 자체의 label 구조에 따라 이 namespace 제한을 강제로 적용하지 않아야 한다(MUST).

#### Scenario: 핵심 namespace의 workload 장애

- **WHEN** allowlist의 workload alert가 허용된 namespace에서 firing한다
- **THEN** 시스템은 해당 alert를 운영 receiver의 routing 후보로 선택해야 한다

#### Scenario: 비핵심 namespace의 workload 장애

- **WHEN** 동일한 workload alert가 허용 목록 밖의 namespace에서 firing한다
- **THEN** 시스템은 해당 alert를 `#monitoring` 운영 receiver로 보내지 않아야 한다

### Requirement: 그룹화와 상태 전달

**Authority / Provenance:** `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31). 시스템은 운영 alert를 `cluster`, `namespace`, `alertname`으로 그룹화하고 `groupWait` 30초, `groupInterval` 5분, `repeatInterval` 4시간을 적용해야 한다(MUST). firing과 resolved 상태를 모두 전달하고, 기존 kube-prometheus-stack inhibition과 silence 동작을 유지해야 한다(MUST).

#### Scenario: 동일 장애 중복 억제

- **WHEN** 같은 cluster·namespace·alertname에 속하는 여러 alert instance가 짧은 시간 안에 firing한다
- **THEN** 시스템은 이를 30초의 최초 대기 뒤 하나의 group notification으로 묶고 같은 group의 추가 상태는 최소 5분 간격으로 전달해야 한다

#### Scenario: 지속 장애 반복 알림

- **WHEN** 동일 group이 계속 firing 상태로 남는다
- **THEN** 시스템은 마지막 notification 이후 4시간이 지나기 전에는 반복 notification을 보내지 않아야 한다

#### Scenario: 장애 복구 알림

- **WHEN** notification을 보낸 alert group이 resolved 상태가 된다
- **THEN** 시스템은 같은 운영 receiver로 resolved notification을 전달해야 한다

### Requirement: 조치 가능한 안전한 Slack 메시지

**Authority / Provenance:** `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31). Slack 메시지는 status, severity, alert name, summary, description, 안전한 영향 label subset, startsAt·endsAt, generator 또는 source, owner, 실행 가능한 runbook과 silence 진입점을 제공해야 한다(MUST). 메시지와 alert label은 사용자 ID, 계정·프로필·게시물 ID, raw URL, GraphQL document 또는 error 원문, credential, webhook 값을 포함하지 않아야 한다(MUST).

#### Scenario: firing 메시지로 초기 대응

- **WHEN** allowlist alert의 firing notification이 생성된다
- **THEN** 운영자는 메시지에서 영향 대상과 시작 시점, owner, source, runbook, silence 진입점을 확인할 수 있어야 한다

#### Scenario: 민감 정보 제외

- **WHEN** 원본 장애 컨텍스트에 사용자 식별 정보, 요청 URL, 오류 원문 또는 secret이 존재한다
- **THEN** 시스템은 해당 값을 alert label, Slack payload와 notification log에 포함하지 않아야 한다

### Requirement: 기존 secret 경로 재사용

**Authority / Provenance:** `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, `byulmaru/kubernetes/modules/vault/grafana-oauth.tf`, `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31). 시스템은 Vault KV `secret/kubernetes/alertmanager/slack`의 `SLACK_WEBHOOK_URL`에서 Kubernetes Secret으로 동기화되는 기존 reference를 사용해야 한다(MUST). webhook secret 값은 repository, Terraform state 출력, CI log, Linear, OpenSpec 또는 Slack payload에 기록하지 않아야 한다(MUST).

#### Scenario: receiver가 webhook을 참조

- **WHEN** Alertmanager Slack receiver가 배포된다
- **THEN** receiver는 secret 값 자체가 아니라 기존 Kubernetes Secret reference를 사용해야 한다

#### Scenario: 검증 산출물의 secret 보호

- **WHEN** Terraform validation·plan 또는 notification test 증거를 저장한다
- **THEN** 산출물에는 webhook secret 값이 평문으로 나타나지 않아야 한다

### Requirement: 배포 전후 검증과 운영 절차

**Authority / Provenance:** `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31). 변경은 Terraform formatting·validation과 실제 plan으로 의도한 rule·route·secret reference만 바뀌는지 검증해야 한다(MUST). 배포 후에는 monitoring 전달 경로, node 또는 workload, storage 범주의 대표 alert에 대해 firing과 resolved 수신을 확인하고, 모든 v0 alert의 owner·runbook과 Slack 전달 실패·잘못된 설정·silence·escalation 절차를 운영 문서에 기록해야 한다(MUST).

#### Scenario: 배포 전 plan 검토

- **WHEN** 운영 alert routing 변경을 배포 후보로 준비한다
- **THEN** 검토자는 Terraform validation 성공과 plan의 의도된 변경 범위, secret 비노출을 확인할 수 있어야 한다

#### Scenario: 대표 notification 검증

- **WHEN** 변경이 운영 환경에 배포된다
- **THEN** 대표 alert의 firing·resolved 메시지와 allowlist 밖 alert의 미전달 증거가 기록되어야 한다

#### Scenario: 전달 경로 장애 대응

- **WHEN** Slack 전달이 실패하거나 Alertmanager 설정이 유효하지 않다
- **THEN** 운영자는 runbook을 통해 실패를 탐지하고 원인을 확인하며 안전하게 복구할 수 있어야 한다
