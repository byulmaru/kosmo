## 1. PROD-962 Profile update selected-actor guard

**Authority / Provenance**

- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/architecture/core-services.md`
- `PROD-962`

**Deliverable**

Membership과 공통 조회 가능 상태를 통과한 selected Profile이 Profile update action에서 Profile Origin/Instance
Kind 때문에 거부되지 않으며, action 고유 운영 권한과 상태 검증은 계속 적용된다.

**Guardrails**

- selected actor의 중복 `InstanceKind.LOCAL` 조건만 제거한다.
- Account Profile Role과 Profile 생성자 여부를 selected Profile 선택 조건으로 추가하지 않는다.
- Profile update의 Owner 운영 권한, 대상 상태와 transaction 조건은 유지한다.
- Target/source/recipient, visibility, federation delivery와 protocol-origin의 의미상 필요한 origin 조건은 변경하지 않는다.

**Verification**

Profile update의 membership/visibility 성공·실패와 action 고유 Owner/상태 결과를 behavior test로 확인하고,
selected actor의 Local kind만을 증명하던 artificial Remote-selected fixture·scenario가 제거되었는지 diff와
focused test 결과로 확인한다.

- [x] 1.1 Profile update action에서 selected actor에 대한 중복 `InstanceKind.LOCAL` guard를 제거하고 Owner·상태·transaction 조건을 보존한다.
- [ ] 1.2 Profile update의 artificial Remote-selected guard 증명 fixture·scenario를 제거하고 membership/visibility 및 Owner·상태 실패 경로를 검증한다.

## 2. PROD-962 Profile mute owner selected-actor guard

**Authority / Provenance**

- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/architecture/core-services.md`
- `PROD-962`

**Deliverable**

Membership과 공통 조회 가능 상태를 통과한 selected Profile이 profile mute owner action에서 Profile Origin/Instance
Kind 때문에 거부되지 않으며, mute의 owner 관계와 대상 상태 검증은 계속 적용된다.

**Guardrails**

- selected actor의 중복 `InstanceKind.LOCAL` 조건만 제거한다.
- profile mute 대상 Profile의 visibility, owner 관계와 상태 조건은 유지한다.
- Target/source/recipient, visibility, federation delivery와 protocol-origin의 의미상 필요한 origin 조건은 변경하지 않는다.

**Verification**

profile mute owner의 membership/visibility 성공·실패와 owner 관계·대상 상태 결과를 behavior test로 확인하고,
selected actor의 Local kind만을 증명하던 artificial Remote-selected fixture·scenario가 제거되었는지 확인한다.

- [x] 2.1 Profile mute owner action에서 selected actor에 대한 중복 `InstanceKind.LOCAL` guard를 제거하고 owner 관계·대상 상태 조건을 보존한다.
- [ ] 2.2 Profile mute의 artificial Remote-selected guard 증명 fixture·scenario를 제거하고 membership/visibility 및 owner 관계·대상 상태 실패 경로를 검증한다.

## 3. PROD-962 Unfollow follower selected-actor guard

**Authority / Provenance**

- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/domain/objects/account-profile-membership.md`
- `docs/architecture/core-services.md`
- `PROD-962`

**Deliverable**

Membership과 공통 조회 가능 상태를 통과한 selected Profile이 unfollow follower action에서 Profile Origin/Instance
Kind 때문에 거부되지 않으며, follower 관계와 대상 Profile 상태 검증은 계속 적용된다.

**Guardrails**

- selected actor의 중복 `InstanceKind.LOCAL` 조건만 제거한다.
- unfollow의 follower 관계, 대상 상태와 idempotent 결과는 유지한다.
- Target/source/recipient, visibility, federation delivery와 protocol-origin의 의미상 필요한 origin 조건은 변경하지 않는다.

**Verification**

unfollow follower의 membership/visibility 성공·실패와 follower 관계·대상 상태 결과를 behavior test로 확인하고,
selected actor의 Local kind만을 증명하던 artificial Remote-selected fixture·scenario가 제거되었는지 확인한다.

- [x] 3.1 Unfollow follower action에서 selected actor에 대한 중복 `InstanceKind.LOCAL` guard를 제거하고 follower 관계·대상 상태·idempotent 조건을 보존한다.
- [ ] 3.2 Unfollow의 artificial Remote-selected guard 증명 fixture·scenario를 제거하고 membership/visibility 및 follower 관계·대상 상태 실패 경로를 검증한다.
