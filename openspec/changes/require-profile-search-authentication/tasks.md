## 1. PROD-517 `searchProfiles` 인증 경계와 회귀 검증

**Authority / Provenance**

- `docs/domain/objects/account.md`
- `docs/domain/objects/session.md`
- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- `PROD-504`
- `PROD-517`

**Deliverable**

세션 또는 유효한 bearer token이 없는 직접 `searchProfiles` 요청은 Profile 검색 후보 조회 전에 permission error로 거부되고, 로그인 Account는 selected Profile 유무와 관계없이 기존 local/remote 부분검색 결과와 pagination을 그대로 사용할 수 있다.

**Guardrails**

- `searchProfiles`는 Account `login`만 요구하고 selected Profile `usingProfile`은 요구하지 않는다.
- 인증은 GraphQL field 경계에서 resolver와 후보 조회보다 먼저 평가하며 기존 scope-auth permission error 표현을 재사용한다.
- `profileByHandle`의 공개 단건 조회 인증·입출력 계약을 변경하지 않는다.
- `searchProfiles`의 field/connection shape, handle 정규화, local/remote 범위, literal `LIKE` escape와 parameter binding, ADR 0017 staged visibility, immutable `Profile.id` cursor pagination을 변경하지 않는다.
- DB schema·migration·index, dependency, Web/native transport, UI/Relay artifact와 전역 rate/complexity limit을 변경하지 않는다.

**Verification**

- token이 없는 요청과 유효하지 않은 credential이 `PERMISSION_DENIED` GraphQL error를 반환하고 search data를 제공하지 않는지 검증한다.
- Active Session token과 selected Profile 없는 Active Session token이 기존 부분검색을 성공하는지 검증한다.
- 기존 local/remote 결과, suspended visibility, `%`·`_`·escape 문자 처리, 다중 page ID cursor, remote no-materialization과 guest `profileByHandle` 회귀 assertion을 유지한다.
- `node scripts/test-db.mjs run -- pnpm --filter @kosmo/api exec node --import tsx --test --test-concurrency=1 tests/integration/graphql/profile.test.ts`
- `pnpm --filter @kosmo/api lint:tsc`
- `pnpm --filter @kosmo/api test:unit`
- `pnpm --filter @kosmo/api lint:schema`
- 구현 diff에 DB/schema/client/dependency 변경이 없고 `openspec validate require-profile-search-authentication --strict`가 통과하는지 확인한다.

- [ ] 1.1 `searchProfiles`만 Account 로그인 field scope로 보호하고 인증 실패가 resolver와 후보 조회 전에 끝나게 한다.
- [ ] 1.2 인증 없음·유효하지 않은 credential·인증 성공·selected Profile 없는 인증 성공을 직접 검증하는 API 통합 회귀를 추가한다.
- [ ] 1.3 기존 검색·pagination·visibility·literal escape·remote no-materialization 및 공개 exact lookup 회귀를 인증 경계와 함께 통과시킨다.
- [ ] 1.4 관련 API typecheck·unit·schema check와 strict OpenSpec validation을 완료하고 DB/schema/client/dependency diff가 없음을 확인한다.
