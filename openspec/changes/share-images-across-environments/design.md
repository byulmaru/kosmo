## Context

Main Docker Build는 이미 source full SHA의 Sentry release와 source map을 포함한 단일 Kosmo image를 GHCR에 push한다. Dev workflow는 build 성공 뒤 Argo를 sync하지만 digest를 설정하지 않아 chart의 `:main` fallback을 사용한다. Production workflow는 target SHA를 승인 전에 검증한 뒤, 승인 후 같은 SHA를 다시 checkout·build·push하고 그 새 digest를 배포한다.

`PROD-891` 이후 browser 공개 설정은 image input이 아니다. Web은 BFF가 runtime `ENVIRONMENT`에서 검증한 `/channel.js`로 `dev` 또는 `prod` 설정을 선택하고, Native는 build mode로 채널을 선택한다. Server Secret과 `ENVIRONMENT`도 Helm runtime 주입으로 남아 있다.

## Goals / Non-Goals

**Goals:**

- Main의 성공한 canonical build를 source SHA당 유일한 deployable image producer로 만든다.
- Dev와 승인된 production이 같은 run의 exact digest를 사용함을 정적으로 검증한다.
- Production preflight가 승인 전에 target SHA, build run과 digest를 fail-closed로 고정한다.
- 승인 뒤 production mutation 경계와 migration barrier를 유지하면서 build/push/Sentry 재생성을 제거한다.

**Non-Goals:**

- Browser runtime config JSON 또는 `/channel.js` 대체
- Runtime별 image 분리, digest map, registry나 manifest abstraction
- 실제 dev/prod deploy, Environment 승인, Argo sync, Secret/Variable 변경
- Android/iOS build·store·OTA 변경

## Implementation Guidance

### Current Constraints

- GitHub artifact download는 run ID로 고정할 수 있고 production preflight는 `actions: read` permission으로 main workflow runs와 artifacts를 조회할 수 있다.
- `workflow_run`의 triggering run ID와 head SHA는 Dev consumer가 canonical producer를 식별하기에 충분하다.
- Helm은 이미 non-empty `imageDigest`를 `ghcr.io/byulmaru/kosmo@sha256:...`로 렌더하고 production에서 digest 형식을 강제한다.
- Production target의 workflow 정의를 실행하지 않고 main의 workflow definition만 사용해야 한다.

### Recommended Approach

- Docker Build는 `build-push-action` output digest를 단일 JSON manifest에 기록하고 같은 run artifact로 업로드한다. Manifest는 `imageDigest` 하나만 소유한다.
- Dev는 triggering run ID에서 artifact를 내려받고 digest 형식을 검증한 뒤 `argocd app set kosmo-dev --revision <head SHA> -p version=<head SHA> -p imageDigest=<digest>`를 실행한 다음 sync한다.
- Triggering Docker Build를 검사하는 Trivy도 별도 image-reference artifact 대신 같은 manifest를 검증해 image reference를 구성한다. 수동·정기 scan의 기존 `:main` 선택은 배포 identity가 아니므로 유지한다.
- Production preflight는 main `Docker Build` workflow의 성공한 run 중 `head_sha == target SHA`, `event == push`, `head_branch == main`인 run을 유일하게 선택하고 그 run artifact를 내려받아 digest를 검증한다. Run ID, target SHA와 digest를 job outputs로 고정한다.
- 승인된 production job은 checkout, Docker setup/login/build/push와 Sentry build secret을 갖지 않고 preflight outputs로 기존 migration-gated Argo sync를 실행한다.
- Root의 작은 Node 정적 test가 producer와 두 consumer의 artifact name, run identity, digest validation, Argo parameter 전달 및 production build 부재를 함께 검사한다.

### Allowed Alternatives

- JSON 대신 한 줄 digest text artifact도 같은 run identity와 형식 검증을 유지하면 가능하다. 현재 manifest field를 명시적으로 드러내는 JSON이 review와 확장 억제에 더 명확하다.

### Known Traps

- Artifact 조회에서 최신 run이나 mutable branch/tag를 다시 해석하면 approval 대기 중 identity가 바뀔 수 있다.
- Production preflight가 동일 SHA의 실패·수동·다른 workflow run을 허용하면 canonical producer 경계가 무너진다.
- 승인 뒤 artifact를 다시 검색하거나 target SHA를 재해석하면 승인 정보와 실제 deploy identity가 달라질 수 있다.
- 단일 image인데 runtime 이름→digest map을 만들면 현재 요구되지 않는 multi-runtime 계약을 미리 고정한다.
- Dev가 `argocd app sync`만 실행하면 기존 `:main` parameter가 남아 exact digest를 소비하지 않는다.
- Trivy용 image reference를 별도 artifact로 게시하면 canonical digest가 두 파일로 분산된다.

## Risks / Trade-offs

- GitHub artifact retention 뒤 오래된 SHA는 즉시 production target으로 사용할 수 없다. Mutable tag나 rebuild로 우회하지 않고 canonical artifact가 없다는 preflight 실패를 남긴다.
- Canonical build의 Sentry upload가 실패하면 dev/prod 모두 해당 SHA를 배포할 수 없다. 이는 source map을 canonical artifact와 함께 보장하는 의도한 fail-closed 경계다.
- 실제 GitHub Actions artifact API와 Argo mutation은 PR에서 live 실행하지 않으므로 정적·문법 검증과 실제 배포 증거를 분리한다.

## Migration Plan

1. Canonical Docker Build에 single-image digest manifest를 추가한다.
2. Dev와 Production consumer를 run-pinned artifact와 exact digest로 전환한다.
3. Workflow 정적 test, actionlint, Helm dev/prod render와 Docker build check를 통과시킨다.
4. 별도 운영 승인 뒤 dev와 production에서 build run·SHA·digest·health를 확인한다.

### Rollback

Repository 변경은 이전 workflow로 revert할 수 있지만 mutable `:main`이나 production 재build를 정상 fallback으로 자동 선택하지 않는다. 이미 시작된 release는 기존 production concurrency와 migration barrier를 따른다.

## Open Questions

없음.
