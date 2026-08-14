## Why

Production build와 배포가 GitHub Release 발행, 별도 deploy workflow와 tag 형식 검증으로 나뉘어 실제 필요한 경로보다 복잡하다. Git tag가 가리키는 commit을 build한 workflow가 그 결과 digest를 production 승인 뒤 그대로 migration과 모든 활성화 workload에 전달하면 별도 release 객체나 selector 없이 같은 identity를 보장할 수 있다.

## What Changes

- 모든 Git tag push에서 production image를 build한다. SemVer 또는 다른 tag 이름 규칙을 두지 않는다.
- Tag build job이 만든 digest를 같은 workflow의 production 승인 job으로 직접 전달한다.
- Production 승인 뒤 같은 digest를 migration Job과 모든 활성화 workload에 설정하고 Argo CD sync를 실행한다.
- 기반 리소스 적용 뒤 Sync wave 1 migration을 성공시키고 wave 2에서 Argo CD와 workload controller의 기본 activation을 사용한다.
- GitHub Release, Release asset·attestation, `publish_release`, 별도 deploy workflow와 publish/resolve script를 제거한다.
- 실행 중인 production 배포는 보존하고 최신 pending tag가 이전 pending tag를 대체한다.
- 실패 시 pipeline이 ReplicaSet을 복구하지 않는다. Pipeline 도입 이후 실제 production에 배포된 호환 가능한 이전 release commit에 새 tag를 붙이면 같은 build·승인·배포 경로를 다시 실행한다.
- PROD-562 runtime, PROD-564 migration Job credential·실행 계약, 개별 destructive migration safety와 PROD-565 실제 첫 production 배포는 변경하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음.
- Linear Contract: PROD-563
- Linear Implementations: PROD-563
- Parent Context: PROD-545

## Capabilities

### New Capabilities

- `production-release`: Git tag build digest의 production 승인, migration 선행 sync, controller 기본 activation과 동일 경로 재배포 계약

### Modified Capabilities

- 없음.

## Impact

- Docker build workflow의 tag trigger와 production approval job
- Helm digest image reference와 production Rollout activation
- 기존 GitHub Release publish/resolve 및 별도 production deploy workflow 제거
- `kosmo-prod` Application의 release parameter seam과 PROD-564 migration-gated Sync Job 소비
