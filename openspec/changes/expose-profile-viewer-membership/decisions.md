## Context

이 기록은 ADR 0023과 PROD-705가 확정한 viewer-relative Membership 계약을 `profile` 및 `profile-edit-ui`
delta와 구현 handoff로 옮긴다. 기존 ADR 0021의 selected Owner 경계와 archived `add-local-profile-edit` 이력은
보존하되, 구체적인 top-level query source만 새 관계 projection으로 대체한다.

## Decision Records

### viewerState는 현재 Account와 queried Profile의 실제 Membership만 반환한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account-profile-membership.md`,
  `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/design/profile-edit.md`, `PROD-705`
- Status: Active
- Context / Problem: route 전용 capability를 여러 consumer가 공유하면 실제 Account-Profile 관계보다 특정 UI
  흐름이 GraphQL root 계약의 중심이 되고, 잘못된 scoping은 다른 Account의 role을 노출할 수 있다.
- Decision Outcome: `Profile.viewerState.membership`은 현재 session Account와 queried Profile 사이의 실제 nullable
  `AccountProfile`만 반환한다. role은 저장된 `OWNER | MEMBER`이며 관계가 없으면 `null`이다. 다른 Account의
  Membership/role과 합성 `canEdit` scalar는 노출하지 않는다. guest 또는 유효한 viewer Profile이 없는 요청은
  기존 viewerState nullable 경계를 유지한다.
- Alternatives Considered: public role/capability scalar는 실제 관계를 축약하고 client 권한 추측을 유도해
  제외한다. Profile의 모든 Membership을 노출하는 방식은 당사자 조회 권한과 account scoping을 위반해 제외한다.
- Consequences: 동일 Profile도 현재 Account에 따라 Membership 결과가 달라지며, Relay/client는 role 하나를
  편집 권한 전체로 해석할 수 없다.
- Confirmation / Follow-up: Owner, Member, 무관 Account, 다른 Account Owner와 guest/no-viewer fixture로
  nullability와 비노출을 검증한다.

### 공개 Profile과 protected route는 서로 다른 selected 경계를 유지한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/design/profile-edit.md`, `PROD-705`
- Status: Active
- Context / Problem: Membership role만 공통으로 사용하면 공개 조회 target이 selected Profile인지 또는 protected
  route가 session의 selected Profile을 대상으로 하는지 보장하지 못한다.
- Decision Outcome: 공개 Profile은 `viewerState.isSelf`와 Owner Membership을 함께 사용한다. protected route는
  `currentSession.selectedProfile.viewerState.membership`을 사용한다. 두 경로 모두 Active Account/Profile,
  Local·non-Suspended Instance 조건을 유지하고, 권한 없는 공개 화면에는 disabled edit placeholder를 만들지
  않으며 직접 route 접근은 기존 StateView를 제공한다.
- Alternatives Considered: Membership role 하나 또는 selected Profile id/Local origin만으로 판정하는 방식은
  selected·Owner·origin/state 조건 일부를 잃으므로 제외한다. 두 consumer를 하나의 top-level edit capability로
  다시 묶는 방식은 이번 migration의 목적과 맞지 않아 제외한다.
- Consequences: 두 consumer는 같은 관계를 조회하지만 eligibility 계산의 진입 target을 각각 검증한다.
- Confirmation / Follow-up: public selected match/mismatch와 protected selected Owner/Member/Remote/상태 부적격
  component scenario를 각각 검증한다.

### Membership projection은 Account 경계를 보존하는 request-scoped batch loader를 사용한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`,
  `docs/design/profile-edit.md`, `PROD-705`
- Status: Active
- Context / Problem: Profile field마다 Membership을 직접 조회하면 목록 크기에 비례한 N+1이 생기고, Account가
  key 또는 predicate에서 빠지면 viewer-relative 결과가 섞일 수 있다.
- Decision Outcome: request-scoped batch loader가 현재 session Account id와 requested Profile id들을 query
  predicate에 함께 보존한다. loader key는 Account를 캡처한 request context 안의 Profile id 또는 Account id를
  포함한 복합 key를 사용할 수 있지만, loader identity와 결과 cache를 서로 다른 Account 요청이 공유해서는 안
  된다. 유효한 session Account가 없으면 Membership row를 조회하거나 합성하지 않고, 기존 `AccountProfile`
  Node/role을 반환 type으로 재사용한다.
- Alternatives Considered: Account를 request context에 캡처한 Profile id key와 Account id를 포함한 복합 key는
  동일한 scoping/batching 불변조건을 만족하므로 둘 다 허용한다. Profile별 direct query는 N+1 때문에 제외한다.
  전역 Account 간 cache는 권한 데이터 혼합 위험 때문에 제외한다.
- Consequences: loader는 request/actor lifecycle 밖에서 공유할 수 없고, query-count와 cross-account fixture가
  구현 검증의 일부가 된다. 새 DB index는 이 결정에 포함되지 않는다.
- Confirmation / Follow-up: 여러 Profile을 한 operation에서 조회해 batch query 수를 확인하고 다른 Account
  Membership이 반환되지 않는지 검증한다.

### viewer projection은 mutation 권한 증거가 아니다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`,
  `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-705`
- Status: Active
- Context / Problem: Relay에 남은 Membership이나 route query 결과를 저장 권한으로 사용하면 관계·상태 변경 뒤의
  stale data가 mutation 권한으로 승격될 수 있다.
- Decision Outcome: `updateProfile`은 mutation 실행 시 현재 Account, selected Profile, Instance와 Owner
  Membership을 server-authoritative하게 독립 재검증한다. 이 migration은 기존 transaction·locking 정책을
  변경하지 않는다.
- Alternatives Considered: client projection 또는 이전 query 결과 재사용은 stale 권한 위험 때문에 제외한다.
  eligibility row lock/atomic guard 추가는 현재 canonical 정책과 범위를 변경하므로 제외한다.
- Consequences: UI eligibility와 mutation authorization은 같은 조건을 공유하지만 서로 독립된 검증 경계다.
- Confirmation / Follow-up: 기존 성공·non-Owner·상태 부적격과 eligibility 변경 후 후속 요청 거부 회귀 test를
  유지한다.

### consumer 전환과 호환성 확인 뒤 selectedProfileForEdit를 제거한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`,
  `docs/design/profile-edit.md`, `PROD-705`
- Status: Active
- Context / Problem: public GraphQL field를 consumer보다 먼저 제거하면 main app과 알려지지 않은 operation이
  실패하고, 반대로 field를 계속 확장하면 route 전용 capability가 새 production 계약으로 굳어진다.
- Decision Outcome: Membership field를 additive하게 제공하고 main의 공개 Profile route와 `ProfileEditRoute`를
  먼저 전환한다. repository 및 외부 호환성 확인 뒤 같은 선행 migration에서 `Query.selectedProfileForEdit`
  schema/resolver, Relay operation과 generated artifact를 제거한다. public/runtime schema를 함께 동기화한다.
- Alternatives Considered: query를 영구 alias로 유지하는 방식은 제거 결정을 지연해 제외한다. consumer 전환 전
  즉시 제거는 deploy/compile 호환성을 깨뜨려 제외한다.
- Consequences: schema removal은 breaking change로 명시하고, rollback 시 schema/resolver와 consumer operation을
  한 계약 단위로 복원한다. archived `add-local-profile-edit`은 수정하지 않는다.
- Confirmation / Follow-up: repository 전체 consumer/generated artifact 검색, schema diff와 Relay compile을
  확인한다.

### PROD-705가 선행 migration과 archive를 소유하고 ProfileSwitcher는 PROD-660에 남긴다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`,
  `docs/design/profile-edit.md`, `PROD-705`, `PROD-660`
- Status: Active
- Context / Problem: PR #529의 sidebar action과 선행 cross-layer migration을 한 change에 섞으면 서로 다른
  review/merge lifecycle과 시각 범위가 결합된다.
- Decision Outcome: PROD-705 선행 PR은 schema/resolver/loader, main의 두 route consumer, tests, canonical 및
  OpenSpec 정합성, 통합 검증과 이 change archive를 소유한다. PR #529의 ProfileSwitcher consumer와 노란 action
  동작은 선행 merge 뒤 PROD-660이 전환한다.
- Alternatives Considered: PR #529 안에서 migration을 함께 수행하는 방식은 합의된 선행 순서와 blocker를
  위반해 제외한다. 별도 archive-only 이슈/PR은 실제 독립 결과가 없어 만들지 않는다.
- Consequences: 이 change는 `web-app-shell` delta와 PROD-660 구현 task를 포함하지 않는다. PROD-705 merge가
  후행 PR 갱신의 전제다.
- Confirmation / Follow-up: PROD-705 완료 전 main consumer·schema·tests·spec 전체를 검증하고, merge 후
  PROD-660이 PR #529를 새 계약 위에 stack/rebase한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archived `openspec/changes/archive/2026-08-06-add-local-profile-edit/decisions.md`의 guest-safe nullable selected
  Profile query 결정은 당시 구현 이력으로 보존한다. 현재 계약에서는 이 change의 viewer Membership projection
  및 consumer-first `selectedProfileForEdit` 제거 Active 결정이 query source를 대체한다.
