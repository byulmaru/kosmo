## Context

이 기록은 `PROD-698`의 전체 PVC alert 결과 중 `byulmaru/kosmo`가 소유하는 범용 대응 runbook slice를 반영한다. 대상 PVC와 alert 의미는 기존 kube-prometheus 규칙을 유지하고, Kosmo는 알림 이후의 진단·owner 판단·안전한 완화·확장·검증을, `byulmaru/kubernetes`는 Alertmanager·Slack 전달과 통합 notification test를 소유한다.

## Decision Records

### 범용 PVC 대응 runbook을 독립 경로로 둔다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-698`
- Status: Active
- Context / Problem: 최초 사례는 PostgreSQL이지만 같은 용량 부족 위험이 Vault, Prometheus와 미래의 모든 PVC 기반 workload에 존재하므로 특정 workload에 종속되지 않은 공통 대응 절차가 필요하다.
- Decision Outcome: 모든 대상 PVC에 공통인 runbook을 `docs/operations/persistent-volume-capacity.md`에 추가하고, workload별 차이는 이 문서에서 전용 runbook과 owner 판단으로 연결한다.
- Alternatives Considered: `docs/operations/postgres-backup.md`에 PostgreSQL 전용 절차만 추가하는 방식은 다른 workload의 대응 공백을 남긴다. Workload마다 별도 PVC runbook을 먼저 만드는 방식은 현재 존재하지 않는 정책을 중복 작성한다.
- Consequences: 운영자는 하나의 범용 PVC 대응 절차를 사용할 수 있지만 Slack 메시지에서 이 문서로 연결되는 계약은 생기지 않는다. 범용 문서는 애플리케이션별 데이터·복구 결정을 소유하지 않는다.
- Confirmation / Follow-up: PostgreSQL이 아닌 PVC를 포함한 진입·진단 scenario, 신규 문서 경로와 workload별 참고 링크를 검증한다.

### Kosmo 대응과 Kubernetes 알림 전달의 책임을 분리한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-698`, 관련 운영 알림 계약 `PROD-530`
- Status: Active
- Context / Problem: 하나의 `PROD-698` 결과가 두 저장소에 걸치지만 routing과 service 대응을 양쪽 문서에 모두 작성하면 절차가 drift한다. 현재 Alertmanager에는 runbook 링크나 custom Slack template 계약이 없으므로 이 이슈에서 새 메시지 계약까지 도입하면 allowlist 추가보다 범위가 커진다.
- Decision Outcome: Kosmo는 PVC 진단·owner 확인·완화·확장·사후 검증만 문서화한다. `byulmaru/kubernetes`는 기존 receiver, `#monitoring`, `sendResolved=true`와 Slack 메시지 형식을 유지하면서 allowlist·notification test·전달 실패 복구를 소유한다. `runbook_url`, Slack runbook 링크와 custom title/text는 추가하지 않으며 두 PR에 병합 순서 제약을 두지 않는다.
- Alternatives Considered: 두 저장소에 end-to-end 절차를 복제하는 방식은 소유권과 업데이트 시점을 불명확하게 한다. Slack에 Kosmo runbook 링크를 추가하는 방식은 기존에 없는 공통 메시지 계약을 이 이슈에서 부분적으로 도입하므로 제외한다.
- Consequences: 두 PR은 독립적으로 리뷰·병합할 수 있지만 어느 한 PR만으로 `PROD-698`을 완료할 수 없다. 전체 이슈 담당자가 runbook 검증과 기존 형식의 firing/resolved·negative routing 증거를 모두 확인해야 한다.
- Confirmation / Follow-up: Kosmo 문서에 routing·Slack 링크 계약을 복제하지 않는지, Kubernetes diff가 allowlist와 기존 형식의 notification test로 제한되는지 확인한다.

### 범용 절차는 데이터 정리를 결정하지 않는다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-backup.md`, Linear `PROD-698`
- Status: Active
- Context / Problem: 데이터 삭제나 retention 변경은 빠르게 공간을 확보할 수 있지만 workload별 보존·backup·복구 정책을 모르는 범용 문서가 안전하게 결정할 수 없고 잘못된 일반화는 복구 불가능한 데이터 손실을 만든다.
- Decision Outcome: Runbook은 mutation 전에 read-only 진단으로 workload와 service owner를 식별한다. 데이터 정리·retention·export·rebalance는 승인된 workload별 정책과 owner에게 위임하고, 범용 문서에는 데이터 삭제, PVC/PV 삭제·재생성, reclaim policy 변경 또는 purge 명령을 두지 않는다.
- Alternatives Considered: 공통 cleanup 명령을 제공하는 방식은 데이터 성격과 backup 상태를 추측한다. 공간이 부족하면 즉시 PVC를 삭제·재생성하는 방식은 현재 Linear 제외 범위이고 데이터 손실·downtime 위험이 크다.
- Consequences: Owner나 backup을 확인하지 못하면 대응이 escalation에서 멈출 수 있지만, 범용 runbook이 승인되지 않은 파괴 작업을 유도하지 않는다.
- Confirmation / Follow-up: 구현 리뷰에서 모든 mutation 전에 owner·backup·가용성 gate가 있는지, command 예시에 destructive operation이 없는지 확인한다.

### Expansion은 live 지원과 workload 선언 소유권을 확인한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-698`; Kubernetes [`Persistent Volumes — Expanding Persistent Volumes Claims`](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#expanding-persistent-volumes-claims), [`Storage Classes — Volume expansion`](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- Status: Active
- Context / Problem: StorageClass 이름만으로 expansion 지원을 알 수 없고, operator나 Helm/GitOps가 size를 소유하는 workload의 PVC를 직접 편집하면 선언과 live 상태가 어긋날 수 있다. Kubernetes는 PVC request 증가를 통해 기존 PV를 확장하며 PV 직접 편집과 shrink를 지원 경로로 보지 않는다.
- Decision Outcome: Incident마다 live StorageClass의 `allowVolumeExpansion`, provisioner·CSI 지원, PVC request/status와 condition/event를 확인한다. Workload가 size를 선언하는 상위 resource가 있으면 그 source를 통해 기존 PVC request를 늘리고, 그렇지 않을 때만 PVC request를 직접 늘린다. PV capacity는 직접 편집하지 않고 현재 capacity 아래로 축소하지 않으며, restart는 condition과 workload 특성이 요구할 때만 수행한다.
- Alternatives Considered: 모든 workload에 `kubectl edit pvc`를 고정하는 방식은 선언 owner를 우회할 수 있다. Standard runbook처럼 mount Pod를 항상 삭제하는 방식은 online expansion에서도 불필요한 중단을 만든다. PV capacity를 먼저 바꾸는 방식은 Kubernetes 자동 resize를 방해한다.
- Consequences: Runbook에 owner resource와 live capability를 확인하는 조건 분기가 추가된다. 지원 불가·불명인 경우 별도 migration 계획이 필요하며 현재 change는 그 실행 절차를 제공하지 않는다.
- Confirmation / Follow-up: 서로 다른 owner 유형의 PVC에서 read-only 진단 명령을 smoke하고, online resize·restart 필요·지원 불가 scenario를 문서 검토한다.

### 완료는 workload 복구와 alert resolved까지 확인한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-698`, 관련 운영 알림 계약 `PROD-530`
- Status: Active
- Context / Problem: PVC request만 변경됐다고 filesystem과 workload가 복구되거나 용량 위험과 alert가 해소됐다고 볼 수 없다. 반대로 실제 data·Secret 원문을 증거에 복사하면 운영 보안 경계를 위반한다.
- Decision Outcome: PVC request/status·resize condition/event, mount filesystem, Pod·상위 workload readiness와 workload별 health, 새 여유 공간·증가 추세를 확인하고 `KubePersistentVolumeFillingUp` resolved를 추적한다. 이슈에는 alert context, 비민감 측정값, 선택한 조치·승인자와 검증 결과만 기록한다.
- Alternatives Considered: PVC spec 변경 직후 완료하는 방식은 비동기 volume/filesystem resize와 workload 장애를 놓친다. Raw command output 전체를 첨부하는 방식은 credential, Secret 값이나 사용자 데이터 노출 위험이 있다.
- Consequences: Kosmo PR은 실행 가능한 response 절차를 검증하지만 기존 메시지 형식의 resolved Slack delivery 증거는 Kubernetes PR과 전체 `PROD-698` 담당자의 통합 검증을 기다린다.
- Confirmation / Follow-up: Resize 실패 상태는 완료로 기록하지 않는지, evidence 예시가 namespace·PVC·severity와 비민감 상태만 허용하는지 검토한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
