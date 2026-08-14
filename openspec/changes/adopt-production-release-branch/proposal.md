## Why

현재 Git tag는 production 배포 trigger·source selector와 사용자 표시 버전을 함께 소유하고, production image와 `main`의 Helm source가 결합될 수 있다. 실제 production source는 단일 `production` 브랜치로 단순화하고 version 표시 의존성은 이번 전환에서 제거해야 한다.

## What Changes

- 최신 실제 production release commit에서 장기 `production` 브랜치 하나를 시작하고 PR 기반으로 보호한다.
- Main의 승인된 변경과 필요한 선행 변경만 production 대상 PR로 반영한다.
- **BREAKING** Git tag push 기반 production build·배포와 별도 수동 승인을 제거하고, `production` 대상 PR merge를 사람의 승인으로 삼아 그 push SHA를 자동 build·배포한다.
- 기존 `버전: <tag>` UI는 주석 처리하고 표시 tag의 생성·공급·재활성화는 후속 범위로 미룬다. Tag push 자체에는 배포 시작·source 선택·승인 권한을 부여하지 않는다.
- Production image와 Argo CD Helm source를 workflow가 확인한 동일 production commit에 고정하고 migration/API/Web에 하나의 digest를 전달한다.
- Rollback은 과거 tag 재배포가 아니라 production revert PR을 merge해 새 배포로 수행한다.
- Dev의 main 배포와 기존 migration barrier는 유지한다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`. `docs/operations/production-release.md`, `docs/operations/production-migrations.md`, `docs/operations/openpanel.md`, `docs/operations/sentry.md`도 갱신한다.
- Linear Contract: `PROD-764`
- Linear Implementations: `PROD-764`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `production-release`: tag-triggered release를 production PR 승인·push 기반 자동 배포로 바꾸고 version 표시를 이번 전환에서 보류한다.

## Impact

- `.github/workflows/docker-build.yml`: production push trigger, 환경별 build와 배포 감사
- `apps/terraform/argocd.tf`, `apps/terraform/ecr.tf`: production source와 release overlay 소유권, tag ref credential trust 제거
- Vault GitHub Actions role: tag ref가 아닌 승인된 production workflow identity 허용
- `apps/app/src/components/shell/RightRail.tsx`: 기존 version label 주석 처리
- `docs/design/breakpoints.md`: full Web footer의 version label 일시 비활성화
- GitHub repository: `production` 브랜치와 PR 기반 protection/ruleset
- Production release, migration, OpenPanel과 Sentry 운영 문서
