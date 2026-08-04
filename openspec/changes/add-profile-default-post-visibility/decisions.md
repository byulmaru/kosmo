## Context

이 기록은 PROD-648의 Backend Feature Slice, Profile과 membership canonical, 현재 DB/Core/GraphQL 경계를
반영한다. Relay·Composer·Profile Settings UI와 settings page 통합 결정은 PROD-667 change로 이동하고,
Backend 저장·권한·API가 독립적으로 지켜야 할 durable choice만 남긴다.

## Decision Records

### 기본 게시 공개 범위는 Local Profile이 소유한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-648`
- Status: Active
- Context / Problem: Account가 여러 Local Profile을 운영할 때 Account 공통값으로는 각 Profile의 게시 성격을
  보존할 수 없고 Remote Profile에는 Kosmo Local 설정을 만들 수 없다.
- Decision Outcome: 기본 Post Visibility는 Local Profile별 설정이며 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만
  허용한다. 기존·미설정 Local Profile은 `UNLISTED`로 동작하고 Remote Profile에는 값을 저장하지 않는다.
- Alternatives Considered: Account 공통 기본값, Remote 포함 모든 Profile의 non-null 기본값, `DIRECT` 포함.
  모두 승인된 소유 단위, Remote 의미 또는 recipient 제외 범위와 충돌한다.
- Consequences: 저장·조회·update는 Profile identity를 유지하고 기존 Post와 Repost에는 적용하지 않는다.
- Confirmation / Follow-up: 서로 다른 Local Profile과 기존/신규/Remote fixture로 저장·조회와 fallback을
  확인한다.

### Member는 기본값을 읽고 Owner만 변경한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/objects/account-profile-membership.md`, `PROD-648`
- Status: Active
- Context / Problem: Post 작성 가능한 Member는 Profile 기본값을 소비해야 하지만 설정 변경 권한까지 얻어서는
  안 되고 공개 Profile 조회가 값을 노출해서도 안 된다.
- Decision Outcome: Local Profile Owner와 Member는 기본값을 조회할 수 있고 Owner만 활성 Local Profile의 값을
  변경할 수 있다. non-member와 Remote Profile에는 값을 노출하거나 write surface를 제공하지 않는다.
- Alternatives Considered: Owner만 조회, 모든 Member 변경, public Profile field 무조건 노출. 각각 Member 작성
  경험, 권한 계약 또는 설정 비노출 경계와 충돌한다.
- Consequences: GraphQL read와 mutation은 서로 다른 membership 권한을 검증해야 한다.
- Confirmation / Follow-up: Owner/Member/non-member/Remote 조합의 API integration test로 검증한다.

### nullable Profile column과 application fallback을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-648`
- Status: Active
- Context / Problem: Local/Remote Profile이 한 table을 공유해 모든 row에 DB non-null default를 적용하면 Remote
  Profile에도 Local 설정값이 생기며 기존 row backfill은 불필요한 rewrite를 만든다.
- Decision Outcome: 기존 `post_visibility` enum을 재사용하는 nullable Profile column을 additive migration으로
  추가한다. 기존 Local `null`은 application read에서 `UNLISTED`로 project하고 새 Local Profile은
  `UNLISTED`를 명시한다. Remote Profile은 `null`을 유지한다.
- Alternatives Considered: 전체 row `UNLISTED` default/backfill, 별도 Profile settings table, 별도 enum. 전자는
  Remote 의미와 rollout 비용이 있고 후자는 단일 설정에 불필요한 schema와 동기화 책임을 만든다.
- Consequences: Local read의 non-null projection과 Remote `null`을 Core/API test로 고정해야 한다. rollback은
  column을 보존해 이미 저장된 사용자 설정을 잃지 않는다.
- Confirmation / Follow-up: migration strict validation, schema snapshot과 Local/Remote persistence test로
  확인한다.

### Profile field와 기존 update mutation으로 GraphQL 계약을 확장한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-648`
- Status: Active
- Context / Problem: 기존 `updateProfile`은 Owner·Local·active 검증, partial update transaction과 Profile
  payload를 소유한다. 별도 top-level 설정 query/mutation은 소유 object와 권한을 분리한다.
- Decision Outcome: nullable `Profile.defaultPostVisibility` field를 추가해 membership을 검증하고 기존
  `UpdateProfileInput`에 optional `defaultPostVisibility`를 추가한다. mutation payload는 갱신된 Profile을
  반환한다. 입력 `DIRECT`와 명시적 `null`은 validation에서 거부한다.
- Alternatives Considered: top-level settings query, 별도 setting object/mutation, public scalar 무조건 expose.
  현재 Profile 소유 경계와 중복 권한·transaction 책임 때문에 채택하지 않는다.
- Consequences: field resolver는 공개 Profile 조회에서 Member 전용 값을 노출하지 않아야 하고 membership
  조회는 batching해야 한다. 기존 mutation caller는 새 optional field로 인해 깨지지 않는다.
- Confirmation / Follow-up: schema snapshot, owner/member/non-member integration, omitted/null/unsupported input과
  mutation Profile payload를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
