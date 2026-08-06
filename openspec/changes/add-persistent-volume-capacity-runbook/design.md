## Context

`PROD-698`은 기존 `KubePersistentVolumeFillingUp`와 Alertmanager 전달을 유지하면서
Kosmo에 PVC 대응 runbook을 추가한다. Alertmanager routing·Slack 메시지·notification
test는 `byulmaru/kubernetes`, PVC 진단·owner 판단·확장·복구 검증은 이 저장소가
소유한다. 선언 owner는 operator CR, StatefulSet, Helm/GitOps로 다르므로 live
`allowVolumeExpansion`, provisioner·CSI, condition·event와 owner 절차를 확인하며,
PostgreSQL data protection은 `docs/operations/postgres-backup.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- 모든 대상 PVC에 warning/critical 진입, read-only 상태·추세·owner 진단, 안전 gate,
  owner 승인 아래 확장과 filesystem/workload/alert 복구 검증을 제공한다.
- 비밀·사용자 데이터 증거를 막고 Kubernetes 전달 문서와 책임을 중복하지 않는다.

**Non-Goals:**

- Alertmanager allowlist, Slack 링크/template, `runbook_url`, notification test,
  Terraform 변경, alert 표현식·severity·제외 조건 변경
- 자동 증설, 공통 삭제·retention 정책, PVC/PV 교체·reclaim 변경, snapshot restore·
  migration 실행 절차와 storage SLI/SLO 확대

## Implementation Guidance

### Current Constraints

- 문서 경로는 `docs/operations/persistent-volume-capacity.md`이며 전달 실패는
  `byulmaru/kubernetes/docs/operations.md` 소유다. 두 PR은 링크나 병합 순서에 의존하지
  않는다.
- Operator는 지원된 resize field/reconcile이 있을 때만 그 경로를 사용한다. Helm/GitOps가
  standalone PVC declaration을 직접 소유하면 gate 뒤 declaration을 늘려 reconcile한다.
  StatefulSet template(Helm/GitOps 포함)의 기존 object `spec.volumeClaimTemplates`는
  API가 immutable field로 거부하므로 generic in-place 변경/reconcile하지 않는다. 기존
  bound PVC direct patch와 template·미래 replica 정합화는 owner 승인 recreation/migration
  계획으로 별도 처리한다.
- live StorageClass·provisioner·CSI 지원이 불명확하면 PVC/PV를 교체하지 않고 migration
  계획으로 escalation한다. PV 직접 편집과 PVC shrink는 허용하지 않는다.
- docs/operations 전용 자동 command test는 없으므로 formatting·link 검토와 서로 다른
  owner 유형의 read-only smoke를 조합한다. smoke 결과에는 실제 identifier/raw output을
  남기지 않는다.

### Recommended Approach

1. Alert context와 기존 warning/critical·제외 경계를 확인하고 전달 문제는 Kubernetes
   문서로 넘긴다.
2. PVC/PV/StorageClass, metrics·trend, mount Pod와 controller/operator owner를 읽기
   전용으로 조회한다. owner·backup·가용성·목표 용량 gate가 없으면 mutation하지 않는다.
3. 승인된 workload 정리 경로가 없으면 선언 owner별 expansion 경로를 선택한다. Operator는
   지원 field/reconcile, standalone PVC declaration은 declaration 증가·reconcile을 사용하고,
   StatefulSet template은 generic 변경/reconcile하지 않는다. 기존 bound PVC direct patch는
   모든 gate 뒤에만 수행하고 template 정합화는 owner 승인 별도 계획으로 둔다.
4. condition/event, filesystem, workload health/readiness, 여유 추세와
   `KubePersistentVolumeFillingUp` resolved를 확인하고 비민감 요약만 기록한다.

명령에는 `<namespace>`, `<pvc>`, `<owner-kind>` 같은 placeholder만 사용하고 Secret,
credential, payload 또는 파일 내용을 출력하지 않는다. 공식 Kubernetes·Prometheus
문서는 원칙의 근거로만 링크하며 실제 지원 여부는 매 incident의 live 값으로 판정한다.

## Risks / Trade-offs

- 공통 문서가 workload 차이를 숨길 수 있으므로 mutation은 owner·전용 runbook·선언
  source에 위임한다.
- 확장은 shrink rollback이 없고 비용·재시도 위험이 있으므로 목표·quota·condition/event를
  완료까지 확인한다.
- online resize를 우선하고 restart는 condition과 owner 절차가 요구할 때만 수행한다.
- Kosmo와 Kubernetes 결과는 각각 독립적으로 검토·revert할 수 있으며 전체 이슈 완료는
  양쪽 firing/resolved·negative routing 증거를 통합 확인한 뒤 결정한다.

## Migration Plan

없음. 문서 PR은 독립적으로 revert 가능하다.

## Open Questions

없음. Incident별 live StorageClass·CSI 지원, owner, backup과 target size는 runbook이 매번 확인한다.
