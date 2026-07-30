## Why

Kosmo의 ApplicationSet은 dev 환경만 선언하고 있어 API, Web, PostgreSQL을 dev와 분리된 production namespace, domain, secret, storage 경계에서 실행할 수 없다. PROD-562는 release·migration·첫 출시 검증과 분리해 `kosmo-prod`의 선언형 runtime 기반을 먼저 제공하고, PROD-546의 실제 backup/restore 검증이 사용할 production Cluster를 연다.

## What Changes

- dev와 독립된 `kosmo-prod` Argo CD Application과 `kosmo-prod` namespace를 선언한다.
- production 전용 Helm values에서 Web/API hostname, environment, runtime secret reference, 총 3 instances의 PostgreSQL/storage와 backup 연결을 구성한다.
- API와 Web Service·HTTPRoute를 production public gateway의 `kos.moe` TLS 경계에 연결한다.
- production runtime 환경값은 dev와 분리된 Vault `kubernetes/kosmo/prod` path에서 동기화하고 `/prod/runtime` path를 만들지 않는다.
- Runtime DB identity와 분리된 migration 전용 DB identity 및 credential Secret을 프로비저닝하되 migration Secret에는 database 인증 정보만 담는다.
- `kosmo-prod`는 automated sync를 항상 유지하되 workload image는 mutable tag를 추적하지 않고 명시적인 non-`main` version으로 고정한다.
- CloudNativePG, Barman Cloud plugin, Vault Secrets Operator, Argo Rollouts, Gateway API와 public Gateway 등 선행 add-on의 준비 상태를 확인하고 workload readiness까지 검증한다.
- dev render에 production resource, secret path, backup 설정 또는 production image policy가 섞이지 않음을 검증한다.
- 정식 release workflow, migration/contract gate, public 사용자 경로 smoke와 첫 release 통합 검증은 추가하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음.
- Linear Contract: `PROD-562`
- Linear Implementations: 없음. `PROD-562`가 OpenSpec, 구현, 검증과 archive를 함께 소유한다.

## Capabilities

### New Capabilities

- `production-runtime`: dev와 격리된 production Application, namespace, automated sync와 고정 image version, public routing/TLS, 총 3 instances의 PostgreSQL/storage, Vault runtime 환경값, 분리된 migration DB identity/Secret과 readiness 계약.

### Modified Capabilities

없음.

## Impact

- `apps/terraform/argocd.tf`: dev ApplicationSet과 lifecycle을 분리한 `kosmo-prod` Application 및 production Helm input.
- `apps/helm`: prod values, 환경별 render 경계, production runtime 환경값 projection, migration DB identity/credential, route와 workload/database 구성.
- Helm render/admission 검증: dev/prod 격리와 production runtime manifest 확인.
- EKS add-on 경계: Argo CD/Rollouts, Gateway API와 `gateway/public`, cert-manager TLS, CloudNativePG/Barman plugin, Vault Secrets Operator, EKS Pod Identity.
- 후속 관계: production Cluster가 준비되면 `PROD-546`의 live backup/restore 검증이 진행될 수 있다. `PROD-563`, `PROD-564`, `PROD-565`의 계약이나 구현은 변경하지 않는다.
