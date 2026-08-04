## 1. PROD-648 Canonical·저장 계약

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `PROD-648`

**Deliverable**

Local Profile별 기본 Post Visibility를 durable하게 저장하고 기존·미설정 Local Profile을 `UNLISTED`로 읽을
수 있다.

**Guardrails**

- 지원 값은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`뿐이다.
- Remote Profile에 Kosmo Local 설정을 만들지 않고 기존 Post Visibility를 rewrite하지 않는다.
- schema 변경은 additive이며 rollback에서 저장된 사용자 값을 임의로 삭제하지 않는다.

**Verification**

- migration strict validation과 schema snapshot을 통과한다.
- 기존/신규 Local Profile과 Remote Profile의 저장·fallback·지원하지 않는 값 거부를 Core test로 검증한다.

- [x] 1.1 Profile 기본 Post Visibility의 canonical 소유권·허용 값·권한 문서를 PROD-648 Backend 계약에 맞게 정렬한다.
- [x] 1.2 Local Profile 기본값을 저장할 additive schema와 migration을 구현한다.
- [x] 1.3 Profile 생성·조회·Owner update에서 Local fallback, 허용 값과 Remote 비저장 계약을 구현한다.
- [x] 1.4 기존/신규 Local Profile, Remote Profile, `DIRECT` 거부와 부분 update 원자성을 검증한다.

## 2. PROD-648 GraphQL·권한 계약

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- `PROD-648`

**Deliverable**

Profile Member는 Local Profile 기본값을 조회하고 Owner는 변경할 수 있으며 기존 Profile update caller와
GraphQL payload 호환성을 유지한다.

**Guardrails**

- Member 조회와 Owner 변경 권한을 구분한다.
- non-member와 Remote Profile에는 값을 노출하거나 설정 변경을 허용하지 않는다.
- 기존 `updateProfile` caller와 Post `visibility` 입력 계약을 깨뜨리지 않는다.
- client generated type과 Relay·UI 검증을 Backend 완료 조건으로 요구하지 않는다.

**Verification**

- Owner·Member·non-member·Remote의 field 조회와 mutation 성공/거부를 GraphQL integration test로 검증한다.
- `DIRECT`와 명시적 `null` 거부, omitted input의 변경 없음과 payload Profile 값을 검증한다.
- GraphQL schema generation/check와 API typecheck를 통과한다.

- [x] 2.1 membership을 검증하는 nullable Profile 기본값 field와 optional Owner update input/payload 계약을 구현한다.
- [x] 2.2 Owner·Member·non-member·Remote와 허용/거부 값의 GraphQL integration test를 추가한다.
- [x] 2.3 GraphQL schema 산출물을 갱신하고 API schema check와 typecheck를 통과시킨다.

## 3. PROD-648 Backend 검증·archive

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/domain/objects/post.md`
- `PROD-648`

**Deliverable**

PROD-648이 소유한 DB/Core/GraphQL slice가 독립 검증되고 Frontend·Storybook 상태와 무관하게 Backend
change lifecycle을 완료할 수 있다.

**Guardrails**

- PROD-667의 Relay·Composer·Settings UI·`/settings` 연결을 diff나 required check에 포함하지 않는다.
- Quote Composer, Repost와 `DIRECT` recipient·옵션을 구현하거나 완료했다고 주장하지 않는다.
- PR readiness와 change archive를 구분하고 전체 Backend tasks와 정합성 증거가 있을 때만 archive한다.

**Verification**

- OpenSpec strict validation, migration validation, Core service test, API GraphQL integration·schema check·typecheck를
  통과한다.
- actual diff가 DB/Core/GraphQL과 Backend canonical/OpenSpec 범위만 포함하는지 확인한다.

- [x] 3.1 Backend OpenSpec strict validation과 migration·Core·API required check를 실행하고 실패를 수정한다.
- [x] 3.2 actual implementation diff와 task checkbox, 최신 canonical·Linear·OpenSpec 정합성을 확인한다.
- [x] 3.3 Backend change archive 담당과 실행 결과·남은 rollout 위험을 handoff와 PR에 기록한다.
