## Why

현재 main은 `PROD-891`의 배포 채널별 공개 설정을 사용하므로 Web image를 환경별 공개 설정으로 다시 build할 필요가 없다. Dev는 mutable `:main` tag를 사용하고 Production은 승인 뒤 같은 SHA를 다시 build하므로, 배포 시점에 GHCR에서 확인하는 image digest를 명시적으로 고정하지 못한다.

## What Changes

- Main `Docker Build`가 현재 단일 Kosmo runtime image를 한 번 build·push하고 `sha-<full 40-character Git SHA>` tag를 게시한다.
- Dev는 triggering Docker Build의 `head_sha`로 SHA tag를 구성하고 GHCR에서 현재 digest를 조회·검증해 Argo CD `imageDigest` parameter로 전달한다.
- Production preflight는 target SHA의 성공한 main push Docker Build run을 확인한 뒤 GHCR의 해당 SHA tag digest를 승인 전에 조회·검증·고정한다.
- **BREAKING** `prod` Environment 승인 뒤 production image를 다시 build·push하거나 tag/digest를 재조회하지 않고 preflight가 고정한 SHA와 digest만 배포한다.
- Sentry release와 source map은 canonical build에서 `kosmo@<full SHA>`로 한 번 생성·업로드한다.
- SHA tag는 재빌드로 덮어쓸 수 있으며 Dev와 Production이 다른 시점에 조회한 digest가 달라질 수 있다. 태그 불변성 강제와 Dev의 실제 digest 비교는 범위에 포함하지 않는다.
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

- `production-release`: Dev와 Production이 SHA tag에서 조회한 digest를 사용하고, Production은 승인 전에 그 digest를 고정하도록 release 계약을 변경한다.

## Impact

- `.github/workflows/docker-build.yml`, `.github/workflows/deploy-dev.yml`, `.github/workflows/production-release.yml`, `.github/workflows/trivy-scan.yml`
- `scripts`의 workflow 정적 검증과 root test entrypoint
- `docs/operations/production-release.md`, `docs/operations/production-migrations.md`, `docs/operations/sentry.md`
- `apps/terraform/README.md`
- 기존 `imageDigest` Helm contract를 소비하는 Web, API, Admin, Worker, Fedify Consumer와 migration
