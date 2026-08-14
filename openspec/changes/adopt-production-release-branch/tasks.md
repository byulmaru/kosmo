## 1. PROD-764 Production branch 기준점

**Authority / Provenance**

- `PROD-764`

**Deliverable**

실제 최신 성공 production release에서 장기 `production` 브랜치가 시작되고 PR 기반으로 보호된다.

**Guardrails**

- 최신 tag만으로 실제 배포를 추론하지 않는다.
- 직접 push, history rewrite와 여러 장기 release branch를 허용하지 않는다.

**Verification**

- GitHub Actions와 live Argo/image로 초기 SHA 대조
- Remote branch SHA, ruleset과 직접 push 거부 확인

- [ ] 1.1 최신 성공 production commit과 live source/image를 확인해 초기 SHA를 기록한다.
- [ ] 1.2 확인한 SHA에서 원격 `production`을 만들고 branch 생성만으로 배포가 실행되지 않음을 확인한다.
- [ ] 1.3 PR review와 필수 checks를 유일한 사람 승인 gate로 적용하고 직접 push·history rewrite 금지를 검증한다.
- [x] 1.4 `ensure-github.sh`를 제거하고 GitHub 설정을 각 운영 절차와 live 검증으로 분리한다.

## 2. PROD-764 Branch 기반 production workflow

**Authority / Provenance**

- `PROD-764`
- Version label 보존에 한해 `PROD-631`
- 동일 digest migration 경계에 한해 `PROD-563`, `PROD-564`

**Deliverable**

Production 대상 PR merge로 발생한 push가 version tag 입력 없이 동일 SHA·digest의 production release를 자동 배포한다.

**Guardrails**

- Production push event의 immutable SHA만 production source로 사용한다.
- Tag는 build input, checkout, source selector 또는 workload identity로 사용하지 않는다.
- PR merge 뒤 별도 dispatch, `prod` Environment reviewer 또는 migration approval을 요구하지 않는다.
- Migration/API/Web은 같은 digest를 사용하고 Sync wave 1 migration 실패 시 wave 2 workload activation을 진행하지 않는다.
- Main dev build는 유지한다.

**Verification**

- Production push, tag push, main push와 manual event trigger matrix
- 연속 production push에서 실행 중 run 비취소와 latest pending coalescing 검증
- Prod/dev build input과 Web version label 비노출 검증
- Argo source SHA와 migration/API/Web digest 대조

- [x] 2.1 Tag push production trigger를 제거하고 protected production push가 event SHA의 production build·deploy를 자동 시작하게 한다.
- [x] 2.2 기존 Web version label 렌더링을 주석 처리하고 사용하지 않는 import/style을 제거하며 표시 tag 공급·재활성화를 후속 범위로 분리한다.
- [x] 2.3 Production build에 prod Vault/OpenPanel/Sentry 설정을 전달하되 `EXPO_PUBLIC_RELEASE_TAG`에 의존하지 않고 dev build 입력을 보존한다.
- [x] 2.4 별도 사람 승인 없이 full push SHA와 하나의 image digest를 Argo source, migration, API와 Web에 전달하고 production runs를 직렬화한다.
- [x] 2.5 GitHub PR/branch history로 승인 이력을 보존하고 workflow에는 actor, production commit, source revision, digest와 결과를 기록하며 PR 연결 관계를 재검증하지 않는다.
- [x] 2.6 Trigger matrix, version label 비노출, 실행 중 run 보존·latest pending coalescing, 동일 SHA·digest와 migration barrier 검증을 추가하고 관련 check를 통과시킨다.

## 3. PROD-764 Credential과 Application ownership

**Authority / Provenance**

- `PROD-764`

**Deliverable**

Tag ref는 production build credential을 얻지 못하고 Terraform은 승인된 production release identity만 보존하면서 나머지 Application/IAM 구조를 관리한다.

**Guardrails**

- Release-time target revision과 Helm parameter 밖의 Application drift를 숨기지 않는다.
- Tag ref trust를 workflow에서 사용하지 않는다는 이유만으로 남기지 않는다.

**Verification**

- Terraform validation/plan과 OIDC trust diff
- Tag-ref credential 거부 및 production workflow identity 허용 확인
- Terraform 재적용 뒤 release revision/parameter 보존

- [x] 3.1 Terraform이 release-time production target revision과 Helm parameter만 보존하도록 lifecycle 경계를 갱신한다.
- [x] 3.2 ECR push trust에서 tag ref를 제거하고 branch build의 필요한 최소 범위를 유지한다.
- [ ] 3.3 Vault production build role owner를 확인해 tag ref trust를 승인된 production workflow identity로 전환하고 별도 repository 변경이면 같은 issue에 연결한다.
- [ ] 3.4 Provider validation과 reviewed plan을 통과시키고 의도한 ownership·credential 변경만 있는지 확인한다.

## 4. PROD-764 Release runbook과 Main 전달

**Authority / Provenance**

- `PROD-764`
- `PROD-631`
- Migration 정책에 한해 `memory/database-migrations.md`

**Deliverable**

운영자가 production PR merge를 승인으로 사용한 자동 release와 revert release를 반복할 수 있고 version 표시 보류를 포함한 계약·구현·문서가 main에 리뷰 가능한 변경으로 전달된다.

**Guardrails**

- 과거 tag 직접 재배포, history rewrite와 DB rollback을 안내하지 않는다.
- Production-first hotfix는 main 반영까지 추적한다.
- Production PR·review·check 강제는 branch ruleset이 소유하고 workflow에 두 번째 PR API 승인 gate를 만들지 않는다.

**Verification**

- 정상 자동 release, tag push 무동작, version label 비노출, 연속 run, hotfix와 revert runbook 검토
- Production migration/OpenPanel/Sentry 문서의 branch 기반 조건 정합성
- Production 대상 PR에서 ruleset의 필수 checks가 모두 실행되는지 확인
- Workflow에 `pull-requests: read` 권한과 commit-associated PR 검증 step이 없는지 확인
- Strict OpenSpec validation과 main PR checks

- [x] 4.1 `production PR review/checks → merge(승인) → 자동 build·migration·deploy → 검증` 절차를 release runbook에 기록한다.
- [x] 4.2 Production-first hotfix와 DB-compatible revert PR을 새 release로 배포하는 rollback 절차를 기록한다.
- [x] 4.3 Production migration, OpenPanel, Sentry와 Terraform 문서에서 tag-triggered 배포 설명을 branch workflow와 version 표시 보류 계약으로 갱신한다.
- [x] 4.4 OpenSpec과 구현·문서의 정합성 및 strict validation을 확인한다.
- [x] 4.5 `PROD-764` main 변경을 commit·push하고 한국어 PR에 결정, 검증, external credential 변경과 live 전환 gate를 기록해 Ready for review로 전환한다.

## 5. PROD-764 첫 branch release와 완료

**Authority / Provenance**

- `PROD-764`

**Deliverable**

Release-control 변경만 포함한 production PR이 version tag 입력 없이 merge되어 자동 workflow로 성공 배포되고 durable 계약과 issue가 완료된다.

**Guardrails**

- Main 구현과 필요한 infrastructure apply 전에는 production 전환을 실행하지 않는다.
- 첫 production PR에 main의 다른 기능을 포함하지 않는다.
- Live 성공 전에는 change를 archive하지 않는다.

**Verification**

- Production PR diff/checks와 migration 무변경
- Production push 자동 실행, tag push 무동작, commit/source/digest/migration-gated Sync/Rollout 결과
- Live Argo/workload 상태와 Web version label 비노출
- Archive 후 active spec strict validation

- [ ] 5.1 Main merge와 infrastructure apply가 완료된 뒤 release-control commit만 production PR로 반영한다.
- [ ] 5.2 Tag push만으로 배포가 실행되지 않고 production build가 표시 tag 입력을 요구하지 않음을 확인한다.
- [ ] 5.3 Production PR을 review/checks 후 merge해 자동 배포하고 추가 사람 승인 없이 commit, version label 비노출, Argo source, digest, migration과 Rollout 결과를 기록한다.
- [ ] 5.4 전체 완료 조건을 Linear에 기록하고 delta를 active `production-release` spec에 동기화해 OpenSpec을 archive한다.
- [ ] 5.5 Archive와 active specs를 strict validation해 main에 전달한 뒤 `PROD-764`을 완료한다.
