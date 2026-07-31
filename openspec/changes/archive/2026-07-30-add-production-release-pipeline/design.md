## Context

Docker Build는 branch와 tag에서 API·Web runtime image를 만들고 digest를 output으로 제공한다. 기존 PROD-563 구현은 SemVer tag를 GitHub Release asset으로 다시 발행하고 별도 workflow가 이를 해석했지만, tag build와 production deploy 사이에 필요한 것은 같은 workflow의 digest 전달과 production 승인뿐이다.

PROD-563은 tag build에서 production sync까지의 release 경계만 소유한다. `kosmo-prod` runtime은 PROD-562, migration Job identity·credential·command는 PROD-564, 실제 첫 release와 public smoke는 PROD-565가 소유한다.

## Goals / Non-Goals

**Goals:**

- 모든 Git tag를 형식 제한 없이 production build trigger로 사용한다.
- Build output digest를 한 번의 production 승인 뒤 migration, API와 Web에 동일하게 전달한다.
- PreSync migration 성공 뒤 controller 기본 activation을 사용한다.
- Tag, commit, digest와 결과를 workflow 및 Argo CD 기록으로 감사한다.
- 실행 중인 production 배포는 보존하고 최신 pending tag가 이전 pending tag를 대체한다.
- 이전 application 재배포는 pipeline 도입 이후 실제 production에 배포된 호환 가능한 이전 release commit에 새 tag를 붙이는 같은 경로를 사용한다.

**Non-Goals:**

- GitHub Release 또는 별도 release catalog
- 별도 production deploy workflow와 수동 release selector
- migration credential, specific schema migration, backup/restore와 destructive rollback gate
- API·Web 원자적 승격이나 pipeline 내부 ReplicaSet recovery
- DB rollback, actual first production run과 public smoke

## Implementation Guidance

### Current Constraints

- Tag build와 deploy job은 같은 GitHub Actions workflow run에 있으므로 build job의 digest output을 직접 전달할 수 있다.
- Helm production render는 tag가 아니라 full digest reference를 요구한다.
- Argo CD ApplicationSet이 release parameter를 보존하는 seam은 PROD-562가 제공한다.
- PROD-564 PreSync Job이 없으면 migration-before-workload 순서를 완성할 수 없다.

### Recommended Approach

Docker Build의 tag trigger를 모든 tag에 적용하고 별도 SemVer validation을 제거한다. Docker metadata에는 SHA tag와 ECR 보존용 `stable` tag만 남기고 Git tag 이름은 workflow audit ref로만 사용하며 container metadata로 발행하지 않는다. Production container identity는 build output의 `sha256:` digest고 `stable`은 배포 입력으로 읽지 않는다. 일반 tag ref metadata를 발행하던 초기 구현은 PR #431에서 dev용 `main` image tag 충돌 가능성 때문에 교정됐다.

같은 workflow에 `deploy_production` job을 두고 tag ref에서만 실행한다. 이 job은 `docker_build` 성공 뒤 GitHub `prod` Environment 승인을 기다린다. 승인 뒤 Argo CD token을 얻고 `version`, `imageDigest`, `workloads.enabled=true`, `migration.enabled=true`를 `kosmo-prod`에 설정한다. `version`은 Kubernetes label에 안전한 commit short SHA를 사용하고 원래 tag 이름은 GitHub run의 ref에 남긴다.

`prod` Environment는 별도 ref policy 없이 사용자 승인을 담당한다. 배포 대상을 tag로 제한하는 권위는 workflow의 tag trigger와 deploy job 조건 하나다.

Production deploy job의 고정 concurrency group은 실행 중 job을 취소하지 않고 pending job은 하나만 유지한다. 더 최신 tag build가 도달하면 이전 pending job이 취소되고 최신 pending job이 다음 후보가 된다. 모든 중간 tag를 FIFO로 배포하지 않는다.

Rendered manifest에서 migration, API와 Web image가 build digest와 일치하고 PreSync Job이 하나인지 확인한 뒤 `argocd app sync`를 실행한다. PreSync 성공 뒤 각 Rollout은 controller 기본 activation을 사용한다. Pipeline은 preview polling, promotion action, ReplicaSet discovery나 자동 recovery를 수행하지 않는다.

GitHub Release publish/resolve job과 script, 별도 deploy workflow는 삭제한다. 실패 뒤 application을 되돌려야 하면 pipeline 도입 이후 실제 production에 배포됐고 현재 DB와 호환되는 이전 release commit에 새 tag를 붙여 동일한 build·approval·sync 경로를 실행한다. Pipeline 도입 전 임의 commit은 rollback 대상으로 보장하지 않으며 이는 DB rollback이 아니다.

### Known Traps

- Tag 문자열을 Kubernetes label이나 container identity로 직접 사용하지 않는다.
- Branch build가 production deploy job을 만들지 않게 tag ref 조건을 둔다.
- Deploy job에서 image를 다시 build하거나 mutable tag를 다시 해석하지 않는다.
- Argo CD sync 성공을 API·Web의 원자적 전환으로 해석하지 않는다.
- 이전 production release commit 재배포가 현재 DB와 호환되는지는 해당 schema migration release가 판단한다.

## Risks / Trade-offs

- [Tag 이름에 제한이 없음] → 사람이 읽는 tag는 GitHub audit ref로만 사용하고 manifest label은 commit short SHA, container identity는 digest로 분리한다.
- [최신 pending tag가 이전 pending tag를 대체함] → 중간 tag를 모두 배포하지 않고 실행 중 배포와 최신 후보만 보존한다.
- [이전 production release commit 재배포는 기존 image 재사용이 아니라 새 build임] → 단순한 단일 경로를 우선하며 각 실행이 만든 digest를 그대로 승인·배포·감사한다.
- [기존 ECR 7일 expiry가 production digest를 삭제할 수 있음] → `stable`을 배포 선택자가 아닌 lifecycle 보존 표식으로 유지하고 나머지 기존 정리 정책을 보존한다.
- [API와 Web activation은 원자적이지 않음] → PreSync와 동일 desired digest만 pipeline이 보장하고 진행 상태는 Rollout controller에 맡긴다.

## Migration Plan

1. Tag trigger에서 SemVer 제한을 제거하고 Git tag 이름은 container metadata가 아닌 workflow audit ref로만 유지한다.
2. 기존 production deploy 단계를 Docker Build workflow의 tag-only 승인 job으로 옮긴다.
3. GitHub Release publish/resolve job·script와 별도 deploy workflow를 삭제한다.
4. Workflow, Helm render와 OpenSpec strict validation을 통과시킨다.
5. 실제 tag와 production 환경을 사용하는 첫 run은 PROD-565에서 검증한다.

## Open Questions

- 없음.
