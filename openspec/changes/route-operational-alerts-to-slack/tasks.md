## 1. PROD-530 운영 alert allowlist v0

**Authority / Provenance**

- `byulmaru/kubernetes/modules/helm-apps/prometheus.tf`
- `byulmaru/kubernetes/modules/vault/grafana-oauth.tf`
- `byulmaru/kubernetes/docs/bootstrap-apps.md`
- Linear PROD-530 (2026-07-31)

**Deliverable**

즉시 대응 가능한 기존 Kubernetes·monitoring alert만 allowlist v0와 핵심 namespace 범위에 따라 Slack `#monitoring`으로 전달되고, 운영자는 중복이 억제된 firing·resolved 메시지에서 안전한 영향 정보와 실행 가능한 대응 경로를 확인할 수 있다.

**Guardrails**

- allowlist 이름과 workload namespace 범위 밖 alert는 `#monitoring` 운영 receiver로 새로 전달하지 않는다.
- `cluster`, `namespace`, `alertname` grouping, 30초 group wait, 5분 group interval, 4시간 repeat interval과 firing·resolved 전달을 유지한다.
- 기존 kube-prometheus-stack inhibition·silence와 Vault-backed Kubernetes Secret reference를 재사용한다.
- 사용자 식별 정보, raw URL, GraphQL 원문, credential과 webhook 값을 label·메시지·repository·Terraform state 출력·CI log·문서에 노출하지 않는다.
- 운영 데이터 기반 allowlist 고도화 PROD-597과 새 SLI/SLO·metric·dashboard·resource tuning은 이 task group에 포함하지 않는다.

**Verification**

- live 또는 렌더링된 rule·route에서 정확한 allowlist, workload namespace matcher, grouping interval, receiver와 Secret reference를 대조한다.
- Terraform formatting·validation과 실제 plan이 의도한 alert route·annotation·문서·Secret reference만 변경하며 민감 값을 출력하지 않는지 확인한다.
- monitoring 전달 경로, node 또는 workload, storage 범주의 대표 firing·resolved 메시지와 allowlist 밖·비허용 namespace 미전달을 검증한다.
- 모든 v0 alert의 owner·runbook과 전달 실패·잘못된 설정·silence·escalation 절차가 운영 문서에 있는지 확인한다.

- [x] 1.1 구현 직전 Linear PROD-530과 `byulmaru/kubernetes`의 live rule·route·Secret reference를 다시 조회해 authority snapshot을 남긴다.
- [x] 1.2 `byulmaru/kubernetes`에서 정확한 alert name allowlist와 workload namespace 범위를 운영 Slack routing에 반영하고 기존 Karpenter route의 중복을 제거한다.
- [x] 1.3 grouping interval, firing·resolved와 계약 필드만 출력하는 안전한 Slack 메시지를 적용하고 기존 inhibition·silence·Secret reference를 보존한다.
- [x] 1.4 v0 alert의 owner·runbook을 보완하고 allowlist 변경, 전달 실패, 설정 오류, silence, escalation과 rollback 절차를 platform 운영 문서에 기록한다.
- [ ] 1.5 Terraform formatting·validation과 실제 plan을 실행해 의도한 범위와 secret 비노출을 확인한다.
- [ ] 1.6 대표 alert의 firing·resolved 수신과 allowlist 밖·비허용 namespace alert의 미전달을 안전한 방식으로 검증하고 증거를 PROD-530에 남긴다.
- [ ] 1.7 Kosmo와 Kubernetes 저장소의 변경·검증 증거를 대조하고 PROD-530 전체 범위가 끝난 뒤에만 OpenSpec change를 archive한다.
