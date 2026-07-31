## Context

이 결정 기록은 `PROD-546`의 production PostgreSQL backup 운영 계약, 구현 자식 `PROD-549`·`PROD-550`·`PROD-551`, 후속 모니터링 이슈 `PROD-552`와 proposal/spec/design에서 구체화한 구현 경계를 반영한다.

## Decision Records

### S3 보존 범위와 보호 수준

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-546`, `PROD-549`
- Status: Active
- Context / Problem: 7일 PITR에 필요한 backup을 cluster와 독립적으로 보존하면서 초기 운영 복잡도와 비용을 제한해야 한다.
- Decision Outcome: `ap-northeast-2`의 단일 전용 bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket은 public access block, TLS-only, versioning과 삭제 보호를 사용한다. Barman recovery window는 7일, S3 lifecycle은 current 10일, non-current 30일, incomplete multipart 1일로 둔다.
- Alternatives Considered: KMS CMK, Object Lock, cross-region/account replication은 초기 범위를 넘고 별도 key/replication 운영이 필요해 제외했다. Lifecycle만 7일로 맞추는 방식은 정리 시점 차이에 대한 여유가 없어 제외했다.
- Consequences: 리전 전체 장애는 방어하지 않는다. Terraform 일반 destroy로 bucket을 제거할 수 없고 객체가 남아 있으면 삭제되지 않는다.
- Confirmation / Follow-up: Terraform plan에서 별도 default encryption resource가 없고 policy, versioning, lifecycle과 삭제 보호만 관리하는지 확인한다. AWS live object의 SSE-S3 적용은 최초 backup 검증에서 확인한다.

### Backup workload의 AWS 인증 방식

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-546`, `PROD-549`, `PROD-550`
- Status: Active
- Context / Problem: production과 restore Pod가 S3에 접근해야 하지만 장기 access key를 배포하면 안 된다.
- Decision Outcome: `byulmaru-kosmo-prod-postgres-backup` IAM role을 EKS Pod Identity로 `kosmo-prod/kosmo-postgres-backup`과 `kosmo-prod-restore/kosmo-postgres-backup`에 연결한다. Policy는 대상 bucket의 `kosmo-prod/` prefix에서 backup/restore에 필요한 List/Get/Put/Delete/multipart 동작만 허용한다.
- Alternatives Considered: static access key Secret은 장기 credential을 만들므로 제외했다. IRSA는 기존 platform의 Pod Identity agent를 재사용하지 못하고 별도 OIDC trust/annotation을 요구해 제외했다. production과 restore 별도 role은 현재 동일 source 접근 계약에서 이점보다 관리 비용이 커 제외했다.
- Consequences: Kosmo Terraform의 role 적용이 Kubernetes association보다 먼저여야 한다. Restore Pod도 기술적으로 write 권한을 받으므로 restore manifest에서 WAL archiver와 ScheduledBackup을 구성하지 않는 방어가 필요하다.
- Confirmation / Follow-up: 두 association의 live 상태와 Pod 내부 기본 AWS credential chain 접근을 확인하고 repository/Secret에 access key가 없는지 검사한다.

### 공식 Barman Cloud CNPG-I plugin 사용

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-546`, `PROD-550`, `PROD-551`
- Status: Active
- Context / Problem: CloudNativePG 1.30.0의 내장 object-store backup 경로는 deprecated되었고 새 production backup은 장기 지원되는 통합 경로가 필요하다.
- Decision Outcome: 공식 CNPG Helm repository의 `plugin-barman-cloud` chart 0.7.0(app v0.13.0)을 `cnpg-system`에 설치하고 `barman-cloud.cloudnative-pg.io` plugin을 ObjectStore, ScheduledBackup과 WAL archiver에 사용한다.
- Alternatives Considered: deprecated된 내장 `barmanObjectStore`는 새 구현의 유지보수 경로로 부적합해 제외했다. 별도 CronJob에서 pg_dump를 실행하는 방식은 연속 WAL/PITR 계약을 충족하지 못해 제외했다.
- Consequences: plugin은 CloudNativePG operator와 cert-manager 이후 준비되어야 하며 cluster와 workload 적용 순서를 지켜야 한다.
- Confirmation / Follow-up: Helm release/deployment 준비 상태와 CNPG/plugin 호환 버전을 live 확인한다.

### Base backup과 WAL 보존 일정

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-546`, `PROD-551`
- Status: Active
- Context / Problem: 명시적인 RPO와 recovery window를 지원하는 실행 일정과 보존 정책이 필요하다.
- Decision Outcome: 최초 활성화 때 immediate base backup을 실행하고 이후 매일 03:00 KST에 base backup을 수행한다. Cluster의 `archive_timeout`은 4분으로 두어 S3 업로드·관측 시간을 포함한 RPO 5분 목표에 1분 여유를 확보하고, ObjectStore retention은 7일로 둔다. 초기 10Gi 전제에서 압축·병렬화는 plugin 기본값을 사용한다.
- Alternatives Considered: 더 잦은 base backup은 초기 규모에서 비용과 I/O 대비 RPO 개선이 작아 제외했다. WAL archive 없는 일일 backup은 RPO 5분을 충족하지 못해 제외했다. 수동 최초 backup만 사용하는 방식은 활성화 누락 가능성이 있어 제외했다.
- Consequences: ScheduledBackup cron은 초를 포함한 UTC 6-field `0 0 18 * * *`을 사용한다. RPO 5분은 실제 WAL archive와 restore에서 검증해야 할 목표다.
- Confirmation / Follow-up: Helm render, immediate Backup 상태, WAL archive 상태와 S3 versioned object를 확인한다.

### Production 전용 렌더 경계

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-546`, `PROD-551`
- Status: Active
- Context / Problem: 아직 production Application이 없는 동안 선언을 먼저 병합하되 dev database에 backup 자원이나 AWS identity 의존성을 추가하면 안 된다.
- Decision Outcome: `kosmo-postgres-backup` ServiceAccount, ObjectStore, Cluster plugin/WAL 설정과 ScheduledBackup은 prod values에서만 렌더한다. PostgreSQL Pod의 plugin이 ObjectStore를 읽을 수 있도록 같은 ServiceAccount에 동명 ObjectStore 하나의 `get`만 허용하는 namespaced Role/RoleBinding을 함께 렌더한다. Dev manifest는 현재 상태를 유지한다.
- Alternatives Considered: 모든 환경에 resource를 만들고 dev에서 비활성화하는 방식은 불필요한 CR과 identity 계약을 남겨 제외했다. 별도 chart는 공통 Cluster 선언이 중복되어 제외했다.
- Consequences: dev/prod 양쪽의 render test가 필요하고 production 값이 활성화되기 전에는 live backup 검증이 불가능하다. ServiceAccount는 다른 ObjectStore나 write verb를 사용할 수 없다.
- Confirmation / Follow-up: Role/RoleBinding은 API server dry-run을 통과해야 하고, 적용 후 exact ObjectStore `get`은 `kubectl auth can-i`로 검증한다. Backup과 WAL archive 성공을 실제 상태로 확인한다.

### 원본 쓰기 없는 격리 PITR rehearsal

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-546`, `PROD-551`
- Status: Active
- Context / Problem: backup 성공만으로 복구 가능성을 증명할 수 없으며 rehearsal이 production 데이터나 backup chain을 오염시키면 안 된다.
- Decision Outcome: application write pause 중 불변 snapshot과 named restore point를 만들고 WAL 전환을 강제하지 않은 상태에서 대상 WAL의 자연 archive 성공을 확인한 뒤 `kosmo-prod-restore` namespace의 새 Cluster를 해당 restore point로 복구한다. Restore Cluster에는 source ObjectStore를 recovery source로만 연결하고 같은 destination의 WAL archiver 또는 ScheduledBackup을 구성하지 않는다. 출시 전 한 번과 이후 월 1회 RPO, RTO, schema, Drizzle migration history, 대표 row count와 최소 read를 검증한다.
- Alternatives Considered: production Cluster in-place restore는 원본을 덮어쓸 위험이 있어 제외했다. Backup phase만 확인하는 방식은 실제 복구 경로를 검증하지 못해 제외했다.
- Consequences: rehearsal용 namespace/PVC 비용과 월간 운영 작업이 발생한다. 민감 데이터가 아닌 시각·phase·측정값·검증 결과만 Linear에 기록해야 한다.
- Confirmation / Follow-up: 최초 production 준비 후 RPO 5분/RTO 60분 목표를 측정하고 `PROD-546`에 증거를 남긴 뒤 restore namespace를 제거한다.

### 자동 실패 알림의 후속 분리

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-546`, `PROD-552`
- Status: Active
- Context / Problem: backup 기반을 우선 구축하면서 실패 탐지 자동화의 독립적인 monitoring ownership을 유지해야 한다.
- Decision Outcome: 이번 변경은 Backup, ScheduledBackup, Cluster/ObjectStore/plugin 상태와 로그의 수동 확인까지만 제공한다. Prometheus/Slack `#monitoring` 자동 알림은 `PROD-552`에서 구현한다.
- Alternatives Considered: 이번 세 구현 이슈에 alert rule을 함께 넣는 방식은 monitoring 범위와 배포 의존성을 확장해 제외했다. 상태 확인 경로도 제공하지 않는 방식은 운영 검증이 불가능해 제외했다.
- Consequences: `PROD-552` 완료 전에는 운영자가 runbook에 따라 주기적으로 상태를 확인해야 한다.
- Confirmation / Follow-up: runbook의 명령으로 성공·실패 상태와 원인을 확인할 수 있는지 검증하고 `PROD-552` 관계를 유지한다.

### 실제 운영 검증 전 완료 금지

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-545`, `PROD-546`, `PROD-551`
- Status: Active
- Context / Problem: production Cluster 생성은 별도 이슈에 속하므로 선언형 구현 완료와 운영 복구 가능성 증명 시점이 다르다.
- Decision Outcome: 세 구현 slice의 선언형 변경은 순서대로 병합할 수 있지만 production에서 immediate backup, WAL archive와 격리 restore 증거를 확보하기 전에는 `PROD-546`과 OpenSpec 운영 검증 task를 완료하거나 archive하지 않는다.
- Alternatives Considered: manifest 검증만으로 parent를 완료하는 방식은 RPO/RTO와 restore 계약을 증명하지 못해 제외했다. Production 준비까지 모든 PR을 보류하는 방식은 독립적으로 검증 가능한 기반 작업을 지연시켜 제외했다.
- Consequences: code PR이 모두 병합된 뒤에도 change가 장기간 열린 상태일 수 있다.
- Confirmation / Follow-up: `PROD-545` 준비 후 live 검증 task를 재개하고 증거가 모두 기록된 때만 archive gate를 통과한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
