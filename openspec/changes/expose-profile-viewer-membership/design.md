## Context

현재 `Profile.viewerState` resolver는 유효한 viewer Profile이 있는 요청에서 `isSelf`, established follow와
pending follow request를 반환한다. 편집 eligibility는 별도 top-level `selectedProfileForEdit` resolver가
session의 selected Profile, 현재 Account Membership, Account/Profile 상태와 Instance 조건을 한 query에서
검증한다. 공개 Profile layout과 `ProfileEditRoute`가 이 route 전용 결과를 직접 소비한다.

GraphQL에는 이미 Relay Node인 `AccountProfile`과 `role` field가 있고, 요청 context에는 Profile id 목록을 한
query로 처리하는 DataLoader 관례가 있다. `updateProfile` service는 projection과 별개로 transaction 안에서 현재
Account, selected Profile, Instance와 Membership role을 재검증한다. 이 change는 이 기반을 재사용해 조회 계약만
관계 중심으로 전환한다.

## Goals / Non-Goals

**Goals:**

- 현재 session Account와 queried Profile 사이의 실제 Membership을 nullable viewer-relative field로 제공한다.
- 다른 Account의 role 비노출과 Profile 목록 batching을 보장한다.
- 공개 Profile과 protected route가 동일한 Membership을 사용하되 각자의 selected Profile 경계를 유지한다.
- first-party `selectedProfileForEdit` consumer를 전환하고 공개 schema에서 field를 제거한다.
- 기존 FollowButton과 mutation authorization 경계를 회귀 없이 유지한다.

**Non-Goals:**

- AccountProfile DB schema, role enum 또는 Membership lifecycle 변경.
- query plan 근거와 별도 승인 없는 DB index 추가.
- `updateProfile` transaction/locking 정책, Profile form·Media·Tag 저장 UX 또는 Follow policy 변경.
- PR #529의 ProfileSwitcher consumer, 노란 편집 action geometry·배치·접근성·navigation 구현.
- Native 실제 기기·simulator runtime QA.

## Implementation Guidance

### Current Constraints

- `Profile.viewerState`는 `usingProfile` auth와 nullable unauthorized resolver를 사용한다. 따라서 Account session이
  있어도 유효한 viewer Profile이 없으면 viewer state 전체가 nullable한 기존 경계를 유지해야 한다.
- 현재 follow와 follow request 조회는 각각 request-scoped DataLoader를 사용한다. Membership을 Profile field마다
  직접 query하면 목록 조회가 N+1로 바뀐다.
- 기존 `AccountProfile` Node resolver는 id 목록으로 row를 조회하지만, viewer-relative Membership 발견 자체는
  반드시 현재 `ctx.session.accountId`로 제한해야 한다. Node resolver가 존재한다는 이유만으로 임의 Membership
  id를 선택해서는 안 된다.
- 공개 `profileByHandle`은 visible Profile만 반환하지만 Local 여부는 별도 `Profile.instance.kind`로 확인해야
  한다. `membership.role === OWNER` 하나만으로 Remote Profile 운영 권한을 만들 수 없다.
- `currentSession.selectedProfile`은 session의 selected identity를 제공하므로 protected route가 별도 top-level
  capability 없이 같은 Profile의 초기값과 viewer Membership을 조회할 수 있다.
- Relay operation과 checked-in generated artifact, `apps/api/schema.graphql` public schema와 runtime schema가 함께
  바뀌어야 한다.

### Recommended Approach

1. 기존 request context의 DataLoader 경계를 사용해 Profile id들을 batch하고, loader instance가 현재 session
   Account id를 캡처하도록 한다. 한 batch query는 `(current account id, requested profile ids)`만 조회하고
   Profile별 최대 한 Membership을 key로 반환한다.
2. 기존 `AccountProfile` Node/role을 `ProfileViewerState.membership`의 nullable type으로 재사용한다. Membership은
   실제 field가 선택된 경우에만 loader를 실행해도 되고, 기존 viewerState resolver가 follow loaders와 함께
   미리 resolve해도 된다.
3. 공개 Profile operation은 target의 `instance.kind`, `viewerState.isSelf`와 `viewerState.membership.role`을 읽고
   전체 eligibility가 성립할 때만 기존 편집 action을 렌더한다. 불성립 시 기존 FollowButton 경로를 유지하되
   FollowButton 자체의 viewer-state 해석을 바꾸지 않는다.
4. `ProfileEditRoute` operation은 `currentSession.selectedProfile`에서 instance, viewer Membership과 현재 form
   초기값을 함께 읽는다. selected Profile이 없거나 Active/Local/non-Suspended/Owner 조건을 만족하지 않으면 기존
   StateView로 분기한다.
5. API integration test에서 Owner/Member/무관 Account와 다른 Account Owner, guest/no-viewer, Local/Remote 및
   목록 query count를 검증한다. app test에서는 selected match/mismatch와 protected route 상태를 검증하고 기존
   FollowButton 및 `updateProfile` authorization 회귀 suite를 유지한다.
6. repository operation·fixture·generated artifact를 검색해 first-party consumer가 전환됐음을 확인한 뒤
   `selectedProfileForEdit` resolver와 schema field를 제거한다.

### Allowed Alternatives

- Membership loader 호출은 `Profile.viewerState` resolver에서 follow 상태와 병렬로 수행하거나
  `ProfileViewerState.membership` field resolver에서 지연 수행할 수 있다. 어느 쪽이든 기존 viewer-state
  nullability, 현재 Account scoping과 request batching을 보존해야 한다.
- loader key는 request context에 Account id를 고정한 Profile id이거나 Account id를 포함한 복합 key일 수 있다.
  동일 request에서 다른 Account의 결과를 공유하지 않고 query-count 검증을 통과해야 한다.
- client eligibility 계산은 route component 내부 또는 권한 추측을 하지 않는 작은 순수 helper에 둘 수 있다.
  public route와 protected route의 서로 다른 selected 경계를 합쳐서는 안 된다.

### Known Traps

- `AccountProfile` Node id만 알고 있는 것을 현재 Account의 Membership 증거로 취급하면 cross-account role이
  노출될 수 있다.
- Membership role만 확인하면 selected mismatch, Remote Profile 또는 상태 부적격을 편집 가능으로 오인한다.
- `viewerState`를 login-only로 넓히면 유효한 viewer Profile이 없는 기존 nullable/follow 경계가 바뀐다.
- route query 결과나 Relay cache를 `updateProfile` 권한 증거로 재사용하면 stale data가 mutation 권한으로
  승격된다.
- 공개 Profile action 분기에서 FollowButton을 수정하거나 disabled edit placeholder를 추가하면 승인 범위를
  넘는다.
- archived `add-local-profile-edit` artifacts를 rewrite하면 당시 결정 이력이 사라진다.
- 이 change에 ProfileSwitcher/web-app-shell delta를 추가하면 PROD-660과 PR #529의 후행 소유권을 침범한다.

## Risks / Trade-offs

- [공개 GraphQL field 제거가 미확인 consumer를 깨뜨릴 수 있음] → repository·generated operation과 알려진
  PR #529 consumer를 확인하고 breaking change를 PR에 명시한다. PR #529는 선행 merge 뒤 별도로 갱신한다.
- [잘못된 loader scoping이 다른 Account role을 노출할 수 있음] → query predicate에 current Account id를 포함하고
  다른 Account만 Owner인 fixture로 null을 검증한다.
- [Membership 추가가 Profile 목록 query 수를 선형 증가시킬 수 있음] → 여러 Profile을 한 request에서 조회하는
  query-count integration test를 둔다.
- [두 consumer의 eligibility 조건이 어긋날 수 있음] → 공통 Membership 관계는 공유하되 public `isSelf`와
  protected `currentSession.selectedProfile` 경계를 각각 scenario/test로 고정한다.
- [동시 authorization 변경은 기존 mutation 정책상 이미 시작한 요청에 반영되지 않을 수 있음] → 이 change에서
  lock을 추가하지 않고, 다음 요청부터 현재 eligibility를 재검증하는 기존 정책을 회귀 test로 유지한다.

## Migration Plan

1. nullable `Profile.viewerState.membership`과 account-scoped batch projection을 additive하게 추가하고 API schema 및
   resolver test를 통과시킨다.
2. main의 기존 first-party consumer를 새 projection으로 전환하고 Relay artifacts와 component tests를 갱신한다.
3. repository consumer 전환을 확인한 뒤 `selectedProfileForEdit` schema/resolver와 관련 artifact를 같은 선행
   migration에서 제거한다.
4. schema/runtime/Relay, API·app test, query-count와 OpenSpec strict validation을 통과시킨다.
5. 선행 migration이 merge되면 PROD-660이 PR #529를 stack/rebase하고 ProfileSwitcher consumer만 새 계약으로
   전환한다. 전체 task와 canonical/spec 정합성을 확인한 뒤 PROD-705가 이 change를 archive한다. archived
   OpenSpec은 수정하지 않는다.

Rollback은 consumer와 schema를 한 계약 단위로 되돌린다. 제거 전이면 새 consumers를 기존 query로 되돌리고
additive Membership field를 남기거나 함께 제거할 수 있다. 제거 후이면 `selectedProfileForEdit` schema/resolver와
필요한 consumer operation을 같은 revert에서 복원한다. 어떤 단계에서도 client-side Owner 추측이나 public
`canEdit` scalar를 임시 fallback으로 추가하지 않는다.

## Open Questions

- 없음.
