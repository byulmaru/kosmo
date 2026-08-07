# ADR 0023: Profile Viewer Membership Edit Eligibility

## 상태

Accepted

## 날짜

2026-08-07

## 맥락

Profile 편집 eligibility는 nullable top-level `Query.selectedProfileForEdit`이 session의 selected Profile,
현재 Account와의 Owner Membership, Account/Profile/Instance 상태와 Profile 초기값을 하나의 route 전용
결과로 결합해 제공해 왔다. 이 query를 sidebar 등 다른 production consumer로 확장하면 실제
Account-Profile 관계보다 특정 편집 UI 흐름이 GraphQL root 계약의 중심이 된다.

Account-Profile Membership은 Account와 Profile 사이에 실제로 존재하는 역할 기반 관계다. 이를 Profile의
viewer-relative 상태로 제공하면 공개 Profile과 protected route가 같은 관계를 사용하면서도 selected Profile
경계를 각 화면에 맞게 유지할 수 있다. 다만 Membership을 노출한다는 사실이 다른 Account의 관계나 role 노출,
Profile별 개별 조회 또는 mutation 권한 증거 재사용으로 이어져서는 안 된다.

## 결정

- `Profile.viewerState.membership`은 현재 session Account와 조회 중인 Profile 사이에 실제로 존재하는 nullable
  `AccountProfile` 관계다. 현재 Account와 Profile 사이에 Membership이 없으면 `null`이다.
- guest 또는 유효한 viewer Profile이 없는 요청은 기존 `Profile.viewerState` 경계처럼 GraphQL authorization
  error 없이 nullable 결과로 처리한다.
- projection은 현재 session Account에 속한 Membership만 반환한다. 다른 Account의 Membership이나 role을
  같은 Profile 조회를 통해 노출하지 않는다.
- `AccountProfile.role`은 실제 관계의 `OWNER | MEMBER` 값을 제공한다. Membership projection 자체를
  `canEdit` 같은 편집 capability로 해석하거나 별도 capability scalar를 만들지 않는다.
- 공개 Profile 화면은 `viewerState.isSelf`와 `viewerState.membership.role === OWNER`를 함께 확인해 표시 중인
  Profile이 selected Profile인지와 Owner 관계인지 검증한다.
- protected `/profile-edit` route는 `currentSession.selectedProfile.viewerState.membership`을 사용한다. 공개
  Profile과 protected route 모두 기존 Active Account/Profile, Local·non-Suspended Instance 조건을 유지한다.
- 편집 eligibility가 없으면 공개 Profile에 disabled placeholder를 포함한 편집 action을 표시하지
  않는다. `/profile-edit` 직접 접근은 기존 `이 프로필을 수정할 수 없어요` StateView를 유지한다.
- client는 selected Profile id, Local origin 또는 Membership role 하나만으로 편집 eligibility를 추측하지
  않는다.
- `updateProfile` mutation은 viewer projection을 권한 증거로 신뢰하지 않는다. 실행 시점에 현재 Account,
  selected Profile, Instance 상태와 Owner Membership을 server-authoritative하게 독립 재검증한다.
- Profile 목록의 Membership projection은 현재 Account로 scope된 batch 경계를 사용하고 Profile마다 개별
  query를 실행하지 않는다.
- 기존 production consumer와 호환성 확인이 끝난 뒤 `Query.selectedProfileForEdit` schema와 resolver를
  제거한다. 공개 GraphQL schema와 runtime schema, Relay operation과 generated artifact를 함께 전환한다.
- `Profile.viewerState.isSelf`, `follow`, `followRequest`와 FollowButton 동작은 변경하지 않는다.

## 이유

Membership을 실제 관계로 투영하면 편집 route에 종속된 top-level capability를 여러 UI가 공유하지 않아도
된다. current Account와 queried Profile을 resolver 경계로 사용하면 다른 Account의 role을 노출하지 않으면서
Owner와 Member 관계를 일관된 GraphQL Node로 제공할 수 있다.

Membership role과 selected Profile 경계를 분리하면 공개 Profile은 `isSelf`로 선택 경계를 유지하고 protected
route는 `currentSession.selectedProfile`에서 같은 경계를 유지한다. mutation이 관계 projection과 독립적으로
권한을 재검증하면 stale Relay data나 client 조작이 저장 권한으로 승격되지 않는다.

## 대체하는 결정

- [ADR 0021](./0021-profile-edit-selected-owner-route-boundary.md)의 protected route가 server-authoritative
  Owner query/capability를 사용한다는 결정 중 구체적인 query source를 이 viewer-relative Membership
  projection으로 대체한다.
- ADR 0021의 presentation과 production route 분리, selected Owner 경계, Profile Tag와 Follow Approval Policy
  생명주기 결정은 유지한다.
- archived `add-local-profile-edit` OpenSpec의 `selectedProfileForEdit` 구현 결정은 당시 이력으로 보존하고
  현재 계약의 근거로 재사용하지 않는다.

## 결과

- 공개 Profile route와 `ProfileEditRoute`는 같은 Membership 관계를 소비하되 서로 다른 selected Profile
  진입 경계를 유지한다.
- `Query.selectedProfileForEdit`는 first-party와 외부 consumer 호환성을 확인하고 기존 consumer를 전환한 뒤
  제거한다.
- PR #529에만 존재하는 ProfileSwitcher sidebar consumer와 편집 action의 geometry·배치·접근성·navigation은
  `PROD-660`이 선행 Membership migration 위에서 전환한다.
- DB 관계 모델, Account Profile Role, `updateProfile` transaction 정책, Profile edit form·Media·Tag 저장 UX와
  FollowButton 정책은 이 결정으로 변경하지 않는다.
- Membership 조회를 위한 DB index가 필요하면 query plan과 필요성을 별도 검토하고 범위를 승인받는다.

## 근거

- [PROD-705](https://linear.app/byulmaru/issue/PROD-705/profileviewerstate%EC%97%90-account-profile-%EC%86%8C%EC%86%8D-%EA%B4%80%EA%B3%84%EB%A5%BC-%ED%88%AC%EC%98%81%ED%95%98%EA%B3%A0-%ED%8E%B8%EC%A7%91-%EA%B6%8C%ED%95%9C-%EC%A1%B0%ED%9A%8C%EB%A5%BC-%EC%A0%84%ED%99%98%ED%95%9C%EB%8B%A4)
- [PROD-660](https://linear.app/byulmaru/issue/PROD-660/%EC%82%AC%EC%9D%B4%EB%93%9C%EB%B0%94-%ED%94%84%EB%A1%9C%ED%95%84-%EC%98%81%EC%97%AD%EC%97%90-%ED%94%84%EB%A1%9C%ED%95%84-%ED%8E%B8%EC%A7%91-%EC%A7%84%EC%9E%85%EC%A0%90%EC%9D%84-%EB%B3%B5%EC%9B%90%ED%95%9C%EB%8B%A4)
- [PR #529 Membership projection review](https://github.com/byulmaru/kosmo/pull/529#discussion_r3727638558)
- [Account-Profile Membership](../objects/account-profile-membership.md)
- [ADR 0019](./0019-selected-profile-authorization-boundary.md)
- [ADR 0021](./0021-profile-edit-selected-owner-route-boundary.md)

## 문서 반영

- [Profile 편집 디자인](../../design/profile-edit.md)은 공개 Profile과 protected route의 eligibility 및 전달
  경계를 정의한다.
- active `profile`과 `profile-edit-ui` OpenSpec은 Domain Gate 승인 뒤 새 Membership projection 계약으로
  전환한다.
