## Context

`PROD-698`의 Kosmo slice는 PVC 진단·owner 판단·안전한 확장·복구 검증을 소유하고,
`byulmaru/kubernetes` slice는 기존 Alertmanager와 Slack 전달 계약을 소유한다. 이
기록은 두 경계와 선언 source별 확장 선택만 남긴다.

## Decision Records

### 저장소 책임을 분리한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-698`, 관련 운영 알림 계약 `PROD-530`
- Status: Active
- Decision Outcome: Kosmo runbook은 PVC 사용량·owner 진단, 데이터 보호 gate, workload별
  완화 연결, 확장과 복구 검증만 제공한다. `byulmaru/kubernetes`는 기존 receiver,
  `#monitoring`, `sendResolved=true`, Slack 형식과 allowlist·notification test·전달
  실패 복구를 소유한다. `runbook_url`, Slack 링크·custom title/text와 PR 병합 순서
  의존성은 추가하지 않는다.
- Consequences / Confirmation: 두 PR은 독립적으로 revert 가능하지만 `PROD-698`의
  통합 완료와 archive는 전체 담당자가 양쪽 증거를 확인한 뒤 결정한다.

### Expansion은 선언 owner와 live 지원에 맞춘다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-698`; Kubernetes [Persistent Volumes —
  Expanding Persistent Volume Claims](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#expanding-persistent-volumes-claims)
  및 [Storage Classes — Volume expansion](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- Status: Active
- Decision Outcome: Incident마다 live StorageClass의 `allowVolumeExpansion`,
  provisioner·CSI 지원, 목표 용량과 owner·backup 승인 gate를 확인한다. Operator가
  지원하는 resize field/reconcile은 그 경로를 사용하고, standalone PVC declaration은
  gate 뒤 declaration을 늘려 reconcile한다. 기존 StatefulSet object의
  `spec.volumeClaimTemplates` 변경은 API가 immutable field로 거부하므로 generic
  in-place reconcile하지 않는다. 기존 bound PVC direct patch와 template·미래 replica
  정합화는 owner 승인 recreation/migration 계획으로 별도 처리하며 PV 직접 편집과
  shrink는 사용하지 않는다.
- Consequences / Confirmation: 지원 여부가 불명확하거나 operator 경로가 없으면
  migration으로 escalation한다. Resize condition·event와 filesystem/workload 복구를
  확인하고, 불필요한 restart를 고정하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
