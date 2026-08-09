## Why

Post 조회 정책이 Account와 선택된 Profile의 actor context를 PostgreSQL에서 해석하게 되면, 각 policy가 setting을 직접 파싱하지 않고 같은 안전한 helper 계약을 사용해야 한다. PROD-370은 이 공통 database contract를 Post RLS base와 독립적으로 전달한다. Post와 Post Content RLS base는 별도 downstream인 PROD-737이 소유한다.

## What Changes

- PostgreSQL setting key `kosmo.account_id`와 `kosmo.profile_id`를 각각 `public.kosmo_current_account_id()`와 `public.kosmo_current_profile_id()` helper에 연결한다.
- 각 helper는 현재 setting을 읽어 유효한 PostgreSQL UUID 또는 `NULL`을 반환한다. setting이 없거나 비어 있거나 UUID로 해석되지 않아도 호출은 오류가 되지 않는다.
- helper는 read-only, invoker-rights SQL function으로 제공되며 setting을 쓰거나 table data를 읽지 않는다.
- PROD-713은 이 helper를 viewer policy에서 소비하고, PROD-726은 setting writer와 DB connection lifecycle을 별도로 소유한다.
- Post/Post Content table, RLS enablement, policy·grant, join/index, owner/non-owner 결과, credential 전환과 PgBouncer lifecycle은 이 change에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `memory/database-migrations.md`
- Linear Authority / Implementation: PROD-370
- Downstream Consumers: PROD-713 (viewer policy), PROD-726 (setting writer와 DB connection lifecycle)
- Sibling Exclusion: PROD-737 (Post/Post Content RLS base)

## Capabilities

### New Capabilities

- `rls-actor-context`: Account/Profile setting key와 안전한 nullable UUID 조회 helper의 공통 PostgreSQL contract를 정의한다.

### Modified Capabilities

없음.

## Impact

- PostgreSQL `public` schema의 Account/Profile actor context helper function
- PROD-713과 PROD-726이 공유하는 setting key와 helper 이름
- helper SQL function을 생성하는 Drizzle migration과 그 parsing 검증
- Post table/RLS metadata, policy·grant와 application connection lifecycle에는 영향이 없다.
