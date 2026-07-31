## Context

`byulmaru/kubernetes/modules/helm-apps/prometheus.tf`는 kube-prometheus-stack과 기존 `KarpenterSpotInterruption` PrometheusRule, `#monitoring` Slack receiver를 가진 AlertmanagerConfig를 배포한다. webhook은 `modules/vault/grafana-oauth.tf`를 통해 Vault에서 Kubernetes Secret으로 동기화된다. 현재 나머지 alert는 Slack route에 연결되지 않으며, live Prometheus에는 warning·critical rule이 다수 존재해 severity 전체를 route하면 운영 알림의 신호 대 잡음비가 급격히 낮아진다.

운영자와 PROD-530 구현자가 주요 이해관계자다. Kosmo 저장소는 계약과 완료 증거를 소유하지만 실제 Terraform/Helm 설정과 notification test는 `byulmaru/kubernetes`에서 수행한다.

## Goals / Non-Goals

**Goals:**

- 명시적인 alert name allowlist와 workload namespace 범위를 Alertmanager routing에 반영한다.
- 기존 Karpenter 알림을 포함한 운영 알림의 receiver, grouping, firing·resolved 메시지 동작을 일관되게 만든다.
- 기존 inhibition·silence와 Vault-backed secret reference를 보존한다.
- 배포 전 Terraform 검증과 배포 후 대표 notification test가 재현 가능하도록 운영 문서를 보완한다.

**Non-Goals:**

- 새로운 alert rule, SLI/SLO, metric exporter 또는 dashboard를 설계하지 않는다.
- 모든 warning·critical alert를 Slack으로 전달하지 않는다.
- 용량 계획·CPU·quota·generic target alert의 승격이나 Kubernetes resource tuning을 수행하지 않는다.
- 운영 데이터 기반 고도화 PROD-597을 미리 구현하지 않는다.

## Implementation Guidance

### Current Constraints

- AlertmanagerConfig는 chart가 선택하는 namespace·label 조건과 기존 kube-prometheus-stack route tree 안에서 병합되므로, route의 matcher와 순서가 잘못되면 allowlist 밖 alert가 receiver에 도달하거나 허용 alert가 누락될 수 있다.
- workload alert에만 namespace matcher가 필요하다. monitoring-path, API/node, storage, Vault alert 중 일부는 namespace label이 없으므로 모든 allowlist를 하나의 namespace 제한 route에 넣으면 안 된다.
- 일부 kube-prometheus-stack rule의 summary·description·runbook annotation은 alert마다 다르다. Slack template은 누락 값을 안전하게 처리해야 하고 임의의 모든 label·annotation을 그대로 출력하면 안 된다.
- 기존 Karpenter route의 12시간 반복 주기는 v0 계약의 4시간과 다르며, 별도 receiver를 중복 유지하면 같은 alert가 두 번 전송될 수 있다.

### Recommended Approach

기존 AlertmanagerConfig 안에 하나의 공통 운영 Slack receiver를 두고, alert 범주별 child route로 allowlist를 표현하는 방식을 기본으로 한다. namespace 제한이 없는 alert 범주와 핵심 workload 범주를 별도 matcher 조합으로 만들고, workload route에서만 alert name과 허용 namespace를 함께 매치한다. 기존 Karpenter route는 공통 receiver와 v0 grouping 정책을 사용하도록 정렬하고 중복 route를 제거한다.

receiver template은 Alertmanager가 제공하는 common labels·annotations와 개별 alert 상태를 사용해 계약 필드만 명시적으로 렌더링한다. 값이 없는 owner·runbook은 배포 전에 해당 rule annotation 또는 운영자가 관리하는 안전한 매핑으로 보완한다. silence 링크는 현재 Alertmanager endpoint를 기준으로 alert의 안전한 matcher만 미리 채운다.

검증은 다음 층으로 나눈다.

1. Terraform formatting·validation과 plan으로 AlertmanagerConfig, PrometheusRule annotation, Secret reference 변경만 포함되는지 확인한다.
2. 렌더링된 route tree 또는 Alertmanager configuration API에서 allowlist·namespace matcher, grouping interval, receiver reference를 확인한다.
3. secret 값을 노출하지 않는 대표 test alert로 monitoring-path, node/workload, storage 범주의 firing·resolved 수신을 확인한다.
4. allowlist 밖 alert와 허용되지 않은 namespace의 workload alert가 `#monitoring`에 도달하지 않는지 확인한다.

### Allowed Alternatives

AlertmanagerConfig의 matcher 길이·가독성 또는 Kubernetes CRD 제약 때문에 범주별 receiver를 여러 개로 나눌 수 있다. 단, 같은 Kubernetes Secret reference와 동일한 Slack 채널을 사용하고, v0의 선택·grouping·message·보안 계약과 중복 미발생을 동일하게 검증해야 한다.

### Known Traps

- `severity=warning|critical`만으로 route를 열어 현재 rule 전체를 전송하지 않는다.
- `continue: true` 또는 겹치는 sibling route로 같은 alert가 기존 Karpenter receiver와 공통 receiver에 중복 전달되지 않게 한다.
- label이 없는 alert에 존재하지 않는 namespace 조건을 강제하지 않는다.
- webhook 값, Terraform sensitive output, 전체 alert label·annotation map을 plan·CI log·Slack message에 출력하지 않는다.
- notification test를 위해 실제 장애를 유발하거나 운영 alert의 `for` 시간을 임시로 약화하지 않는다.

## Risks / Trade-offs

- [v0에서 중요한 alert가 빠질 수 있음] → 보수적인 초기 범위를 유지하고 배포 후 최소 7일 데이터를 PROD-597에서 재평가한다.
- [allowlist가 chart rule 이름 변경으로 조용히 깨질 수 있음] → 배포 전 live/rerendered rule name과 matcher를 대조하고 runbook에 업그레이드 점검 절차를 둔다.
- [grouping이 서로 다른 장애를 과도하게 묶을 수 있음] → `cluster`, `namespace`, `alertname`을 사용하고 실제 운영 중 grouping 품질은 PROD-597에서 조정한다.
- [Slack 자체 장애로 알림 경로가 사라질 수 있음] → Alertmanager 전송 실패·cluster 상태 alert와 Prometheus/Grafana 직접 확인 절차를 runbook에 유지한다.

## Migration Plan

1. 현재 live rule name, Alertmanager route, Secret reference를 다시 확인한다.
2. allowlist matcher, 공통 receiver template, owner·runbook 보완과 운영 문서를 `byulmaru/kubernetes`에서 변경한다.
3. Terraform formatting·validation과 plan을 검토한 뒤 배포한다.
4. Alertmanager configuration과 대표 firing·resolved·미전달 사례를 검증하고 증거를 PROD-530에 남긴다.
5. 문제가 발생하면 AlertmanagerConfig 변경을 직전 revision으로 되돌려 기존 Karpenter 전용 route를 복구한다. Vault secret은 회전하거나 값 자체를 변경하지 않는다.

## Open Questions

없음.
