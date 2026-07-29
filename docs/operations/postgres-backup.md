# Production PostgreSQL backup과 복구

## 운영 계약

Production CloudNativePG Cluster는 Barman Cloud CNPG-I plugin으로 다음 경계를 유지한다.

- Cluster namespace: `kosmo-prod`
- Cluster: `kosmo-postgres`
- Backup ServiceAccount와 ObjectStore: `kosmo-postgres-backup`
- Destination: `s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/`
- WAL archive timeout: 5분
- Base backup: 매일 03:00 KST, 최초 동기화 시 즉시 1회
- PITR recovery window: 7일
- Restore namespace: `kosmo-prod-restore`
- 목표: RPO 5분 이내, restore Cluster Ready까지 RTO 60분 이내

Backup 내용, database credential과 row 값은 command output, workflow log 또는 Linear에 남기지 않는다. Prometheus/Slack 자동 알림은 `PROD-552` 범위이며, 그 전에는 아래 상태를 수동 확인한다.

## 상태 확인

```sh
kubectl get cluster,scheduledbackup,backup -n kosmo-prod
kubectl get objectstore.barmancloud.cnpg.io -n kosmo-prod
kubectl describe cluster kosmo-postgres -n kosmo-prod
kubectl describe scheduledbackup kosmo-postgres-daily -n kosmo-prod
kubectl get backup -n kosmo-prod --sort-by=.metadata.creationTimestamp
```

최신 `Backup`의 `status.phase`, 시작·완료 시각과 error를 확인한다. Cluster status에서는 archiving 상태와 마지막 WAL 관련 condition을 확인한다. ObjectStore가 Ready가 아니거나 backup이 실패하면 다음 순서로 경계를 좁힌다.

```sh
kubectl describe objectstore kosmo-postgres-backup -n kosmo-prod
kubectl get serviceaccount kosmo-postgres-backup -n kosmo-prod -o yaml
aws eks list-pod-identity-associations --cluster-name byulmaru --region ap-northeast-2
kubectl logs deployment/barman-cloud-plugin-barman-cloud -n cnpg-system --since=30m
kubectl get pod -n kosmo-prod -l cnpg.io/cluster=kosmo-postgres \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].name}{"\n"}{end}'
```

마지막 명령에서 확인한 plugin sidecar container 이름으로 instance 로그를 조회한다.

```sh
kubectl logs -n kosmo-prod POD_NAME -c PLUGIN_SIDECAR_NAME --since=30m
```

- `AccessDenied`: association의 namespace, ServiceAccount, role ARN과 요청된 S3 prefix를 확인한다.
- credential endpoint 오류: `eks-pod-identity-agent` 상태와 Pod 재생성 후 credential 주입 여부를 확인한다.
- ObjectStore/plugin 연결 오류: `cnpg-system`의 plugin Deployment, client/server Certificate와 ObjectStore condition을 확인한다.
- WAL archive 오류가 지속되면 새 base backup을 실행하기 전에 원인을 해결한다. WAL 연속성이 끊긴 기간은 복구 가능 시점에서 제외될 수 있다.

## On-demand base backup

정기 schedule을 바꾸지 않고 plugin 방식 Backup을 하나 생성한다.

```sh
kubectl cnpg backup --namespace kosmo-prod kosmo-postgres \
  --method plugin \
  --plugin-name barman-cloud.cloudnative-pg.io
kubectl get backup -n kosmo-prod --sort-by=.metadata.creationTimestamp
```

`kubectl cnpg` plugin을 사용할 수 없으면 아래 manifest를 적용한다. `BACKUP_NAME`은 중복되지 않는 운영 식별자로 바꾼다.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: BACKUP_NAME
  namespace: kosmo-prod
spec:
  cluster:
    name: kosmo-postgres
  method: plugin
  pluginConfiguration:
    name: barman-cloud.cloudnative-pg.io
```

`Backup` phase가 `completed`가 된 뒤 S3의 `kosmo-prod/` 아래에 새 versioned object가 생성됐는지 확인한다. Object key나 내용을 Linear에 복사하지 않는다.

## 격리 PITR rehearsal

한 달에 한 번, 그리고 최초 production 출시 전에 다음 절차를 수행한다. 실행자는 `PROD-546` assignee이며 해당 월이 끝나기 전에 결과를 같은 이슈에 기록한다.

### 1. 기준 시각과 원본 상태 기록

UTC 기준 target time을 정하고 rehearsal 시작 시각을 기록한다. Target time은 현재 시각보다 최소 5분 이전이며 7일 recovery window 안에 있어야 한다. 원본에서 다음과 같은 비민감 집계값만 기록한다.

```sql
SELECT now();
SELECT count(*) FROM drizzle.__drizzle_migrations;
SELECT count(*) FROM account;
SELECT count(*) FROM profile;
SELECT count(*) FROM post;
```

실제 schema에 없는 대표 테이블은 현재 production의 핵심 테이블로 교체하되 row 값은 출력하지 않는다.

### 2. Restore namespace와 source ObjectStore 생성

Pod Identity association은 미리 `kosmo-prod-restore/kosmo-postgres-backup`에 연결되어 있다.

```sh
kubectl create namespace kosmo-prod-restore
```

다음 manifest를 적용한다.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kosmo-postgres-backup
  namespace: kosmo-prod-restore
---
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata:
  name: kosmo-postgres-backup
  namespace: kosmo-prod-restore
spec:
  configuration:
    destinationPath: s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/
    s3Credentials:
      inheritFromIAMRole: true
```

### 3. 새 Cluster를 target time으로 복구

`TARGET_TIME`을 timezone이 포함된 RFC3339 UTC 값으로 바꿔 적용한다. `serverName`은 source Cluster 이름인 `kosmo-postgres`로 유지한다.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: kosmo-postgres-restore
  namespace: kosmo-prod-restore
spec:
  instances: 1
  serviceAccountName: kosmo-postgres-backup
  bootstrap:
    recovery:
      source: production
      recoveryTarget:
        targetTime: 'TARGET_TIME'
  externalClusters:
    - name: production
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters:
          barmanObjectName: kosmo-postgres-backup
          serverName: kosmo-postgres
  storage:
    size: 10Gi
```

이 Cluster에는 `.spec.plugins`와 `ScheduledBackup`을 추가하지 않는다. 따라서 source ObjectStore는 recovery input으로만 사용되고 restore Cluster는 같은 destination에 WAL이나 base backup을 쓰지 않는다.

```sh
kubectl wait --for=condition=Ready cluster/kosmo-postgres-restore \
  -n kosmo-prod-restore --timeout=60m
kubectl get cluster,pod -n kosmo-prod-restore
```

### 4. 데이터와 목표 검증

Restore Cluster의 application credential로 읽기 전용 연결을 만든 뒤 다음을 비교한다.

- `pg_dump --schema-only` 결과의 구조적 차이
- `drizzle.__drizzle_migrations` count와 마지막 migration hash
- 앞에서 선택한 대표 테이블의 row count
- 대표 GraphQL read query 또는 동일 query path의 최소 application read
- `pg_last_xact_replay_timestamp()` 또는 검증 가능한 최신 domain timestamp와 target time의 차이

Rehearsal 시작부터 Cluster Ready까지를 RTO로, target time 기준 마지막 복구 데이터의 차이를 RPO로 기록한다. 목표는 각각 60분과 5분 이내다. Timestamp, Backup phase, 측정값과 성공/실패만 `PROD-546`에 남긴다.

### 5. 정리

검증 결과를 기록한 뒤 restore namespace만 제거한다.

```sh
kubectl delete namespace kosmo-prod-restore
kubectl get namespace kosmo-prod kosmo-prod-restore
aws s3api get-bucket-versioning \
  --bucket byulmaru-kosmo-prod-postgresql-backups-822638974464
```

`kosmo-prod`와 source S3 bucket은 유지되어야 한다. Restore 실패 시 원인을 기록하고 namespace를 정리한 뒤 같은 달 안에 재실행한다. 실제 backup과 최초 restore 증거가 없으면 `PROD-546` 또는 관련 OpenSpec을 완료·archive하지 않는다.
