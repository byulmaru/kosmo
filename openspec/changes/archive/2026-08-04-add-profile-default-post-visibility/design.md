## Context

현재 `profile` row와 Profile GraphQL object에는 기본 Post Visibility가 없다. Local/Remote Profile이 같은
table과 공개 GraphQL Profile object를 공유하므로 단순한 non-null DB default나 공개 field 노출은 Remote
Profile에 Kosmo Local 설정을 만들거나 non-member에게 Member 전용 값을 노출할 수 있다.

PROD-648은 Local Profile이 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나인 기본값을 소유하고 Member가
조회하되 Owner만 변경하는 Backend 계약을 소유한다. Relay·Composer·Profile Settings UI와 canonical
`/settings` 연결은 PROD-667의 별도 change가 소유하며 Backend 검증·archive를 막지 않는다.

## Goals / Non-Goals

**Goals:**

- Local Profile별 기본 Post Visibility를 additive하게 저장하고 기존·미설정 Local Profile을 `UNLISTED`로
  호환한다.
- Remote Profile에는 Kosmo Local 설정을 저장하거나 노출하지 않는다.
- Member 조회와 Owner 변경 권한을 Core·GraphQL 경계에서 일관되게 적용한다.
- 기존 Profile update caller와 Post Visibility 입력 계약을 유지한다.
- DB/Core/GraphQL 검증만으로 change를 독립 완료·archive할 수 있게 한다.

**Non-Goals:**

- Relay fragment·client cache, Composer 초기값·draft와 Profile Settings UI
- `/settings` route·navigation·page shell 또는 Byulmaru ID Account entry
- Quote Composer, Repost Visibility와 `DIRECT` recipient·옵션 구현
- 기존 Post Visibility rewrite
- ActivityPub actor 속성이나 federation payload에 기본값 투영

## Implementation Guidance

### Current Constraints

- `Profiles`는 Local/Remote Profile을 한 table에 저장한다. 모든 row에 non-null default를 주면 Remote
  Profile에도 Kosmo Local 설정이 생긴다.
- `updateProfile` Core service와 GraphQL mutation은 이미 Owner membership, Local/active 상태, 부분 update와
  transaction 경계를 소유한다. 별도 저장 service는 같은 권한과 atomicity를 중복할 수 있다.
- GraphQL `Profile` object는 공개 조회에도 사용된다. DB column을 단순 expose하면 non-member에게 Member
  전용 설정이 노출될 수 있다.
- PostgreSQL에는 기존 `post_visibility` enum과 `DIRECT` 값이 있지만 Profile 기본값은 승인된 세 값만
  허용한다.
- 기존 Profile row와 Post row를 destructive하게 rewrite하지 않아야 하며 rollback에서 저장된 사용자 값을
  임의로 제거하면 안 된다.

### Recommended Approach

1. 기존 `post_visibility` PostgreSQL enum을 재사용하는 nullable Profile column을 additive migration으로
   추가한다. 기존 row는 rewrite하지 않고 application read에서 Local `null`을 `UNLISTED`로 project한다.
   새 Local Profile 생성은 `UNLISTED`를 명시하고 Remote materialization은 `null`을 유지한다.
2. 기존 Profile update service의 optional input에 기본값을 추가한다. 값이 제공되면 Owner·Local·active 검증
   뒤 세 허용 값만 같은 transaction에서 update하고, 생략하면 기존 값을 유지한다. `DIRECT`와 명시적
   `null`은 write 전에 validation 오류로 거부한다.
3. `Profile.private`는 nullable GraphQL projection으로 두고 로그인 Account와 대상 Profile의 membership을
   batching 가능한 access-only loader로 검증한다. Local Member에게만 projection을 반환하고 그 안의
   non-null `defaultPostVisibility`는 이미 로드한 Profile 값 또는 `UNLISTED` fallback으로 채운다. Remote·
   non-member에는 `private: null`을 반환하며 access loader는 value column을 재조회하지 않는다.
4. 기존 `UpdateProfileInput`에 optional field를 추가하고 mutation payload로 갱신된 Profile을 반환한다.
   기존 caller가 새 field를 생략하면 종전과 동일하게 동작한다.
5. migration/schema, Core 생성·조회·update, GraphQL permission·validation·payload를 각각 focused test로
   검증한다. client/Storybook check는 Backend required check에 포함하지 않는다.

### Allowed Alternatives

- 기존 Local Profile을 migration에서 `UNLISTED`로 backfill해도 된다. 다만 Remote row는 `null`을 유지하고
  대규모 row rewrite와 rollback 영향을 별도로 검증해야 한다.
- 동일한 Owner·Local·active 권한, partial update atomicity와 갱신된 Profile payload를 유지한다면 기본값
  전용 mutation을 사용할 수 있다. 중복 service나 별도 설정 table은 현재 한 필드만으로 정당화하지 않는다.
- Profile field 대신 Member 전용 Profile settings object를 둘 수 있으나 public Profile 조회 비노출과 기존
  update 호환성을 동일하게 증명해야 한다.

### Known Traps

- `UNLISTED`를 모든 Profile row의 DB default로 지정해 Remote Profile에 Local 설정을 생성하지 않는다.
- GraphQL enum에 `DIRECT`가 있다는 이유로 Profile 기본값 input에 허용하지 않는다.
- 공개 Profile field resolver에서 membership 검증을 생략하지 않는다.
- optional input 생략과 명시적 `null`을 같은 의미로 처리하지 않는다.
- client generated type이나 Storybook 실패를 Backend change의 완료 gate로 넣지 않는다.

## Risks / Trade-offs

- [nullable storage와 non-null Local projection이 어긋날 수 있음] → Core/API test에서 Local `null` fallback과
  Remote `null` 비노출을 함께 고정한다.
- [Member 전용 field가 공개 Profile query에 노출될 수 있음] → membership loader와 non-member integration
  test로 field access를 제한한다.
- [기존 update caller가 새 validation에 영향받을 수 있음] → optional omitted input과 기존 field-only update를
  회귀 검증한다.
- [schema rollback이 저장된 사용자 설정을 잃을 수 있음] → client/API write surface를 먼저 되돌리고 nullable
  column은 별도 contract 없이 제거하지 않는다.

## Migration Plan

1. nullable column을 추가하는 additive migration을 적용한다. 기존 Post와 Profile row를 rewrite하지 않는다.
2. Core/API가 Local `null`을 `UNLISTED`로 project하고 지원 값만 write하도록 배포한다.
3. PROD-667 client는 nullable `Profile.private` projection을 소비하고 unavailable 상태에서 `UNLISTED`로
   fallback한다.
4. rollback은 client와 API write surface를 먼저 되돌린 뒤 nullable column을 보존한다. column 제거는 저장된
   사용자 설정을 잃으므로 별도 contract와 데이터 보존 판단 없이 수행하지 않는다.

## Open Questions

없음.
