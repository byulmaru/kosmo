## Why

Prometheus, Grafana, Alertmanager는 이미 Kubernetes에 운영 중이지만 Karpenter Spot interruption 외의 장애 alert는 Slack으로 전달되지 않는다. 현재 활성 warning·critical rule 전체를 연결하면 alert fatigue가 생기므로, 즉시 대응 가능한 항목만 보수적인 allowlist v0로 고정해 안전한 운영 알림 경로를 먼저 만든다.

## What Changes

- 기존 Kubernetes·monitoring alert 중 사용자 경로, 프로덕션 데이터 또는 monitoring 전달 경로의 중단과 임박한 손실을 나타내는 항목만 allowlist v0로 선정한다.
- workload alert는 핵심 운영 namespace로 제한하고 allowlist 밖의 alert는 Slack `#monitoring` receiver에 전달하지 않는다.
- 동일 장애를 `cluster`, `namespace`, `alertname` 기준으로 묶고 firing과 resolved 상태, 안전한 영향 정보, source·runbook·silence 진입점을 전달한다.
- 기존 kube-prometheus-stack inhibition·silence와 Vault-backed Slack webhook을 재사용하며 secret과 사용자 식별 정보가 설정·로그·메시지에 노출되지 않게 한다.
- 실제 운영 데이터에 따른 allowlist·grouping·inhibition 고도화는 PROD-597로 분리한다.

## Authority / Provenance

- Canonical: `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`, `byulmaru/kubernetes/docs/bootstrap-apps.md`; Kosmo의 `docs/domain/README.md`는 infrastructure를 domain object 범위에서 제외하며 이 변경에 적용되는 `docs/design` 문서는 없음.
- Linear Contract: PROD-530 `서버 장애 지표를 Slack으로 알린다` (2026-07-31 갱신)
- Linear Implementations: PROD-530. 후속 고도화 PROD-597은 이 변경의 구현 범위에서 제외한다.

## Capabilities

### New Capabilities

- `operational-alert-routing`: 기존 Kubernetes·monitoring alert의 allowlist v0, namespace 범위, Slack routing·message·보안·검증 계약을 정의한다.

### Modified Capabilities

없음.

## Impact

- `byulmaru/kubernetes`: kube-prometheus-stack의 Alertmanager route·receiver, alert annotation, Terraform/Helm 검증, 운영 runbook과 notification test가 영향을 받는다.
- `byulmaru/kosmo`: PROD-530의 교차 저장소 OpenSpec 계약과 완료 증거를 소유하며 제품 API·데이터 모델·사용자 UI는 변경하지 않는다.
- 운영 시스템: 기존 Prometheus, Grafana, Alertmanager, Vault Secret reference와 Slack `#monitoring`을 그대로 사용한다.
