## MODIFIED Requirements

### Requirement: role별 VaultStaticSecret이 legacy와 runtime password source를 소유한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-712`, `PROD-780`, `PROD-781`, `PROD-782`. 모든 Helm 배포 환경은 기존 `api-database`와 `worker-database` VaultStaticSecret을 유지하고, `runtime-database` VaultStaticSecret을 provision해야 한다(MUST). runtime source는 `kubernetes/kosmo/<env>/runtime-database` release-derived static KV path를 사용하고(MUST), destination은 `kosmo_runtime` username/password를 포함하는 Kubernetes basic-auth Secret이어야 한다(MUST). 별도 migration-database VaultStaticSecret 또는 `kosmo_migration` password destination을 provision해서는 안 된다(MUST NOT).

#### Scenario: Legacy와 runtime VSO destination을 렌더함

- **WHEN** dev 또는 prod Helm release를 렌더한다
- **THEN** api-database, worker-database와 runtime-database VaultStaticSecret 및 release-derived destination이 나타나야 한다
- **AND** runtime source path에는 환경 segment와 `runtime-database`가 포함되고 destination type은 `kubernetes.io/basic-auth`여야 하며 transformation은 username과 password만 포함해야 한다
- **AND** `cnpg.io/reload: "true"` label과 정적 refresh 경계를 유지해야 한다
- **AND** migration-database VaultStaticSecret과 `<release>-postgres-migration` destination은 나타나서는 안 된다

#### Scenario: Owner·runtime·queue credential을 혼합하지 않음

- **WHEN** role별 source를 공용 env, CNPG-generated application-user와 Fedify queue manifest와 비교한다
- **THEN** 공용 env, runtime과 Fedify queue Secret은 각 기존 책임을 유지해야 한다
- **AND** migration Job만 CNPG-generated application-user Secret을 사용하고 API/Web/Worker/Fedify application workload는 shared runtime destination을 사용해야 한다
- **AND** Legacy API/Worker Secret provisioning은 유지되고 Vault password value는 values/rendered manifest/OpenSpec/log에 나타나지 않아야 한다
