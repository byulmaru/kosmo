## Why

보호 라우트인 `/search`가 사용하는 GraphQL `searchProfiles`는 현재 로그인 scope 없이 공개되어 있어, 비로그인 클라이언트가 UI를 우회해 비용이 큰 부분 문자열 검색을 반복하거나 batch로 실행할 수 있다. PROD-517의 보안 경계에 따라 API 접근 정책을 UI와 일치시키되, 완료된 PROD-504의 검색 결과·visibility·pagination 계약은 그대로 유지해야 한다.

## What Changes

- `searchProfiles` 호출에 로그인한 Account를 요구하고, 세션 또는 유효한 bearer token이 없는 요청은 Profile 후보 조회 전에 GraphQL permission error로 거부한다.
- 로그인 사용자의 기존 local/remote handle 부분 검색, SQL `LIKE` 메타문자 escape, staged visibility와 `Profile.id` cursor pagination 동작을 유지한다.
- 인증 실패와 인증 성공 경로를 API 통합 테스트로 직접 검증한다.
- GraphQL 전체 rate/complexity limit, 부분 검색 index·알고리즘·정렬, UI 보호 라우트와 인증 사용자 abuse control은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- Linear Contract: [PROD-517](https://linear.app/byulmaru/issue/PROD-517/searchprofiles%EB%A5%BC-%EB%A1%9C%EA%B7%B8%EC%9D%B8-%EC%82%AC%EC%9A%A9%EC%9E%90%EB%A1%9C-%EC%A0%9C%ED%95%9C%ED%95%9C%EB%8B%A4)
- Linear Implementations: `PROD-517` — 동일 이슈가 이 작은 변경의 구현·회귀 테스트·통합 검증·archive를 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: `searchProfiles`의 기존 부분검색 계약에 로그인 인증과 후보 DB 조회 전 거부 요구사항을 추가한다.

## Impact

- GraphQL API: `searchProfiles` resolver의 auth scope와 비로그인 오류 응답이 바뀌며 field 이름, 인자, 반환 connection shape와 schema nullability는 유지된다.
- 검증: 기존 Profile GraphQL 통합 테스트 요청에 인증 context를 제공하고, 비인증 permission error 및 인증 검색 회귀를 추가한다.
- 소비자: Web `/graphql` 프록시와 native bearer 전달, 보호 라우트, Relay operation/artifact는 동작과 공개 shape가 바뀌지 않아 수정 대상이 아니다.
- 데이터·운영: dependency, DB schema, migration, index와 전역 GraphQL resource control 변경은 없다.
