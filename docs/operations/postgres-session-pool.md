# PostgreSQL PgBouncer session pool 운영

## 운영 경계

이 문서는 CloudNativePG가 생성한 read-write PgBouncer Pooler를 기존 PostgreSQL Cluster 옆에 배포하고 확인하는 절차를 정의한다.

- Pooler 이름은 `<release>-postgres-pooler-rw`이고 Cluster 이름은 `<release>-postgres`이다.
- Pooler Service의 기본 client port는 `5432`이며, 기존 `<release>-postgres-rw` Service와 별개다.
- API Rollout의 `DATABASE_URL`은 현재 request/auth/startup 경계로서 기존 `<release>-postgres-rw` direct Service를 유지하고, GraphQL operation session 전용 `OPERATION_DATABASE_URL`만 `<release>-postgres-pooler-rw`를 사용한다. 이는 현재 배포 baseline이지 향후 GraphQL principal 방향이 아니다. PROD-715에서 chart는 Web과 기존 `worker.enabled` gate가 켜진 Temporal Worker의 기본 `DATABASE_URL`도 기존 direct read-write Service의 고정된 `kosmo_worker`/`kosmo` source로 생성하며, values selector나 별도 `WORKER_DATABASE_*` application connection을 두지 않는다. Worker 기본값은 disabled이고, 명시적으로 enabled된 template에만 Worker source가 투영된다. PgBouncer는 GraphQL operation 전용이다. Migration workload의 direct endpoint와 `kosmo_fedify_queue` database는 유지한다. GraphQL principal 전환은 PROD-716이 소유하고, 취소된 client-certificate/direct-rw 대안 PROD-470은 재개하지 않는다.
- 기존 `postgres.credentials.api` atomic trio가 구성된 환경에서는 기존 API `DATABASE_URL` source/authority와 API-role Secret selector를 유지하고, operation URL의 host와 port를 포함한 authority만 in-chart `<release>-postgres-pooler-rw:5432`로 교체한다. Scheme, username, database, password Secret source, path와 query는 보존한다. Runtime operation client는 configured `OPERATION_DATABASE_URL`을 변경 없이 postgres.js에 전달하며, query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않는다. 따라서 구성된 URL은 Pooler와 호환되어야 하며 임의의 잘못된 URL은 지원하지 않는다. 이 change는 새 credential selector를 만들거나 trio를 설정·교체하지 않는다.
- CloudNativePG operator와 `Pooler` CRD가 대상 namespace에 먼저 설치되어 있어야 한다.
- 명령 출력에는 Secret 값, connection string, database row를 남기지 않는다. 검증 결과는 readiness, metric 이름과 비민감한 성공/실패만 기록한다.

## 2026-08-11 dev activation incident와 forward fix

Merge revision `de6034d3`를 dev에 배포한 뒤 Argo와 Rollout은 `Synced`/`Healthy`였지만, GraphQL operation client가 API direct DB client의 `connection` startup options(`idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout`)을 물려받아 PgBouncer가 지원하지 않는 옵션을 전달했다. 그 결과 operation 초기화가 거부되어 dev의 GraphQL Query/Mutation이 모두 HTTP 500으로 실패했다. 이 incident는 GraphQL operation Pooler 경계에 한정됐고, API request/startup의 기존 `DATABASE_URL` 경계, PROD-715 Web/Temporal Worker direct read-write Service, migration direct endpoint와 production image에는 영향이 확인되지 않았다.

사용자 결정은 전체 activation revert가 아닌 forward fix다. Forward fix는 다음 계약만 변경한다.

- direct `DATABASE_URL` client의 기존 server timeout startup 동작은 이 forward fix에서 변경하지 않는다. 이 legacy 동작과 그 값은 이 change의 범위 밖이다.
- operation Pooler client는 API direct DB client의 `connection` startup options를 상속하지 않는다. Fix는 operation client 생성 시 해당 options를 전달하지 않는 것이며, configured `OPERATION_DATABASE_URL`은 변경 없이 postgres.js에 전달한다. Runtime은 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않으므로, configured URL이 이미 Pooler와 호환되지 않으면 지원 대상이 아니다. 연결 대기는 별도 숫자를 선택하지 않고 postgres.js의 기본 bounded connection timeout 동작에 맡긴다.
- operation client가 실제 frontend connection을 만든 뒤 actor GUC만 하나의 initialization SQL round trip에서 session-level로 설정하고, 이 SQL이 성공하기 전에는 resolver를 실행하지 않는다.
- endpoint, 기존 API credential/Secret selector, Pooler CR, replica, resource와 capacity 설정은 변경하지 않는다. 이 forward fix는 PROD-715 Web/Worker direct credential source/cutover, PROD-716 GraphQL principal cutover나 PROD-728 Pooler resource lifecycle을 변경하지 않는다. Role/Secret provisioning, grant와 RLS policy는 각각의 별도 선행 issue 경계로 남긴다.

Forward fix release가 dev GraphQL smoke와 아래 startup-compatibility gate를 통과하기 전에는 PROD-726 live gate 완료로 처리하지 않는다.

## Render, endpoint assertion과 admission 확인

지원되는 환경별로 Pooler가 기존 Cluster를 참조하고 API의 operation endpoint만 GraphQL lifecycle에 사용되며 API, Web과 enabled Temporal Worker의 기본 direct endpoint 및 migration direct endpoint가 유지되는지 확인한다. PROD-715 Web/Worker는 Pooler를 사용하지 않으며 이 문서의 GraphQL operation gate와 별도로 direct `kosmo_worker` principal을 검증한다. Production render에는 실제 release digest를 사용한다. 아래 assertion은 connection string 전체를 출력하지 않고 endpoint authority(host와 port)와 Secret ref가 기대값인지 exit status로만 확인한다.

```sh
HELM="${HELM:-helm}"
DEV_RENDER="$(mktemp)"
PROD_RENDER="$(mktemp)"
CONFIGURED_RENDER="$(mktemp)"
trap 'rm -f "$DEV_RENDER" "$PROD_RENDER" "$CONFIGURED_RENDER"' EXIT

"$HELM" lint apps/helm --set env=dev
"$HELM" lint apps/helm \
  --set env=prod \
  --set imageDigest=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
  --set workloads.enabled=false

"$HELM" template kosmo apps/helm \
  --namespace kosmo-dev \
  --set env=dev >"$DEV_RENDER"

"$HELM" template kosmo apps/helm \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
  --set workloads.enabled=true \
  --set worker.enabled=true \
  --set migration.enabled=true >"$PROD_RENDER"

# A configured API trio keeps the credential/path/query source in rendered env
# while replacing the operation endpoint authority with the in-chart Pooler
# Service on port 5432. Runtime passes the configured operation URL unchanged;
# the configured URL must already be compatible with the Pooler.
"$HELM" template kosmo apps/helm \
  --namespace kosmo-dev \
  --set env=dev \
  --set-string 'postgres.credentials.api.databaseUrl=postgres://api:$(DATABASE_PASSWORD)@example.invalid:6543/kosmo?sslmode=prefer' \
  --set-string 'postgres.credentials.api.passwordSecret.name=kosmo-api-custom' \
  --set-string 'postgres.credentials.api.passwordSecret.key=password' >"$CONFIGURED_RENDER"

assert_database_host() {
  local render="$1" source="$2" env_name="$3" expected="$4"
  awk -v source="$source" -v env_name="$env_name" -v expected="$expected" '
    $0 == "# Source: kosmo-web/templates/" source { active = 1; next }
    active && /^# Source:/ { active = 0 }
    active && $0 ~ ("- name: " env_name "$") {
      getline
      if (index($0, expected) == 0) { bad = 1 }
      found = 1
    }
    END { exit (!found || bad) }
  ' "$render"
}

assert_env_absent() {
  local render="$1" source="$2" env_name="$3"
  awk -v source="$source" -v env_name="$env_name" '
    $0 == "# Source: kosmo-web/templates/" source { active = 1; next }
    active && /^# Source:/ { active = 0 }
    active && $0 ~ ("- name: " env_name "$") { found = 1 }
    END { exit found }
  ' "$render"
}

assert_source_absent() {
  local render="$1" source="$2"
  if rg -q "^# Source: kosmo-web/templates/${source}$" "$render"; then
    return 1
  fi
  return 0
}

assert_secret_ref() {
  local render="$1" source="$2" env_name="$3" expected_name="$4" expected_key="$5"
  awk -v source="$source" -v env_name="$env_name" -v expected_name="$expected_name" -v expected_key="$expected_key" '
    $0 == "# Source: kosmo-web/templates/" source { active = 1; next }
    active && /^# Source:/ { active = 0 }
    active && $0 ~ ("- name: " env_name "$") { password = 1; next }
    active && password && /name:/ {
      if (index($0, expected_name) == 0) { bad = 1 }
      password = 0; name_found = 1; next
    }
    active && /key:/ && name_found {
      if (index($0, expected_key) == 0) { bad = 1 }
      found = 1; name_found = 0
    }
    END { exit (!found || bad) }
  ' "$render"
}

assert_migration_host() {
  local render="$1" expected="$2"
  awk -v expected="$expected" '
    $0 == "# Source: kosmo-web/templates/database-migration-job.yaml" { active = 1; next }
    active && /^# Source:/ { active = 0 }
    active && /- name: PGHOST$/ {
      getline
      if (index($0, expected) == 0) { bad = 1 }
      found = 1
    }
    END { exit (!found || bad) }
  ' "$render"
}

assert_worker_restart_targets() {
  local render="$1" expected_worker="$2"
  awk -v expected_worker="$expected_worker" '
    $0 == "# Source: kosmo-web/templates/vaultstaticsecret.yaml" { source = 1; next }
    source && /^---$/ {
      if (worker_secret && web_target && (expected_worker == "true" ? worker_target : !worker_target)) { found = 1 }
      source = worker_secret = targets = web_target = worker_target = 0
    }
    source && /name: "worker-database"$/ { worker_secret = 1 }
    source && worker_secret && /rolloutRestartTargets:/ { targets = 1 }
    source && targets && /name: "[^"]+-web"$/ { web_target = 1 }
    source && targets && /name: "[^"]+-worker"$/ { worker_target = 1 }
    END {
      if (source && worker_secret && web_target && (expected_worker == "true" ? worker_target : !worker_target)) { found = 1 }
      exit !found
    }
  ' "$render"
}

for render in "$DEV_RENDER" "$PROD_RENDER"; do
  assert_database_host "$render" api/rollout.yaml DATABASE_URL 'kosmo-postgres-rw'
  assert_database_host "$render" api/rollout.yaml OPERATION_DATABASE_URL 'kosmo-postgres-pooler-rw:5432'
  assert_database_host "$render" web/rollout.yaml DATABASE_URL 'kosmo-postgres-rw:5432'

  # Default values keep the API-role Secret selector unchanged.
  assert_secret_ref "$render" api/rollout.yaml DATABASE_PASSWORD 'kosmo-postgres-app' 'password'
done

# The default Worker activation gate stays disabled. Its template and restart
# target appear only when the explicit worker.enabled override is supplied.
assert_source_absent "$DEV_RENDER" worker.yaml
assert_worker_restart_targets "$DEV_RENDER" false
assert_database_host "$PROD_RENDER" worker.yaml DATABASE_URL 'kosmo-postgres-rw:5432'
assert_secret_ref "$PROD_RENDER" worker.yaml DATABASE_PASSWORD 'kosmo-postgres-worker' 'password'
assert_worker_restart_targets "$PROD_RENDER" true

# Configured trio: direct API authority and Secret source remain unchanged;
# rendered operation authority is replaced with the Pooler Service and port
# 5432 while the database path/query stays intact. Runtime passes the
# configured operation URL unchanged; incompatible URL parameters are not
# silently corrected.
assert_database_host "$CONFIGURED_RENDER" api/rollout.yaml DATABASE_URL '@example.invalid:6543'
assert_database_host "$CONFIGURED_RENDER" api/rollout.yaml OPERATION_DATABASE_URL '@kosmo-postgres-pooler-rw:5432'
assert_database_host "$CONFIGURED_RENDER" api/rollout.yaml OPERATION_DATABASE_URL '/kosmo?sslmode=prefer'
assert_secret_ref "$CONFIGURED_RENDER" api/rollout.yaml DATABASE_PASSWORD 'kosmo-api-custom' 'password'

assert_secret_ref "$DEV_RENDER" database-migration-job.yaml DATABASE_PASSWORD 'kosmo-postgres-app' 'password'
assert_database_host "$DEV_RENDER" database-migration-job.yaml DATABASE_URL 'kosmo-postgres-rw'
assert_migration_host "$PROD_RENDER" 'kosmo-postgres-rw'
assert_secret_ref "$PROD_RENDER" database-migration-job.yaml PGUSER 'kosmo-postgres-migration' 'username'
assert_secret_ref "$PROD_RENDER" database-migration-job.yaml PGPASSWORD 'kosmo-postgres-migration' 'password'

rg -n 'kind: (Cluster|Pooler)|name: kosmo-postgres(-pooler-rw)?|poolMode:|server_reset_query|max_client_conn|default_pool_size|instances:' \
  "$DEV_RENDER" "$PROD_RENDER"
```

정적 결과에는 dev Pooler `instances: 1`, prod Pooler `instances: 3`, `type: rw`, `poolMode: session`, `server_reset_query: DISCARD ALL`, `max_client_conn: "1000"`, `default_pool_size: "10"`과 `pgbouncer` container의 resource request/limit가 나타나야 한다. API Rollout의 `OPERATION_DATABASE_URL`만 GraphQL operation lifecycle의 Pooler authority `<release>-postgres-pooler-rw:5432`를 사용하고 API `DATABASE_URL`, Web과 enabled Worker `DATABASE_URL`, migration은 각자 소유한 direct baseline을 유지해야 하며, API-role Secret name/key assertion은 activation 전과 동일해야 한다. 기본 `worker.enabled=false` render에서는 Worker resource와 Worker restart target이 없어야 하고, `worker.enabled=true` override render에서만 `kosmo_worker`와 기존 `<release>-postgres-rw` authority, Worker Secret ref와 Worker restart target이 나타나야 한다. Configured trio의 rendered env에서는 API direct URL의 authority와 operation URL의 scheme, username, database, password Secret source, path/query가 보존되고 operation authority만 Pooler `:5432`로 교체되는지 확인한다. Runtime operation client가 direct DB의 `connection` startup options를 상속하지 않고 configured operation URL을 변경 없이 전달하는지 확인하며, Pooler와 호환되지 않는 임의의 URL은 지원하지 않는다. `postgres-pooler.yaml`, `values.yaml`의 Pooler CR, replica, resource와 capacity 설정은 이 전환에서 수정하지 않는다.

CRD가 설치된 대상 cluster에서는 실제 변경 없이 server-side admission도 확인한다.

```sh
helm template kosmo apps/helm \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
  --set workloads.enabled=false \
  | kubectl apply --server-side --dry-run=server -f -
```

## Application activation과 operation session gate

Pooler admission과 readiness가 먼저 통과한 뒤 API Rollout의 `OPERATION_DATABASE_URL`만 GraphQL operation endpoint로 소비하도록 application release를 동기화한다. API request authentication·startup의 기존 `DATABASE_URL` 경계, PROD-715 Web과 enabled Worker의 direct read-write Service source와 migration direct endpoint도 이 change에서 유지한다. Worker activation은 기존 `worker.enabled` gate를 따르며, 이 문서는 Worker runtime registration/lifecycle을 검증하지 않는다. 실제 환경의 env를 확인할 때는 endpoint authority의 host와 port만 shell 변수로 비교하고 URL, Secret 값, actor UUID를 출력하거나 기록하지 않는다.

`worker-database` VaultStaticSecret destination이 갱신되면 SecretKeyRef를 env로 소비하는 Web Rollout은 재시작되어야 하며, Temporal Worker Deployment는 기존 `worker.enabled`가 켜진 render에서만 함께 재시작되어야 한다. 이 restart target은 PROD-715 workload wiring의 일부이며 GraphQL operation Pooler gate와 별개다. Runtime credential refresh, URL 감지 또는 compatibility flag를 추가하지 않는다. 정적 render와 비운영 preflight에서는 default render의 `worker-database`가 Web target만 갖고, `worker.enabled=true` override render에서 Web과 Worker target을 갖는지 확인하며, Secret 값은 출력하지 않는다.

```sh
set -eu

NAMESPACE=kosmo-dev
RELEASE=kosmo
POOLER="${RELEASE}-postgres-pooler-rw"
DIRECT="${RELEASE}-postgres-rw"

api_url="$(kubectl get rollout "${RELEASE}-api" -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].env[?(@.name=="DATABASE_URL")].value}')"
operation_url="$(kubectl get rollout "${RELEASE}-api" -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].env[?(@.name=="OPERATION_DATABASE_URL")].value}')"
case "$api_url" in *"@${DIRECT}:5432/"*) ;; *) exit 1 ;; esac
case "$operation_url" in *"@${POOLER}:5432/"*) ;; *) exit 1 ;; esac

kubectl wait --for=condition=Available "rollout/${RELEASE}-api" -n "$NAMESPACE" --timeout=5m

# Every Pod in the current rollout revision must be readable and must not emit
# a PgBouncer-unsupported startup-parameter error.
API_POD_HASH="$(kubectl get rollout "${RELEASE}-api" -n "$NAMESPACE" \
  -o jsonpath='{.status.currentPodHash}')"
test -n "$API_POD_HASH" || {
  echo "current-api-pod-hash-missing" >&2
  exit 1
}
API_PODS="$(kubectl get pod -n "$NAMESPACE" \
  -l "app.kubernetes.io/name=api,app.kubernetes.io/instance=${RELEASE},rollouts-pod-template-hash=${API_POD_HASH}" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')"
test -n "$API_PODS" || {
  echo "current-api-pods-missing" >&2
  exit 1
}

printf '%s\n' "$API_PODS" | while IFS= read -r API_POD; do
  if ! API_LOGS="$(kubectl logs "$API_POD" -n "$NAMESPACE" --since=10m 2>&1)"; then
    echo "current-api-pod-log-read-failed" >&2
    exit 1
  fi
  if printf '%s\n' "$API_LOGS" \
    | rg -i 'unsupported.*startup|startup.*parameter.*(unsupported|not supported)|idle_in_transaction_session_timeout.*(unsupported|not supported)' \
      >/dev/null; then
    echo "operation-startup-parameter-unsupported" >&2
    exit 1
  fi
done
```

API activation 후 일반 GraphQL Query/Mutation을 익명, Account-only, Account+Profile 세 경우로 실행해 다음을 비민감하게 확인한다. user-data query, domain action과 Mutation payload의 nested result projection은 operation `ctx.db`에서 실행되어야 하며, `searchProfiles`가 촉발하는 Fedify-owned remote actor materialization만 trusted direct side effect 예외로 둔다.

- 각 operation이 `OPERATION_DATABASE_URL`의 실제 Pooler frontend connection 하나를 만들고 같은 operation의 resolver·loader·core SQL이 같은 session을 사용한다.
- request authentication과 startup SQL은 API `DATABASE_URL` direct connection을 사용하며, `searchProfiles` materialization이 끝난 뒤의 최종 Profile query·result projection은 다시 operation `ctx.db`를 사용한다.
- `kosmo.account_id`와 `kosmo.profile_id`를 매 operation UUID 또는 빈 문자열로 설정하며, 설정 SQL이 실패하면 resolver SQL을 실행하지 않는다. `public.kosmo_current_account_id()`와 `public.kosmo_current_profile_id()`의 UUID/`NULL` 의미는 integration/live gate에서 한 번 read-back해 확인하고, 정상 operation마다 helper read-back을 반복하지 않는다.
- operation client는 direct DB client의 `connection` startup options를 상속하지 않고 configured `OPERATION_DATABASE_URL`을 변경 없이 사용해야 하며, actor GUC만 같은 initialization SQL round trip에서 session-level로 설정한 뒤에만 resolver를 시작해야 한다. URL이 Pooler와 호환되지 않으면 자동 보정하지 않고 operation을 실패시킨다. direct `DATABASE_URL` client의 기존 timeout startup 동작은 변경하지 않으며 이 change의 범위 밖이다.
- `selectProfile` Mutation이 `Sessions.activeProfileId`와 `ctx.session.profileId`를 갱신하면 `selectProfile`이 소유하는 action-local narrow transaction을 같은 operation `ctx.db`에서 열어 session-level `kosmo.profile_id`도 갱신하고, `kosmo.account_id`는 유지한 채 다음 top-level Mutation field가 새 Profile actor를 관찰하는지 확인한다. 이 transaction은 operation-wide transaction이 아니며 authorization concurrency, locking 또는 TOCTOU safety를 검증하지 않는다.
- 정상 결과와 GraphQL 오류, execution throw, timeout/abort 뒤 connection close가 정확히 한 번 완료되고 PgBouncer client baseline으로 복귀한다.
- HTTP batch sibling은 client connection, actor setting, DataLoader와 execution cache를 공유하지 않는다.
- `@defer`·`@stream` incremental execution과 Subscription은 현재 lifecycle 범위에서 제외한다. 이 기능을 위해 AsyncIterable connection bridge를 추가하거나 장기 Subscription session을 할당하지 않는다.
- forward fix release의 current API Pod 로그에 direct DB `connection` startup options 상속으로 인한 PgBouncer unsupported startup-parameter 오류가 없어야 하며, 익명·Account-only·Account+Profile 기존 GraphQL smoke가 HTTP 500 없이 기대한 결과를 반환해야 한다. 근거에는 로그 원문, URL, Secret, actor UUID를 남기지 않고 `startup-compatibility-ok`와 smoke 상태만 기록한다.

Capacity 안의 동시 operation은 완료되어야 하며, capacity를 넘은 operation은 custom semaphore·retry queue 없이 postgres.js의 기본 bounded connection timeout 동작으로 제한된 실패를 반환해야 한다. 별도의 application-selected timeout 숫자는 두지 않는다. `cnpg_pgbouncer_pools_cl_active`, `cnpg_pgbouncer_pools_cl_waiting`, `cnpg_pgbouncer_pools_sv_active`, `cnpg_pgbouncer_pools_sv_idle`, `cnpg_pgbouncer_pools_maxwait`를 부하 전후에 관찰하되 label, URL, credential, row와 backend PID는 근거에 남기지 않는다. 같은 backend가 재사용될 때 이전 actor setting이 남지 않는지는 아래 reset probe로 한 번 확인한다.

이 operation session gate는 GraphQL RLS 대상만 검증한다. Fedify inbound/delivery와 Temporal Workflow/Activity가 사용하는 Web/Worker direct read-write Service 기본 `DATABASE_*` lifecycle은 이 gate의 대상이 아니며 `OPERATION_DATABASE_URL`에 공급하지 않는다. PROD-716은 GraphQL principal credential source/cutover만 소유하고, Role/Secret provisioning, grant와 RLS policy는 각각의 별도 issue 경계로 남긴다.

## Pooler와 Service readiness

`POOLER`는 `<release>-postgres-pooler-rw`로, `NAMESPACE`는 배포 namespace로 설정한다. Pooler가 소유한 Deployment와 Pod가 Ready이고 Service에 endpoint가 생긴 뒤에만 연결 검증을 진행한다.

```sh
NAMESPACE=kosmo-prod
POOLER=kosmo-postgres-pooler-rw

kubectl get pooler "$POOLER" -n "$NAMESPACE" -o wide
kubectl describe pooler "$POOLER" -n "$NAMESPACE"
kubectl wait --for=condition=Available \
  "deployment/$POOLER" -n "$NAMESPACE" --timeout=5m
kubectl wait --for=condition=Ready \
  pod -l cnpg.io/poolerName="$POOLER" -n "$NAMESPACE" --timeout=5m
kubectl get service "$POOLER" -n "$NAMESPACE" -o wide
kubectl get endpointslice -n "$NAMESPACE" \
  -l "kubernetes.io/service-name=$POOLER" -o wide
```

Service port `5432`와 metrics port `9127`을 혼동하지 않는다. Pooler Service에 metrics port를 추가하지 않고, PgBouncer Pod의 exporter를 직접 확인한다.

```sh
POD="$(kubectl get pod -n "$NAMESPACE" \
  -l cnpg.io/poolerName="$POOLER" \
  -o jsonpath='{.items[0].metadata.name}')"
kubectl port-forward -n "$NAMESPACE" "pod/$POD" 19127:9127
```

다른 터미널에서 다음 지표가 응답에 포함되는지만 확인한다. 실제 database/user label 값이나 credential은 기록하지 않는다.

```sh
curl --fail --silent http://127.0.0.1:19127/metrics \
  | rg 'cnpg_pgbouncer_(pools_pool_mode|pools_cl_active|pools_cl_waiting|pools_sv_active|pools_sv_idle|pools_maxwait)'
```

`pools_pool_mode` 값은 PgBouncer session mode인 `1`이어야 한다. `cl_waiting`, `sv_active`, `sv_idle`, `maxwait`는 부하와 pool 크기를 판단하는 관찰값이다.

## Session affinity와 reset 검증

검증용으로 한 Pooler Pod에만 port-forward한다. Cluster의 기존 `<cluster>-app` Secret에서 username/password를 shell 변수로만 읽고 출력하지 않는다.

Terminal 1에서 한 Pooler Pod에 port-forward한다.

```sh
NAMESPACE=kosmo-prod
POOLER=kosmo-postgres-pooler-rw
POD="$(kubectl get pod -n "$NAMESPACE" \
  -l cnpg.io/poolerName="$POOLER" \
  -o jsonpath='{.items[0].metadata.name}')"
kubectl port-forward -n "$NAMESPACE" "pod/$POD" 15432:5432
```

Terminal 2에서 Cluster의 기존 `<cluster>-app` Secret을 shell 변수로만 읽고 출력하지 않는다.

```sh
CLUSTER=kosmo-postgres
NAMESPACE=kosmo-prod
PGUSER="$(kubectl get secret "${CLUSTER}-app" -n "$NAMESPACE" \
  -o jsonpath='{.data.username}' | base64 --decode)"
PGPASSWORD="$(kubectl get secret "${CLUSTER}-app" -n "$NAMESPACE" \
  -o jsonpath='{.data.password}' | base64 --decode)"
export PGUSER PGPASSWORD PGHOST=127.0.0.1 PGPORT=15432 PGDATABASE=kosmo
```

첫 client는 두 query 사이에 session GUC와 backend identity가 유지되는지 확인한다. 두 번째 client는 첫 client가 닫힌 뒤 같은 backend connection을 재사용했을 때 reset된 상태를 확인한다. backend PID는 shell 변수 안에서 비교에만 사용하고 출력하거나 기록하지 않는다. 출력은 `affinity-ok`/`reset-ok` 같은 비민감한 판정으로만 기록한다.

```sh
FIRST_CLIENT_RESULT="$(psql -qXAt <<'SQL'
SELECT pg_backend_pid() AS first_backend_pid \gset
SET kosmo.prod_728_probe = 'first-client';
SELECT CASE
  WHEN pg_backend_pid() = :first_backend_pid
    AND current_setting('kosmo.prod_728_probe', true) = 'first-client'
  THEN 'affinity-ok'
  ELSE 'affinity-failed'
END;
SELECT pg_backend_pid();
SQL
)"

FIRST_STATUS="$(printf '%s\n' "$FIRST_CLIENT_RESULT" | sed -n '1p')"
FIRST_BACKEND_PID="$(printf '%s\n' "$FIRST_CLIENT_RESULT" | sed -n '2p')"
printf '%s\n' "$FIRST_STATUS"

psql -qXAt --set first_backend_pid="$FIRST_BACKEND_PID" <<'SQL'
SELECT CASE
  WHEN pg_backend_pid() = :'first_backend_pid'::integer
    AND NULLIF(current_setting('kosmo.prod_728_probe', true), '') IS NULL
  THEN 'reset-ok'
  WHEN pg_backend_pid() <> :'first_backend_pid'::integer
  THEN 'reset-not-proven-different-backend'
  ELSE 'reset-failed'
END;
SQL
```

첫 client는 `affinity-ok`를 출력해야 한다. 첫 client 종료 뒤 두 번째 client가 같은 backend connection에서 `reset-ok`를 출력해야 한다. `reset-not-proven-different-backend`이면 state 유출을 뜻하지는 않지만 reset 증거도 아니므로 같은 Pooler Pod에서 반복해 동일 backend 재사용을 확인한다. `reset-failed`이면 Pooler를 application traffic에 연결하지 않고 PgBouncer Pod 로그, `cnpg_pgbouncer_*` metrics와 rendered parameters를 확인한다.

## Whole activation application rollback

Operation lifecycle 또는 API endpoint live gate가 실패하면 전체 activation 변경을 현재 대상 브랜치에서 Git revert한다. 과거 activation 직전 parent를 별도 검증 기준으로 삼지 않고, 이후 독립 변경을 포함한 현재 target branch에 실제 revert candidate를 만든다. `kubectl patch`, `kubectl delete` 또는 Argo UI의 out-of-band parameter override는 rollback 방법으로 사용하지 않는다.

Rollback candidate와 적용에는 다음 계약을 따른다.

- 일반 PR/CI와 현재 Helm render·admission 검증으로 실제 revert 결과를 확인한다. Candidate에서 GraphQL operation DB 환경 변수와 operation plugin/code가 사라져야 한다.
- 기존 API `DATABASE_URL` 경계, migration workload와 Secret, PROD-715 Web/Temporal Worker direct read-write Service 경계는 보존한다. GraphQL operation Pooler와 Cluster 및 이후 독립 변경도 유지한다.
- 검증된 candidate의 정확한 revert SHA만 승인된 대상에 sync한다. Dev와 production의 sync·live verification은 각각의 승인된 배포 절차를 따르며, production sync는 별도 승인을 요구한다.
- 이 application rollback은 PROD-728이 소유한 Pooler 리소스 lifecycle을 되돌리지 않는다. Pooler 자체를 제거하는 rollback은 아래의 별도 PROD-728 Pooler-only 절차로만 수행한다.

## Separate PROD-728 Pooler-only rollback

이 절차는 위의 PROD-726 whole activation application rollback과 별개로, PROD-728이 소유한 Pooler resource lifecycle을 되돌릴 때만 사용한다. Application rollback에는 이 절차를 호출하지 않는다. Pooler manifest를 제거하기 전에 API `OPERATION_DATABASE_URL`이 해당 Pooler를 참조하지 않는지 확인한다. Web/Temporal Worker 기본 `DATABASE_URL`은 기존 direct read-write Service를 사용하므로 Pooler-only rollback의 blocker가 아니다. Whole activation rollback 뒤에는 `OPERATION_DATABASE_URL` env가 absent여야 한다. 기존 API `DATABASE_URL` 경계, Cluster·direct Service·PROD-715 revert 뒤 Web/Worker owner source·migration workload가 계속 유지되는지도 확인한다. Dev `kosmo-dev` Application은 automated prune을 사용한다. Production `kosmo-prod` Application은 automated prune을 사용하지 않으므로 revert commit이 `main`에 반영된 뒤 승인된 Argo CD identity로 prune을 명시한 sync를 실행한다. `kubectl delete`로 Helm/Argo CD 소유 리소스를 out-of-band 삭제하지 않는다. Cluster, `<cluster>-rw` Service, 기존 Secret과 workload Rollout은 삭제하거나 수정하지 않는다.

```sh
NAMESPACE=kosmo-prod
CLUSTER=kosmo-postgres
POOLER="${CLUSTER}-pooler-rw"

kubectl get pooler "$POOLER" -n "$NAMESPACE"
kubectl get service "$POOLER" -n "$NAMESPACE"
kubectl get cluster "$CLUSTER" -n "$NAMESPACE"
kubectl get service "${CLUSTER}-rw" -n "$NAMESPACE"
```

Production rollback은 Git의 revert commit을 source로 다음과 같이 sync한다. `POOLER_ROLLBACK_REVISION`은 Pooler manifest가 제거된 `main` commit SHA로 고정한다.

```sh
POOLER_ROLLBACK_REVISION=REVERT_COMMIT_SHA
argocd app sync kosmo-prod --revision "$POOLER_ROLLBACK_REVISION" --prune
argocd app wait kosmo-prod --sync --health --timeout 600
```

Dev는 revert commit이 `main`에 반영되면 automated sync/prune 완료를 기다린다. Rollback sync 뒤 Pooler와 그 Service가 제거되고 기존 API `DATABASE_URL` 경계와 migration workload readiness가 그대로 유지되는지 확인한다.

```sh
kubectl get pooler "$POOLER" -n "$NAMESPACE"
kubectl get service "$POOLER" -n "$NAMESPACE"
kubectl get cluster "$CLUSTER" -n "$NAMESPACE"
kubectl get service "${CLUSTER}-rw" -n "$NAMESPACE"
```

앞의 두 명령은 `NotFound`, 뒤의 두 명령은 정상 상태여야 한다. Pooler-only rollback 결과와 direct endpoint 불변 여부만 비민감하게 기록한다.
