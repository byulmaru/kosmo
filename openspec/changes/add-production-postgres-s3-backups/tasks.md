## 1. PROD-549 PostgreSQL backup S3와 workload IAM

**Authority / Provenance**

- `PROD-546`
- `PROD-549`

**Deliverable**

Production PostgreSQL backup이 cluster와 독립된 서울 리전 S3 저장소를 사용하고 production·restore workload가 장기 credential 없이 prod prefix에만 접근할 수 있다.

**Guardrails**

- Bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket은 public access block, TLS-only, versioning, current 10일/non-current 30일/incomplete multipart 1일 lifecycle과 Terraform 삭제 보호를 사용한다.
- KMS, Object Lock, cross-region/account replication과 영구 access key는 추가하지 않는다.
- IAM role 이름은 `byulmaru-kosmo-prod-postgres-backup`이며 bucket-level list는 Barman 확인을 위해 대상 전용 bucket 하나에만 허용하고 object 동작은 `kosmo-prod/` prefix로 제한한다.
- 이 Terraform state는 bucket과 role을 소유하며 Kubernetes resource를 소유하지 않는다.

**Verification**

- Terraform fmt/validate와 검토 가능한 saved plan에서 bucket, lifecycle, policy와 role/policy/output만 추가되고 별도 default encryption resource가 없는지 확인한다.
- 적용 후 AWS live 설정, role policy와 output을 조회해 선언과 일치하는지 확인한다.

- [x] 1.1 기존 Terraform 구조와 design guidance에 맞춰 backup bucket, 접근 보안 설정, versioning과 lifecycle을 선언한다.
- [x] 1.2 production·restore workload용 최소 권한 Pod Identity role과 trust/policy를 선언한다.
- [x] 1.3 Terraform bootstrap 주체에 대상 bucket 설정과 workload role만 관리할 권한을 추가한다.
- [x] 1.4 bucket/role 식별자를 output과 운영자가 찾을 수 있는 repository 문서에 기록한다.
- [x] 1.5 Terraform fmt/validate와 saved plan을 검토해 의도하지 않은 resource 변경이 없음을 확인한다.
- [x] 1.6 승인된 saved plan을 적용하고 AWS live 설정과 output 증거를 `PROD-549`에 기록한다.
- [ ] 1.7 Live Barman `HeadBucket` 403을 유발한 bucket-level list의 `s3:prefix` 조건을 제거하고 Terraform plan/apply와 실제 WAL archive로 보완을 검증한다.

## 2. PROD-550 Barman Cloud plugin과 PostgreSQL Pod Identity

**Authority / Provenance**

- `PROD-546`
- `PROD-550`

**Deliverable**

Kubernetes platform에 지원되는 Barman Cloud CNPG-I plugin이 준비되고 production·restore ServiceAccount가 Kosmo Terraform의 workload role에 연결된다.

**Guardrails**

- 공식 `plugin-barman-cloud` chart 0.7.0(app v0.13.0)을 `cnpg-system`에 설치하고 CloudNativePG operator·cert-manager 이후 준비되게 한다.
- 기존 EKS Pod Identity agent를 재사용하며 static credential이나 별도 IRSA를 만들지 않는다.
- 같은 role을 `kosmo-prod/kosmo-postgres-backup`과 `kosmo-prod-restore/kosmo-postgres-backup`에 연결한다.
- `PROD-549`의 role 적용 이후 진행하며 Kubernetes Terraform state가 S3 bucket이나 IAM role을 생성하지 않는다.

**Verification**

- Kubernetes Terraform fmt/validate와 saved plan에서 plugin release와 두 association만 의도대로 추가되는지 확인한다.
- 적용 후 Helm release/deployment readiness, plugin 호환 버전과 두 Pod Identity association의 ACTIVE 상태를 확인한다.

- [x] 2.1 기존 addon 구조와 design guidance에 맞춰 Barman Cloud plugin release와 선행 의존성을 선언한다.
- [x] 2.2 Kosmo workload role을 조회하고 production·restore namespace/service account의 두 Pod Identity association을 선언한다.
- [x] 2.3 Terraform fmt/validate와 saved plan을 검토해 의도하지 않은 platform 변경이 없음을 확인한다.
- [x] 2.4 승인된 saved plan을 적용하고 plugin readiness와 association live 증거를 `PROD-550`에 기록한다.

## 3. PROD-551 CNPG backup 선언과 restore runbook

**Authority / Provenance**

- `PROD-546`
- `PROD-551`

**Deliverable**

Production CNPG Cluster가 5분 WAL archive 목표와 매일 03:00 KST base backup을 7일 recovery window로 수행할 수 있고, 운영자가 원본을 변경하지 않는 PITR restore를 실행·검증·정리할 수 있다.

**Guardrails**

- Backup resource와 Cluster 설정은 prod에서만 렌더하며 dev manifest에는 나타나지 않는다.
- Production Cluster는 `kosmo-postgres-backup` ServiceAccount를 사용하고 ObjectStore는 IAM role 상속으로 고정 bucket의 `kosmo-prod/` prefix에 연결한다.
- Production ServiceAccount에는 같은 namespace의 exact-name `kosmo-postgres-backup` ObjectStore 본문 `get`과 같은 이름의 `objectstores/status` `update`만 허용한다. 다른 ObjectStore 이름, 본문·status의 `patch`·`create`·`delete`·`list`·`watch`와 cluster-wide 권한은 부여하지 않는다.
- 공식 plugin을 WAL archiver와 ScheduledBackup method로 사용하며 `archive_timeout=4min`, retention 7일, immediate 실행과 UTC 6-field cron `0 0 18 * * *`을 사용한다.
- Restore Cluster는 별도 `kosmo-prod-restore` namespace에서 source를 recovery source로만 읽고 같은 destination에 WAL 또는 새 backup을 쓰지 않는다.
- Restore 검증은 application write pause 중 생성한 named restore point와 직전 불변 snapshot을 기준으로 하며 이후 현재 production count와 비교하지 않는다. RPO 측정에서는 WAL 전환을 강제하지 않고 대상 WAL의 자연 archive 성공을 확인한 뒤 restore를 시작한다.
- Prometheus/Slack 자동 알림, dev backup, replica/failover, EBS snapshot과 plugin 압축·병렬화 조정은 포함하지 않는다.

**Verification**

- OpenSpec strict validation과 Helm dev/prod render test를 통과시킨다.
- Dev에는 backup 관련 resource/field가 없고 prod에는 정확한 ServiceAccount, ObjectStore, Cluster plugin/WAL 설정과 ScheduledBackup이 있는지 확인한다.
- Runbook의 on-demand, 상태 확인, 접근 장애 진단, restore, 검증·정리 명령이 선언된 이름과 일치하는지 검토하고 exact-name ObjectStore `get`과 `objectstores/status` `update` `kubectl auth can-i` 확인을 포함한다.
- 현재 Tailscale API endpoint의 `kubectl auth can-i --as`는 요청한 ServiceAccount 대신 관리자 identity를 반환하므로, 그 `yes` 결과를 3.7 완료 evidence로 사용하지 않는다. 실제 workload identity로 다시 확인할 때까지 3.7은 미완료로 유지한다.

- [x] 3.1 Prod 전용 ServiceAccount와 ObjectStore를 선언하고 Cluster가 해당 identity와 plugin WAL archiver를 사용하게 한다.
- [x] 3.2 Immediate 실행과 일일 schedule을 갖는 plugin 방식 ScheduledBackup을 선언한다.
- [x] 3.3 Dev/prod render assertion을 추가해 환경 경계와 backup 계약을 검증한다.
- [x] 3.4 On-demand backup, 상태 확인과 S3/Pod Identity/plugin 장애 진단 절차를 운영 문서에 기록한다.
- [x] 3.5 격리 PITR manifest 작성, named restore point와 WAL archive gate, 데이터 검증과 namespace 정리 절차를 운영 문서에 기록한다.
- [x] 3.6 OpenSpec strict validation과 관련 Helm 검증을 통과시키고 결과를 `PROD-551`에 기록한다.
- [ ] 3.7 Live activation에서 확인된 recovery-window `objectstores/status` 갱신 권한 누락을 namespaced 최소 Role/RoleBinding으로 보완하고, 렌더 결과의 API server server-side dry-run, exact-name `get`·status `update` `kubectl auth can-i`와 OpenSpec strict validation evidence를 기록한다. 이 task만으로 post-merge live plugin 성공이나 recovery-window 관측을 완료로 표시하지 않는다.

## 4. PROD-546 운영 통합 검증과 archive gate

**Authority / Provenance**

- `PROD-545`
- `PROD-546`

**Deliverable**

실제 production backup과 격리 restore가 RPO 5분·RTO 60분 목표를 충족한다는 증거가 있고 반복 가능한 월간 rehearsal 경계가 확립된다.

**Guardrails**

- Production Cluster 준비 전에는 이 group을 완료하지 않는다.
- Restore는 production Cluster를 덮어쓰지 않으며 source backup destination에 쓰지 않는다.
- 증거에는 secret, row 값 또는 기타 민감 데이터를 남기지 않는다.
- 실제 backup/restore 증거 전에는 `PROD-546`을 완료하거나 OpenSpec change를 archive하지 않는다.

**Verification**

- Plugin sidecar, WAL archive, immediate base backup과 S3 versioned object의 live 상태를 확인한다.
- 2026-08-04 status-RBAC 수정 전의 completed `Backup`, DONE catalog와 `ContinuousArchiving=True` 관측은 진단 근거일 뿐이며, 이 task를 완료하려면 merge 후 같은 성공 증거를 새로 수집한다.
- Write pause 중 불변 snapshot과 named restore point를 만들고 WAL 전환을 강제하지 않은 상태에서 대상 WAL의 archive 성공을 확인한 뒤 별도 Cluster를 해당 restore point로 복구한다.
- Restore point 직전 snapshot과 schema, Drizzle migration history, 대표 row count와 최소 read를 비교하고 target LSN 도달을 확인한다.
- Restore point 생성부터 대상 WAL archive 성공 관측까지와 rehearsal 시작부터 restore Ready까지를 측정해 `PROD-546`에 기록한다.

- [ ] 4.1 `PROD-545`의 production Cluster 준비를 확인하고 production Application을 동기화한다.
- [ ] 4.2 Immediate base backup, 연속 WAL archive와 S3 versioned object 성공 증거를 수집한다.
- [ ] 4.3 Write pause 중 불변 snapshot과 named restore point를 만들고 강제 WAL 전환 없이 대상 WAL archive 성공 후 `kosmo-prod-restore`에서 해당 지점으로 격리 PITR rehearsal을 실행한다.
- [ ] 4.4 WAL archive 지연, target LSN 도달, RTO와 schema, migration history, 대표 row count, 최소 read 검증 결과를 민감 데이터 없이 `PROD-546`에 기록한다.
- [ ] 4.5 검증 후 restore namespace를 제거하고 source backup과 production resource가 유지되는지 확인한다.
- [ ] 4.6 월 1회 rehearsal 책임을 운영 일정에 반영하고 모든 자식 완료 후 `PROD-546`과 OpenSpec archive gate를 닫는다.
