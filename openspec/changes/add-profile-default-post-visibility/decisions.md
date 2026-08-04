## Context

이 기록은 PROD-648의 승인된 Local Profile 기본 게시 공개 범위 계약, 적용 canonical 문서, 현재
Profile/GraphQL/Relay/Composer 경계와 PROD-653의 설정 page shell 통합 책임을 반영한다. 제품 행동은 canonical과
Linear 계약에서 파생하고, storage·API·rollout처럼 여러 구현 slice가 일관되게 지켜야 할 수단만 Implementation
Choice로 기록한다.

## Decision Records

### 기본 게시 공개 범위는 Local Profile이 소유한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-648`
- Status: Active
- Context / Problem: Account가 여러 Local Profile을 운영할 때 Account 공통값이나 Composer별 고정값으로는 각
  Profile의 게시 성격을 보존할 수 없다.
- Decision Outcome: 기본 Post Visibility는 Local Profile별 설정이며 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만
  허용한다. 기존·미설정 Local Profile은 `UNLISTED`로 동작하고 Remote Profile에는 Kosmo Local 설정을 만들지
  않는다. `DIRECT`는 recipient 계약이 완료되기 전 기본값 후보가 아니다.
- Alternatives Considered: Account 공통 기본값, Composer surface별 기본값, `DIRECT` 포함. 모두 현재 소유 단위,
  공통 Composer 계약 또는 recipient 제외 범위와 충돌한다.
- Consequences: DB/API/Relay cache key와 UI state는 Profile identity를 유지해야 한다. Repost와 기존 Post에는
  적용하지 않는다.
- Confirmation / Follow-up: 서로 다른 Local Profile과 미설정/Remote Profile fixture로 저장·조회와 fallback을
  확인한다.

### Member는 기본값을 읽고 Owner만 변경한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/objects/account-profile-membership.md`, `PROD-648`
- Status: Active
- Context / Problem: Post 작성 가능한 Member는 Profile 기본값을 소비해야 하지만 설정 변경 권한까지 얻어서는
  안 된다.
- Decision Outcome: Local Profile Owner와 Member는 Composer용 기본값을 조회할 수 있고, Owner만 활성 Local
  Profile의 값을 변경할 수 있다. non-member와 Remote Profile에는 값을 노출하거나 write surface를 제공하지
  않는다.
- Alternatives Considered: Owner만 조회, 모든 Member 변경, public Profile field 무조건 노출. 각각 Member 작성
  경험, 권한 계약 또는 설정 조회 경계와 충돌한다.
- Consequences: GraphQL read와 mutation은 서로 다른 membership 권한을 검증하고, 설정 control은 Owner가 아닌
  Member의 저장을 허용하지 않는다.
- Confirmation / Follow-up: Owner/Member/non-member/Remote 조합의 API integration test로 검증한다.

### 기본값은 새 Composer의 seed로만 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/design/reply-composer.md`, `PROD-648`
- Status: Active
- Context / Problem: 설정값이나 Relay record가 바뀔 때 열린 draft를 동기화하면 사용자가 선택한 개별 Post
  Visibility와 dirty 상태를 잃을 수 있다.
- Decision Outcome: 일반 Post·Reply·Quote Composer는 새 문맥을 시작할 때 선택 Profile의 기본값을 seed로
  사용한다. 사용자가 바꾼 개별 Visibility는 Profile 기본값을 변경하지 않고, Profile 설정 변경도 열린 draft를
  덮어쓰지 않는다. selected Profile·Parent·Relay Environment 전환은 새 Profile 값으로 새 draft를 시작하며
  이전 completion을 무시한다.
- Alternatives Considered: Profile 설정과 열린 Composer를 양방향 동기화, Parent/Source Visibility 상속,
  Composer 변경을 자동 저장. 모두 draft 독립성과 확정 계약을 위반한다.
- Consequences: client는 fragment 값을 state-sync effect로 복사하지 않고 mount/reset seed로만 사용해야 한다.
- Confirmation / Follow-up: 열린 draft, 제출 성공 reset, Profile/Environment 전환과 늦은 completion interaction을
  검증한다.

### nullable Profile column과 application fallback을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-648`
- Status: Active
- Context / Problem: Local/Remote Profile이 한 table을 공유해 모든 row에 DB non-null default를 적용하면 Remote
  Profile에도 Local 설정값이 생기며, 기존 row backfill은 불필요한 rewrite를 만든다.
- Decision Outcome: 기존 `post_visibility` enum을 재사용하는 nullable Profile column을 additive migration으로
  추가한다. 기존 Local `null`은 application read에서 `UNLISTED`로 project하고 새 Local Profile은
  `UNLISTED`를 명시한다. Remote Profile은 `null`을 유지한다.
- Alternatives Considered: 전체 row `UNLISTED` default/backfill, 별도 Profile settings table, 별도 enum. 전자는
  Remote 의미와 rollout 비용이 있고, 후자는 단일 설정에 불필요한 schema와 동기화 책임을 만든다.
- Consequences: Local read의 non-null projection과 Remote `null`을 core/API test로 고정해야 한다. rollback은
  column을 보존해 이미 저장된 사용자 설정을 잃지 않는다.
- Confirmation / Follow-up: migration strict validation, schema snapshot과 Local/Remote persistence test로
  확인한다.

### Profile field와 기존 update mutation으로 GraphQL 계약을 확장한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-648`
- Status: Active
- Context / Problem: Composer는 normalized Profile fragment를 이미 소비하고 기존 `updateProfile`은 Owner·Local·
  active 검증과 Profile payload를 소유한다. 별도 top-level 설정 query/mutation은 소유 object와 cache update를
  분리한다.
- Decision Outcome: nullable `Profile.defaultPostVisibility` field를 추가해 membership을 검증하고, 기존
  `UpdateProfileInput`에 optional `defaultPostVisibility`를 추가한다. mutation payload의 Profile로 Relay record를
  수렴시킨다. 입력 `DIRECT`와 명시적 `null`은 validation에서 거부한다.
- Alternatives Considered: top-level settings query, 별도 setting object/mutation, public scalar 무조건 expose.
  현재 normalized Profile 소유 경계와 중복 권한·cache 책임 때문에 채택하지 않는다.
- Consequences: field resolver는 공개 Profile 조회에서 Member 전용 값을 노출하지 않아야 하고 membership 조회는
  batching해야 한다. 기존 mutation caller는 새 optional field로 인해 깨지지 않는다.
- Confirmation / Follow-up: schema snapshot, owner/member/non-member integration과 Relay mutation response를
  검증한다.

### 설정 component와 canonical route 통합 책임을 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-648`, `PROD-653`
- Status: Active
- Context / Problem: PROD-648은 Profile 설정의 데이터·입력·저장·상태를 소유하지만 `/settings` route,
  navigation과 Account/Profile 정보 구조는 PROD-653이 소유한다.
- Decision Outcome: PROD-648은 target Profile identity와 설정 control, mutation state, 접근성 계약을 가진
  재사용 가능한 component와 독립 검증을 제공한다. `/settings` route와 page shell을 복제하지 않으며,
  PROD-653이 component를 canonical route에 통합하고 페이지 수준 검증·최종 archive를 소유한다.
- Alternatives Considered: PROD-648에서 임시 route 생성, PROD-653이 Profile 설정 기능 재구현. 둘 다 이슈
  소유권과 통합 순서를 위반한다.
- Consequences: 이 PR의 implementation delivery와 PROD-653의 page integration 완료는 별도 gate다.
- Confirmation / Follow-up: standalone Storybook contract와 PROD-653 handoff에 component fragment/상태/검증
  정보를 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
