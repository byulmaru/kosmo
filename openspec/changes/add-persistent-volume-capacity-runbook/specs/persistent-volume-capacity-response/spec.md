## ADDED Requirements

### Requirement: 모든 대상 PVC에 공통인 알림 진입점

**Authority / Provenance:** 적용되는 `docs/domain`·`docs/design` 문서 없음; Linear `PROD-698`. 내부 PVC 용량 대응 runbook은 namespace나 애플리케이션 종류와 무관하게 기존 `KubePersistentVolumeFillingUp` 규칙의 모든 대상 PVC에 MUST 같은 기본 절차를 제공한다. Runbook은 알림의 namespace, PVC, severity, summary와 description을 MUST 대응 시작 정보로 사용하며, 기존 규칙의 warning/critical 의미와 `ReadOnlyMany`·`excluded_from_alerts=true` 제외 조건을 MUST NOT 재정의한다.

#### Scenario: 비-PostgreSQL PVC 알림에서 진입

- **WHEN** 운영자가 PostgreSQL이 아닌 쓰기 가능한 PVC의 `KubePersistentVolumeFillingUp` 알림에서 namespace, PVC, severity, summary와 description을 확인한다
- **THEN** runbook은 특정 애플리케이션을 전제하지 않는 동일한 진단 절차로 안내한다

#### Scenario: 기존 alert 대상 경계 유지

- **WHEN** PVC가 `ReadOnlyMany`이거나 `excluded_from_alerts=true`로 기존 규칙에서 제외되어 있다
- **THEN** runbook은 해당 PVC를 현재 알림 대상에 강제로 포함하거나 기존 규칙의 제외 조건을 변경하도록 안내하지 않는다

### Requirement: 읽기 전용 진단과 workload owner 식별

**Authority / Provenance:** 적용되는 `docs/domain`·`docs/design` 문서 없음; Linear `PROD-698`. Runbook은 변경 작업보다 먼저 PVC의 요청·현재 용량과 상태, 최근 사용량·여유 공간·증가 추세, 연결된 PV와 StorageClass, mount한 Pod, 상위 workload owner와 Kubernetes event를 MUST 읽기 전용으로 확인한다. Pod의 owner reference를 실제 변경을 소유한 controller 또는 operator resource까지 MUST 추적하고 담당 service owner를 식별하며, owner와 데이터 성격을 확인하지 못한 상태에서는 데이터 정리·보존 변경·volume 변경을 MUST NOT 시작한다.

#### Scenario: owner가 식별되는 정상 진단

- **WHEN** namespace와 PVC에서 mount Pod와 상위 workload resource를 추적할 수 있다
- **THEN** 운영자는 현재 용량·사용량·증가 추세·PVC/PV 상태와 event를 함께 기록하고 변경 책임을 가진 service owner를 확인한다

#### Scenario: owner를 식별할 수 없음

- **WHEN** PVC를 mount한 Pod, 상위 workload 또는 담당 service owner를 확정할 수 없다
- **THEN** 운영자는 mutation을 중단하고 확인하지 못한 관계와 현재 용량 위험을 운영 담당자에게 escalation한다

### Requirement: 애플리케이션별 데이터 정리의 안전 경계

**Authority / Provenance:** `docs/operations/postgres-backup.md`, Linear `PROD-698`. Runbook은 보존 기간 변경, 오래된 데이터 삭제, export와 rebalance 같은 애플리케이션 수준 완화를 해당 workload의 승인된 정책·전용 runbook과 service owner 판단으로 MUST 분리한다. 범용 절차는 데이터 내용 삭제, PVC/PV 삭제·재생성, reclaim policy 변경 또는 volume purge 명령을 MUST NOT 제공하며, 승인된 정리 경로가 없고 데이터가 필요하면 지원되는 volume 확장 또는 별도 migration 계획으로 MUST escalation한다.

#### Scenario: 승인된 정리 절차가 있음

- **WHEN** service owner가 workload 전용 runbook과 보존 정책에 따라 제거 가능한 데이터를 확인한다
- **THEN** 운영자는 해당 전용 절차와 백업·복구 경계를 따라 정리하고 범용 runbook에는 데이터별 삭제 방식을 새로 결정하지 않는다

#### Scenario: 정리 가능 여부가 불명확함

- **WHEN** 데이터 보존 정책, 백업 상태 또는 삭제 승인 중 하나라도 확인되지 않는다
- **THEN** 운영자는 데이터를 삭제하지 않고 volume 확장 가능성을 확인하거나 migration을 별도 계획하도록 escalation한다

### Requirement: 지원 여부를 확인한 PVC 확장

**Authority / Provenance:** 적용되는 `docs/domain`·`docs/design` 문서 없음; Linear `PROD-698`. Runbook은 PVC 확장 전에 해당 StorageClass의 `allowVolumeExpansion`, provisioner·CSI driver의 확장 지원, 현재 PVC 요청·상태 용량, workload가 소유한 선언 경로, backup·가용성 영향과 목표 용량을 MUST 확인한다. 지원되는 경우 기존 PVC의 요청 용량을 현재 용량보다 큰 값으로 MUST 변경하며, PV 용량을 직접 편집하거나 PVC를 축소하는 작업은 MUST NOT 안내한다. Filesystem 반영에 rollout 또는 restart가 필요한지는 PVC condition과 workload 특성으로 MUST 판단하고, 불필요한 restart를 고정 절차로 MUST NOT 요구한다.

#### Scenario: 온라인 확장을 지원함

- **WHEN** StorageClass와 CSI driver가 expansion을 지원하고 in-use filesystem이 온라인 확장을 완료한다
- **THEN** 운영자는 기존 PVC의 요청 용량만 늘리고 workload를 불필요하게 restart하지 않는다

#### Scenario: filesystem 반영에 restart가 필요함

- **WHEN** volume 확장 뒤 PVC condition 또는 workload 상태가 filesystem resize를 완료하기 위한 rollout이나 restart를 요구한다
- **THEN** 운영자는 service owner와 가용성 영향을 확인한 뒤 workload 소유 방식에 맞는 통제된 restart를 수행한다

#### Scenario: 확장을 지원하지 않음

- **WHEN** StorageClass 또는 CSI driver가 확장을 지원하지 않거나 지원 여부를 확인할 수 없다
- **THEN** 운영자는 PVC나 PV를 임의로 교체하지 않고 snapshot·backup·migration이 포함된 workload별 후속 계획으로 escalation한다

### Requirement: 확장 완료와 alert 해소 검증

**Authority / Provenance:** 적용되는 `docs/domain`·`docs/design` 문서 없음; Linear `PROD-698`. Runbook은 변경 뒤 PVC의 요청·상태 용량, resize condition과 event, mount된 filesystem 용량, Pod와 상위 workload readiness, workload별 health, 새 여유 공간과 증가 추세를 MUST 검증한다. 현재 용량 부족 상태가 해소된 뒤 `KubePersistentVolumeFillingUp`이 resolved되는지 MUST 확인하며, resize가 실패하거나 반복 재시도되는 동안에는 완료로 MUST NOT 기록한다.

#### Scenario: 용량 확보와 정상 복구

- **WHEN** PVC와 filesystem 확장이 완료되고 workload readiness와 workload별 health가 정상이다
- **THEN** 운영자는 확보된 여유 공간과 예상 증가 추세를 확인하고 alert의 resolved 상태까지 완료 증거로 기록한다

#### Scenario: resize가 완료되지 않음

- **WHEN** PVC condition이나 event에 resize 실패·대기 상태가 남거나 workload가 Ready로 복구되지 않는다
- **THEN** 운영자는 대응을 완료 처리하지 않고 현재 상태와 가용성 영향을 기록해 service owner와 storage 운영 담당자에게 escalation한다

### Requirement: 저장소 책임 분리와 비민감 대응 증거

**Authority / Provenance:** `docs/operations/postgres-backup.md`, Linear `PROD-698`, 관련 운영 알림 계약 `PROD-530`. Kosmo runbook은 PVC 사용량 진단, owner 확인, 안전한 완화·확장과 후속 검증만 MUST 소유하며, Alertmanager receiver·allowlist·Slack notification test와 전달 실패 복구 절차를 MUST NOT 복제한다. PostgreSQL처럼 기존 workload별 runbook이 있으면 MUST 연결하고, 대응 증거에는 alert context, 비민감 측정값, 선택한 조치, 승인자와 검증 결과만 MUST 남긴다. Credential·Secret 값·database row·object 내용 또는 기타 실제 사용자 데이터는 command output, Linear, CI log나 Slack payload에 MUST NOT 복사한다.

#### Scenario: 전달 경로 자체가 실패함

- **WHEN** PVC 대응 중 Alertmanager routing, Slack delivery 또는 resolved notification 전달 실패를 진단해야 한다
- **THEN** 운영자는 `byulmaru/kubernetes/docs/operations.md`의 전달 경로 절차로 이동하고 Kosmo runbook에 중복된 routing 절차를 추가하지 않는다

#### Scenario: 대응 증거를 남김

- **WHEN** 운영자가 진단, owner 승인, 용량 변경과 복구 결과를 이슈에 기록한다
- **THEN** 기록에는 namespace·PVC·severity와 비민감 상태·측정값만 포함되고 credential, Secret 값과 실제 사용자 데이터는 포함되지 않는다
