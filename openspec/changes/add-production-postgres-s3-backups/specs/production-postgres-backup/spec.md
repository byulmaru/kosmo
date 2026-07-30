## ADDED Requirements

### Requirement: 독립된 프로덕션 backup 저장소

**Authority / Provenance:** `PROD-546`. 시스템은 프로덕션 PostgreSQL의 base backup과 WAL archive를 Kubernetes cluster와 독립된 `ap-northeast-2` 전용 S3 bucket의 prod 전용 prefix에 저장해야 한다. 이를 위해 시스템은 해당 저장 경계와 보안 설정을 반드시 유지해야 한다(MUST). Bucket 객체는 S3가 기본 제공하는 SSE-S3 암호화를 사용해야 한다. Bucket은 public access 전면 차단, TLS 전송 강제, versioning과 lifecycle을 사용해야 하며 Terraform의 일반 destroy나 빈 bucket이 아닌 삭제로 제거되어서는 안 된다. Terraform은 별도 default encryption resource를 관리하지 않는다.

#### Scenario: Terraform으로 backup 저장소 생성

- **WHEN** 승인된 Kosmo Terraform plan을 적용한다
- **THEN** 전용 S3 bucket, public access block, TLS-only policy, versioning, lifecycle과 삭제 보호가 선언형으로 생성되고 새 객체는 S3의 기본 SSE-S3 암호화를 사용한다

#### Scenario: 허용하지 않은 저장소 범위

- **WHEN** production PostgreSQL backup workload가 prod prefix 밖의 객체 또는 다른 bucket에 접근한다
- **THEN** AWS IAM이 요청을 거부한다

### Requirement: 장기 credential 없는 workload identity

**Authority / Provenance:** `PROD-546`. 시스템은 production backup과 별도 restore workload가 EKS Pod Identity로 같은 최소 권한 IAM role의 단기 자격 증명을 받게 해야 한다(MUST). 시스템은 AWS access key, secret key 또는 session token을 repository, Kubernetes Secret이나 workflow 입력으로 저장해서는 안 된다.

Production backup ServiceAccount는 같은 namespace의 `kosmo-postgres-backup` ObjectStore 하나를 읽을 수 있어야 하며(MUST), 다른 ObjectStore나 write verb 권한을 받아서는 안 된다(MUST NOT).

#### Scenario: Production backup Pod의 S3 접근

- **WHEN** `kosmo-prod`의 PostgreSQL Pod가 Barman Cloud sidecar에서 기본 AWS credential chain으로 S3에 접근한다
- **THEN** `kosmo-postgres-backup` ServiceAccount와 연결된 Pod Identity role의 단기 자격 증명으로만 prod prefix를 읽고 쓴다

#### Scenario: Restore Pod의 S3 접근

- **WHEN** `kosmo-prod-restore`의 복구 Pod가 source backup을 읽는다
- **THEN** 같은 이름의 restore ServiceAccount에 연결된 Pod Identity role로 source prefix를 읽고 static credential을 사용하지 않는다

#### Scenario: Production plugin의 ObjectStore 조회

- **WHEN** production PostgreSQL Pod의 Barman plugin이 backup 설정을 해석한다
- **THEN** `kosmo-postgres-backup` ServiceAccount는 같은 namespace의 동명 ObjectStore에 대한 `get`만 허용받고 WAL archive와 base backup을 시작할 수 있다

### Requirement: 연속 WAL archive와 매일 base backup

**Authority / Provenance:** `PROD-546`. 프로덕션 CloudNativePG Cluster는 공식 Barman Cloud CNPG-I plugin을 WAL archiver로 사용하고 WAL을 연속 보관해야 한다(MUST). 시스템은 최초 활성화 시 base backup을 즉시 시작하고 이후 매일 03:00 KST에 plugin 방식의 base backup을 실행하며 7일 recovery window 안의 임의 시점 복구에 필요한 base backup과 WAL을 유지해야 한다.

#### Scenario: Backup 기능 최초 활성화

- **WHEN** backup이 활성화된 production Cluster와 ScheduledBackup을 처음 동기화한다
- **THEN** 다음 정기 시각을 기다리지 않고 plugin 방식의 base backup 하나를 생성한다

#### Scenario: 일일 정기 backup

- **WHEN** 매일 03:00 KST schedule이 도래한다
- **THEN** CloudNativePG가 production Cluster의 plugin 방식 base backup을 시작하고 완료 상태를 Backup resource에 기록한다

#### Scenario: WAL archive 최대 지연 목표

- **WHEN** production database에 WAL이 생성되고 segment가 가득 차지 않는다
- **THEN** 시스템은 4분 archive timeout으로 WAL segment 전환을 시도하고 S3 업로드 시간을 포함한 RPO 5분 이내 목표를 유지한다

#### Scenario: Dev 환경 렌더

- **WHEN** 같은 Helm chart를 dev 값으로 렌더한다
- **THEN** Barman ObjectStore, backup ServiceAccount, plugin 설정과 ScheduledBackup이 생성되지 않는다

### Requirement: Backup 상태와 실패 원인의 수동 확인

**Authority / Provenance:** `PROD-546`. 운영자는 CloudNativePG Cluster, ScheduledBackup, Backup, Barman plugin 상태와 로그에서 마지막 성공 backup, WAL archive 상태와 실패 원인을 확인할 수 있어야 한다(MUST). 이 변경은 Prometheus 또는 Slack 자동 알림을 제공해서는 안 된다.

#### Scenario: 마지막 성공 backup 확인

- **WHEN** 운영자가 runbook의 상태 확인 절차를 실행한다
- **THEN** 최신 Backup의 phase, 시작·완료 시각과 Cluster의 WAL archive 상태를 secret이나 backup content 노출 없이 확인한다

#### Scenario: S3 접근 실패 진단

- **WHEN** backup workload가 S3 AccessDenied 또는 object-store 연결 실패를 보고한다
- **THEN** 운영자는 Pod Identity association, ObjectStore 상태와 plugin/instance 로그를 순서대로 확인해 실패 경계를 식별할 수 있다

### Requirement: 격리된 PITR 복구와 반복 검증

**Authority / Provenance:** `PROD-546`. 운영자는 production Cluster를 변경하거나 덮어쓰지 않고 별도 `kosmo-prod-restore` namespace에 source object store를 읽는 새 Cluster를 복구할 수 있어야 한다(MUST). Restore Cluster는 source destination에 WAL이나 새 backup을 쓰지 않아야 하며 최초 production 출시 전과 이후 월 1회 schema, Drizzle migration history, 대표 데이터와 최소 application read를 검증해야 한다.

#### Scenario: 최신 복구 가능 시점으로 PITR

- **WHEN** 운영자가 write pause 중 named restore point와 불변 snapshot을 기록하고 WAL 전환을 강제하지 않은 상태에서 대상 WAL의 archive 성공을 확인한 뒤 restore rehearsal을 시작한다
- **THEN** 별도 namespace의 새 Cluster가 base backup과 WAL을 사용해 named restore point까지 복구되고 production Cluster는 변경되지 않으며 restore point 직전의 불변 snapshot으로 데이터 정확성을 검증한다

#### Scenario: RPO와 RTO 측정

- **WHEN** restore Cluster가 Ready가 되고 검증 query가 성공한다
- **THEN** restore point 생성부터 자연 WAL archive 성공 관측까지의 지연은 5분 이내이고 restore Cluster는 해당 LSN에 도달하며 rehearsal 시작부터 Ready까지는 60분 이내이고 측정값을 민감 정보 없이 Linear에 기록한다

#### Scenario: 복구 데이터 검증

- **WHEN** 복구된 Cluster에 연결한다
- **THEN** schema, Drizzle migration history, 대표 row count와 최소 read 결과가 named restore point 직전에 기록한 불변 기준과 일치한다

#### Scenario: Rehearsal 정리

- **WHEN** 검증 증거를 기록하고 복구 결과를 승인한다
- **THEN** restore namespace와 임시 PVC를 제거하되 source S3 backup과 production namespace는 유지한다
