# Fedify 큐와 전달 모니터링

## 수집 경로

`web`, Temporal `worker`, Fedify `fedify-consumer` Pod가 내부 `9464/metrics` endpoint를 제공합니다. `kosmo-fedify-metrics` PodMonitor는 같은 namespace의 세 workload를 30초 간격으로 수집하며, scrape timeout은 10초입니다. 앱 Service나 HTTPRoute에는 metrics 포트를 추가하지 않습니다. 로컬 실행은 `METRICS_PORT`를 설정하지 않으면 exporter를 시작하지 않습니다.

운영 sidecar가 모든 namespace의 Grafana dashboard ConfigMap을 검색하므로 대시보드는 `prod` Helm release에서만 생성합니다. 각 환경 release는 자체 PodMonitor를 생성합니다. 대시보드의 Environment 선택은 `kosmo-dev` 또는 `kosmo-prod` namespace 하나를 모든 query에 적용합니다.

## 지표 해석

- `fedify_queue_depth`는 `fedify_queue_role="shared"`, `fedify_queue_backend="PostgresMessageQueue"` 큐의 `ready`와 `delayed` 메시지 수입니다. Web과 각 Fedify instance가 같은 공유 큐를 관측하므로 대시보드는 복제된 gauge의 `max by (namespace)`를 사용합니다. 복제본 수를 더하지 않습니다. `queued` 상태를 ready와 delayed의 합으로 다시 합산하지 않습니다.
- `fedify_queue_task_in_flight`는 consumer가 현재 실행 중인 queue task 수입니다. 대시보드는 `job="fedify-consumer"`인 Pod 전체를 namespace별로 더합니다.
- `activitypub_inbox_processing_duration`은 inbox handler 처리 시간 histogram이며 단위는 밀리초입니다. 대시보드 p95는 handler 처리만 보며 큐 대기 시간은 포함하지 않습니다.
- `activitypub_delivery_sent_total`은 HTTP delivery attempt별 counter입니다. `activitypub_delivery_success="false"` attempt 수를 전체 attempt 수로 나눈 비율과 최근 5분 attempt 수를 표시합니다. Queue task 완료는 원격 delivery 성공을 뜻하지 않습니다.
- `activitypub_delivery_permanent_failure_total`은 영구 delivery 실패 counter입니다. 대시보드에는 HTTP 404와 410의 최근 5분 추이가 표시됩니다.

Metrics에 remote host나 Activity type URI를 label로 남기지 않습니다. 이 exporter는 metrics만 노출하며 trace 전송을 켜지 않습니다. 기존 Sentry 오류·로그 동작과 활성화 정책은 변경하지 않습니다.

## 배포 후 검증

Production release가 공유 dashboard를 설치하고 각 환경 release가 해당 namespace의 PodMonitor를 설치한 뒤 확인합니다.

```sh
kubectl get podmonitor kosmo-fedify-metrics -n kosmo-dev
kubectl get podmonitor kosmo-fedify-metrics -n kosmo-prod
kubectl get pods -n kosmo-dev -l app.kubernetes.io/name=fedify-consumer
```

Prometheus Targets에서 `web`, `worker`, `fedify-consumer` scrape가 모두 `UP`인지 확인하고, Prometheus query에서 `fedify_queue_depth`, `fedify_queue_task_in_flight`, `activitypub_inbox_processing_duration_bucket`, `activitypub_delivery_sent_total`, `activitypub_delivery_permanent_failure_total`을 조회합니다. Grafana에서 Environment를 `Development`와 `Production`으로 바꿔 각 namespace의 값만 표시되는지 확인합니다. HTTP attempt가 하나도 없으면 실패 비율은 빈 시계열이고, 성공 attempt만 있으면 실패 비율은 0%입니다.

이 문서 작성 시점에는 Kubernetes 배포, 실제 Prometheus scrape 및 Grafana 표시를 확인하지 않았습니다.
