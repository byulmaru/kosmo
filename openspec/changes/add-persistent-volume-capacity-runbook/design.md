## Context

`PROD-698`은 기존 kube-prometheus-stack의 `KubePersistentVolumeFillingUp` 규칙을 모든 대상 PVC에 유지하면서 명시적 Alertmanager allowlist를 통해 `#monitoring`으로 전달하고, 별도로 Kosmo의 내부 대응 runbook을 제공하는 하나의 운영 결과다. 현재 Slack 계약은 receiver, `#monitoring` 채널과 `sendResolved=true`뿐이므로 Alertmanager routing과 기존 메시지 형식의 notification test는 `byulmaru/kubernetes`가 소유하고, 이 저장소는 Slack 링크 없이 실제 PVC 진단·완화·확장·복구 검증을 소유한다.

Kosmo에는 PostgreSQL backup·복구 등 workload별 운영 문서는 있지만 PVC 용량 부족에서 시작하는 범용 절차가 없다. PVC는 StatefulSet, operator CR처럼 서로 다른 선언 소유자를 가질 수 있고, 확장 가능 여부도 live StorageClass의 `allowVolumeExpansion`, provisioner와 CSI driver 지원에 달려 있으므로 특정 workload나 현재 cluster 값으로 일반화할 수 없다. Kubernetes 공식 문서는 PVC request 증가, PV 직접 편집 금지, filesystem resize와 실패 재시도 경계를 제공하고, Prometheus Operator 표준 runbook은 사용량 추세·retention·export·rebalance·resize·migration 선택지를 제시한다.

## Goals / Non-Goals

**Goals:**

- warning/critical PVC filling 알림에서 시작해 공통 읽기 전용 진단으로 실제 위험과 owner를 확인한다.
- 데이터 정리 판단을 workload owner와 전용 보존·backup runbook으로 분리한다.
- StorageClass·CSI와 workload 선언 경계를 확인한 뒤 지원되는 PVC 확장을 안전하게 수행할 수 있게 한다.
- PVC/filesystem/workload 상태와 새 여유 공간, 증가 추세와 alert resolved까지 검증한다.
- `byulmaru/kubernetes` 전달 경로 문서와 책임이 중복되지 않고 비밀·실제 사용자 데이터를 증거에 남기지 않는다.

**Non-Goals:**

- Alertmanager allowlist, `runbook_url` annotation, Slack runbook 링크·custom title/text, firing/resolved 합성 notification test 또는 Terraform 변경
- `KubePersistentVolumeFillingUp` 표현식·severity·제외 조건 변경
- 자동·선제 volume 증설, 애플리케이션별 보존 정책 결정 또는 공통 삭제 명령
- PVC/PV 삭제·재생성, reclaim policy 변경, snapshot restore 또는 volume migration의 실행 절차
- 전체 storage SLI/SLO, dashboard, quota·inode·node filesystem alert 확대

## Implementation Guidance

### Current Constraints

- 신규 문서 경로는 Linear가 정한 `docs/operations/persistent-volume-capacity.md`다. 현재 Slack 메시지는 이 경로를 소비하지 않으며 두 저장소 PR 사이에 runbook 링크나 병합 순서 의존성이 없다.
- `docs/operations/postgres-backup.md`는 PostgreSQL의 data protection과 복구를 소유한다. 범용 runbook이 이를 복제하거나 PostgreSQL 데이터 삭제·복구 방식을 새로 정하면 기존 운영 계약과 충돌한다.
- CNPG, Prometheus, Vault처럼 PVC를 생성·관리하는 상위 resource가 다르다. Pod 하나만 찾아 임의로 삭제하거나 PVC를 직접 편집하는 고정 명령은 선언 source of truth와 가용성 정책을 우회할 수 있다.
- StorageClass 이름이나 현재 Terraform 선언은 live `allowVolumeExpansion`과 CSI resize 지원의 증거가 아니다. Incident마다 실제 PVC, StorageClass, provisioner, condition과 event를 조회해야 한다.
- Kubernetes는 PVC 축소를 지원하지 않으며, 과도한 확장 요청은 controller가 계속 재시도할 수 있다. PV capacity를 직접 편집하면 자동 resize가 수행되지 않을 수 있다.
- 저장소에는 docs/operations 전용 자동 command test가 없다. Markdown formatting·link 정합성, 명령의 읽기 전용 실클러스터 smoke와 사람의 안전 경계 검토를 조합해야 한다.

### Recommended Approach

Runbook을 다음 순서의 하나의 의사결정 흐름으로 작성하는 것을 기본으로 한다.

1. **진입점과 책임:** alertname, namespace, PVC, severity, summary, description을 확인하고 warning/critical의 기존 의미를 그대로 사용한다. Alertmanager·Slack 전달 문제는 `byulmaru/kubernetes/docs/operations.md`로 보낸다.
2. **읽기 전용 진단:** placeholder를 사용한 `kubectl get/describe`와 Prometheus 조회로 PVC request/status, available/capacity와 최근 추세, PV·StorageClass, condition/event를 확인한다. PVC를 mount한 Pod에서 owner reference를 controller/operator resource까지 추적한다.
3. **owner와 데이터 경계:** service owner, 데이터의 지속성, 승인된 retention·export·rebalance 절차, backup/restore 상태를 확인한다. PostgreSQL이면 `docs/operations/postgres-backup.md`로 연결하고, 확인되지 않은 데이터 삭제나 purge는 중단한다.
4. **완화 선택:** 승인된 workload별 정리로 충분하면 그 절차를 사용한다. 그렇지 않으면 live StorageClass와 CSI 지원, 목표 용량, 가용성 영향과 workload의 선언 source를 확인해 expansion을 선택한다. 확장이 불가능하면 범용 문서에서 PVC를 교체하지 않고 별도 migration 계획으로 escalation한다.
5. **확장:** workload가 용량을 선언하는 상위 resource가 있으면 그 source를 통해 기존 PVC request가 증가하도록 하고, 그렇지 않은 경우에만 기존 PVC request를 직접 늘린다. PV는 직접 편집하지 않고 현재 `status.capacity` 이하로 낮추지 않는다. Restart는 condition과 workload 특성이 요구할 때만 통제된 방식으로 수행한다.
6. **검증과 증거:** PVC request/status, allocated resize status·condition·event, mount filesystem, Pod/controller readiness와 workload별 health를 확인한다. 새 여유 공간과 추세가 충분하고 alert가 resolved된 뒤 비민감 결과만 기록한다.

명령 예시는 `<namespace>`, `<pvc>`, `<storage-class>`, `<workload>`처럼 명시적인 placeholder를 사용하고, credential이나 Secret 값을 출력하는 command를 포함하지 않는다. 사용량은 `kubelet_volume_stats_available_bytes`와 `kubelet_volume_stats_capacity_bytes`를 같은 namespace/PVC label로 대조하되 기존 alert threshold를 문서에서 다시 정의하지 않는다.

### Allowed Alternatives

- Runbook 안에서 진단·판단·확장·검증을 섹션으로 나누거나, 상단에 동일한 순서를 보존하는 체크리스트를 둘 수 있다.
- Owner resource 추적과 metric 조회 command는 현재 cluster 도구에 맞는 `kubectl` JSONPath, `jq` 또는 Prometheus UI 쿼리를 사용할 수 있다. 결과가 같은 read-only 사실을 제공하고 placeholder·비밀 비노출 경계를 지켜야 한다.
- Workload가 공식 operator command나 GitOps 선언으로 size를 관리하면 직접 PVC patch 대신 그 경로를 사용할 수 있다. 최종적으로 기존 PVC request와 실제 volume/filesystem이 커지고 specs의 검증을 만족해야 한다.

### Known Traps

- 표준 Prometheus runbook의 Pod 자동 삭제 예시를 그대로 복사하면 single-replica workload나 operator 관리 workload에 불필요한 중단을 만들 수 있다.
- StorageClass 이름만 보고 expansion을 지원한다고 가정하거나 PV capacity를 먼저 편집하면 resize를 건너뛰거나 반복 실패 상태를 만들 수 있다.
- 용량 부족을 즉시 데이터 삭제 문제로 취급하면 승인되지 않은 보존 정책과 데이터 손실을 초래한다.
- PVC/PV 이름, namespace와 severity는 대응에 필요한 resource context지만, Secret 값·database row·object payload를 함께 출력하거나 Linear/Slack에 복사해서는 안 된다.
- Kosmo runbook에서 synthetic alert, Slack receiver 또는 Terraform 검증을 다시 설명하면 두 저장소의 운영 문서가 서로 다른 절차로 drift한다.

## Risks / Trade-offs

- [범용 절차가 workload별 복구·가용성 차이를 숨길 수 있음] → 공통 절차는 read-only 진단과 판단 gate까지만 제공하고 mutation은 service owner와 전용 runbook·선언 source에 연결한다.
- [잘못된 목표 용량은 실패 재시도 또는 비용 증가를 만들고 shrink rollback이 없음] → 현재 용량·추세·provider 한도와 목표를 사전 확인하고 resize condition/event를 완료까지 관찰한다.
- [Restart가 가용성 또는 모니터링 공백을 만들 수 있음] → online filesystem expansion을 우선 관찰하고 condition이 요구할 때만 owner 승인 아래 workload 방식으로 restart한다.
- [외부 표준 문서와 cluster 구현이 변할 수 있음] → 공식 문서는 원칙의 근거로 링크하고 실제 지원 여부는 매 incident의 live read-only 조회로 판정한다.
- [Kosmo 문서와 Kubernetes routing PR의 생명주기가 다름] → 두 PR은 독립적으로 리뷰·병합하되 `PROD-698` 담당자가 runbook 실행 가능성과 기존 형식의 firing/resolved·negative routing 증거를 모두 확인해야 이슈를 완료한다.

## Migration Plan

1. Kosmo 브랜치에서 OpenSpec strict validation과 runbook 요구사항을 확정한다.
2. `docs/operations/persistent-volume-capacity.md`를 추가하고 Markdown formatting, 내부·외부 링크, placeholder와 민감정보 경계를 검증한다.
3. Tailscale Kubernetes API proxy를 사용한 read-only 명령 smoke로 대상이 다른 PVC에서 진단·owner 추적 명령의 실행 가능성을 확인하되 실제 identifier와 출력 원문은 커밋·Linear에 남기지 않는다.
4. Kosmo runbook PR과 `byulmaru/kubernetes`의 별도 `PROD-698` PR을 순서 제약 없이 독립적으로 리뷰·병합한다.
5. Kubernetes PR은 `KubePersistentVolumeFillingUp`만 기존 allowlist에 추가하고 receiver, `#monitoring`, `sendResolved=true`와 Slack 메시지 형식을 유지한 채 positive/negative firing·resolved routing을 검증한다.
6. 두 저장소의 결과와 통합 증거를 `PROD-698` 담당자가 확인한다.

이 변경에는 schema나 runtime migration이 없다. Kosmo 문서와 Kubernetes allowlist는 링크 계약을 공유하지 않으므로 각 저장소에서 독립적으로 revert할 수 있다.

## Open Questions

없음. Incident별 live StorageClass·CSI 지원, owner, backup과 target size는 구현 전에 고정할 제품 결정이 아니라 runbook이 매번 확인할 운영 입력이다.
