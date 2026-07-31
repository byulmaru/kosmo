## Context

이 기록은 PROD-530에서 승인된 allowlist v0, 현재 `byulmaru/kubernetes`의 kube-prometheus-stack·Alertmanager·Vault 구성, 그리고 실제 운영 데이터 기반 고도화를 PROD-597로 분리한 결과를 반영한다. 구현 메커니즘의 비규범적 기본안은 design에 두고, 저장소와 구현 slice를 넘어 유지되어야 하는 계약만 기록한다.

## Decision Records

### severity 전체가 아닌 명시적 allowlist를 사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, Linear PROD-530 (2026-07-31)
- Status: Active
- Context / Problem: live Prometheus의 warning·critical rule 전체를 Slack으로 route하면 즉시 대응 가치가 낮은 파생·용량 진단 alert까지 전달되어 alert fatigue가 발생한다.
- Decision Outcome: alert name과 필요한 namespace를 명시한 allowlist v0만 `#monitoring`에 route한다. severity는 메시지 정보로 사용하되 route를 여는 충분조건으로 사용하지 않는다.
- Alternatives Considered: 모든 warning·critical 일괄 route는 운영 신호 대 잡음비를 보장하지 못해 제외했다. critical만 route하는 방식도 actionability와 root cause 여부를 표현하지 못해 제외했다.
- Consequences: 새 alert는 선정 기준, owner, runbook을 충족하고 계약을 갱신한 뒤 추가해야 한다. allowlist 밖 alert는 Grafana·Prometheus에서 계속 관찰할 수 있지만 Slack으로 즉시 전송되지 않는다.
- Confirmation / Follow-up: 렌더링된 matcher와 allowlist 내·외 대표 notification test로 확인한다.

### v0 alert와 핵심 workload namespace를 고정한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, Linear PROD-530 (2026-07-31)
- Status: Active
- Context / Problem: 초기 운영 경로의 범위가 모호하면 구현자마다 alert와 namespace를 다르게 해석해 불필요한 notification 또는 중요 장애 누락이 생긴다.
- Decision Outcome: monitoring 전달 경로 7개, API/node 8개, workload 8개, data/storage/security 4개와 기존 `KarpenterSpotInterruption`을 v0로 고정한다. workload 8개는 `kosmo-prod`, `prometheus`, `vault`, `argocd`, `argo-rollouts`, `cnpg-system`, `kube-system`, `tailscale`, `cert-manager`, `vault-secrets-operator`에서만 route한다.
- Alternatives Considered: alert 범주만 정의하고 구현 중 이름을 선택하는 방식은 변경 범위를 검증할 수 없어 제외했다. 모든 namespace 적용은 비핵심 workload의 반복 장애까지 즉시 알림화하므로 제외했다.
- Consequences: chart 업그레이드로 rule name이 바뀌면 matcher와 계약을 함께 검토해야 한다. namespace label이 없는 비-workload alert에는 workload 제한을 적용하지 않는다.
- Confirmation / Follow-up: live 또는 렌더링된 rule name 대조와 허용·비허용 namespace test로 확인한다.

### 기존 Alertmanager·Vault·Slack 경로를 재사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, `byulmaru/kubernetes/modules/vault/grafana-oauth.tf`, `byulmaru/kubernetes/docs/bootstrap-apps.md`, Linear PROD-530 (2026-07-31)
- Status: Active
- Context / Problem: 이미 운영 중인 kube-prometheus-stack Alertmanager와 Vault-backed webhook 경로가 있어 새 알림 플랫폼이나 secret 전달 경로를 만들 이유가 없다.
- Decision Outcome: 기존 AlertmanagerConfig와 Slack `#monitoring` receiver, Vault KV `secret/kubernetes/alertmanager/slack`에서 동기화되는 Kubernetes Secret reference를 재사용한다. secret 값 자체는 어떤 코드·상태 출력·문서·로그·payload에도 기록하지 않는다.
- Alternatives Considered: 새 Slack app, 별도 webhook secret 또는 별도 notification service 도입은 운영·보안 표면을 늘리고 PROD-530 범위를 벗어나므로 제외했다.
- Consequences: 실제 routing 구현과 platform runbook은 `byulmaru/kubernetes`가 소유한다. Kosmo 저장소는 교차 저장소 계약과 완료 증거를 유지한다.
- Confirmation / Follow-up: Terraform plan과 배포된 receiver가 기존 Secret reference만 사용하는지 확인하고 민감 출력이 없는지 검토한다.

### 운영 notification의 grouping과 상태 계약을 통일한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, Linear PROD-530 (2026-07-31)
- Status: Active
- Context / Problem: 기존 Karpenter 전용 route와 신규 운영 route의 반복 주기·receiver가 분리되면 동일 장애가 중복되거나 alert별 복구 상태가 일관되지 않을 수 있다.
- Decision Outcome: 모든 v0 운영 notification을 `cluster`, `namespace`, `alertname`으로 그룹화하고 30초 group wait, 5분 group interval, 4시간 repeat interval, firing·resolved 전달을 사용한다. 기존 inhibition·silence 동작은 유지한다.
- Alternatives Considered: 기존 Karpenter의 12시간 반복 주기 유지와 alert별 개별 전송은 일관된 운영 계약과 중복 억제를 어렵게 해 제외했다. 반복 알림을 끄는 방식은 장기 장애 인지를 약화해 제외했다.
- Consequences: Karpenter route도 공통 계약에 맞춰야 하며 겹치는 route에서 중복 전송이 없음을 확인해야 한다. 실제 반복 주기 최적화는 운영 데이터가 쌓인 뒤 수행한다.
- Confirmation / Follow-up: route tree 검토와 동일 group·resolved·지속 firing notification test로 확인한다.

### 운영 데이터 기반 고도화는 별도 issue가 소유한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-530, Linear PROD-597 (2026-07-31)
- Status: Active
- Context / Problem: 초기 안전 경로 구축과 실제 firing 데이터에 근거한 최적화를 한 완료 단위로 묶으면 v0 배포가 지연되고, 아직 존재하지 않는 운영 증거를 현재 구현의 조건으로 삼게 된다.
- Decision Outcome: PROD-530은 allowlist v0 구현, notification test와 전체 change 완료·archive를 소유한다. PROD-597은 PROD-530 완료 후 최소 7일의 운영 데이터를 바탕으로 promote·demote·grouping·inhibition·repeat interval 고도화를 독립적으로 소유한다.
- Alternatives Considered: 고도화를 PROD-530 task로 포함하는 방식은 서로 독립적으로 승인·연기 가능한 결과를 결합하므로 제외했다.
- Consequences: PROD-597 작업은 이 change의 task나 완료 조건에 포함하지 않는다. PROD-530 완료 뒤 운영 기록을 별도로 수집해야 한다.
- Confirmation / Follow-up: PROD-597의 blocked-by 관계와 PROD-530 완료 증거를 확인한 뒤 후속 작업을 시작한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
