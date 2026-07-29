# Production PostgreSQL backup과 복구

## 운영 계약

Production CloudNativePG Cluster는 Barman Cloud CNPG-I plugin으로 다음 경계를 유지한다.

- Cluster namespace: `kosmo-prod`
- Cluster: `kosmo-postgres`
- Backup ServiceAccount와 ObjectStore: `kosmo-postgres-backup`
- Destination: `s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/`
- WAL archive timeout: 4분(업로드·관측 시간을 포함한 RPO 5분 목표에 1분 여유)
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

### 1. 복구 지점과 불변 기준 기록

고유한 `RESTORE_POINT_NAME`을 정한다. Application의 쓰기 경로를 maintenance/read-only 상태로 전환하고 실제 writer가 멈춘 것을 확인한다. 쓰기가 중지된 동안 원본 database의 한 read-only transaction에서 비민감 집계값을 기록한다.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT count(*) FROM drizzle.__drizzle_migrations;
SELECT count(*) FROM account;
SELECT count(*) FROM profile;
SELECT count(*) FROM post;
COMMIT;
```

실제 schema에 없는 대표 테이블은 현재 production의 핵심 테이블로 교체하되 row 값은 출력하지 않는다. 마지막 migration hash와 최소 read에서 사용할 불변 식별자도 같은 snapshot에서 기록하되 Linear나 workflow log에는 값 자체를 남기지 않는다.

Write pause를 유지한 채 CNPG의 `postgres` superuser 연결에서 named restore point를 만들고 해당 WAL segment, LSN과 UTC 시각을 기록한다.

```sql
SELECT pg_create_restore_point('RESTORE_POINT_NAME') AS target_lsn;
SELECT pg_walfile_name(pg_current_wal_lsn()) AS target_wal;
SELECT clock_timestamp() AS target_time;
```

이후 application 쓰기를 재개한다. 현재 원본의 count를 다시 기준으로 사용하지 않는다. Write pause를 확보하지 못했으면 rehearsal을 진행하지 않는다. 그렇지 않으면 restore point 이후의 정상 insert/delete를 복구 실패와 구분할 수 없다.

RPO 측정 중에는 `pg_switch_wal()`이나 backup 명령으로 WAL 전환을 강제하지 않는다. 실제 workload 또는 `archive_timeout=4min`이 segment를 자연스럽게 전환하도록 두고, 원본의 `pg_stat_archiver`와 CNPG/plugin 상태에서 `target_wal` 또는 그 이후 WAL의 archive 성공을 확인한다.

```sql
SELECT last_archived_wal, last_archived_time, failed_count, last_failed_wal
FROM pg_stat_archiver;
```

`last_archived_wal`이 기록한 `target_wal`과 같거나 이후이고 새로운 archive 실패가 없을 때만 restore를 시작한다. Target time부터 이 조건을 처음 관측한 시각까지를 WAL archive 지연으로 기록한다. 이 지연이 5분을 넘으면 RPO 검증 실패로 기록하며, 단순히 5분이 지났다는 이유만으로 restore를 시작하지 않는다.

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

### 3. 새 Cluster를 named restore point로 복구

`RESTORE_POINT_NAME`을 1단계에서 생성한 이름으로 바꿔 적용한다. `serverName`은 source Cluster 이름인 `kosmo-postgres`로 유지한다.

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
      database: kosmo
      owner: kosmo
      recoveryTarget:
        targetName: 'RESTORE_POINT_NAME'
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

CNPG가 생성한 `kosmo-postgres-restore-app` Secret을 `kosmo` owner와 `kosmo` database의 application credential로 사용해 읽기 전용 연결을 만든 뒤 다음을 비교한다. Secret 값은 terminal history, command output이나 Linear에 출력하지 않는다.

- `pg_dump --schema-only` 결과의 구조적 차이
- restore point 직전 snapshot에 기록한 `drizzle.__drizzle_migrations` count와 마지막 migration hash
- restore point 직전 snapshot에 기록한 대표 테이블의 row count와 불변 식별자 존재 여부
- 대표 GraphQL read query 또는 동일 query path의 최소 application read
- Restore Cluster의 마지막 replay LSN이 기록한 `target_lsn`에 도달했는지 여부

현재 production 상태가 아니라 1단계에서 restore point 직전에 고정한 기준과 Restore Cluster를 비교한다. Restore point LSN 도달은 선택한 복구 지점까지 데이터가 복원됐음을 증명한다. Target time부터 `target_wal` archive 성공을 처음 관측한 시각까지의 지연을 RPO 증거로, rehearsal 시작부터 Cluster Ready까지를 RTO로 기록한다. 목표는 각각 5분과 60분 이내다. Restore point 이름, timestamp, Backup phase, 측정값과 성공/실패만 `PROD-546`에 남긴다.

### 5. 정리

검증 결과를 기록한 뒤 restore namespace만 제거한다.

```sh
kubectl delete namespace kosmo-prod-restore
kubectl get namespace kosmo-prod kosmo-prod-restore
aws s3api get-bucket-versioning \
  --bucket byulmaru-kosmo-prod-postgresql-backups-822638974464
```

`kosmo-prod`와 source S3 bucket은 유지되어야 한다. Restore 실패 시 원인을 기록하고 namespace를 정리한 뒤 같은 달 안에 재실행한다. 실제 backup과 최초 restore 증거가 없으면 `PROD-546` 또는 관련 OpenSpec을 완료·archive하지 않는다.
