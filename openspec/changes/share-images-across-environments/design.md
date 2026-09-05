## Context

Main Docker Build는 source full SHA의 Sentry release와 source map을 포함한 단일 Kosmo image를 GHCR에 `sha-<full SHA>` tag로 push한다. Dev workflow는 build 성공 뒤 triggering `head_sha`의 SHA tag에서 digest를 조회해 Argo에 전달한다. Production workflow는 target SHA의 성공한 main push Docker Build를 확인한 뒤 GHCR에서 같은 SHA tag의 digest를 승인 전에 조회·고정하고, 승인 후에는 그 값을 재조회하거나 image를 다시 build·push하지 않는다.

`PROD-891` 이후 browser 공개 설정은 image input이 아니다. Web은 BFF가 runtime `ENVIRONMENT`에서 검증한 `/channel.js`로 `dev` 또는 `prod` 설정을 선택하고, Native는 build mode로 채널을 선택한다. Server Secret과 `ENVIRONMENT`도 Helm runtime 주입으로 남아 있다.

## Goals / Non-Goals

**Goals:**

- Main의 성공한 canonical build가 `sha-<full SHA>` tag를 한 번 게시하도록 한다.
- Dev가 triggering `head_sha`의 GHCR SHA tag digest를 조회해 Argo에 전달하도록 한다.
- Production preflight가 승인 전에 성공한 main push Docker Build와 GHCR SHA tag digest를 fail-closed로 고정하도록 한다.
- 승인 뒤 production mutation 경계와 migration barrier를 유지하면서 build/push/Sentry 재생성과 tag/digest 재조회를 제거한다.
- SHA tag 재빌드로 Dev와 Production의 조회 digest가 달라질 수 있음을 허용하되, 승인 전 Production digest 고정은 유지한다.

**Non-Goals:**

- Browser runtime config JSON 또는 `/channel.js` 대체
- Runtime별 image 분리, digest map, registry나 manifest/artifact abstraction
- SHA tag 불변성 강제 또는 Dev와 Production의 실제 digest 비교
- 실제 dev/prod deploy, Environment 승인, Argo sync, Secret/Variable 변경
- Android/iOS build·store·OTA 변경

## Implementation Guidance

### Current Constraints

- Production preflight는 `actions: read` permission으로 성공한 main workflow run의 head SHA를 확인하고 `packages: read` 권한으로 GHCR의 `sha-<target SHA>` tag digest를 조회한다.
- `workflow_run`의 triggering `head_sha`는 Dev consumer가 조회할 SHA tag를 구성하기에 충분하다.
- Helm은 이미 non-empty `imageDigest`를 `ghcr.io/byulmaru/kosmo@sha256:...`로 렌더하고 production에서 digest 형식을 강제한다.
- Production target의 workflow 정의를 실행하지 않고 main의 workflow definition만 사용해야 한다.

### Recommended Approach

- Docker Build는 `sha-<full SHA>` tag를 게시하고 별도 release manifest나 digest artifact를 생성하지 않는다.
- Dev는 triggering `head_sha`로 SHA tag를 구성해 GHCR digest를 조회·검증한 뒤 `argocd app set kosmo-dev --revision <head SHA> -p version=<head SHA> -p imageDigest=<digest>`를 실행한 다음 sync한다.
- Triggering Docker Build를 검사하는 Trivy도 별도 release artifact 없이 triggering `sha-<head SHA>` tag를 사용한다. 수동·정기 scan의 기존 `:main` 선택은 배포 identity가 아니므로 유지한다.
- Production preflight는 main `Docker Build` workflow의 성공한 run 중 `head_sha == target SHA`, `event == push`, `head_branch == main`인 run을 확인한 뒤 GHCR의 `sha-<target SHA>` tag digest를 조회·검증한다. Run ID, target SHA와 조회 digest를 job outputs로 고정한다. Run 자체가 digest를 증명한다고 간주하지 않는다.
- 승인된 production job은 checkout, Docker setup/login/build/push, Sentry build secret과 tag/digest 재조회를 갖지 않고 preflight outputs로 기존 migration-gated Argo sync를 실행한다.
- Root의 작은 Node 정적 test가 SHA tag producer와 두 consumer의 tag 형식, run identity, GHCR digest validation, Argo parameter 전달 및 production build 부재를 함께 검사한다.

### Allowed Alternatives

- GHCR registry API 대신 인증된 registry CLI를 사용해 SHA tag digest를 조회할 수 있다. 어느 경로든 target SHA tag와 `sha256:<64 lowercase hex>` 검증, production pre-approval 고정을 유지해야 한다.

### Known Traps

- GHCR 조회에서 target SHA가 아닌 branch/tag를 사용하거나 digest를 검증하지 않으면 배포 identity가 바뀔 수 있다.
- Production preflight가 동일 SHA의 실패·수동·다른 workflow run을 허용하면 canonical producer 경계가 무너진다.
- 승인 뒤 SHA tag를 다시 조회하거나 target SHA를 재해석하면 승인 정보와 실제 deploy identity가 달라질 수 있다.
- SHA tag는 재빌드로 덮어쓸 수 있으므로 Dev와 Production이 다른 시점에 조회한 digest가 달라질 수 있다. 이는 허용된 경계이며, production은 preflight digest를 유지한다.
- 단일 image인데 runtime 이름→digest map이나 manifest를 만들면 현재 요구되지 않는 multi-runtime 계약을 미리 고정한다.
- Dev가 `argocd app sync`만 실행하면 기존 `:main` parameter가 남아 exact digest를 소비하지 않는다.
- Trivy용 image reference artifact를 게시하면 배포 identity가 별도 파일로 분산된다.

## Risks / Trade-offs

- GHCR SHA tag가 없거나 digest 조회가 실패하면 해당 SHA는 배포할 수 없다. `:main`이나 다른 tag, production rebuild로 우회하지 않고 preflight 실패를 남긴다.
- SHA tag 재빌드로 digest가 바뀔 수 있으므로 Dev와 Production의 실제 digest가 다를 수 있다. Production approval 전 고정된 digest는 tag가 바뀌어도 유지한다.
- Canonical build의 Sentry upload가 실패하면 dev/prod 모두 해당 SHA를 배포할 수 없다. Sentry release/source map은 canonical build에서만 생성한다.
- 실제 GHCR SHA tag 조회와 Argo mutation은 PR에서 live 실행하지 않으므로 정적·문법 검증과 실제 배포 증거를 분리한다.

## Migration Plan

1. Canonical Docker Build에 `sha-<full SHA>` tag 게시와 Sentry source map upload를 유지한다.
2. Dev는 triggering SHA tag를, Production은 preflight가 검증·고정한 SHA tag digest를 사용하도록 전환한다.
3. Workflow 정적 test, actionlint, Helm dev/prod render와 Docker build check를 통과시킨다.
4. 별도 운영 승인 뒤 dev와 production에서 build run·SHA·digest·health를 확인한다.

### Rollback

Repository 변경은 이전 workflow로 revert할 수 있지만 mutable `:main`이나 production 재build를 정상 fallback으로 자동 선택하지 않는다. SHA tag가 없거나 digest 조회가 실패하면 release를 중단하며, 이미 시작된 release는 preflight가 고정한 digest와 기존 production concurrency·migration barrier를 따른다.

## Open Questions

없음.
