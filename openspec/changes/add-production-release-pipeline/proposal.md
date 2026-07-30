## Why

정식 SemVer tag는 production 설정을 포함한 image를 발행하지만, 운영자가 그 artifact의 immutable identity를 승인해 migration과 API·Web에 일관되게 전달하고 실패 시 이전 release를 재선택하는 production 배포 계약은 없다. Mutable tag나 dev의 자동 restart를 production에 재사용하지 않고, 승인·실패 차단·재실행·application rollback을 하나의 재현 가능한 pipeline으로 제공해야 한다.

## What Changes

- 정식 SemVer image build가 성공하면 digest reference를 GitHub Release asset으로 고정하고, immutable하게 발행된 SemVer GitHub Release tag를 하나의 production release selector로 검증·선택한다.
- GitHub `production` environment의 명시적 승인과 production 전용 권한 경계를 통과한 실행만 `kosmo-prod` 배포를 변경할 수 있게 한다.
- migration Job과 API·Web Rollout에 같은 digest-pinned image를 전달하고, migration 성공과 두 preview workload의 준비가 확인되기 전에는 새 release를 활성화하지 않는다.
- 같은 immutable GitHub Release tag를 다시 선택하면 고정된 같은 digest로 release를 재실행하고, 이전 정상 Release tag를 같은 pipeline에 입력해 application rollback을 수행한다.
- workflow 입력·승인·선택한 identity·결과를 GitHub Actions와 Argo CD 기록에서 감사할 수 있게 하고, manifest·workflow·실패 경로 검증을 추가한다.
- PROD-562의 production Application/runtime resource, PROD-564의 migration 단계·contract gate, PROD-565의 실제 첫 release와 public smoke는 변경하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음.
- Linear Contract: PROD-563
- Linear Implementations: PROD-563
- Parent Context: PROD-545

## Capabilities

### New Capabilities

- `production-release`: 정식 SemVer artifact의 immutable identity 선택, production 승인, migration 선행 배포, API·Web 동시 활성화 차단, 재실행과 application rollback 계약

### Modified Capabilities

- 없음.

## Impact

- GitHub immutable releases 설정, Docker build의 immutable Release 발행과 production deployment workflow
- GitHub `production` Environment 설정과 Argo CD 배포 권한
- Helm image reference, production Rollout 승격 설정과 manifest render 검증
- `kosmo-prod` Application이 제공하는 release parameter seam 및 PROD-564가 제공하는 migration 성공 신호를 소비한다.
- production resource 생성, migration policy/credential, DB rollback, public-origin smoke와 실제 첫 release 실행에는 영향이 없다.
