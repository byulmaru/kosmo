## Context

이 결정 기록은 `proposal.md`, `specs/profile/spec.md`, `specs/post/spec.md`와 `design.md`가 정리한
PROD-962 범위의 selected Profile 권한 변경을 반영한다. canonical 문서가 정한 Membership-only 선택 자격과
action 고유 Local/Remote 의미를 구현 전에 분리해 기록한다.

## Decision Records

### Selected Profile 선택 자격은 Account-Profile Membership 하나다

- Decision Date: 2026-09-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/objects/account-profile-membership.md`, `docs/architecture/core-services.md`, PROD-962
- Status: Active
- Context / Problem: selected Profile을 고르는 공통 경계에 Profile Origin/Instance Kind, Account Profile Role 또는 Profile 생성자 여부가 중복 조건으로 섞여 있었다.
- Decision Outcome: 요청 Account와 Profile 사이의 Account-Profile Membership 존재를 유일한 선택 자격으로 사용한다. Active Account와 selected Profile의 공통 조회 가능 상태는 요청 유효성 경계로 유지하되, 선택 권한을 추가하는 Origin/Kind/Role/creator 검사는 하지 않는다.
- Alternatives Considered: Local Profile만 허용하거나 Local/Remote capability를 공통 계약으로 명시하는 선택은 실제 권한 규칙을 불필요하게 좁히거나 넓히므로 채택하지 않는다.
- Consequences: `selectProfile`/`usingProfile` 이후 resolver와 Core action은 Membership 권한을 다시 만들지 않으며, Member와 Owner의 운영 권한은 별도의 action 조건으로 남는다.
- Confirmation / Follow-up: 선택 성공, Membership 부재, Profile 공통 조회 불가 결과를 focused behavior test와 strict OpenSpec 검증으로 확인한다.

### Remote 선택은 지원·금지 capability로 계약하지 않는다

- Decision Date: 2026-09-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/objects/account-profile-membership.md`, `docs/architecture/core-services.md`, PROD-962
- Status: Active
- Context / Problem: 현재 운영 경로에 Remote Profile Membership 생성이 없다는 구현 사실이 Remote selected Profile을 지원하거나 거부하는 계약처럼 active 문서와 테스트에 표현되어 있었다.
- Decision Outcome: Remote Profile Membership 생성 경로의 유무는 구현 사실로만 취급한다. 이 change는 Remote selected Profile capability를 보장하지도 금지하지도 않으며, 이를 증명하는 인위적인 성공·실패 scenario를 유지하지 않는다.
- Alternatives Considered: Remote 선택을 명시적으로 지원하거나 명시적으로 금지하는 것은 현재 upstream authority가 정하지 않은 제품 capability를 추가하므로 채택하지 않는다.
- Consequences: active post spec에서 Local/Remote selected Profile 약속과 artificial Remote-selected scenario를 제거하고, Remote materialization이나 생성 경로는 변경하지 않는다.
- Confirmation / Follow-up: active 문서와 새 delta에 Remote 지원·금지 문구가 없는지 확인하되, target/source/recipient/federation/protocol-origin의 의미상 분기는 별도로 검증한다.

### 대상·source·recipient·delivery의 origin 조건은 유지한다

- Decision Date: 2026-09-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/objects/account-profile-membership.md`, `docs/architecture/core-services.md`, PROD-962
- Status: Active
- Context / Problem: selected actor의 공통 권한 조건을 제거하는 과정에서 action 결과의 저장 위치, Media source, Follow/Follow Request 관계, federation delivery 정책까지 함께 단순화할 위험이 있다.
- Decision Outcome: Profile update, profile mute owner, unfollow follower에서 selected actor에 중복된 Local guard만 별도로 정리한다. Target, source, recipient, visibility, transaction, federation delivery와 protocol-origin에 의미상 필요한 Local/Remote 조건은 각 action 계약에 보존한다.
- Alternatives Considered: 모든 Local/Remote 조건을 전역에서 제거하는 방식은 action별 결과·전달 의미를 훼손하므로 채택하지 않는다.
- Consequences: 구현·테스트 diff는 selected actor와 action 대상의 조건을 분리해야 하며, keep-list에 해당하는 조건은 제거 대상이 아니다.
- Confirmation / Follow-up: 세 후보 action의 성공·관계/상태 실패 및 target/source/recipient/federation/protocol-origin focused test를 각각 확인한다.

### 중복 selected-actor Local guard와 전용 테스트만 제거한다

- Decision Date: 2026-09-14
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/objects/account-profile-membership.md`, `docs/architecture/core-services.md`, PROD-962
- Status: Active
- Context / Problem: 이미 공통 선택 경계를 통과한 selected actor를 소비하는 action 중 Profile update, profile mute owner, unfollow follower에 Local kind guard와 그 guard만을 증명하는 artificial Remote-selected fixture/test가 남아 있다.
- Decision Outcome: 위 세 후보 action에서 selected actor의 중복 `InstanceKind.LOCAL` guard와 해당 guard만을 증명하는 artificial Remote-selected test를 제거한다. Membership/visibility 및 action 고유 owner·follower·state·target 조건과 그 검증은 유지한다.
- Alternatives Considered: 모든 Core action을 일괄 검색·수정하거나 Remote membership fixture를 새로 도입하는 방식은 범위를 넓히고 계약되지 않은 capability를 만든다.
- Consequences: 세 action 외의 origin 조건과 schema/DB 모델은 변경하지 않는다. 구현자는 변경된 결과를 behavior test로 검증해야 한다.
- Confirmation / Follow-up: PROD-962 구현자가 세 action의 focused tests와 strict OpenSpec validation을 실행하고, keep-list 조건이 diff에 남아 있음을 보고한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 기존 selected Profile을 Local-only로 규정하거나 Local/Remote 선택 capability를 보장하던 active 문구와 인위적인 Remote-selected 성공·실패 scenario는 위 Membership-only 계약으로 대체된다. Remote 선택 지원·금지 capability를 새로 정하지 않는 이유는 현재 canonical/Linear authority가 선택 자격을 Membership 존재로만 정했기 때문이다. archived OpenSpec history는 이 change에서 수정하지 않는다.
