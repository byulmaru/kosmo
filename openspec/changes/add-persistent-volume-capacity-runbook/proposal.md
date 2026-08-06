## Why

`PROD-698`은 모든 대상 PVC의 용량 부족 알림을 기존 `#monitoring` 경로로 전달하지만, Kosmo 저장소에는 알림을 받은 운영자가 사용량 원인과 소유 workload를 식별하고 데이터 손실 없이 용량을 확보할 범용 대응 절차가 없다. PostgreSQL, Vault, Prometheus와 미래의 PVC 기반 workload에 같은 안전 경계를 적용할 수 있는 내부 runbook이 필요하다.

## What Changes

- `docs/operations/persistent-volume-capacity.md`에 `KubePersistentVolumeFillingUp` 알림에서 시작하는 범용 PVC 용량 대응 runbook을 추가한다.
- namespace와 PVC에서 사용량·증가 추세, 연결된 PV·Pod·상위 workload와 service owner를 확인하는 진단 순서를 정의한다.
- 애플리케이션별 데이터 정리·보존 변경은 owner가 판단하도록 경계를 두고, StorageClass와 CSI의 확장 지원을 확인한 뒤 PVC 요청 용량만 늘리는 안전한 확장 절차를 정의한다.
- 확장 상태, filesystem 반영, workload readiness와 용량 여유를 확인하고 alert가 resolved되는지 추적하는 사후 검증을 정의한다.
- 기존 PostgreSQL backup runbook과 workload별 추가 runbook을 연결하되, 자동 증설·애플리케이션별 보존 정책 결정·PVC/PV 삭제나 migration 절차·Alertmanager routing은 현재 Kosmo slice에서 제외한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain`·`docs/design` 문서 없음. 운영 절차 권위는 `docs/operations/`이며 기존 데이터 보호 경계는 `docs/operations/postgres-backup.md`를 따른다.
- Linear Contract: `PROD-698`
- Linear Implementations: `PROD-698`의 `byulmaru/kosmo` runbook slice. 별도 Sub Issue 없음.

## Capabilities

### New Capabilities

- `persistent-volume-capacity-response`: PVC 용량 부족 알림을 안전한 진단, owner 판단, 지원되는 volume 확장과 완료 검증으로 연결하는 내부 운영 절차

### Modified Capabilities

없음.

## Impact

- `docs/operations/persistent-volume-capacity.md`: 모든 쓰기 가능한 대상 PVC에 공통으로 적용할 신규 runbook
- `docs/operations/postgres-backup.md`: 변경하지 않고 PostgreSQL 데이터 보호·복구 절차의 참조 대상으로 사용
- `byulmaru/kubernetes`: 별도 `PROD-698` PR이 Alertmanager allowlist, Slack runbook 링크와 firing/resolved 통합 검증을 소유하며, 깨진 링크를 피하기 위해 Kosmo runbook PR이 먼저 병합되어야 함
- 애플리케이션 코드, API, database schema, package dependency 변경 없음
