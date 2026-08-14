## Context

현재 Docker workflow는 main push와 모든 tag push를 받으며 tag ref를 production 환경·Vault role·OpenPanel·version label·배포 조건으로 사용한다. `kosmo-prod`는 image parameter는 tag workflow에서 받지만 Helm source는 `main`을 추적한다. `PROD-764`은 source와 배포를 `production` 브랜치로 옮기고, `PROD-631`이 제공한 `버전: <tag>` UI는 표시 tag 공급 방식이 정해질 때까지 주석 처리한다.

## Goals / Non-Goals

**Goals:**

- Production 대상 PR merge를 승인으로 삼아 그 push SHA를 자동 build·배포한다.
- Tag push와 production credential·배포의 연결을 제거한다.
- 기존 Web version label을 주석 처리해 production build의 tag 입력 의존성을 제거한다.
- Image, migration/API/Web digest와 Helm source를 같은 production SHA로 고정한다.
- Revert PR을 새 release로 배포해 rollback한다.
- Main dev build와 migration barrier를 유지한다.

**Non-Goals:**

- Tag 기반 source 선택, 과거 tag 재배포 또는 GitHub Release publication
- 별도 수동 workflow 실행 또는 GitHub Environment reviewer 승인
- 여러 release branch, feature flag와 database rollback
- Native store·OTA release 변경
- 표시 tag 생성·공급 방식과 version label 재활성화

## Implementation Guidance

### Current Constraints

- Version tag는 Web static build에 bake되므로 이번 변경에서는 version label을 주석 처리하고 tag 공급 방식을 결정하지 않는다.
- 연속 production push가 발생해도 실행 중인 배포는 취소하지 않는다. GitHub Actions native concurrency가 이전 pending run을 최신 pending run으로 대체하는 기존 `PROD-563` 동작은 유지한다.
- ECR IAM trust는 현재 heads와 tags를 모두 허용하고 Vault production build role도 tag ref를 사용한다. Tag push에서 production 권한을 제거하려면 workflow 조건뿐 아니라 trust 경계도 함께 갱신해야 한다.
- Argo CD `target_revision`과 release parameters를 workflow가 설정하면 Terraform이 main/bootstrap 값으로 되돌리지 않도록 좁은 lifecycle ownership이 필요하다.

### Recommended Approach

1. 실제 최신 성공 production commit에서 `production`을 만들고 PR·checks·rewrite 금지 ruleset을 적용한다.
2. Docker workflow의 tag push trigger를 제거한다. Main push는 dev build를 유지하고 protected production push는 해당 event SHA의 production build·deploy를 자동 시작한다.
3. Production 대상 PR의 필수 review와 checks를 유일한 사람 승인 gate로 사용하고 `prod` Environment의 required reviewer와 별도 manual dispatch는 제거한다.
4. Production build 조건을 하나의 판정으로 사용해 prod Vault role, OpenPanel Client ID, stable preservation metadata와 deploy job을 선택하고 `EXPO_PUBLIC_RELEASE_TAG` 입력에는 의존하지 않는다.
5. Deploy job은 event의 full SHA와 build가 만든 하나의 digest를 Argo CD source, migration, API와 Web에 전달한다. 실행 중인 production run은 취소하지 않고, 여러 pending run은 최신 production SHA로 coalesce한다.
6. Terraform은 release-time target revision과 Helm parameter만 ignore하고 ECR OIDC trust에서 tag ref를 제거한다. Vault production role은 protected production branch workflow identity만 허용한다.
7. Production release runbook에 `production PR review/checks → merge → 자동 build·migration·deploy → 검증`을 기록한다.
8. Rollback은 production revert PR을 같은 절차로 merge해 배포한다.

GitHub production ruleset과 `prod` Environment 설정은 범용 repository bootstrap 스크립트가 소유하지 않는다. 첫 전환에서 명시적으로 적용하고 GitHub API의 live 상태로 검증한다.

### Allowed Alternatives

- Production push 처리를 기존 Docker workflow의 조건부 branch로 유지하거나 작은 전용 workflow로 분리할 수 있다. 어느 방식이든 push-driven 계약과 build logic·digest 전달이 drift하지 않아야 한다.

### Known Traps

- 별도 Environment approval을 남겨 production PR merge 뒤 두 번째 사람 승인을 요구하지 않는다.
- 주석 처리한 version label을 이번 범위에서 임의의 fallback 문자열로 다시 노출하지 않는다.
- Workflow 조건만 바꾸고 tag ref의 Vault/IAM trust를 남기지 않는다.
- 범용 bootstrap 스크립트에 production reviewer·ruleset 정책을 복제해 장기 source of truth처럼 만들지 않는다.
- Mutable `production` ref를 Argo sync에 넘기지 않고 workflow가 확인한 full SHA를 사용한다.
- Revert 없이 과거 tag commit을 직접 배포해 rollback하지 않는다.

## Risks / Trade-offs

- [연속 production merge에서 중간 pending run이 대체될 수 있다] → 실행 중인 run은 보존하고 latest pending SHA가 앞선 production history를 포함하는지 확인하며 GitHub Actions 취소 기록을 감사에 남긴다.
- [Version label이 일시적으로 보이지 않는다] → 의도된 보류 상태를 UI 검증과 runbook에 기록하고 별도 후속 범위에서 재활성화한다.
- [Revert가 migration을 되돌리지 않는다] → DB-compatible application revert만 허용하고 destructive migration 정책은 기존 계약을 따른다.
- [Vault role 변경이 다른 repository에 있을 수 있다] → 현재 owner를 확인해 같은 `PROD-764` 결과의 별도 PR과 적용 증거로 관리한다.

## Migration Plan

1. 최신 성공 production SHA와 live Argo/image 상태를 확인하고 해당 SHA에서 production branch를 만든다.
2. Main에서 workflow, Terraform/IAM, Vault owner 변경, specs와 runbook을 검증·merge하고 필요한 infrastructure apply를 완료한다.
3. Initial production에서 시작한 PR에 release-control 변경만 반영한다.
4. Production 대상 PR을 필수 review와 checks로 승인·merge해 자동 배포를 시작한다.
5. 별도 사람 승인 없이 commit, source SHA, digest, migration과 Rollout 결과를 확인하고 version label이 숨겨졌는지 확인한다.
6. 실패하면 production에 수정 또는 revert PR을 merge해 재시도한다. 과거 tag 재배포, history rewrite와 DB rollback은 사용하지 않는다.

## Open Questions

없음. 표시 tag 공급과 version label 재활성화는 이 change의 제외 범위다.
