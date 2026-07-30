## Context

`Docker Build`는 branch와 정식 `[0-9]+.[0-9]+.[0-9]+` tag에서 하나의 API·Web runtime image를 GHCR/ECR에 발행하고 build digest artifact를 남긴다. 그러나 현재 배포 자동화는 mutable `main` image를 사용하는 dev Application을 sync/restart할 뿐이며, Helm은 repository와 tag를 결합해 migration/API/Web image를 렌더하고 두 Rollout을 자동 승격한다.

PROD-563은 release identity, production 승인, migration 선행 차단, API·Web activation, 재실행과 application rollback만 소유한다. `kosmo-prod` Application과 runtime resource는 PROD-562, migration credential·단계·contract gate는 PROD-564, 실제 첫 release·public smoke·운영 통합 검증은 PROD-565가 각각 소유한다.

## Goals / Non-Goals

**Goals:**

- 검증된 immutable SemVer GitHub Release tag 하나로 그 Release가 고정한 digest image를 선택한다.
- production 승인 뒤 하나의 identity를 migration, API와 Web에 전달한다.
- migration과 두 preview가 준비되기 전 production traffic 활성화를 막는다.
- 같은 identity의 재실행과 이전 정상 identity의 application rollback을 같은 경로로 제공한다.
- manifest와 workflow의 성공·실패 경계를 정적으로 검증한다.

**Non-Goals:**

- `kosmo-prod` Application, namespace, domain, PostgreSQL, secret 또는 다른 runtime resource 생성
- migration phase/credential, backup/restore, rollback window와 destructive contract safety gate 구현
- DB rollback 또는 특정 schema migration 실행
- 실제 production 배포, public-origin smoke, Sentry 연결과 첫 release 운영 runbook 검증

## Implementation Guidance

### Current Constraints

- 현재 image build는 full digest reference를 7일 workflow artifact로만 기록한다. Repository immutable releases는 아직 비활성화돼 있고 발행된 Release도 없으며, Git tag와 GHCR container tag는 서로 다른 객체라 Git tag만 고정해도 container tag identity가 고정되지는 않는다.
- Helm의 `image:version` 조합은 digest reference를 직접 표현하지 못하고 migration/API/Web가 같은 formatter를 공유하지 않는다.
- dev Rollout의 `autoPromotionEnabled: true`를 그대로 production에 쓰면 API와 Web preview를 함께 검증하기 전에 한 workload가 active가 될 수 있다.
- Argo CD ApplicationSet이 생성한 Application parameter를 pipeline이 변경할 때 reconciliation이 값을 되돌리면 audit된 release identity와 실제 manifest가 어긋날 수 있다. PROD-562의 Application은 pipeline이 관리하는 release parameter seam을 보존해야 한다.
- PROD-564가 제공하는 production PreSync migration이 없으면 이 pipeline의 live activation gate를 완성할 수 없다. 이 change는 migration 정책을 대신 만들지 않는다.

### Recommended Approach

기본 경로는 repository immutable releases를 활성화하고 정식 SemVer image build가 성공한 뒤 draft GitHub Release에 `docker-image-ref.txt`를 첨부해 발행하는 방식이다. Asset에는 `ghcr.io/byulmaru/kosmo@sha256:...` full reference 하나만 기록한다. Release 발행 뒤 Git tag와 asset은 immutable해지고 Release attestation으로 검증할 수 있다. Build나 asset 준비가 실패하면 Release를 발행하지 않는다.

`main`의 수동 production workflow는 운영자에게 SemVer Release tag 하나만 받는다. `gh release verify`로 발행된 immutable Release인지 확인하고, `docker-image-ref.txt`를 내려받아 `gh release verify-asset`으로 attestation과 내용을 검증한 뒤 strict full digest reference를 해석한다. GHCR의 같은 SemVer container tag가 나중에 움직여도 deployment는 이를 조회하지 않고 immutable Release asset이 고정한 digest를 사용한다.

승인 job은 GitHub `production` Environment 뒤에 두고, 승인된 뒤에만 GitHub OIDC로 Argo CD token을 얻는다. Production Environment는 main ref만 허용하고 admin bypass를 막으며 required reviewer를 둔다. Workflow concurrency는 production 배포를 직렬화하고 진행 중인 배포를 취소하지 않는다.

Helm에는 dev의 repository/tag 렌더를 유지하면서 production에서 full digest reference를 만드는 공통 image rendering 경계를 둔다. Migration Job, API와 Web container가 모두 이 경계를 사용하고 release tag는 label/audit metadata로만 유지한다. PROD-562의 Application이 제공하는 release parameter seam은 pipeline 변경을 보존하며, sync 전에 rendered manifest의 세 image가 정확히 같은지 확인한다.

Argo CD sync는 PROD-564의 PreSync migration 성공을 먼저 요구한다. Production Rollout은 자동 승격하지 않고 preview를 만든다. Pipeline은 변경 전 두 Rollout의 stable ReplicaSet image가 같은 digest인지 읽어 복구 identity로 기록하고, sync 뒤 Application parameter와 desired manifest identity를 다시 검증한다. API와 Web preview가 모두 준비됐을 때만 둘을 승격하고 active image identity를 다시 확인한다. Parameter read-back, preview 또는 승격 실패 시 기록한 직전 active digest로 두 workload를 복구하고 실패 결과를 남긴다.

Migration 실행 전에는 PROD-564의 `production-migration-gate.mjs preflight`를 같은 release identity context로 호출해 자동 safety gate를 통과한다. Contract phase도 선택한 image의 migration/API/Web 전체에 적용된 동일한 `production` Environment 승인 안에서 처리하며, contract 전용 Environment, reusable approval workflow, 수동 승인 input이나 approval hash를 추가하지 않는다. General release pipeline의 PreSync command는 실제 schema 적용을 위한 `migrate`로 고정하며, full Argo CD sync 성공 뒤 PROD-564의 `complete`가 activation을 허용해야만 preview 승격으로 진행한다. 이 pipeline은 restore point 생성이나 gate의 phase·recovery·compatibility 정책을 다시 구현하지 않고 자동 gate 결과만 소비한다. 실패 복구는 DB migration을 다시 실행하지 않도록 API·Web Rollout만 selective sync한다.

Rollback은 별도 DB 조작이 아니라 이전 정상 immutable Release tag를 같은 workflow에 다시 입력하는 application deployment다. Pipeline은 해당 Release의 검증된 asset에서 이전 digest를 다시 해석한다. GitHub run/deployment record와 Argo CD operation/history에 요청자, 승인, Release tag, 해석한 identity, 이전 identity와 결과를 남기고 job summary에도 사람이 확인할 값을 출력한다.

### Allowed Alternatives

- Release asset 대신 container artifact attestation과 immutable Release attestation을 결합해 Release tag·commit·image digest의 대응을 검증해도 된다. 단, 운영자 입력은 immutable Release tag 하나로 유지하고 재실행 때 같은 Release가 항상 같은 digest를 해석해야 한다.
- Argo CD parameter 대신 Git에 선언된 release state를 갱신해도 된다. 단, production 승인·직렬화·감사 기록과 PROD-562 Application의 self-heal을 보존하고 직접 main push에 의존하지 않아야 한다.
- 두 Rollout의 승격 조정 수단은 Argo Rollouts action, sync wave 또는 동등한 controller 기능을 사용할 수 있다. 단, 두 preview가 모두 준비되기 전 어느 것도 active가 되지 않고 실패 시 이전 identity가 복구되어야 한다.

### Known Traps

- `stable` 또는 SemVer tag만 Helm에 전달하면 immutable release가 아니다.
- Raw Git tag 존재만 확인하고 immutable GitHub Release 및 asset attestation을 검증하지 않으면 아직 발행되지 않았거나 고정되지 않은 artifact를 배포할 수 있다.
- Image build와 digest asset 첨부 전에 immutable Release를 발행하면 실패한 build의 Release를 수정할 수 없게 된다.
- Docker Build를 production workflow 안에서 다시 실행하면 승인 대상 artifact가 바뀐다.
- GitHub environment 이름만 workflow에 적고 required reviewer·branch policy·admin bypass를 구성하지 않으면 승인 gate가 강제되지 않는다.
- Migration success를 Job 이름이나 과거 run으로 추정하면 다른 digest의 성공을 현재 release에 재사용할 수 있다.
- Argo CD sync 성공만으로 두 Rollout의 active image 일치를 증명할 수 없다.
- Application rollback에 DB rollback 또는 PROD-564의 contract 판단을 섞으면 이 change의 소유 범위를 넘는다.

## Risks / Trade-offs

- [API와 Web 승격은 하나의 원자적 Kubernetes transaction이 아님] → 둘의 preview 준비를 먼저 확인하고 승격 실패 시 직전 active identity로 두 workload를 즉시 복구한 뒤 최종 identity 일치를 검증한다.
- [ApplicationSet reconciliation이 pipeline parameter를 되돌릴 수 있음] → PROD-562가 제공하는 release seam과 ignore/persistence 경계를 manifest test에서 확인하고, 보존되지 않으면 live 배포를 시작하지 않는다.
- [이전 application이 현재 schema와 호환되지 않을 수 있음] → pipeline은 자동으로 임의 구버전을 선택하지 않고 운영자가 PROD-564의 호환성 판단을 거친 이전 정상 identity를 명시적으로 승인한다.
- [Environment 설정은 repository 밖 GitHub 상태임] → idempotent repository 관리 script와 API read-back 검증으로 reviewer, branch policy와 bypass 설정을 확인한다.
- [Immutable releases 설정은 future Release에만 적용되고 image digest 자체가 registry에서 삭제될 수 있음] → 설정 활성화를 첫 정식 Release의 선행 조건으로 검증하고, 배포 전에 asset이 가리키는 digest를 registry에서 pull할 수 있는지 확인하되 다른 digest로 대체하지 않는다.

## Migration Plan

1. Repository immutable releases를 활성화하고, 성공한 SemVer image build의 digest asset을 draft Release에 첨부한 뒤 발행하는 경로와 검증을 추가한다.
2. Digest image rendering과 dev tag rendering의 호환성을 추가하고 migration/API/Web 동일 identity render test를 통과시킨다.
3. GitHub production Environment 설정과 Release tag 하나를 받는 승인 workflow를 추가하고 Release/asset 검증·권한·직렬화·감사 기록을 정적으로 검증한다.
4. PROD-562 release seam과 PROD-564 PreSync migration을 사용할 수 있을 때 preview 대기·승격·실패 복구 경로를 연결한다.
5. 이 change에서는 manifest/workflow 검증까지만 수행하고 실제 첫 production Release는 PROD-565에서 실행한다.
6. Pipeline 코드 rollback은 workflow·Helm 변경을 이전 revision으로 되돌린다. 배포된 application rollback은 승인된 이전 immutable Release tag를 같은 pipeline으로 재선택하며 DB는 변경하지 않는다.

## Open Questions

- 없음.
