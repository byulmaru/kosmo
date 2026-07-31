## 1. PROD-607 Remote actor Update 처리

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `PROD-607`

**Deliverable**

검증된 inbound actor Update가 저장된 동일 remote profile의 projection, follow policy와 endpoint metadata를
TTL과 무관하게 즉시 갱신한다.

**Guardrails**

- Update actor, embedded object와 저장 actor identity가 모두 일치해야 한다.
- unsupported object, unknown actor와 local actor 충돌은 저장 상태를 변경하지 않는다.
- Update만으로 새 remote profile을 만들거나 기존 identity를 재연결하지 않는다.

**Verification**

- actor type, identity mismatch, unsupported/unknown/local actor, 양방향 policy, endpoint, timestamp와 중복
  Update handler 테스트를 통과시킨다.

- [x] 1.1 검증된 embedded actor Update를 저장 remote profile refresh 경계에 연결한다.
- [x] 1.2 inbox listener에 actor Update 처리를 등록한다.
- [x] 1.3 성공, 거부, 양방향 projection과 멱등성 handler 테스트를 추가한다.

## 2. PROD-607 Follow lifecycle 회귀 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `PROD-607`

**Deliverable**

policy refresh 전의 established 관계는 유지되고, refresh 뒤 신규 Follow와 후속 Accept가 최신 policy에 맞는
pending/established DB, GraphQL, count와 FollowButton 상태를 만든다.

**Guardrails**

- policy 변경만으로 기존 relation이나 pending request를 변경하지 않는다.
- count는 established relationship 전이에만 한 번 반영한다.

**Verification**

- 기존 core/API/web Follow 상태 머신 테스트와 Update 뒤 Follow/Accept 연결 테스트를 통과시킨다.

- [x] 2.1 policy refresh가 기존 relation과 count를 유지하고 신규 Follow 결과를 바꾸는지 검증한다.
- [x] 2.2 approval-required Update 뒤 pending request와 후속 Accept 승격을 검증한다.
- [x] 2.3 관련 core, API와 FollowButton 회귀 테스트를 실행한다.

## 3. PROD-607 계약 및 완료 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `PROD-607`

**Deliverable**

구현, 테스트와 OpenSpec delta가 같은 PROD-607 계약을 표현하고 strict validation을 통과한다.

**Guardrails**

- Note lifecycle, outbound local actor Update와 기존 잘못된 relation 일괄 복구를 포함하지 않는다.

**Verification**

- 대상 package test, typecheck/lint 및 `openspec validate --strict`를 통과시킨다.

- [x] 3.1 관련 package test와 정적 검사를 통과시킨다.
- [x] 3.2 OpenSpec strict validation과 diff 검사를 통과시킨다.
