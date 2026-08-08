## Context

현재 `apps/helm/templates/postgres-cluster.yaml`은 환경별 CloudNativePG Cluster를 선언하고 `_helpers.tpl`의 기본 database URL은 `<release>-postgres-rw` direct Service를 사용한다. CloudNativePG operator와 cluster-wide CRD는 `byulmaru/kubernetes`가 제공하지만, application namespace의 Cluster·Pooler 같은 workload resource는 이 저장소의 Helm chart가 소유한다.

PROD-708은 operation context/DB handle seam만 제공하며 실제 connection을 열지 않는다. PROD-726이 모든 GraphQL DB consumer 정렬 뒤 Pooler endpoint와 session-level actor GUC를 활성화하고, PROD-716은 그 뒤 non-owner credential 전환을 소유한다. 따라서 이번 배포는 사용되지 않는 access layer를 기존 경로 옆에 추가하는 것으로 끝나야 한다.

CloudNativePG `Pooler` CRD는 같은 namespace의 하나의 Cluster와 `rw` 또는 `ro` Service에 결합된다. PgBouncer session mode에서는 client disconnect 때 backend connection이 pool로 반환되고 기본 `server_reset_query`인 `DISCARD ALL`이 실행되지만, reset 계약을 manifest에서 명시해 operator/PgBouncer 기본값 변화에도 의도가 보이게 한다.

## Goals / Non-Goals

**Goals:**

- 기존 Cluster 앞에 별도 read-write session Pooler Service를 additive하게 선언한다.
- client/server capacity, replica, resource와 `DISCARD ALL` reset 경계를 명시한다.
- 정적 render와 실제 환경에서 readiness, session affinity/reset, PgBouncer pool metrics를 검증할 절차를 제공한다.
- Pooler만 제거할 수 있는 독립 rollback 경계를 유지한다.

**Non-Goals:**

- API/Web database endpoint 또는 Secret 전환
- GraphQL operation connection 생성·종료, actor GUC 설정 또는 resolver DB handle 이전
- PostgreSQL role·grant·RLS policy, database schema 또는 credential 변경
- transaction pooling, read-only routing 또는 cluster-wide CloudNativePG 설치 변경

## Implementation Guidance

### Current Constraints

- 기본 database URL helper와 API/Web workload는 `<release>-postgres-rw`를 사용하므로 새 Pooler helper를 기존 helper에 연결하면 범위를 침범한다.
- CloudNativePG Pooler 이름은 같은 namespace의 Cluster 이름과 달라야 하고, Cluster와 같은 namespace에 렌더링돼야 한다.
- Pooler의 각 replica가 user/database pair별 server pool을 별도로 유지하므로 `default_pool_size`를 replica 수와 곱한 최대 backend connection 소비를 검토해야 한다.
- PgBouncer는 parameter 값을 검증하지 않으므로 문자열 타입과 지원되는 option 이름을 chart에서 정확히 렌더링해야 한다.
- 실제 session reset은 manifest만으로 증명되지 않는다. 동일 credential로 첫 client가 custom GUC를 설정·종료한 뒤 다른 client가 값을 관찰하지 못하는 live 검증이 필요하다.

### Recommended Approach

`postgres.pooler` values 아래에 replica 수, `maxClientConnections`, `defaultPoolSize`와 resources를 둔다. production은 Cluster HA와 맞춰 3 replicas, dev는 1 replica를 렌더링하고, PgBouncer 기본 예시와 현재 예상 부하를 보수적으로 시작하기 위해 replica당 `max_client_conn=1000`, user/database pair당 `default_pool_size=10`을 사용한다. resources는 경량 proxy의 초기 경계로 request `100m/128Mi`, limit `500m/512Mi`를 명시한다.

별도 Pooler template은 기존 Cluster 이름을 참조하고 `type: rw`, `poolMode: session`, `server_reset_query: DISCARD ALL`을 선언한다. Pod template에는 PgBouncer container resource만 override하며 CloudNativePG가 Service, readiness와 metrics exporter 구성을 소유하게 둔다. 이름 helper는 `<release>-postgres-pooler-rw`처럼 direct `-rw`와 명확히 구분한다.

운영 문서는 render/admission 확인, Pooler/Deployment/Pod/Service readiness, session affinity와 reset SQL, pool mode/client waiting/server active·idle/max-wait metrics, rollback 뒤 direct endpoint 불변을 한 절차로 기록한다. credential 값이나 database row는 출력하지 않는다.

### Allowed Alternatives

spec과 결정 경계를 유지한다면 초기 capacity/resource 값은 production 관측에 따라 별도 values override로 조정할 수 있다. Pooler 이름도 Cluster와 충돌하지 않고 direct endpoint와 구분되며 후속 PROD-726이 안정적으로 참조할 수 있으면 다른 명명 규칙을 사용할 수 있다.

### Known Traps

- API/Web `DATABASE_URL`을 새 Service로 바꾸거나 기존 helper를 재사용해 endpoint를 조용히 전환하지 않는다.
- `poolMode: transaction` 또는 `server_reset_query_always`로 session semantics를 바꾸지 않는다.
- `DISCARD ALL`을 생략하고 현재 PgBouncer 기본값에만 의존하지 않는다.
- 단일 Pooler replica의 `default_pool_size`만 보고 production 전체 backend connection 상한을 계산하지 않는다.
- 정적 manifest나 Ready condition만으로 session affinity/reset 완료를 주장하지 않는다.

## Risks / Trade-offs

- [3개 production replica와 pool size 10은 user/database pair마다 최대 30개 backend connection을 유지할 수 있다] → rollout 전 PostgreSQL connection budget을 확인하고 metrics의 active/idle/waiting/max-wait를 근거로 values를 조정한다.
- [session pooling은 긴 client session 동안 backend connection을 점유해 transaction pooling보다 multiplexing 이득이 작다] → 이 access layer의 목적은 operation 단위 session state이며 PROD-726에서 connection 수명과 동시성 stress를 검증한다.
- [`DISCARD ALL`은 prepared statement와 cache를 제거해 connection 반환 비용이 생긴다] → actor state 격리를 우선하고 reset을 약화하지 않는다.
- [사용되지 않는 Pooler도 Pod와 유휴 backend connection 비용을 만든다] → 최소 dev/prod replica/resource 기본값을 사용하고 Pooler 리소스만 독립 rollback할 수 있게 한다.

## Migration Plan

1. Helm lint/render와 가능한 admission dry-run으로 Cluster 참조, Pooler mode/parameters/resources와 기존 workload endpoint 불변을 확인한다.
2. Pooler만 기존 environment에 sync하고 Pooler, Deployment, Pod와 Service readiness를 확인한다. API/Web는 direct `-rw`를 계속 사용한다.
3. 비민감 test GUC와 backend identity로 한 client 안의 session affinity 및 client 종료 뒤 reset을 검증한다.
4. metrics에서 pool mode, active/waiting client, active/idle server와 max wait를 확인한다.
5. 실패하면 Pooler manifest만 제거한다. 기존 Cluster, `-rw` Service, credentials와 workload를 변경하거나 rollback하지 않는다.

## Open Questions

없음.
