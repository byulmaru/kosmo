# PersistentVolume 용량 부족 대응

이 문서는 `KubePersistentVolumeFillingUp` 알림에서 PVC의 용량 위험과 workload
owner를 확인하고, 데이터 보호 경계를 지키며 용량 확보와 복구를 검증하는 공통
runbook이다. PostgreSQL, Vault, Prometheus와 앞으로 추가될 PVC workload에 같은
순서를 적용하되 애플리케이션별 정책과 선언 소유자의 절차를 우선한다.

## 1. 알림을 확인하고 범위를 고정한다

알림의 다음 필드를 별도 이슈나 대응 기록에 적는다. Secret, credential, database row,
object 본문과 실제 사용자 데이터는 복사하지 않는다.

- `alertname`: `KubePersistentVolumeFillingUp`
- `namespace`, `persistentvolumeclaim`, `severity`
- `summary`, `description`
- 알림이 firing으로 관측된 시각과 확인한 시각

기존 규칙의 의미와 대상 경계를 그대로 사용한다. `critical`은 현재 여유 공간 부족,
`warning`은 기존 예측 기간 안에 고갈될 추세를 뜻한다. `ReadOnlyMany` 또는
`excluded_from_alerts=true` PVC를 이 문서가 다시 포함하지 않는다. Alertmanager
receiver, allowlist, `#monitoring`, Slack 형식, `runbook_url`이나 Slack 링크는
정의하지 않으며 전달 문제는 [Kubernetes 운영 문서](https://github.com/byulmaru/kubernetes/blob/main/docs/operations.md)의
소유 범위로 넘긴다.

PostgreSQL이 아닌 PVC에도 아래 절차를 적용한다. 알림이 없거나 대상 PVC가
불명확하면 다른 PVC를 추측해 변경하지 말고 관측 담당자에게 escalation한다.

## 2. 읽기 전용으로 현재 상태를 진단한다

꺾쇠 괄호 안 값만 실제 값으로 바꾸고 Secret·데이터 출력을 추가하지 않는다. 이
단계에서는 PVC, PV, StorageClass, Pod와 workload를 변경하지 않는다.

### PVC, PV와 StorageClass

```sh
kubectl get pvc "<pvc>" -n "<namespace>" \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,REQUEST:.spec.resources.requests.storage,BOUND_PV:.spec.volumeName,STATUS_CAPACITY:.status.capacity.storage,STORAGE_CLASS:.spec.storageClassName,ACCESS:.spec.accessModes[*],VOLUME_MODE:.spec.volumeMode'

kubectl get pv "<pv>" \
  -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,CAPACITY:.spec.capacity.storage,CLAIM_NAMESPACE:.spec.claimRef.namespace,CLAIM_NAME:.spec.claimRef.name,RECLAIM_POLICY:.spec.persistentVolumeReclaimPolicy,CSI_DRIVER:.spec.csi.driver'

kubectl get storageclass "<storage-class>" \
  -o custom-columns='NAME:.metadata.name,PROVISIONER:.provisioner,ALLOW_EXPANSION:.allowVolumeExpansion,VOLUME_BINDING:.volumeBindingMode'

kubectl get events -n "<namespace>" \
  --field-selector='involvedObject.kind=PersistentVolumeClaim,involvedObject.name=<pvc>' \
  --sort-by=.lastTimestamp \
  -o custom-columns='TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message'
```

다음 값을 서로 비교해 현재 위험을 고정한다: PVC의 `REQUEST`, `STATUS_CAPACITY`,
`STATUS`, `ACCESS`; PV의 `CAPACITY`, `PHASE`, reclaim policy, CSI driver; StorageClass의
`PROVISIONER`, `ALLOW_EXPANSION`; PVC condition, `allocatedResourceStatuses`와
event의 실패·대기·재시도 상태.

`status.capacity`가 비어 있거나 PVC가 `Bound`가 아니거나 resize 실패 event가 남아
있으면 확장을 완료로 간주하지 않는다. StorageClass 이름만으로 지원 여부를
판정하지 말고 incident의 live 값과 실제 provisioner/CSI 지원을 확인한다.

### 사용량과 증가 추세

Prometheus UI에서 다음 PromQL을 각각 실행한다. 결과에는 namespace, PVC, 관측 시각,
비민감한 바이트 측정값과 관측 기간만 기록한다. 결과가 없다고 용량이 충분하다고
판정하지 말고 kubelet volume metric 수집 상태를 관측 담당자에게 확인한다.

```promql
kubelet_volume_stats_available_bytes{
  namespace="<namespace>",
  persistentvolumeclaim="<pvc>"
}

kubelet_volume_stats_capacity_bytes{
  namespace="<namespace>",
  persistentvolumeclaim="<pvc>"
}

kubelet_volume_stats_used_bytes{
  namespace="<namespace>",
  persistentvolumeclaim="<pvc>"
}

predict_linear(
  kubelet_volume_stats_available_bytes{
    namespace="<namespace>",
    persistentvolumeclaim="<pvc>"
  }[6h],
  4 * 24 * 60 * 60
)
```

`available / capacity`로 여유 비율과 최근 감소 추세를 확인한다. 예측식은 추세
확인용이며 alert threshold나 severity를 재정의하지 않는다.

### PVC를 mount한 Pod와 상위 owner

먼저 PVC를 실제로 mount한 Pod를 찾는다. `jq`는 PVC 이름만 비교하고 payload를
출력하지 않는다.

```sh
kubectl get pods -n "<namespace>" -o json \
  | jq -r --arg pvc "<pvc>" '
      .items[]
      | select(any(.spec.volumes[]?; .persistentVolumeClaim.claimName == $pvc))
      | .metadata.name
    '
```

각 Pod에서 volume·mount path를 확인하고 owner reference를 한 단계씩 따라간다.

```sh
kubectl get pod "<pod>" -n "<namespace>" \
  -o jsonpath='{range .spec.volumes[*]}{.name}{"\t"}{.persistentVolumeClaim.claimName}{"\n"}{end}{range .spec.containers[*]}{.name}{"\t"}{range .volumeMounts[*]}{.name}{"="}{.mountPath}{"\n"}{end}{end}'

kubectl get pod "<pod>" -n "<namespace>" \
  -o jsonpath='{range .metadata.ownerReferences[*]}{.apiVersion}{"\t"}{.kind}{"\t"}{.name}{"\tcontroller="}{.controller}{"\n"}{end}'

kubectl get "<owner-kind>" "<owner-name>" -n "<namespace>" \
  -o jsonpath='{range .metadata.ownerReferences[*]}{.apiVersion}{"\t"}{.kind}{"\t"}{.name}{"\tcontroller="}{.controller}{"\n"}{end}'
```

ReplicaSet→Deployment, Pod→StatefulSet처럼 controller를 끝까지 추적한다. CNPG,
Vault 등 operator workload는 최종 custom resource와 용량 선언 경로까지 확인한다.
owner reference·controller·service owner가 불명확하면 멈추고 미확인 관계, 현재
위험과 필요한 담당자를 기록해 service owner와 storage 운영 담당자에게 escalation한다.

## 3. 데이터와 변경 책임을 확인한다

용량을 바꾸거나 데이터를 정리하기 전에 최종 owner resource·service owner, 데이터
성격과 승인된 retention·backup·export·rebalance 정책, 최근 backup과 복구 경계,
목표 용량·provider 한도·quota·비용, 가용성 영향과 rollout/restart 계획을 확인하고
승인자를 기록한다.

service owner가 승인한 workload 전용 절차와 제거 가능성을 확인한 경우에만 따른다.
PostgreSQL은 [Production PostgreSQL backup과 복구](./postgres-backup.md)의
backup·복구 경계를 먼저 확인하고, Vault·Prometheus 등은 각 owner의 절차를 따른다.

보존 정책·삭제 승인, 최근 backup·복구 가능성, workload owner·가용성 영향 또는
안전한 정리·export·rebalance 절차가 하나라도 없으면 데이터를 건드리지 않는다.

승인된 정리 경로가 없고 즉시 해소가 필요하면 지원되는 volume 확장 또는 별도
snapshot/backup/migration 계획으로 escalation한다. 이 문서는 데이터 삭제·공통
purge·retention 결정·PVC/PV 교체·reclaim policy 변경을 제공하지 않는다.

## 4. 지원되는 방법으로 용량을 확장한다

### 사전 조건

다음 조건을 모두 확인한 뒤에만 확장을 선택한다: live StorageClass의
`allowVolumeExpansion=true`, provisioner·CSI driver 지원, 현재 PVC request/status보다
큰 목표 용량, provider 한도·quota·비용·가용성 승인, 용량 선언 source와 reconcile 방식,
backup·owner 승인과 필요한 rollout/restart 계획.

StorageClass 또는 CSI 지원 여부가 불명확하거나 expansion을 지원하지 않으면 PVC/PV를
교체하지 말고 데이터 보호 계획을 포함한 별도 migration 또는 storage 운영 escalation을
만든다.

### 선언 source와 기존 PVC를 정합화한다

선언 source는 다음 세 경로를 구분한다.

| 선언 source                              | 확장 경로                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator                                 | 지원된 resize field/reconcile만 사용한다. 경로가 없거나 불명확하면 owner가 direct patch 또는 migration을 별도 승인하며, operator가 덮어쓰는 동안 live PVC를 수정하지 않는다.                                                                                                        |
| Standalone PVC declaration (Helm/GitOps) | PVC manifest를 직접 소유하면 모든 gate 뒤 declaration을 늘리고 reconcile한 뒤 live PVC 결과를 확인한다.                                                                                                                                                                             |
| StatefulSet template (Helm/GitOps 포함)  | 기존 object의 `spec.volumeClaimTemplates`는 API가 immutable field로 거부하므로 generic in-place 변경/reconcile하지 않는다. 기존 bound PVC direct patch와 template·미래 replica 정합화는 owner 승인 recreation/migration 계획으로 별도 처리하며 이 runbook은 교체를 실행하지 않는다. |

owner와 선언 source를 확인하고 backup, StorageClass/CSI 지원, 목표 용량·quota,
service owner 승인과 가용성 gate를 모두 통과한 경우에만 기존 PVC request를 직접
늘린다. `<target-size>`는 현재 request/status보다 큰 승인된 값이어야 한다.

```sh
kubectl patch pvc "<pvc>" -n "<namespace>" \
  --type=merge \
  --patch='{"spec":{"resources":{"requests":{"storage":"<target-size>"}}}}'
```

Kubernetes가 기존 PV를 resize하도록 PVC request만 변경한다. PV capacity를 직접
편집하거나 PVC request를 줄이지 않는다. 자동 증설, PVC/PV 교체, reclaim policy 변경,
volume purge 절차는 없다.

### filesystem과 workload 반영

변경 직후 완료 처리하지 말고 PVC condition, allocated resource status와 event를
반복 확인한다. ReadWrite filesystem이 online resize를 지원하면 running Pod에 반영될
수 있다. 새 Pod가 필요하거나 condition이 restart를 요구할 때만 owner와 가용성 영향을
다시 확인해 workload 소유 방식으로 통제된 rollout/restart를 수행한다.

filesystem 용량은 mount path를 확인한 뒤 파일 내용이 아닌 filesystem 통계만 읽는다.

```sh
kubectl exec -n "<namespace>" "<pod>" -c "<container>" -- \
  df -P -k "<mount-path>"
```

operator custom resource가 restart나 failover를 소유하면 generic rollout 대신 operator
절차를 따른다. 확장·restart 중 readiness가 떨어지거나 event가 반복되면 완료 처리하지
않고 service owner와 storage 운영 담당자에게 escalation한다.

## 5. 복구와 alert 해소를 검증한다

다음 순서로 새 상태를 확인하고, 모든 항목이 정상일 때만 완료로 기록한다.

```sh
kubectl get pvc "<pvc>" -n "<namespace>" \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,REQUEST:.spec.resources.requests.storage,STATUS_CAPACITY:.status.capacity.storage'

kubectl get pvc "<pvc>" -n "<namespace>" \
  -o jsonpath='{.status.conditions[*].type}{"\t"}{.status.allocatedResourceStatuses}{"\n"}'

kubectl get events -n "<namespace>" \
  --field-selector='involvedObject.kind=PersistentVolumeClaim,involvedObject.name=<pvc>' \
  --sort-by=.lastTimestamp \
  -o custom-columns='TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message'

kubectl get pods -n "<namespace>" \
  -o custom-columns='NAME:.metadata.name,READY:.status.containerStatuses[*].ready,PHASE:.status.phase'

kubectl get "<owner-kind>" "<owner-name>" -n "<namespace>" \
  -o custom-columns='NAME:.metadata.name,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas,PHASE:.status.phase'
```

검증 기준은 PVC가 `Bound`이고 request/status capacity가 목표에 수렴하며 resize
condition·allocated status에 실패·대기·반복 재시도가 없는지, mount filesystem과
여유 공간·예상 추세 및 Pod·상위 workload health/readiness가 정상인지, Prometheus가
해당 PVC의 firing series를 반환하지 않는지 확인한다.

```promql
ALERTS{
  alertname="KubePersistentVolumeFillingUp",
  namespace="<namespace>",
  persistentvolumeclaim="<pvc>",
  alertstate="firing"
}
```

resize가 실패·대기·재시도 중이거나 workload가 Ready가 아니거나 alert가 계속 firing이면
완료 처리하지 말고 현재 상태, 가용성 영향, 마지막 정상 측정과 담당자를 기록한다.
Slack resolved notification과 전달 실패 검증은 Kubernetes 저장소의 기존 경계에서
별도로 확인한다.

## 6. 비민감 대응 증거

운영 이슈에는 raw command output 대신 alert context(이름·namespace·PVC·severity·시각),
request/status와 available/capacity·추세, PV/StorageClass·resize condition/event 상태,
최종 owner·승인 조치·선언 source, filesystem/workload 복구·alert 해소 시각과 실패 시
현재 상태·영향·escalation 대상만 요약한다.

Secret 값, credential, connection string, database row, object payload, 파일 내용과
실제 사용자 데이터는 terminal history, CI log, Linear, Slack 또는 commit에 남기지
않는다.

## 참고 자료

- [Kubernetes: Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Kubernetes: Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Prometheus Operator: KubePersistentVolumeFillingUp runbook](https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubepersistentvolumefillingup/)
