## 1. PROD-563 Immutable release identity

**Authority / Provenance**

- PROD-563

**Deliverable**

정식 SemVer image build의 digest가 immutable GitHub Release asset으로 고정되고, 운영자가 선택한 Release tag에서 검증된 identity가 production migration, API와 Web에 동일하게 전달된다.

**Guardrails**

- 배포 과정에서 release artifact를 다시 build하지 않는다.
- Mutable `stable`, SemVer 또는 `main` tag만 production container identity로 사용하지 않는다.
- Raw Git tag, draft/mutable GitHub Release와 attestation이 검증되지 않은 Release asset을 production selector로 사용하지 않는다.
- dev의 기존 mutable `main` render와 배포 동작은 유지한다.

**Verification**

- Immutable releases 설정, 성공 build 뒤 draft asset 첨부·발행 순서, immutable Release/asset 검증 실패와 동일 tag 재선택을 검증한다.
- Helm dev/prod render에서 migration, API와 Web의 image reference와 release metadata를 비교한다.

- [x] 1.1 Immutable releases 설정과 성공한 SemVer image build의 digest asset을 포함한 immutable GitHub Release 발행 경계를 구현한다.
- [x] 1.2 Immutable Release tag 하나에서 Release와 asset attestation을 검증해 full digest image reference를 확정하는 입력 경계를 구현한다.
- [x] 1.3 Migration, API와 Web이 같은 production digest를 사용하면서 dev tag render를 보존하도록 manifest 경계를 구현한다.
- [x] 1.4 Immutable Release 발행·검증 실패와 dev/prod image render 회귀 검증을 추가한다.

## 2. PROD-563 Production approval and activation pipeline

**Authority / Provenance**

- PROD-563

**Deliverable**

명시적으로 승인된 production 실행만 같은 release migration과 API·Web preview를 검증하고 두 workload를 활성화한다.

**Guardrails**

- 승인 전에는 production 자격 증명을 취득하거나 Argo CD 상태를 변경하지 않는다.
- Migration 성공 전 새 API·Web workload를 활성화하지 않는다.
- API와 Web preview가 모두 준비되기 전 어느 것도 production traffic에 승격하지 않는다.
- 선택한 release의 migration과 API·Web 전체를 한 번 승인하며 contract 전용 Environment·수동 approval input·중복 승인을 추가하지 않는다.
- PROD-562 runtime resource와 PROD-564 migration 단계·credential·contract gate를 이 task에서 구현하지 않는다.

**Verification**

- GitHub Environment reviewer·main ref·admin bypass 설정과 approval-before-OIDC 순서를 확인한다.
- Migration 실패, API/Web preview 개별 실패, 정상 준비, 승격 실패와 active identity mismatch를 검증한다.
- Production 배포 concurrency가 직렬화되고 진행 중 실행을 취소하지 않는지 확인한다.
- Workflow에 `production` Environment 승인만 하나 있고 contract 전용 approval 경로가 없는지 확인한다.

- [x] 2.1 Production Environment 승인·ref·bypass 정책을 재현 가능하게 구성하고 설정 read-back 검증을 추가한다.
- [x] 2.2 승인 뒤 검증된 identity로 `kosmo-prod` sync를 실행하고 별도 contract 승인 없이 PROD-564 자동 preflight·completion interface로 같은-digest migration 성공을 기다리는 pipeline을 구현한다.
- [x] 2.3 API와 Web preview를 함께 검증한 뒤 승격하고 실패 시 이전 active identity를 유지·복구하는 경로를 구현한다.
- [x] 2.4 승인·migration·preview·promotion 성공 및 실패 경로와 production 직렬화를 자동 검증한다.

## 3. PROD-563 Rerun, application rollback and audit

**Authority / Provenance**

- PROD-563

**Deliverable**

같은 release를 동일 identity로 재실행하고 이전 정상 application release를 같은 승인 pipeline으로 재선택하며 각 결과를 감사할 수 있다.

**Guardrails**

- Rollback은 이전 정상 immutable GitHub Release tag의 명시적 재선택이며 DB rollback이나 destructive migration을 실행하지 않는다.
- 실제 첫 production release, public-origin smoke와 운영 통합 검증은 PROD-565에 남긴다.
- Secret, token, kubeconfig와 database credential을 repository, artifact 또는 workflow summary에 남기지 않는다.

**Verification**

- 동일 immutable Release tag 재실행과 이전 Release tag rollback에서 build가 발생하지 않고 두 active workload identity가 일치하는지 검증한다.
- 성공·Release 검증 실패·activation 실패·rollback 기록에 요청자, 승인, Release tag, 해석한 digest, 이전 identity와 결과가 남는지 확인한다.
- Workflow/manifest 정적 검사, repository format 검사와 OpenSpec strict validation을 통과시킨다.

- [x] 3.1 같은 immutable Release tag 재실행과 승인된 이전 정상 Release tag의 application rollback을 같은 pipeline으로 제공한다.
- [x] 3.2 GitHub와 Argo CD 배포 기록에 요청·승인·release identity·이전 identity·결과를 연결하고 민감 정보 비노출을 검증한다.
- [x] 3.3 관련 workflow·manifest 성공/실패 검증, format 검사와 strict OpenSpec validation을 통과시킨다.
