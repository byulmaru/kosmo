## Context

현재 `apps/terraform/argocd.tf`의 `kosmo` ApplicationSet은 `kosmo-dev`만 생성하며 dev namespace, `dev.kos.moe`/`dev-api.kos.moe`와 `main` image version을 inline Helm 값으로 전달하고 automated sync, prune와 self-heal을 사용한다. Helm chart는 API/Web Rollout·Service·HTTPRoute, CloudNativePG Cluster와 하나의 환경별 Vault Secrets Operator projection을 렌더하고, database migration Job만 dev에서 렌더한다. API와 Web 및 dev migration Job의 `DATABASE_URL`은 모두 CloudNativePG가 bootstrap owner용으로 생성한 같은 `-app` Secret과 read-write Service를 사용한다.

PROD-546의 선행 구현으로 prod render에는 Barman Cloud ObjectStore, backup ServiceAccount, WAL archiver와 ScheduledBackup이 이미 존재하지만 이를 실행할 `kosmo-prod` Application과 namespace는 없다. Kubernetes platform은 `gateway/public`에서 `kos.moe`와 `*.kos.moe` TLS를 종료하고, Argo Rollouts, Gateway API, cert-manager, CloudNativePG 1.30, Barman Cloud plugin, Vault Secrets Operator와 EKS Pod Identity를 제공한다. 이 change는 해당 cluster-wide 기반을 재구현하지 않고 준비 상태를 확인해 소비한다.

PROD-562는 작은 독립 계약으로 `production-runtime` capability, 구현, 검증과 archive를 직접 소유한다. 정식 release version을 선택·승인·rollback하는 workflow는 PROD-563, production migration 실행과 contract gate는 PROD-564, 실제 public 사용자 journey와 첫 release 통합 검증은 PROD-565가 소유한다.

## Goals / Non-Goals

**Goals:**

- dev와 격리된 `kosmo-prod` Application, namespace와 production Helm 입력을 선언한다.
- Production automated sync, prune와 self-heal을 유지하되 workload image는 선언에 명시된 non-`main` version으로 고정한다.
- `kos.moe` Web과 `api.kos.moe` API route를 기존 public Gateway/TLS 경계에 연결한다.
- Production CloudNativePG를 primary 1개와 standby replica 2개, 총 3 instances로 구성하고 기존 persistent storage와 backup 선언을 연결한다.
- API/Web database traffic은 기존 read-write Service에 유지한다.
- Production runtime 환경값은 Vault `kubernetes/kosmo/prod`에서 동기화하고 `/prod/runtime` 하위 path를 만들지 않는다.
- Runtime DB identity와 다른 migration 전용 DB login identity 및 basic-auth credential Secret을 선언형으로 프로비저닝한다.
- Migration DB Secret은 database 인증 정보만 포함하고 API/Web에 주입하지 않는다.
- dev/prod render, admission dry-run, Application automated sync와 runtime readiness를 검증한다.
- PROD-546의 live backup/restore 검증이 사용할 production Cluster를 제공한다.

**Non-Goals:**

- PROD-563의 SemVer release 선택, production 승인, 배포 workflow와 rollback 자동화.
- PROD-564의 migration DB Secret consumer, production migration Job, 단계별 migration 실행 및 contract gate.
- API/Web query를 CloudNativePG read-only Service로 분기하는 application read-routing.
- PROD-565의 로그인·피드·게시 등 public 사용자 경로 smoke, Sentry 확인과 첫 release 통합 판정.
- S3/IAM/Barman plugin 재구현, standalone/cross-cluster replica 또는 총 3 instances를 넘는 추가 failover topology와 새로운 cluster-wide add-on 설치.

## Implementation Guidance

### Current Constraints

- ApplicationSet의 단일 template은 dev의 automated sync, prune와 self-heal을 모든 element에 동일하게 적용한다. Production도 이 동작을 유지하되 `main` 같은 mutable operational tag가 아니라 명시적으로 고정된 image version을 받아야 한다.
- 현재 Docker workflow는 branch와 `main` build에 `EXPO_PUBLIC_ENVIRONMENT=dev`와 dev Vault의 browser Sentry DSN을 bake하고, production build는 정식 SemVer Git tag에서만 만든다. 첫 release 전에는 production-built image가 없는 것이 의도된 상태이므로 Application은 `0.0.0` bootstrap version을 명시하고, PROD-563이 정식 image version을 제공하기 전까지 workload readiness를 완료로 기록하지 않는다.
- `apps/helm/values.yaml`은 `env`, `image`, `version`만 제공한다. Production의 public hostname과 고정 image version을 명시적으로 검토할 환경별 값 경계가 없다.
- 기존 Vault manifest는 `kubernetes/kosmo/<env>` 하나를 `env` Secret으로 투영하고 API/Web 모두에 주입한다. Production runtime은 이 구조를 `kubernetes/kosmo/prod`에 그대로 사용해야 하며 `/prod/runtime`으로 옮기지 않는다.
- 2026-07-30 live key-only 확인에서 `kubernetes/kosmo/prod`에는 Sentry와 Slack key만 존재하고 API에 필요한 public origin, OIDC와 media runtime key가 없었다. 이 change는 해당 path를 소비하는 선언을 구현하되 값을 복제하거나 임의 생성하지 않으며, 필수 key가 준비되기 전까지 workload readiness를 완료로 기록하지 않는다.
- 현재 CloudNativePG bootstrap owner `kosmo`와 `-app` Secret을 API/Web 및 dev migration이 공유한다. Production migration credential 경계를 분리하려면 runtime 환경값을 복제하지 않는 basic-auth Secret과 별도 PostgreSQL login identity가 필요하다.
- CloudNativePG 1.30은 `DatabaseRole`과 `passwordSecret`으로 별도 login role과 password를 선언형으로 조정할 수 있다. 참조 Secret은 `kubernetes.io/basic-auth` type과 `cnpg.io/reload: "true"` label을 사용해야 password 변경이 즉시 적용된다.
- `gateway/public`이 이미 `kos.moe`와 `*.kos.moe` 인증서를 소유하므로 Kosmo chart가 Certificate나 DNS provider credential을 다시 만들면 ownership이 겹친다.
- Prod backup manifest는 `env=prod` 조건에 연결되어 있다. Production Cluster를 추가할 때 이 선언을 우회하거나 별도 Cluster를 중복 생성하면 PROD-546의 검증 대상이 달라진다.
- CloudNativePG의 `instances`는 primary를 포함한다. `instances: 3`은 primary 1개와 standby replica 2개이며 기본 `-ro` Service가 생기지만 현재 application은 `-rw`만 사용한다.

### Recommended Approach

1. Review 가능한 production values에 `env=prod`, Web/API hostname과 명시적인 image version을 둔다. 첫 release 전에는 의도적으로 존재하지 않는 `0.0.0` bootstrap version을 사용한다. Version 형식과 release 선택 정책은 PROD-563에 남긴다.
2. `apps/terraform/argocd.tf`가 별도 `kosmo-prod` Application과 `kosmo-prod` destination namespace를 선언하게 한다. 기존 dev ApplicationSet lifecycle은 바꾸지 않고 production Application은 `cascade=false`로 제거 시 resource를 보존한다. Automated sync, prune와 self-heal을 유지하고 image version 변경은 Git의 명시적인 Application 선언 변경으로만 일어나게 한다.
3. Web은 `kos.moe`, API는 `api.kos.moe`를 사용하고 기존 HTTPRoute가 `gateway/public`을 참조하게 한다. Certificate, ClusterIssuer, Cloudflare credential과 public Gateway는 Kubernetes platform 소유로 유지한다.
4. 기존 CloudNativePG Cluster template에서 dev는 1 instance, prod는 3 instances를 렌더한다. 기존 10Gi per-instance storage와 prod backup 조건을 재사용하고 API/Web `DATABASE_URL`은 `-rw` Service에 유지한다.
5. 기존 환경별 Vault projection 구조를 재사용해 production runtime 환경값은 `kubernetes/kosmo/prod`에서 `env` Secret으로 동기화한다. 별도 migration VaultStaticSecret은 `kubernetes/kosmo/prod/migration`에서 database username/password만 `kubernetes.io/basic-auth` Secret으로 투영한다.
6. CloudNativePG `DatabaseRole`로 별도 `kosmo_migration` login identity를 관리하고 migration basic-auth Secret을 `passwordSecret`으로 참조한다. 기존 `kosmo` database owner role membership을 상속해 현재 migration 권한을 유지하되, API/Web은 기존 `-app` runtime DB Secret을 계속 사용한다. Role reclaim은 `retain`으로 두고 DatabaseRole과 migration VaultStaticSecret의 prune에는 명시적 확인을 요구한다. 이 change는 credential/identity만 분리하며 runtime role의 privilege를 축소하지 않는다.
7. 기존 Helm lint/render를 통과시키고 production render를 검토한 다음 실제 cluster의 server-side dry-run으로 CRD/schema/admission 호환성을 확인한다. YAML 텍스트 marker 검사는 추가하지 않는다.
8. 구현 PR에서는 정적 검증과 Terraform plan까지 완료한다. 실제 적용은 필수 add-on, public Gateway/TLS, 두 production Vault path 및 production-built image가 준비된 시점에 수행하고, Application automated sync로 `kosmo-prod`를 조정한 뒤 CNPG/DatabaseRole/VSO/Rollout/Service/HTTPRoute readiness까지만 증거로 남긴다.

### Allowed Alternatives

- Production 값을 별도 values 파일 대신 Application의 구조화된 Helm values로 전달할 수 있다. 다만 dev/prod 차이와 pinned version이 한곳에서 명시적으로 검토 가능하고 render test가 같은 격리를 증명해야 한다.
- ApplicationSet element 또는 별도 Terraform `argocd_application` resource를 사용할 수 있다. 어느 방식이든 `kosmo-prod`가 automated sync, prune와 self-heal을 유지하고 image version은 명시적인 Git 변경으로만 바뀌어야 한다. 이 구현은 dev 삭제 lifecycle을 바꾸지 않고 production resource 보존 경계를 독립시키기 위해 별도 Application을 사용한다.
- Admission 검증은 `kubectl apply --server-side --dry-run=server` 또는 동일한 API-server admission 경로를 통과하는 도구를 사용할 수 있다.

### Known Traps

- Production image에 `main`이나 자동 이동하는 `stable` tag를 넣지 않는다. Automated sync와 mutable image tracking을 혼동하지 않는다. `0.0.0`은 첫 release 전 bootstrap sentinel이며 Ready image로 간주하지 않는다.
- `main`에서 만든 `sha-*` image를 tag만 고정됐다는 이유로 production-built artifact로 간주하지 않는다.
- 필수 runtime key가 없는 production Vault path로 API/Web을 먼저 활성화하지 않는다.
- Kosmo chart에서 `Certificate`, `ClusterIssuer`, public Gateway 또는 Cloudflare secret을 만들지 않는다.
- Migration projection에 API/Web runtime 환경값 전체를 복제하지 않는다. Database username/password만 basic-auth Secret으로 동기화한다.
- Migration DB Secret을 API/Web에 주입하거나 PROD-562에서 production migration Job에 연결하지 않는다.
- Production migration Job을 임시로 활성화해 database readiness를 확인하지 않는다. PROD-564 전에는 production render에 migration Job이 없어야 한다.
- `instances: 3`만으로 API/Web read query가 replica로 분산된다고 가정하지 않는다. Application 연결은 `-rw`에 유지한다.
- Backup readiness를 manifest 존재만으로 PROD-546의 실제 backup/restore 성공으로 간주하지 않는다.
- HTTP 200 수준의 public smoke를 PROD-562 완료 증거로 확장하지 않는다. Route/TLS/controller 상태 확인까지만 이 change가 소유한다.

## Risks / Trade-offs

- [Automated sync가 Git의 production manifest 변경을 즉시 반영한다] → Workload image version은 immutable하고 명시적인 값으로 유지하며 정식 version 선택·승인과 rollback workflow는 PROD-563에서 제공한다.
- [Application 생성 즉시 불완전한 secret이나 add-on 때문에 sync가 실패할 수 있다] → Production Vault path와 필수 add-on/Gateway/TLS 상태를 사전 점검하고 server-side dry-run 뒤 Terraform을 적용한다.
- [Migration DatabaseRole이 runtime owner membership을 상속하므로 privilege 자체는 분리되지 않는다] → 이번 계약을 credential/identity 분리로 한정하고 runtime least-privilege 전환은 별도 database authorization 계약 없이 선제 도입하지 않는다.
- [Migration password Secret 형식이나 rotation이 잘못되면 role reconciliation이 실패한다] → basic-auth type, reload label, username 일치와 DatabaseRole status를 render/live 검증한다.
- [세 PostgreSQL instance가 storage와 compute 비용을 늘린다] → Production HA를 위해 primary 1개와 standby 2개를 명시적으로 유지하고 read-routing이나 추가 topology는 포함하지 않는다.
- [비동기 standby는 primary보다 늦을 수 있다] → 이번 change에서는 application을 `-rw`에 유지해 read-after-write 의미를 바꾸지 않는다.
- [Route controller 정상 상태가 실제 사용자 journey 성공을 보장하지 않는다] → 이 change는 infra readiness만 증명하고 public origin smoke는 PROD-565에서 수행한다.

## Migration Plan

1. Helm dev/prod lint와 render를 통과시키고 기존 dev 동작과 backup 계약이 보존됨을 확인한다.
2. Platform의 Argo Rollouts, Gateway/TLS, CNPG/Barman, VSO와 Pod Identity 준비 상태 및 runtime/migration production Vault path 존재를 확인한다.
3. Production manifest를 API server에 server-side dry-run해 CRD, schema와 admission을 검증한다.
4. `apps/terraform` plan에서 `kosmo-prod` Application 추가 외의 의도하지 않은 변경이 없는지 검토한다. Production-built image와 필수 runtime key가 준비되기 전에는 적용 및 workload readiness를 완료로 기록하지 않는다.
5. 적용 시 Application automated sync로 `kosmo-prod`가 조정되는지 확인하고 CNPG 3 instances/PVC, Vault runtime projection, migration basic-auth Secret/DatabaseRole, API/Web Rollout·Service와 HTTPRoute 상태를 확인한다.
6. API/Web database endpoint와 credential이 기존 runtime `-rw`/`-app` 경계에 유지되고 migration Secret을 참조하지 않는지 확인한 뒤 PROD-546에 production Cluster 준비 사실을 전달한다.

Rollback은 Git의 `kosmo-prod` 선언 변경을 되돌려 automated sync가 이전 선언으로 수렴하게 한다. PVC나 production database를 자동 삭제하지 않으며 backup 연결이 활성화된 뒤에는 backup 연속성과 보존을 확인하지 않고 Cluster/PVC/ObjectStore를 제거하지 않는다.

## Open Questions

- 없음.
