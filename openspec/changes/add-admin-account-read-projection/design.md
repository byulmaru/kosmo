## Context

PROD-690은 독립 SvelteKit Admin runtime과 Tailscale Viewer 경계를 제공한다. PROD-691은 기존 Account
테이블을 읽어 첫 운영 화면을 제공해야 하며, canonical read policy의 목록·상세 필드 분리를 그대로 유지해야
한다. Account ID는 UUIDv7이라 정렬과 cursor 양쪽에 사용할 수 있다.

## Goals / Non-Goals

**Goals:**

- Account 목록과 상세를 server-rendered Admin 화면으로 제공한다.
- 조회 결과를 허용된 필드로 명시적으로 projection한다.
- 50개 단위 ID keyset pagination과 일반 404·오류 경계를 제공한다.
- 현재 Admin Viewer metadata와 no-store/CSP 경계를 유지한다.

**Non-Goals:**

- Account mutation
- Profile·Membership·Session 조회
- REST·GraphQL API
- Admin-specific logging 또는 audit

## Implementation Guidance

### Current Constraints

- Admin은 `apps/admin`의 SvelteKit server runtime이며 request Viewer는 hooks에서 `locals`로 전달된다.
- 공용 database handle과 Account schema는 `@kosmo/core/db`가 소유한다.
- 목록이 Account row 전체를 읽으면 OIDC subject가 목록 경계로 유입되므로 explicit select가 필요하다.
- offset pagination은 데이터 추가 중 페이지 중복·누락을 만들 수 있다.

### Recommended Approach

`$lib/server`의 작은 read query 모듈에서 Drizzle로 필요한 column만 select한다. 목록은 `id desc`와
`id < cursor` 조건으로 51개를 읽어 50개와 다음 cursor를 구분하고, 상세는 UUID ID exact lookup을 한다.
각 route의 server loader가 query를 직접 호출해 page data를 반환한다. 화면은 Svelte component와 필요한 최소
shadcn-svelte source component만 사용한다.

### Allowed Alternatives

동일한 projection, 정렬, cursor와 loader 경계를 지키는 한 query 조립 위치와 UI component 구성은 달라질 수
있다.

### Known Traps

- Account table 전체 row를 목록 loader에 전달하지 않는다.
- cursor를 생성 시각으로 다시 변환하거나 offset과 섞지 않는다.
- Viewer identity를 Account filter 또는 권한 판단에 사용하지 않는다.

## Risks / Trade-offs

- [UUIDv7 ID 순서가 Account 생성 순서를 대표한다] → 현재 schema의 UUIDv7 생성 계약을 사용하고 ID를 그대로
  cursor로 반환한다.
- [51번째 row lookahead가 한 건 더 읽는다] → 고정 page size에서 다음 페이지 존재 여부를 정확히 판단하는
  단순한 비용으로 수용한다.
- [DB 오류가 framework 오류 화면으로 전파될 수 있다] → production 오류 화면이 내부 메시지를 노출하지 않는
  기존 SvelteKit 경계를 유지한다.

## Migration Plan

schema migration 없이 Admin image를 교체한다. rollback은 이전 Admin image로 되돌리며 database 상태는 변경되지
않는다.

## Open Questions

없음.
