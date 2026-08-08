## Context

이 기록은 Linear PROD-728의 additive PgBouncer session pool 계약, 현재 Kosmo Helm의 CloudNativePG workload 소유권, 공식 CloudNativePG 1.30 Pooler와 PgBouncer session reset 동작을 반영한다. 제품 도메인·디자인 요구사항은 변경하지 않는다.

## Decision Records

### Kosmo Helm이 namespaced Pooler를 소유한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-728`; 운영 맥락 `docs/operations/production-migrations.md`, `docs/operations/postgres-backup.md`
- Status: Active
- Context / Problem: CloudNativePG operator는 platform repository가 제공하지만 기존 application Cluster와 관련 namespaced 리소스는 Kosmo Helm이 선언한다.
- Decision Outcome: 기존 Kosmo Cluster를 가리키는 `Pooler`는 `apps/helm`에 추가하고 cluster-wide operator/CRD 설치는 변경하지 않는다.
- Alternatives Considered: `byulmaru/kubernetes`에서 Pooler까지 선언하면 application release의 Cluster 이름·namespace·rollback 소유권이 platform state로 분리되므로 제외했다.
- Consequences: operator/CRD가 준비되지 않은 환경은 배포 선행조건으로 확인하며, Pooler의 application lifecycle은 Kosmo release가 소유한다.
- Confirmation / Follow-up: Helm render와 server-side dry-run에서 CRD 인식 및 Cluster 참조를 확인한다.

### 별도 read-write session Pooler와 명시적 DISCARD ALL

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-728`
- Status: Active
- Context / Problem: 후속 operation connection은 client 수명 동안 backend session과 actor state가 유지되고 client 반환 뒤 state가 완전히 제거되는 access layer가 필요하다.
- Decision Outcome: 기존 Cluster와 다른 이름의 `type: rw` Pooler를 `poolMode: session`으로 선언하고 `server_reset_query: DISCARD ALL`을 명시한다. `server_reset_query_always`는 설정하지 않는다.
- Alternatives Considered: transaction pooling은 session GUC를 보존하지 못해 제외했다. reset 기본값에만 의존하거나 `DEALLOCATE ALL`로 약화하면 actor state 격리를 manifest에서 보장하지 못해 제외했다.
- Consequences: client 연결 동안 backend connection이 점유되고 반환 때 prepared statement와 session cache도 제거된다.
- Confirmation / Follow-up: live 두-client GUC reset과 한 client 내 backend identity 유지로 검증한다.

### 환경별 replica와 초기 connection budget

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-728`
- Status: Active
- Context / Problem: 이슈는 replica, client/server limit와 resource 기본값을 요구하지만 구체 수치를 고정하지 않는다. 현재 production Cluster는 3 instances이고 dev는 1 instance다.
- Decision Outcome: dev는 Pooler 1 replica, prod는 3 replicas를 사용한다. 각 replica는 `max_client_conn=1000`, user/database pair별 `default_pool_size=10`을 사용한다. PgBouncer container는 경량 proxy와 exporter의 초기 경계로 request `25m/64Mi`, limit `250m/128Mi`를 기본값으로 두고 모두 Helm values에서 조정 가능하게 한다. CNPG 문서의 더 큰 resource 수치는 구성 방법을 보여 주는 예시이지 workload sizing 권위가 아니므로 그대로 채택하지 않는다. 실제 traffic 활성화 전 dev 사용량과 throttling/OOM을 관찰하고 후속 PROD-726에서 필요할 때 조정한다.
- Alternatives Considered: 모든 환경 3 replicas는 dev 비용이 불필요해 제외했다. PgBouncer 기본 `default_pool_size=20`은 production 3 replicas에서 pair당 최대 60 backend connection을 만들 수 있어 초기값으로 제외했다. limit 미지정은 이슈의 명시적 capacity 경계를 충족하지 못한다.
- Consequences: production은 user/database pair마다 최대 30 backend connection을 사용할 수 있고 replica당 최대 1000 client가 연결될 수 있다. 다수 DB user가 생기면 전체 server connection budget을 다시 계산해야 한다.
- Confirmation / Follow-up: render된 값을 확인하고 live metrics의 active/idle/waiting/max-wait 및 PostgreSQL connection budget으로 후속 values 조정을 판단한다.

### CloudNativePG 기본 readiness와 exporter를 소비한다

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-728`
- Status: Active
- Context / Problem: Pooler readiness와 pool 사용 metrics를 관찰해야 하지만 platform monitoring 리소스와 중복 선언하면 소유권이 섞인다.
- Decision Outcome: CloudNativePG가 생성·관리하는 Pooler Deployment/Pod/Service readiness와 PgBouncer exporter의 `cnpg_pgbouncer_*` metrics를 사용한다. 이 변경에서 별도 ServiceMonitor/PodMonitor나 custom Service port를 만들지 않는다.
- Alternatives Considered: application chart가 PodMonitor를 추가하면 현재 platform Prometheus discovery 정책과 중복될 수 있고, Pooler Service에 9127을 노출할 필요도 없어 제외했다.
- Consequences: metrics 수집 여부는 기존 platform discovery가 담당하고, 수집 전 검증은 exporter Pod의 9127 port를 직접 확인한다.
- Confirmation / Follow-up: Pooler/Deployment/Pod/Service 상태와 exporter metrics에 pool mode, client waiting, server active/idle, max wait가 나타나는지 확인한다.

### 기존 workload 연결을 불변으로 유지한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-728`, `PROD-708`, `PROD-726`, `PROD-716`
- Status: Active
- Context / Problem: Pooler 기반과 실제 GraphQL operation session/credential 전환은 독립 배포·rollback 단위다.
- Decision Outcome: 기존 database URL helper, API/Web Rollout env와 Secret 참조는 변경하지 않는다. Pooler Service는 이번 변경에서 어떤 workload도 소비하지 않으며 Pooler 리소스만 제거해 rollback한다.
- Alternatives Considered: API/Web를 동시에 Pooler로 전환하면 전체 DB consumer 정렬과 connection cleanup을 소유한 PROD-726, credential 전환을 소유한 PROD-716 범위를 침범하므로 제외했다.
- Consequences: 배포 직후 Pooler는 검증 트래픽 외 production application traffic을 받지 않는다. 실제 활성화는 후속 이슈가 소유한다.
- Confirmation / Follow-up: Pooler 추가 전후 API/Web의 rendered `DATABASE_URL`과 Secret 참조가 동일하고 rollback 뒤 direct workload가 유지되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
