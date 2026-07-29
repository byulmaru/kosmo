## Context

이 결정 기록은 PROD-517의 공개 `searchProfiles` 비용 증폭 경로를 닫으면서 PROD-504로 확정·구현된 Profile 부분검색 계약을 보존하기 위한 권한 경계와 구현 제약을 정리한다. 새 제품 동작이나 후속 abuse-control 정책을 추가하지 않고, 현재 canonical Account·Session·Profile 정책과 Linear 범위 안에서 구현자가 반드시 공유해야 할 선택만 기록한다.

## Decision Records

### `searchProfiles`는 Account 로그인만 요구한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `PROD-517`
- Status: Active
- Context / Problem: `/search` UI는 로그인 보호 라우트지만 `searchProfiles` root field는 공개되어 직접 API 호출이 가능하다. 동시에 selected Profile이 없는 로그인 Account도 Account 인증 경계를 통과할 수 있어야 한다.
- Decision Outcome: `searchProfiles`는 유효한 현재 Session으로 확인되는 Account 로그인 요청만 허용한다. selected Profile은 요구하지 않으며, 인증할 수 없는 요청은 Profile 검색 후보 조회 전에 permission error로 거부한다.
- Alternatives Considered: `usingProfile` 요구는 PROD-517보다 강한 정책으로 selected Profile이 없는 Account를 거부하므로 선택하지 않았다. UI 보호 라우트만 유지하는 방안은 직접 GraphQL 호출을 막지 못하므로 선택하지 않았다.
- Consequences: 브라우저 session 또는 유효 bearer credential에서 파생된 로그인 context는 검색할 수 있고, 비로그인·폐기·만료 credential 요청은 검색 결과를 받지 못한다.
- Confirmation / Follow-up: 비인증 permission error, Active Session 성공, selected Profile 없는 Active Session 성공을 API 통합 경계에서 검증한다.

### 인증은 GraphQL field scope에서 resolver보다 먼저 평가한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `PROD-517`
- Status: Active
- Context / Problem: PROD-517은 후보 DB 조회 전 거부와 기존 GraphQL auth error 일관성을 요구한다. resolver 내부나 Web 프록시에만 guard를 두면 검사 시점이 늦거나 direct/native API 경계를 놓칠 수 있다.
- Decision Outcome: `searchProfiles` field 자체에 기존 GraphQL `login` auth scope를 적용해 resolver 호출 전에 인증을 평가하고, 기존 scope-auth permission error 변환을 재사용한다. 이 보안 경계를 만족하는 동등한 builder-level 구성은 허용한다.
- Alternatives Considered: resolver 본문의 수동 context 검사는 configured local Instance 또는 후보 조회 전 실행을 구조적으로 보장하기 어렵고 error 표현을 중복하므로 선택하지 않았다. Web 프록시-only 차단은 공개 API와 native bearer 경계를 보호하지 못한다. Profile type 전체 scope는 공개 exact 조회까지 바꾸므로 선택하지 않았다.
- Consequences: 검색 SQL·connection 구현은 인증 이후 그대로 재사용할 수 있다. field-level auth가 아닌 우회 guard로 바꾸려면 resolver 선행 실행 방지와 기존 error 계약을 동등하게 증명해야 한다.
- Confirmation / Follow-up: 구현 diff에서 scope가 `searchProfiles` connection 하나에만 적용되고 resolver의 local Instance·Profile 조회보다 먼저 평가되는지 리뷰한다.

### 기존 Profile 검색과 공개 exact lookup 계약을 보존한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-504`, `PROD-517`
- Status: Active
- Context / Problem: 인증 보완이 완료된 부분검색의 local/remote 범위, visibility, literal `LIKE` 처리, cursor pagination이나 공개 프로필 exact lookup까지 바꾸면 독립적인 계약 변경과 소비자 회귀가 생긴다.
- Decision Outcome: 인증된 `searchProfiles`는 현재 query/input, non-null connection, local/remote handle 해석, staged visibility, literal `LIKE` escape, parameter binding과 immutable `Profile.id` cursor 의미를 유지한다. `profileByHandle`의 공개 단건 lookup 인증·입출력 계약도 변경하지 않는다.
- Alternatives Considered: trigram/GIN index, 검색 알고리즘·정렬, 전역 rate/complexity limit, UI 변경과 exact/partial moderation 전환은 PROD-517의 승인 범위가 아니므로 현재 결정에 포함하지 않았다.
- Consequences: 구현과 테스트는 인증 경계에 집중하며 DB schema, migration, Relay artifact와 UI 변경을 만들지 않는다. 인증된 Account의 반복 검색 비용은 현재도 남는다.
- Confirmation / Follow-up: 기존 local/remote, wildcard escape, pagination, no-materialization 회귀와 guest exact lookup을 검증하고 DB/schema/client diff가 없음을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
