## 1. PROD-562 Production runtime

**Authority / Provenance**

- `PROD-562`
- `PROD-546` — 기존 backup 선언의 production Cluster 연결과 후속 live 검증 dependency에 한함

**Deliverable**

Argo CD가 dev와 격리된 `kosmo-prod` Application을 자동 동기화하고, 유효한 immutable release image가 지정되면 application workloads를 함께 render한다. 총 3 instances의 PostgreSQL, backup, runtime Vault 환경값과 분리된 migration DB identity/credential 기반이 Ready가 되어 PROD-545가 PROD-546 live restore rehearsal을 시작할 수 있다.

**Guardrails**

- Production Web은 `kos.moe`, API는 `api.kos.moe`를 사용하고 기존 `gateway/public` TLS 경계를 소비한다. Kosmo change가 Gateway, Certificate, ClusterIssuer 또는 DNS credential을 만들지 않는다.
- Production runtime 환경값은 기존 환경별 Vault projection에 따라 `kubernetes/kosmo/prod`에서 동기화하며 `/prod/runtime` path를 만들지 않는다. Migration DB credential은 `kubernetes/kosmo/prod/migration`에서 username/password만 별도 basic-auth Secret으로 동기화하고 API/Web runtime 환경값 전체를 복제하지 않는다. 어떤 secret value도 repository, Terraform input/state 또는 rendered manifest에 넣지 않는다.
- 별도 `kosmo_migration` DB login identity를 선언하고 migration credential과 연결한다. API/Web은 기존 runtime `-app` Secret만 사용하며 migration Secret을 참조하지 않는다.
- `kosmo-prod`는 automated sync, prune와 self-heal을 유지하고 유효한 immutable release image에서 application workloads를 render한다. 이 change는 release 선택·승인 workflow를 구현하지 않고, PROD-545가 설정한 release parameter를 이후 Terraform 적용에서 보존한다. 별도 workload activation key는 사용하지 않는다.
- Production CloudNativePG는 primary 1개와 standby replica 2개, 총 3 instances 및 기존 10Gi per-instance storage를 사용한다. 기존 prod backup ServiceAccount/ObjectStore/Barman WAL/ScheduledBackup을 재사용하고 S3/IAM/plugin과 backup policy를 변경하지 않는다.
- API/Web은 기존 read-write Service를 유지한다. Application read-routing, standalone/cross-cluster replica와 추가 failover topology를 구현하지 않는다.
- PROD-562는 migration DB identity/credential 기반까지만 프로비저닝한다. Production migration Job, 이 credential의 consumer wiring, 실행 순서와 contract gate 및 public 사용자 journey smoke를 추가하지 않는다.

**Verification**

- Dev/prod Helm lint/render와 admission dry-run으로 environment, hostname, 명시적인 image version, runtime/migration Vault path와 Secret type, `DatabaseRole`, prod 3 instances, backup 연결, API/Web credential 격리와 migration Job/read-routing 비렌더를 검증한다.
- Production manifest의 server-side admission dry-run과 Terraform saved plan을 검토한다.
- 필수 add-on, public Gateway/TLS, production runtime/migration Vault path와 Pod Identity 준비 상태를 확인한 뒤 Application automated sync 상태를 확인한다.
- CloudNativePG 3 Pods/PVC, 두 VSO projection, migration basic-auth Secret과 `DatabaseRole`, API/Web Rollout·Service와 HTTPRoute Accepted/ResolvedRefs/readiness를 확인하고 API/Web database endpoint/credential이 `-rw`/`-app` 경계에 유지됨을 기록한다. Secret value는 읽거나 기록하지 않는다.

- [x] 1.1 Production values와 runtime Vault projection을 추가해 environment, public hostname, pinned image version과 dev secret 격리를 구현한다.
- [x] 1.2 Migration DB username/password만 투영하는 production basic-auth Secret과 별도 `kosmo_migration` `DatabaseRole`을 선언하고 API/Web runtime credential과 격리한다.
- [x] 1.3 `kosmo-prod` Application과 namespace를 선언형으로 추가하고 automated sync, prune와 self-heal을 유지하면서 mutable image tag 추적을 차단한다.
- [x] 1.4 Production CloudNativePG를 총 3 instances로 구성하고 기존 storage/backup 선언에 연결하되 API/Web read-write endpoint를 유지한다.
- [x] 1.5 Dev/prod Helm lint/render와 admission dry-run으로 production runtime 요구사항 및 명시적 제외 범위를 확인한다.
- [x] 1.6 OpenSpec strict validation, Helm lint/render와 repository 정적 검증을 통과시킨다.
- [x] 1.7 Cluster-wide add-on, public Gateway/TLS, production runtime/migration Vault path와 Pod Identity의 live 선행 조건을 확인하고 production manifest의 server-side admission dry-run을 통과시킨다.
- [x] 1.8 Terraform이 bootstrap values와 Application 구조를 소유하되 PROD-545 release workflow의 Helm parameter overlay를 이후 reconciliation에서 보존하도록 lifecycle 경계를 선언하고 provider schema 및 정적 검증을 통과시킨다.
- [ ] 1.9 Terraform saved plan을 검토하고 `kosmo-prod` Application의 release parameter 보존과 workload render 전제를 확인한다. Production apply/sync는 별도 승인 없이는 수행하지 않는다.
- [ ] 1.10 PostgreSQL 3 Pods/PVC, runtime projection, migration basic-auth Secret/`DatabaseRole` readiness를 확인하고 민감 정보 없이 PROD-545에 증거를 기록한다.
- [ ] 1.11 Production Cluster 준비 사실을 PROD-546 restore rehearsal 흐름에 전달하고, workload 활성화·public smoke·첫 release가 PROD-545에 남아 있음을 최종 대조한다.
- [ ] 1.12 모든 구현·live 검증과 정합성 확인 뒤 `production-runtime` spec을 archive하고 archive 후 validation을 통과시킨다.
