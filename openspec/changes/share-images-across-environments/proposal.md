## Why

현재 main은 `PROD-891`의 배포 채널별 공개 설정을 사용하므로 Web image를 환경별 공개 설정으로 다시 build할 필요가 없다. 그러나 Dev는 mutable `:main` tag를 사용하고 Production은 승인 뒤 같은 SHA를 다시 build하므로, dev에서 검증한 image와 production image의 exact artifact identity가 다르다.

## What Changes

- Main `Docker Build`가 현재 단일 Kosmo runtime image를 한 번 build·push하고 exact digest manifest artifact를 게시한다.
- Dev는 triggering Docker Build run의 digest를 검증해 Argo CD `imageDigest` parameter로 전달한다.
- Production preflight는 target SHA의 성공한 main Docker Build run과 digest manifest를 승인 전에 검증·고정한다.
- **BREAKING** `prod` Environment 승인 뒤 production image를 다시 build·push하지 않고 preflight가 고정한 exact digest만 배포한다.
- Sentry release와 source map은 canonical build에서 `kosmo@<full SHA>`로 한 번 생성·업로드한다.
- `ENVIRONMENT`, server Secret과 `/channel.js` 기반 공개 설정 선택은 현재 runtime 경계를 유지한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain`·`docs/design` 문서 없음. Application domain과 UI design은 변경하지 않는다.
- Linear Contract: [PROD-833](https://linear.app/byulmaru/issue/PROD-833)
- Related Contract: [PROD-891](https://linear.app/byulmaru/issue/PROD-891)의 channel-selected public config를 유지하고, [PROD-783](https://linear.app/byulmaru/issue/PROD-783)의 production 재build 결정만 대체한다.
- Linear Implementation: PROD-833

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `production-release`: dev와 production이 같은 main Docker Build run의 단일 Kosmo image digest를 소비하도록 release 계약을 변경한다.

## Impact

- `.github/workflows/docker-build.yml`, `.github/workflows/deploy-dev.yml`, `.github/workflows/production-release.yml`, `.github/workflows/trivy-scan.yml`
- `scripts`의 workflow 정적 검증과 root test entrypoint
- `docs/operations/production-release.md`, `docs/operations/production-migrations.md`, `docs/operations/sentry.md`
- 기존 `imageDigest` Helm contract를 소비하는 Web, API, Admin, Worker, Fedify Consumer와 migration
