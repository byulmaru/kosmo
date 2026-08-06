## 1. PROD-698 범용 PVC 용량 대응 runbook

**Authority / Provenance**

- 적용되는 `docs/domain`·`docs/design` 문서 없음
- `docs/operations/postgres-backup.md`
- Linear `PROD-698`

**Deliverable**

운영자가 namespace나 애플리케이션 종류와 무관하게 `KubePersistentVolumeFillingUp` 알림에서 시작해 PVC 용량과 추세, 상위 workload와 owner를 진단하고, 데이터 안전 경계를 지키며 지원되는 확장과 복구 검증까지 수행할 수 있는 `docs/operations/persistent-volume-capacity.md`를 제공한다.

**Guardrails**

- 기존 warning/critical 의미와 `ReadOnlyMany`·`excluded_from_alerts=true` 제외 조건을 변경하지 않는다.
- Mutation 전에 read-only 진단, service owner, 데이터 성격, backup·가용성 영향을 확인한다.
- 범용 문서에서 애플리케이션별 보존 정책을 결정하거나 데이터 삭제, PVC/PV 삭제·재생성, reclaim policy 변경, purge, 자동 증설을 안내하지 않는다.
- Expansion은 live StorageClass·CSI 지원과 workload 선언 owner를 확인하고 기존 PVC request를 증가시키며, PV를 직접 편집하거나 PVC를 축소하지 않는다.
- Restart는 condition과 workload 특성이 요구할 때만 수행하고, routing·Slack notification test는 `byulmaru/kubernetes` 운영 문서에 남긴다. Kosmo runbook에는 `runbook_url`, Slack 링크나 custom title/text 계약을 추가하지 않는다.
- Credential, Secret 값, database row·object 내용과 실제 사용자 데이터를 command output, 문서 예시나 협업 시스템에 노출하지 않는다.

**Verification**

- PostgreSQL이 아닌 PVC 진입, owner 미확인, 승인된 정리 경로, expansion 지원·미지원, online resize·restart 필요, resize 실패와 비민감 증거 scenario를 문서에서 재현한다.
- 모든 command가 명시적 placeholder를 사용하고 destructive operation이나 Secret/data 출력 경로가 없는지 검토한다.
- 내부 workload runbook과 Kubernetes 전달 경로 문서 링크의 목적과 소유권이 중복되지 않는지 확인한다.

- [x] 1.1 Alert 필드, 적용 대상과 Kosmo/Kubernetes 책임 경계를 설명하는 runbook 진입부를 작성한다.
- [x] 1.2 PVC request/status, 사용량·여유 공간·증가 추세, PV·StorageClass, mount Pod·상위 workload owner와 event를 확인하는 read-only 진단 절차를 작성한다.
- [x] 1.3 Service owner와 workload별 retention·backup·export·rebalance 절차로 연결하고, 확인되지 않은 데이터 정리와 파괴 작업을 중단하는 판단 경계를 작성한다.
- [x] 1.4 Live expansion 지원, workload 선언 owner와 목표 용량을 확인한 뒤 PVC request를 늘리고 필요한 경우에만 통제된 restart를 수행하는 절차를 작성한다.
- [x] 1.5 PVC/filesystem/workload 복구, 새 여유 공간·추세와 alert resolved를 확인하고 비민감 증거만 남기는 완료 절차를 작성한다.

## 2. PROD-698 실행 가능성 검증과 교차 저장소 handoff

**Authority / Provenance**

- `docs/operations/postgres-backup.md`
- Linear `PROD-698`
- 관련 운영 알림 계약 `PROD-530`

**Deliverable**

Runbook의 read-only 진단 명령과 내부·외부 참고 링크·안전 gate가 현재 cluster에서 실행 가능하고 리뷰 가능한 증거를 가진다. Kubernetes routing slice는 Kosmo 문서 URL을 소비하지 않고 기존 Alertmanager receiver와 Slack 메시지 형식을 유지한 채 allowlist와 firing/resolved 검증을 소유한다.

**Guardrails**

- Live 검증에서는 read-only 진단만 실행하고 incident 없는 PVC에 size·data·workload mutation을 만들지 않는다.
- 실제 identifier와 raw output을 commit, CI log, Linear 또는 Slack에 복사하지 않고 성공 여부와 비민감 측정 범위만 기록한다.
- 두 PR 사이에 runbook 링크나 병합 순서 의존성을 만들지 않는다.
- OpenSpec archive owner는 `PROD-698` assignee이며, Kosmo runbook 구현·검증·delta spec 동기화와 strict validation이 모두 끝난 뒤에만 이 change를 archive한다.
- Cross-repository integration과 Linear 완료 owner는 `PROD-698` assignee이며, 두 PR과 firing/resolved·negative routing 증거가 모두 확인되기 전에는 이슈를 완료하지 않는다.

**Verification**

- `pnpm lint:prettier`
- 신규 문서의 local Markdown link와 Prometheus Operator·Kubernetes 공식 문서 URL 확인
- 서로 다른 owner 유형의 PVC 두 개 이상(그중 하나는 비-PostgreSQL)에서 진단·owner 추적 command의 read-only smoke와 redacted 결과
- `openspec validate add-persistent-volume-capacity-runbook --strict`
- Kosmo runbook과 Kubernetes allowlist의 독립 범위, 기존 메시지 형식 유지와 남은 통합 검증을 `PROD-698` handoff에서 확인

- [x] 2.1 Markdown formatting, local/external link, placeholder, destructive command와 민감정보 노출 경계를 정적 검토한다.
- [x] 2.2 서로 다른 owner 유형의 PVC 두 개 이상에서 read-only 진단·owner 추적 명령을 실행하고 비민감 성공·실패 증거만 기록한다.
- [x] 2.3 모든 requirement scenario를 runbook section에 대조하고 expansion·restart·실패·escalation 분기가 누락되지 않았는지 검토한다.
- [x] 2.4 OpenSpec strict validation을 통과하고 runbook 구현과 delta spec의 정합성을 확인한다.
- [ ] 2.5 Kosmo runbook과 Kubernetes allowlist의 독립 범위, 기존 receiver·메시지 형식 유지, 통합·archive owner와 남은 검증을 `PROD-698`에 handoff한다.
