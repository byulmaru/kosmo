## Context

`searchProfiles`는 `@kosmo/api`의 로그인 scope 안에서 `parseProfileHandle`로 query를 local/remote로 나눈 뒤
`resolveCursorConnection`의 PostgreSQL query만 실행한다. remote branch는 요청 domain의 저장된 ActivityPub
Instance와 Profile을 조회하며, `profileByHandle`과 같은 staged visibility를 사용한다.

기존 `@kosmo/fedify`는 `federation.createContext`, `findOrMaterializeRemoteProfileActor`와 Remote Profile
transaction을 공개한다. materializer는 Instance availability, Fedify의 private-address 차단, actor identity와
canonical domain, uniqueness와 동시성을 이미 검증한다. 다만 저장된 actor가 stale이면 기본적으로 background
refresh를 예약하고, canonical actor domain이 요청 alias와 다르면 저장 Profile은 요청 domain DB 검색으로 다시
찾을 수 없다. `@kosmo/api`는 현재 `@kosmo/fedify` runtime dependency가 없으며 예상하지 못한 API 오류는
`captureUnexpectedError`로 관측한다.

## Goals / Non-Goals

**Goals:**

- 로그인 인증 뒤 명시적인 원격 qualified handle 전체만 기존 materializer에 전달한다.
- 저장 actor는 network lookup·refresh 없이 반환하고 미저장 actor만 materialize한다.
- canonical Profile identity, 기존 visibility와 connection shape를 유지해 검색 결과를 반환한다.
- lookup·충돌·unavailable·unexpected materialization 실패는 검색 결과 없음으로 격리하고 unexpected 오류는
  관측한다.
- API/Fedify/PostgreSQL 테스트와 route 회귀로 zero-network 경계를 증명한다.

**Non-Goals:**

- `profileByHandle`, 프로필 GET·nested route, 익명·일반·local·불완전한 remote 검색의 materialization
- GraphQL schema, Relay query, DB schema·migration, SSR HTML 변경
- 별도 WebFinger client/document loader, rate limit, fetch 제한 또는 새로운 moderation predicate
- actor refresh, remote Post/Note discovery와 다른 ActivityPub ingress 확장

## Implementation Guidance

### Current Constraints

- `t.withAuth({ login: true })`가 resolver보다 먼저 인증을 거부하므로 materialization trigger를 resolver 밖이나
  Web BFF에 두면 인증 선행 계약을 잃는다.
- `parseProfileHandle`은 leading `@`를 제거하고 `handle@domain`도 remote로 파싱한다. 파싱 결과만 사용하면 기존
  partial remote 검색까지 network fetch 대상으로 넓어진다. 명시적 전체 입력 표면과 기존 handle schema를 함께
  확인해야 한다.
- `findOrMaterializeRemoteProfileActor`의 기본 `scheduleRefresh`는 stale 저장 actor의 lookup을 예약한다. 검색
  호출에서는 이 callback을 비활성화해야 저장 actor zero-network 계약을 만족한다.
- materializer는 alias handle을 canonical actor domain의 Profile로 합칠 수 있다. materialization 뒤 요청
  domain으로 기존 remote query를 반복하면 성공한 actor가 빈 결과가 될 수 있다.
- materialization catch 범위를 기존 connection DB query까지 넓히면 PostgreSQL 검색 회귀를 빈 결과로 숨긴다.
  원격 준비 단계만 격리하고 이후 DB query 오류는 기존 GraphQL 오류 경계를 유지해야 한다.
- public `@kosmo/fedify` export를 사용하려면 `@kosmo/api` manifest를 workspace dependency로 정렬해야 한다.
  내부 `packages/fedify/src/**` 경로를 직접 import하면 package boundary와 타입 검증을 우회한다.

### Recommended Approach

1. `searchProfiles`의 인증된 resolver에서 기존 local Instance와 parsed handle을 구한다. trim된 원문이 leading
   `@`를 포함하고 remote로 파싱되며 handle이 기존 Profile handle schema를 만족할 때만 explicit remote
   materialization 후보로 취급한다.
2. 후보이면 configured local canonical origin으로 `federation.createContext`를 만들고
   `findOrMaterializeRemoteProfileActor`를 호출한다. 검색 호출은 refresh scheduler를 no-op으로 주입해 저장
   actor가 stale이어도 network 작업을 예약하지 않는다.
3. helper가 반환한 Profile ID를 explicit 검색의 DB connection anchor로 보관한다. 성공 뒤 connection callback은
   요청 alias domain 대신 이 ID와 기존 `visibleProfileWhere`, cursor predicate를 함께 적용한다. 일반/부분 remote
   query는 현재 domain + normalized `LIKE` 경로를 그대로 사용한다.
4. materialization 준비 단계의 오류는 빈 connection marker로 변환한다. 알려진 materialization/NotFound/Conflict
   오류는 조용히 fallback하고, 그 밖의 오류는 `captureUnexpectedError`로 기록한 뒤 같은 빈 connection을
   반환한다. 이후 기존 Profile connection DB query 오류는 이 catch에 포함하지 않는다.
5. `@kosmo/api`는 public `@kosmo/fedify` package만 사용하도록 `pnpm`으로 workspace dependency를 추가한다.
   GraphQL schema와 client query는 바꾸지 않는다.
6. 기존 API PostgreSQL integration fixture에 lookup context를 제어할 수 있는 경계를 두고 auth-before-fetch,
   stored zero-refresh, missing success, alias canonical identity, expected/unexpected fallback, visibility와 동시성을
   검증한다. Fedify unit/integration tests는 materializer 자체의 SSRF·identity·transaction 보장을 회귀 검증한다.

### Allowed Alternatives

- resolver를 얇게 유지하기 위해 explicit-search orchestration을 `@kosmo/api` 내부 service로 추출할 수 있다.
  다만 인증 뒤에만 호출되고, public `@kosmo/fedify` API와 기존 관측 경계만 사용하며, 반환 Profile ID를 기존
  DB connection에 다시 통과시켜야 한다.
- 기존 helper에 검색 전용 refresh 정책 이름을 추가할 수 있으나, 공개 API·다른 federation 소비자의 stale
  refresh 동작을 바꾸지 않고 같은 zero-network scenario를 검증해야 한다.

### Known Traps

- `parsed.kind === 'remote'`만으로 materializer를 호출해 기존 partial remote 검색을 network query로 바꾸는 것
- `findOrMaterializeRemoteProfileActor`의 기본 refresh scheduler를 그대로 사용해 저장 actor 검색에서 fetch하는 것
- materializer 반환값을 버리고 요청 alias domain으로만 재조회해 canonical actor 결과를 누락하는 것
- 인증 scope 전에 lookup하거나 `profileByHandle`/프로필 route에 공용 자동-materialize loader를 연결하는 것
- 모든 resolver/DB 오류를 catch해 성공한 빈 결과로 바꾸고 PostgreSQL 장애를 숨기는 것
- Fedify의 document loader와 `allowPrivateAddress: false` 경계를 우회하는 별도 HTTP/WebFinger client를 만드는 것

## Risks / Trade-offs

- [인증된 요청도 외부 network와 DB write를 시작함] → leading `@` qualified handle과 기존 handle validation으로
  trigger를 좁히고 Fedify SSRF·Instance 상태 경계를 재사용한다.
- [동시 요청이 중복 network lookup을 수행할 수 있음] → 기존 transaction lock과 unique retry로 중복 row를
  막고 동시 검색 integration test로 결과 identity를 검증한다. 이 변경에서 distributed fetch dedupe는 추가하지
  않는다.
- [실패를 빈 결과로 격리하면 원인 파악이 어려움] → expected 오류 범위를 테스트하고 unexpected 오류는 기존
  API 관측 sink에 기록한다.
- [API가 federation package에 runtime 의존함] → public workspace export만 사용하고 package typecheck와
  dependency graph를 검증한다.
- [rollback 뒤 materialized row가 남음] → row는 기존 remote identity/materialization 계약으로 유효하며 DB-only
  검색과 다른 federation 소비자가 사용할 수 있으므로 삭제하지 않는다.

## Migration Plan

1. canonical 문서와 delta spec을 먼저 배포 가능한 계약으로 확정한다.
2. API workspace dependency와 검색 orchestration, 테스트를 같은 PROD-573 구현 slice에서 추가한다.
3. schema diff가 없고 API/Fedify/PostgreSQL 및 필요한 Web typecheck가 통과하는지 확인한다.
4. rollback은 explicit remote materialization 준비 단계를 제거해 기존 DB-only 검색으로 되돌린다. 새 schema가
   없으므로 DB migration rollback은 없고, 이미 materialize된 유효 Remote Profile row는 유지한다.

## Open Questions

없음.
