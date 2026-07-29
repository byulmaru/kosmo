## Why

현재 Kosmo의 CloudNativePG Cluster는 persistent volume만 사용하고 외부 backup, 연속 WAL archive와 실제 복구 검증 경계가 없다. 프로덕션 공개 전에 cluster/PVC 장애, 운영 실수와 파괴적 migration에서도 최근 데이터를 복구할 수 있는 독립 저장소와 검증 가능한 운영 절차가 필요하다.

## What Changes

- Terraform으로 서울 리전의 프로덕션 PostgreSQL 전용 S3 bucket과 최소 권한 EKS Pod Identity role을 관리한다.
- CloudNativePG 1.30.0에 공식 Barman Cloud CNPG-I plugin을 설치하고 production·restore ServiceAccount에 단기 AWS 자격 증명을 연결한다.
- production Cluster가 연속 WAL archive와 매일 03:00 KST base backup을 수행하고 7일 recovery window를 유지하게 한다.
- 별도 restore namespace에서 PITR 복구를 반복 검증하는 runbook과 최초 출시 전·월 1회 검증 책임을 정의한다.
- backup·WAL 실패의 자동 Prometheus/Slack 알림은 `PROD-552`로 분리하고 이 변경은 수동 상태·로그 확인만 제공한다.

## Authority / Provenance

- Canonical: 없음. 제품 도메인 행동을 변경하지 않는 배포·운영 계약이다.
- Linear Contract: `PROD-546`
- Linear Implementations: `PROD-549`, `PROD-550`, `PROD-551`

## Capabilities

### New Capabilities

- `production-postgres-backup`: 프로덕션 PostgreSQL의 S3 base backup, 연속 WAL archive, PITR 보존과 별도 cluster 복구 검증 계약

### Modified Capabilities

- 없음.

## Impact

- `apps/terraform`: S3, lifecycle, bucket policy, workload IAM role, CI bootstrap 권한과 output
- `apps/helm`: production 전용 ServiceAccount, Barman ObjectStore, Cluster plugin과 ScheduledBackup
- `docs/operations`: backup 상태 확인, on-demand backup, PITR restore와 rehearsal runbook
- `byulmaru/kubernetes`: Barman Cloud plugin과 두 EKS Pod Identity association
- AWS S3/IAM/EKS, Argo CD, CloudNativePG와 Barman Cloud CNPG-I plugin
