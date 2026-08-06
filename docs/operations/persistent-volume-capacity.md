# PersistentVolume 용량 부족 대응

이 문서는 `KubePersistentVolumeFillingUp` 알림을 받은 운영자가 PVC의 용량 위험과
workload owner를 확인하고, 데이터 보호 경계를 지키면서 용량을 확보한 뒤 복구를
검증하기 위한 공통 runbook이다. PostgreSQL, Vault, Prometheus와 앞으로 추가될
PVC 기반 workload에 같은 순서를 적용하되, 애플리케이션별 정책과 선언 소유자의
절차를 우선한다.

## 1. 알림을 확인하고 범위를 고정한다

알림의 다음 필드를 별도 이슈나 대응 기록에 적는다. Secret, credential, database
row, object 본문과 실제 사용자 데이터는 복사하지 않는다.

- `alertname`: `KubePersistentVolumeFillingUp`
- `namespace`, `persistentvolumeclaim`, `severity`
- `summary`, `description`
- 알림이 firing으로 관측된 시각과 확인한 시각

기존 규칙의 의미와 대상 경계를 그대로 사용한다.

- `critical`은 현재 여유 공간 부족을 나타낸다.
- `warning`은 최근 추세로 보아 기존 규칙의 예측 기간 안에 고갈될 위험을 나타낸다.
- `ReadOnlyMany` PVC와 `excluded_from_alerts=true` 라벨로 제외된 PVC를 이 문서가
  알림 대상으로 강제로 포함하지 않는다.
- 이 문서는 Alertmanager receiver, allowlist, `#monitoring`, Slack 메시지 형식,
  `runbook_url` 또는 Slack runbook 링크를 정의하지 않는다. 알림 전달 자체의 문제는
  [Kubernetes 운영 문서](https://github.com/byulmaru/kubernetes/blob/main/docs/operations.md)의
  소유 범위로 넘긴다.

알림이 PostgreSQL이 아닌 PVC에서 시작해도 아래 진단 절차를 동일하게 적용한다.
알림이 없거나 대상 PVC가 명확하지 않으면 추측으로 다른 PVC를 변경하지 말고 관측
담당자에게 escalation한다.

## 2. 읽기 전용으로 현재 상태를 진단한다

아래 명령의 꺾쇠 괄호 안 값을 실제 값으로 바꾸되, 명령 자체에 Secret이나 데이터
출력을 추가하지 않는다. 이 단계에서는 PVC, PV, StorageClass, Pod와 workload를
변경하지 않는다.

### PVC, PV와 StorageClass

```sh
kubectl get pvc "<pvc>" -n "<namespace>" \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,REQUEST:.spec.resources.requests.storage,BOUND_PV:.spec.volumeName,STATUS_CAPACITY:.status.capacity.storage,STORAGE_CLASS:.spec.storageClassName,ACCESS:.spec.accessModes[*],VOLUME_MODE:.spec.volumeMode'

kubectl get pv "<pv>" \
  -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,CAPACITY:.spec.capacity.storage,CLAIM:.spec.claimRef.namespace/.spec.claimRef.name,RECLAIM_POLICY:.spec.persistentVolumeReclaimPolicy,CSI_DRIVER:.spec.csi.driver'

kubectl get storageclass "<storage-class>" \
  -o custom-columns='NAME:.metadata.name,PROVISIONER:.provisioner,ALLOW_EXPANSION:.allowVolumeExpansion,VOLUME_BINDING:.volumeBindingMode'

kubectl get events -n "<namespace>" \
  --field-selector='involvedObject.kind=PersistentVolumeClaim,involvedObject.name=<pvc>' \
  --sort-by=.lastTimestamp \
  -o custom-columns='TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message'
```

다음 값을 서로 비교해 현재 위험을 고정한다.

- PVC의 `REQUEST`, `STATUS_CAPACITY`, `STATUS`와 `ACCESS`
- 연결된 PV의 `CAPACITY`, `PHASE`, reclaim policy와 CSI driver
- StorageClass의 `PROVISIONER`, `ALLOW_EXPANSION`
- PVC의 resize condition, `allocatedResourceStatuses`와 event의 실패·대기·재시도
  상태

`status.capacity`가 비어 있거나 PVC가 `Bound`가 아니거나 event에 resize 실패가
남아 있으면 확장을 완료로 간주하지 않는다. StorageClass 이름만으로 확장 가능성을
판정하지 말고 이 incident의 live 값과 실제 provisioner/CSI driver 지원을 확인한다.

### 사용량과 증가 추세

Prometheus UI에서 다음 PromQL을 각각 실행한다. 결과에는 namespace, PVC, 관측 시각,
비민감한 바이트 측정값과 관측 기간만 기록한다. 결과가 없으면 용량이 충분하다고
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

`available / capacity`로 현재 여유 비율을 계산하고, 같은 PVC의 최근 표본에서
available이 감소하는지 확인한다. 위의 예측식은 추세 확인용이며 이 문서가 기존
alert threshold나 severity를 재정의하는 기준으로 사용하지 않는다.

### PVC를 mount한 Pod와 상위 owner

먼저 PVC를 실제로 mount한 Pod를 찾는다. `jq`는 Pod spec에서 PVC 이름만 비교하고
애플리케이션 payload를 출력하지 않는다.

```sh
kubectl get pods -n "<namespace>" -o json \
  | jq -r --arg pvc "<pvc>" '
      .items[]
      | select(any(.spec.volumes[]?; .persistentVolumeClaim.claimName == $pvc))
      | .metadata.name
    '
```

각 Pod에서 volume과 mount path를 확인한 뒤 owner reference를 한 단계씩 따라간다.

```sh
kubectl get pod "<pod>" -n "<namespace>" \
  -o jsonpath='{range .spec.volumes[*]}{.name}{"\t"}{.persistentVolumeClaim.claimName}{"\n"}{end}{range .spec.containers[*]}{.name}{"\t"}{range .volumeMounts[*]}{.name}{"="}{.mountPath}{"\n"}{end}{end}'

kubectl get pod "<pod>" -n "<namespace>" \
  -o jsonpath='{range .metadata.ownerReferences[*]}{.apiVersion}{"\t"}{.kind}{"\t"}{.name}{"\tcontroller="}{.controller}{"\n"}{end}'

kubectl get "<owner-kind>" "<owner-name>" -n "<namespace>" \
  -o jsonpath='{range .metadata.ownerReferences[*]}{.apiVersion}{"\t"}{.kind}{"\t"}{.name}{"\tcontroller="}{.controller}{"\n"}{end}'
```

ReplicaSet에서 Deployment로, Pod에서 StatefulSet으로 이어지는 것처럼 controller를
끝까지 추적한다. CNPG, Vault 등 operator가 관리하는 workload라면 최종 operator
custom resource와 그 resource가 용량을 선언하는 경로까지 확인한다. owner reference가
없거나 controller가 분명하지 않거나 담당 service owner를 확인할 수 없으면 여기서
멈춘다. 미확인 관계, 현재 용량 위험과 필요한 담당자를 기록하고 service owner와
storage 운영 담당자에게 escalation한다.

## 3. 데이터와 변경 책임을 확인한다

용량을 바꾸거나 데이터를 정리하기 전에 다음을 모두 확인하고 승인자를 기록한다.

1. workload의 최종 owner resource와 담당 service owner
2. 데이터의 성격, 승인된 retention·backup·export·rebalance 정책
3. 최근 backup 성공 여부와 복구 경계
4. 목표 용량, provider 한도 또는 namespace quota와 비용 영향
5. 확장 중 workload 가용성 영향, rollout/restart 계획과 rollback 불가 범위

서비스 owner가 승인된 workload 전용 정리 절차를 제공하고 해당 데이터가 제거 가능함을
확인한 경우에만 그 절차를 따른다. PostgreSQL은 [Production PostgreSQL backup과
복구](./postgres-backup.md)의 backup·복구 경계를 먼저 확인한다. Vault, Prometheus와
다른 workload는 각 service owner의 전용 retention·backup·export 절차를 따른다.

다음 중 하나라도 확인되지 않으면 데이터를 건드리지 않는다.

- 데이터 보존 정책 또는 삭제 승인
- 최근 backup과 복구 가능성
- workload owner와 가용성 영향
- 안전한 정리·export·rebalance 절차

승인된 정리 경로가 없고 용량 위험이 즉시 해소되어야 하면 지원되는 volume 확장 또는
별도 snapshot/backup/migration 계획을 escalation한다. 이 공통 runbook은 데이터
내용 삭제, 공통 purge, retention 정책 결정, PVC/PV 교체나 reclaim policy 변경을
제공하지 않는다.

## 4. 지원되는 방법으로 용량을 확장한다

### 사전 조건

다음 조건을 모두 확인한 뒤에만 확장을 선택한다.

- StorageClass의 `allowVolumeExpansion=true`
- 해당 `provisioner`와 CSI driver가 volume expansion을 지원함
- 목표 용량이 현재 PVC request와 PV/PVC status capacity보다 큼
- 목표 용량이 provider 한도와 quota 안에 있으며 비용·가용성 영향이 승인됨
- workload가 용량을 선언하는 source of truth와 reconcile 방식이 확인됨
- backup, owner 승인과 필요한 rollout/restart 계획이 준비됨

StorageClass 또는 CSI 지원 여부를 확인할 수 없거나 expansion을 지원하지 않으면
PVC/PV를 임의로 교체하지 않는다. 데이터 보호 계획이 포함된 별도 migration 또는
storage 운영 escalation을 만든다.

### 선언 source를 먼저 변경한다

StatefulSet의 `volumeClaimTemplates`, operator custom resource, Helm/GitOps 선언 등
상위 resource가 용량을 소유하면 해당 선언 source를 목표 용량으로 변경하고 정상적인
reconcile을 기다린다. 상위 resource가 다시 PVC request를 덮어쓰는 환경에서 live PVC만
수정하지 않는다.

owner와 선언 source를 확인했으며 해당 PVC가 직접 관리되는 경우에만 다음처럼 기존
PVC의 request를 더 큰 값으로 변경한다. `<target-size>`는 현재 request/status보다
큰 승인된 값이어야 한다.

```sh
kubectl patch pvc "<pvc>" -n "<namespace>" \
  --type=merge \
  --patch='{"spec":{"resources":{"requests":{"storage":"<target-size>"}}}}'
```

Kubernetes가 기존 PV를 resize하도록 PVC request만 변경한다. PV의 capacity를 직접
편집하거나 PVC request를 줄이지 않는다. 이 runbook에는 자동 증설, PVC/PV 교체,
reclaim policy 변경과 volume purge 절차가 없다.

### filesystem과 workload 반영

변경 직후 완료 처리하지 말고 PVC condition, allocated resource status와 event를
반복 확인한다. ReadWrite로 mount된 filesystem은 driver와 filesystem이 online resize를
지원하면 running Pod에서 반영될 수 있다. 새 Pod가 필요하거나 condition이 restart를
요구하면 service owner와 가용성 영향을 다시 확인한 뒤 workload가 소유한 방식으로
통제된 rollout/restart를 수행한다. online expansion이 가능한 경우 불필요한 Pod
재시작을 고정 절차로 만들지 않는다.

filesystem 용량은 mount path를 확인한 뒤 파일 내용이 아닌 filesystem 통계만 읽는다.

```sh
kubectl exec -n "<namespace>" "<pod>" -c "<container>" -- \
  df -P -k "<mount-path>"
```

operator custom resource가 restart나 failover를 소유하는 경우 generic rollout 명령을
사용하지 말고 해당 operator의 승인된 절차를 따른다. 확장·restart 중 readiness가
떨어지거나 event가 반복되면 변경을 완료 처리하지 않고 service owner와 storage 운영
담당자에게 escalation한다.

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

검증 기준은 다음과 같다.

- PVC가 `Bound`이고 request와 status capacity가 목표 용량으로 수렴한다.
- resize condition과 allocated resource status에 실패·대기·반복 재시도가 남지 않는다.
- mount filesystem의 용량과 여유 공간이 증가하고, 예상 증가 추세가 다시 고갈 위험을
  만들지 않는다.
- Pod, 상위 workload와 workload별 health/readiness가 정상이다.
- Prometheus에서 다음 query가 해당 PVC에 firing series를 반환하지 않는다.

```promql
ALERTS{
  alertname="KubePersistentVolumeFillingUp",
  namespace="<namespace>",
  persistentvolumeclaim="<pvc>",
  alertstate="firing"
}
```

resize가 실패·대기·재시도 중이거나 workload가 Ready가 아니거나 alert가 계속 firing이면
대응을 완료 처리하지 않는다. 현재 상태, 가용성 영향, 마지막 정상 측정과 escalation
담당자를 기록한다. Slack resolved notification과 전달 실패 검증은 이 문서의 소유
범위가 아니며 Kubernetes 저장소의 기존 전달 경계에서 별도로 확인한다.

## 6. 비민감 대응 증거

운영 이슈에는 raw command output 대신 다음 요약만 남긴다.

- alertname, namespace, PVC 이름, severity와 관측 시각
- request/status capacity, available/capacity 측정값, 관측 기간과 추세 판단
- PV/StorageClass의 상태, resize condition/event의 reason과 성공·실패 여부
- 최종 workload owner, service owner, 승인된 조치와 선언 source
- filesystem 반영, workload readiness/health와 alert가 더 이상 firing이 아닌 시각
- 실패 시 현재 상태, 가용성 영향과 escalation 대상

Secret 값, credential, connection string, database row, object payload, 파일 내용과
실제 사용자 데이터는 terminal history, CI log, Linear, Slack 또는 commit에 남기지
않는다.

## 참고 자료

- [Kubernetes: Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Kubernetes: Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Prometheus Operator: KubePersistentVolumeFillingUp runbook](https://runbooks.prometheus-operator.dev/runbooks/kubernetes/kubepersistentvolumefillingup/)
