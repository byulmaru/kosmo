## 1. PROD-573 인증된 원격 Profile 검색 materialization

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- `PROD-573`
- 기존 materialization·identity 기반: `PROD-248`, `PROD-257`

**Deliverable**

로그인한 Account가 명시적인 `@handle@instance` 전체로 아직 저장되지 않은 원격 계정을 검색하면 기존 Fedify
actor materialization 뒤 canonical Profile을 기존 `searchProfiles` connection에서 받을 수 있다. 저장 Profile과
그 밖의 검색·조회는 기존 DB-only 동작을 유지한다.

**Guardrails**

- 인증 실패는 Profile DB 후보 조회와 remote lookup보다 먼저 평가한다.
- local·일반·불완전한 remote 검색, 저장 actor, `profileByHandle`와 프로필 GET·하위 route는 network lookup이나
  refresh를 시작하지 않는다.
- 별도 WebFinger/document loader, GraphQL schema, DB schema·migration, 새 moderation predicate를 만들지 않는다.
- Fedify의 Instance availability, private-address 차단, actor identity, canonical domain, transaction과 uniqueness
  경계를 우회하지 않는다.
- materialized Profile은 기존 visibility와 `Profile.id` cursor connection을 통과해야 하며 alias Profile을 만들지
  않는다.
- 원격 준비 실패는 빈 connection으로 fallback하고 unexpected 오류는 관측한다. 기존 DB connection 오류는
  원격 실패로 숨기지 않는다.

**Verification**

- API PostgreSQL integration test로 auth-before-fetch, explicit missing success, stored zero-refresh, canonical alias,
  expected/unexpected fallback, visibility, cursor와 concurrent idempotency를 검증한다.
- Fedify 관련 test로 기존 lookup·SSRF·Instance 상태·identity·transaction 계약이 유지되는지 확인한다.
- schema diff와 migration이 없고 public package dependency만 사용했는지 확인한다.

- [x] 1.1 인증된 명시적 원격 qualified handle만 actor 준비 단계를 실행하고 성공한 canonical Profile을 기존 DB connection 결과로 반환하도록 구현한다.
- [x] 1.2 저장 actor의 stale refresh를 억제하고 local·일반·불완전 remote·비인증 검색과 exact Profile 조회의 zero-network 경계를 유지한다.
- [x] 1.3 expected materialization 실패를 빈 connection으로 격리하고 unexpected 오류를 관측하되 기존 DB 검색 오류 semantics는 유지한다.
- [x] 1.4 auth, trigger, 저장/미저장, alias, 실패·관측, visibility, cursor, 동시성 matrix를 API/Fedify/PostgreSQL 테스트로 추가하고 통과시킨다.

## 2. PROD-573 검색·route 회귀와 change 완료

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- `PROD-573`
- 기존 웹 route 기반: `PROD-249`

**Deliverable**

사람 검색은 materialize된 canonical Remote Profile과 실패 시 결과 없음 상태를 기존 UI·Relay shape로 표시하고,
프로필 route와 하위 경로는 저장된 Profile만 조회한다. PROD-573의 구현·검증·active spec 정합성과 archive가
완료된다.

**Guardrails**

- 사람 검색 외 탭, GraphQL schema, Relay connection과 Profile item/navigation contract를 변경하지 않는다.
- 검색 결과 선택, 프로필 GET, followers·following·post 하위 경로에서 추가 remote lookup을 시작하지 않는다.
- change 전체 scenario와 task가 완료되고 canonical·Linear 정합성을 독립 확인하기 전에는 archive하지 않는다.

**Verification**

- Web typecheck와 관련 unit/E2E에서 canonical Remote Profile 표시, 결과 없음 fallback과 route zero-network 회귀를
  확인한다.
- `pnpm lint:prettier`, `pnpm --filter @kosmo/api lint:schema`, API/Fedify/Web typecheck와 관련 unit·integration
  test를 실행한다.
- `openspec validate materialize-remote-profile-search --strict`와 archive 후 전체 OpenSpec validation을 통과시킨다.

- [x] 2.1 기존 people 검색 UI가 새 canonical Remote Profile edge와 빈 fallback을 표시하고 프로필·nested route가 DB-only로 유지되는지 필요한 회귀 검증을 추가한다.
- [x] 2.2 formatting, GraphQL schema, API/Fedify/Web typecheck와 관련 unit·PostgreSQL integration·E2E 검증을 통과시키고 실행 결과를 handoff와 PR에 기록한다.
- [x] 2.3 최신 canonical·Linear와 구현·delta spec을 독립 대조하고 모든 task·scenario가 완료되면 active spec 동기화, archive와 archive 후 strict validation을 수행한다.
