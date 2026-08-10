## Context

현재 `apps/helm/templates/_helpers.tpl`의 기본 database URL은 `kosmo` owner username, CloudNativePG read-write Service와 `$(DATABASE_PASSWORD)`를 사용한다. API와 Web Rollout 및 활성화된 Worker는 `<release>-postgres-app` Secret의 `password`를 `DATABASE_PASSWORD`로 주입한다. Web inbound Fedify와 Worker foundation에는 기존 기본 DB connection을 교체하지 않고 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`라는 명시적 입력 seam도 additive로 제공한다.

이 change가 다루는 runtime 역할은 `api`, `fedify`, `migration` 세 가지다. `api` source는 API Rollout과 Web BFF 및 활성화된 Worker의 기본 DB 입력이 공유하고, `fedify` source는 Web inbound Fedify와 활성화된 Worker 입력 seam에 노출한다. `migration`은 별도 `<release>-postgres-migration` credential로 인증한 뒤 `kosmo_migration`에서 `SET ROLE kosmo`로 전환하는 기존 production 경계와 dev owner fallback을 유지한다.

API outbound Fedify 직접 호출을 Temporal durable intent/workflow와 Worker Fedify Activity로 바꾸는 일은 PROD-448이 소유한다. 후속 Worker foundation은 기존 `api`/`fedify` selector 값을 Worker env에 전달하는 seam까지 준비했지만 foundation은 DB connection을 열지 않는다. 실제 BYPASSRLS identity는 PROD-369의 `kosmo_worker`이며 이 change의 `fedify`/`FEDIFY_DATABASE_*`는 구현 당시의 legacy selector seam일 뿐 role/Secret 이름 계약이 아니다. Selector/env 명칭 migration과 Web/Worker의 실제 DB connection 전환은 PROD-715가 소유한다.

## Goals / Non-Goals

**Goals:**

- `postgres.credentials.api`의 URL/password Secret atomic trio를 API Rollout과 Web BFF 기본 DB env에 공통 적용한다.
- `postgres.credentials.fedify`의 URL/password Secret atomic trio를 Web inbound Fedify와 활성화된 Worker의 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 입력 seam에 적용한다.
- API Rollout에는 `FEDIFY_DATABASE_*`를 주입하지 않고 Web BFF 기본 `DATABASE_*`를 Fedify source로 덮어쓰지 않는다.
- 세 필드가 모두 비어 있는 기존 values의 rendered manifest를 byte-identical하게 보존한다.
- 역할별 trio를 모두 채우거나 모두 비우게 검증해 custom 값과 owner fallback이 섞이지 않게 한다.
- API/Fedify runtime selector와 migration의 `kosmo_migration` → `SET ROLE kosmo` 경계를 독립적으로 유지한다.
- image와 각 역할 selector를 독립적으로 rollback할 수 있게 한다.

**Non-Goals:**

- 실제 Kubernetes Secret value, `kosmo_api`/`kosmo_worker`/`kosmo_migration` role 생성·membership·grant·policy 또는 `BYPASSRLS` provisioning.
- API 또는 Web에 새 Postgres.js/Drizzle DB client, connection 객체, pool 또는 connection lifecycle을 생성·전환하는 것.
- API outbound Fedify direct-call 제거, Temporal Workflow, durable intent, Worker Fedify Activity 또는 기존 Worker 입력 seam을 사용한 실제 DB connection 전환.
- API Rollout에 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 주입하거나 Web BFF 기본 `DATABASE_URL`을 바꾸는 것.
- Production migration host/database/Secret selector, `kosmo_migration` → `SET ROLE kosmo` 실행 계약 또는 migration 순서 변경.
- Fedify inbound behavior, role transition, RLS policy behavior 또는 live credential smoke/production cutover.

## Implementation Guidance

### Current Constraints

- Kubernetes container env의 `DATABASE_URL` 안 `$(DATABASE_PASSWORD)` 확장은 앞서 선언된 같은 이름의 env를 참조한다. Fedify URL은 `$(FEDIFY_DATABASE_PASSWORD)`를 참조해야 하며, URL과 Secret selector 중 일부만 적용하면 custom endpoint와 owner password가 조합될 수 있다.
- `packages/core/db/index.ts`와 현재 Fedify package는 process env에서 DB client를 사용한다. 이번 change는 env selector만 렌더하고 새 client/connection을 만들지 않는다.
- Chart에는 values schema가 없어 unknown values가 조용히 무시될 수 있다. 구현 시 수동 Helm template 명령으로 default render, API/Fedify 조합과 partial input failure를 한 번 확인하며, 재사용 가능한 regression harness는 이 change에 두지 않는다.
- Chart의 실제 workload 이름은 `api`, `web`, `worker`이지만 credential source 역할은 workload 이름과 다르다. API source는 두 Rollout과 활성화된 Worker의 기본 DB 입력이 공유하고 Fedify source는 Web inbound와 Worker 입력 seam에 대응한다.
- API Rollout은 API 기본 `DATABASE_PASSWORD`/`DATABASE_URL`만 가져야 하며, Web Rollout과 활성화된 Worker는 같은 API 기본 env에 선택적으로 `FEDIFY_DATABASE_PASSWORD`/`FEDIFY_DATABASE_URL`을 더한다.
- Production migration Job은 runtime selectors를 읽지 않고 기존 migration Secret과 `kosmo_migration` → `SET ROLE kosmo`를 사용한다. Dev Job은 기존 owner fallback을 사용한다.

### Recommended Approach

`postgres.credentials.api`와 `postgres.credentials.fedify` 아래에 각각 빈 기본값의 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 둔다. 세 값이 모두 비어 있으면 해당 source는 비활성이고, 모두 채워지면 활성이다. 일부만 채워진 경우 template helper가 source 이름을 포함한 명확한 오류로 render를 거부한다.

API source가 활성화되면 API와 Web 및 활성화된 Worker의 기본 `DATABASE_PASSWORD` SecretKeyRef와 `DATABASE_URL` 값이 같은 API trio를 사용한다. Fedify source가 활성화되면 Web과 활성화된 Worker에 `FEDIFY_DATABASE_PASSWORD` SecretKeyRef와 `FEDIFY_DATABASE_URL`을 추가한다. API에는 Fedify env를 렌더하지 않고 Web/Worker의 기본 API env는 그대로 둔다. URL 문자열은 Secret value를 포함하지 않으며 API는 `$(DATABASE_PASSWORD)`, Fedify는 `$(FEDIFY_DATABASE_PASSWORD)`를 참조한다.

Migration template은 runtime helper를 호출하지 않고 기존 PG environment, migration Secret, `DATABASE_MIGRATION_ROLE`과 `SET ROLE kosmo` 경계를 그대로 유지한다. `kosmo_worker`의 `BYPASSRLS`와 role/policy provisioning은 chart helper나 values에서 표현하지 않는다.

구현 시 Helm template을 일회성으로 실행해 default render가 pre-selector 결과와 byte-identical인지 확인하고, 대표 API-only/Fedify-only/양쪽 활성화와 rollback, partial input failure, API env 부재를 수동으로 검사한다. migration Job document 불변도 대표 조합에서 확인한 결과를 구현 evidence로 남긴다. 이 change는 해당 검증을 재실행하는 script, CI hook 또는 committed golden hash를 추가하지 않는다.

### Allowed Alternatives

동일한 `api`/`fedify` values 공개 계약, atomic validation, default render byte identity, API/Web env 경계와 migration 비침범을 유지한다면 helper 내부 구현은 dict 전달 또는 작은 workload helper로 구성할 수 있다. 검증은 구현 시 수행하는 수동 Helm template 명령과 결과 기록으로 충분하며 별도 test harness를 추가하지 않는다.

### Known Traps

- `system`, `federation-system` 또는 `web`를 runtime source 이름으로 되살려 `fedify` 경계를 흐리지 않는다.
- `default`를 각 필드에 독립 적용해 URL과 Secret selector 일부를 owner fallback과 섞지 않는다.
- Secret value나 password가 포함된 완성 connection string을 values, rendered manifest, test fixture 또는 로그에 넣지 않는다.
- API와 Web에 별도 API credential values를 만들어 기본 BFF source가 drift하게 하지 않는다.
- Fedify source로 Web의 기본 `DATABASE_URL`을 바꾸거나 API Rollout에 `FEDIFY_DATABASE_*`를 주입하지 않는다.
- Runtime selector를 migration owner fallback, production migration Secret 또는 `SET ROLE kosmo` 실행에 전달하지 않는다.
- `kosmo_worker` role, `BYPASSRLS`, policy/grant, actual Secret, Postgres client/connection, Temporal 또는 Worker resource를 이 selector change에 복사·생성하지 않는다.

## Risks / Trade-offs

- [Values 공개 surface가 늘어남] → API와 Fedify에 동일한 세 필드 trio만 제공하고 migration·role provisioning 및 Worker의 실제 DB connection surface는 각 소유 계약에 남긴다.
- [사용자가 password 없는 URL을 전달함] → Helm은 Secret reference의 완전성만 검증할 수 있다. 실제 URL semantic, `kosmo_worker` 권한과 credential 성공은 downstream transition smoke가 검증한다.
- [Default manifest의 공백/순서 변화] → 구현 시 pre-selector render와 byte comparison을 수동으로 확인하고 결과를 evidence로 남긴다.
- [API와 Web 기본 env를 실수로 분기함] → API source는 두 workload에 같은 helper를 사용하고, Fedify env는 Web template의 additive block으로만 둔다.
- [Worker foundation에 입력 seam은 있지만 실제 DB connection은 없음] → 기존 seam을 현재 계약으로 인정하고 selector/env 명칭 migration과 실제 `kosmo_worker` connection cutover는 PROD-715, API direct-call 제거와 capability 활성화는 PROD-448/719의 downstream gate로 명시한다.

## Migration Plan

1. 빈 `api`/`fedify` selector 기본값을 포함한 chart를 수동 렌더하고 pre-selector manifest가 byte-identical인지 확인한다. 비교 hash나 fixture는 저장하지 않는다.
2. PROD-369이 `kosmo_api` 및 `kosmo_worker` Secret/role attribute(`BYPASSRLS` 포함)를 provision하고, PROD-724/713이 권한·API RLS를 소유한다. 이 change는 resource를 만들지 않는다.
3. `fedify` trio를 Web inbound Fedify와 활성화된 Worker 입력 seam에 opt-in하고 API/Web BFF 기본 API 연결과 API의 Fedify env 부재를 검증한다.
4. `api` trio를 API Rollout과 Web BFF 및 활성화된 Worker 기본 입력에 opt-in한다. Worker selector/env 명칭과 실제 credential connection 전환은 PROD-715, API outbound Fedify와 Worker/Temporal capability 활성화는 PROD-448/719에서 별도 진행한다.
5. Rollback은 해당 역할의 세 값을 함께 제거해 기존 owner 경계로 돌아간다. 다른 역할 selector, image와 migration boundary는 유지한다.

## Open Questions

없음.
