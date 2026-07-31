## Why

인증된 사람 검색은 현재 DB에 저장된 Profile만 조회하므로 사용자가 정확한 원격 qualified handle을 알고 있어도
아직 materialize되지 않은 원격 계정을 찾을 수 없다. PROD-573은 일반 검색과 프로필 route의 zero-network
경계를 유지하면서, 사용자가 명시한 원격 계정만 기존 Fedify actor materialization 경계로 저장해 검색 결과로
연결한다.

## What Changes

- 인증된 `searchProfiles`가 명시적인 `@handle@instance` 전체 입력을 받은 경우에만 저장된 actor를 우선 확인하고,
  없으면 기존 Fedify lookup과 Remote Profile materialization을 수행한다.
- 저장된 Remote Profile 검색은 actor refresh를 예약하지 않고 기존 DB 결과를 반환한다.
- materialization 결과는 기존 Profile visibility와 `Profile.id` cursor connection을 통과한 뒤 검색 결과로
  반환한다. canonical actor domain이 요청 alias와 달라도 materialized Profile identity를 기준으로 결과를
  연결한다.
- lookup 실패, unavailable Instance와 identity 충돌은 빈 검색 결과로 fallback한다. 예상하지 못한
  materialization 오류도 관측한 뒤 검색 fallback을 유지한다.
- 비인증 요청, 일반 텍스트·local·불완전한 remote handle 검색, `profileByHandle`, 프로필 GET와 하위 route는
  기존 인증·DB-only·zero-network 계약을 유지한다.
- GraphQL schema, DB schema·migration, 별도 WebFinger/document loader와 SSR HTML은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`,
  `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- Linear Contract: `PROD-573`
- Linear Implementations: `PROD-573`; 기존 기반 `PROD-248`, `PROD-249`, `PROD-257`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: 인증된 명시적 원격 qualified handle 검색에만 actor materialization을 연결하고 나머지 Profile
  조회·검색의 DB-only 경계를 유지한다.
- `web-app-shell`: 기존 사람 검색 UI가 같은 GraphQL connection을 사용해 materialize된 원격 Profile을 표시하되,
  프로필 route와 클라이언트 자체는 원격 fetch를 시작하지 않는다.

## Impact

- API: `searchProfiles` resolver의 명시적 원격 handle 분기, 예상 오류 fallback·관측과 PostgreSQL 통합 테스트
- Federation: 기존 `federation.createContext`, `findOrMaterializeRemoteProfileActor`, Instance 상태·SSRF·identity
  검증과 idempotent 저장 경계 재사용
- Package boundary: `@kosmo/api`가 기존 workspace package `@kosmo/fedify` runtime API를 사용하도록 manifest를
  정렬할 수 있으나 새 외부 protocol client는 추가하지 않음
- Web/App: GraphQL schema와 Relay query shape는 유지하며 정확한 미저장 원격 계정 검색 결과만 확장
- Data: schema와 migration 없이 기존 `Instances`, `Profiles`, `ActivityPubActors` row와 uniqueness를 사용
