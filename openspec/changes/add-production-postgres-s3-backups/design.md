## Context

Kosmo 애플리케이션 repository의 Terraform은 애플리케이션 전용 AWS resource를 소유하고, `byulmaru/kubernetes` Terraform은 EKS add-on과 cluster-wide operator를 소유한다. 현재 `apps/helm`의 CloudNativePG Cluster는 10Gi persistent volume만 사용하며 production Application은 `PROD-545`에서 별도로 생성될 예정이다.

CloudNativePG 1.30.0에서는 내장 `barmanObjectStore` 경로가 deprecated되었으므로 공식 Barman Cloud CNPG-I plugin을 사용한다. 현재 Kubernetes platform은 plugin이 요구하는 CloudNativePG 1.26+와 cert-manager를 이미 제공하고 EKS Pod Identity agent도 활성화되어 있다.

이 변경은 세 Terraform/Helm 적용 경계를 가로지른다. 따라서 AWS backup 저장소와 role, cluster-wide plugin과 identity association, workload backup 선언을 각각 독립적으로 검증하고 순서대로 적용해야 한다.

## Goals / Non-Goals

### Goals

- production PostgreSQL의 base backup과 연속 WAL을 서울 리전 S3에 7일 PITR window로 보관한다.
- 매일 03:00 KST base backup과 5분 WAL archive timeout으로 RPO 5분 목표를 지원한다.
- 장기 AWS credential 없이 production과 restore workload에 최소 권한을 제공한다.
- 원본을 덮어쓰지 않는 restore rehearsal로 RTO 60분 목표와 데이터 복구 가능성을 검증한다.
- production cluster가 아직 없어도 안전하게 선언형 변경을 먼저 병합할 수 있게 한다.

### Non-Goals

- replica 수, failover topology, EBS snapshot 또는 dev database backup 변경
- KMS CMK, S3 Object Lock, cross-region/account replication과 지역 재해 복구
- backup 압축·병렬화 기본값 조정
- Prometheus/Slack 자동 실패 알림
- production Cluster 또는 Argo CD Application 자체 생성

## Implementation Guidance

### Current Constraints

- Kosmo Terraform state가 S3 bucket과 IAM role을, Kubernetes Terraform state가 plugin과 Pod Identity association을, Kosmo Helm이 CNPG workload resource를 소유한다.
- Kubernetes CI의 `iam:PassRole` 범위는 `byulmaru*` role 이름에 한정되어 있다.
- Kosmo Terraform bootstrap policy는 새 bucket과 role을 관리할 최소 권한을 plan 전에 먼저 받아야 한다.
- production Application과 Cluster가 아직 없으므로 선언형 검증은 가능하지만 live backup/restore 검증은 `PROD-545` 준비 이후에만 가능하다.

### Recommended Approach

1. `PROD-549`에서 `ap-northeast-2`의 `byulmaru-kosmo-prod-postgresql-backups-822638974464` bucket과 `kosmo-prod/` prefix 전용 `byulmaru-kosmo-prod-postgres-backup` role을 만든다. Bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket에는 public access block, TLS-only policy, versioning, current 10일/non-current 30일/incomplete multipart 1일 lifecycle, `prevent_destroy = true`, `force_destroy = false`를 적용한다.
2. `PROD-550`에서 공식 CNPG Helm repository의 `plugin-barman-cloud` chart 0.7.0(app v0.13.0)을 `cnpg-system`에 설치한다. CloudNativePG operator와 cert-manager 이후 준비되게 하고 같은 role을 `kosmo-prod/kosmo-postgres-backup`, `kosmo-prod-restore/kosmo-postgres-backup`에 연결한다.
3. `PROD-551`에서 prod 값에만 ServiceAccount, ObjectStore, Cluster plugin과 ScheduledBackup을 렌더한다. ObjectStore는 IAM role을 상속하고 7일 retention을 사용한다. Cluster는 plugin을 WAL archiver로 지정하고 `archive_timeout=5min`을 사용한다. ScheduledBackup은 plugin method, self ownership, immediate 실행과 6-field UTC cron `0 0 18 * * *`을 사용한다.
4. runbook은 on-demand backup, 상태·접근 장애 확인, 격리된 PITR restore, 검증과 정리를 포함한다. Application write pause 중 불변 snapshot과 named restore point를 만들고 대상 WAL의 archive 성공을 확인한 뒤 restore를 시작한다. 이후 현재 production count를 비교 기준으로 사용하지 않는다. Restore workload는 source prefix를 읽을 수 있지만 ScheduledBackup 또는 WAL archiver destination을 구성하지 않는다.

### Allowed Alternatives

- repository 내 file/module 배치는 기존 구조에 맞게 조정할 수 있다. 다만 resource의 소유 state, 고정 bucket/role/ServiceAccount 이름, output 계약과 적용 순서는 유지해야 한다.
- restore manifest는 복사 가능한 문서 template 또는 별도 예제 manifest로 제공할 수 있다. 두 방식 모두 named restore point와 source server name을 운영자가 명시하고 source에 쓰지 않아야 한다.
- plugin chart의 values key는 chart schema에 맞춰 조정할 수 있으나 chart/app version과 namespace는 고정한다.

### Known Traps

- deprecated된 Cluster 내장 `barmanObjectStore`를 새 구현에 사용하지 않는다.
- AWS access key를 Secret이나 Helm values에 넣지 않는다.
- S3/IAM 적용 전에 Pod Identity association을 만들거나 plugin 준비 전에 workload backup을 활성화하지 않는다.
- restore Cluster에 production과 같은 WAL archiver destination 또는 ScheduledBackup을 연결하지 않는다.
- dev render에 ServiceAccount, ObjectStore, plugin 또는 ScheduledBackup이 섞이지 않게 한다.
- CloudNativePG schedule은 일반 5-field cron이 아니라 초를 포함한 6-field 표현식이다.
- S3 lifecycle이 7일 recovery window보다 먼저 필요한 current object를 지우지 않게 한다.
- 실제 backup/restore 증거가 없는데 `PROD-546` 또는 OpenSpec을 완료·archive하지 않는다.

## Risks / Trade-offs

- [S3 lifecycle과 Barman retention 정리 시점이 어긋날 수 있음] → current object에 10일 여유를 두고 versioning/non-current 30일을 유지하며 최초 backup 후 실제 object 만료 상태를 확인한다.
- [S3 또는 Pod Identity 장애가 WAL archive를 지연시킬 수 있음] → Cluster/ObjectStore/plugin 상태와 로그를 runbook에서 수동 확인하고 자동 알림은 `PROD-552`에서 추가한다.
- [일일 base backup이 database I/O를 증가시킬 수 있음] → 초기 10Gi 규모에서는 plugin 기본 압축·병렬화로 시작하고 실제 소요 시간과 영향이 문제일 때만 후속 조정한다.
- [서울 단일 bucket은 리전 재해를 방어하지 못함] → 이번 RPO/RTO는 cluster/PVC와 운영 장애 범위로 한정하고 cross-region/account DR은 별도 계약으로 남긴다.
- [production 준비 지연으로 복구 가능성이 선언만 된 상태가 지속될 수 있음] → 선언형 PR은 병합하되 live rehearsal task, `PROD-546`과 OpenSpec을 열린 상태로 유지한다.

## Migration Plan

1. `PROD-549`의 Kosmo Terraform plan을 검토·적용해 bucket과 role을 먼저 준비한다.
2. `PROD-550`의 Kubernetes Terraform plan을 검토·적용해 plugin과 두 Pod Identity association을 준비하고 live 상태를 확인한다.
3. `PROD-551`의 Helm/runbook 변경을 병합한다. dev render에는 변화가 없어야 한다.
4. `PROD-545`가 production Cluster를 제공하면 production Application을 동기화하고 immediate backup, WAL archive와 S3 object를 확인한다.
5. 별도 restore namespace에서 PITR rehearsal과 RPO/RTO·데이터 검증을 수행하고 증거를 `PROD-546`에 남긴 뒤 namespace를 제거한다.
6. 이후 월 1회 같은 rehearsal을 수행한다. 최초 live 검증 전에는 이 change를 archive하지 않는다.

Rollback 시에는 activation 전 Helm backup resource를 되돌릴 수 있다. Activation 후에는 WAL 연속성 영향을 검토하지 않고 archiver를 중단하지 않으며, 보존이 필요한 backup이 있는 동안 bucket과 role을 제거하지 않는다. Cluster-wide plugin은 workload가 사용하지 않더라도 설치 상태로 둘 수 있다.

## Open Questions

없음.
