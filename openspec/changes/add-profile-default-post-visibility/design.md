## Context

현재 `profile` row와 Profile GraphQL object에는 기본 Post Visibility가 없고, `PostComposer`는 mount와 제출 성공
reset에서 `UNLISTED`를 직접 사용한다. Reply는 별도 입력 체계를 만들지 않고 같은 `PostComposer`를 Parent
문맥에서 재사용하며, selected Profile·Parent·Relay Environment를 key와 generation guard로 격리한다.

PROD-648은 Local Profile이 기본값을 소유하고 Member가 Composer에서 소비하되 Owner만 변경하도록 요구한다.
`PROD-653`은 canonical `/settings` route와 page shell 통합을 별도로 소유한다. 현재 `main`에는 해당 route가
없으므로 이 change는 재사용 가능한 Profile 설정 component와 검증 가능한 state contract를 제공하고,
`PROD-653`이 페이지에 조립한다.

## Goals / Non-Goals

**Goals:**

- Local Profile별 기본 Post Visibility를 additive하게 저장하고 기존 Profile을 `UNLISTED`로 호환한다.
- Member 조회와 Owner 변경 권한을 GraphQL·core 경계에서 일관되게 적용한다.
- 설정 control과 새 Post·Reply Composer가 같은 Relay Profile 설정값으로 수렴한다.
- selected Profile·Parent·Relay Environment 전환과 늦은 completion에서 다른 Profile의 설정·draft를 격리한다.

**Non-Goals:**

- `PROD-653`의 `/settings` route·navigation·page shell 구현 또는 `PROD-645` Account 외부 진입점 구현
- Quote 작성 surface 자체 추가, Repost visibility 변경, `DIRECT` recipient 구현
- 기존 Post visibility 변경 또는 Composer 개별 선택을 Profile 기본값으로 자동 저장
- ActivityPub actor 속성이나 federation payload에 기본값 투영

## Implementation Guidance

### Current Constraints

- `Profiles`는 기존 PostgreSQL `post_visibility` enum을 사용하는 Post와 별도이며 Local/Remote Profile을 한
  table에 저장한다. 모든 row에 non-null default를 주면 Remote Profile에도 Kosmo Local 설정이 생긴다.
- `updateProfile` core service와 GraphQL mutation은 이미 Owner membership, Local/active 상태, 부분 update와
  transaction 경계를 소유한다. 별도 저장 service를 만들면 같은 권한과 cache payload를 중복할 수 있다.
- `Profile` GraphQL object는 공개 조회에도 사용된다. DB column을 단순 expose하면 Member 전용 설정이 다른
  Profile 조회에 노출된다.
- `PostComposer`의 Profile fragment가 일반 Post와 Reply surface에서 공유된다. 별도 Reply 설정 query나 state를
  만들면 기존 문맥 격리와 draft lifecycle이 갈라진다.
- 현재 branch에는 Quote 작성 mutation/surface가 없다. 기본값 구현은 공용 Composer 계약을 유지하되 Quote
  기능을 선행 구현하거나 완료했다고 주장하지 않아야 한다.

### Recommended Approach

1. 기존 `post_visibility` PostgreSQL enum을 재사용하는 nullable `profile.default_post_visibility` column을
   additive migration으로 추가한다. 기존 row는 rewrite하지 않고 application read에서 Local `null`을
   `UNLISTED`로 project한다. 새 Local Profile 생성은 `UNLISTED`를 명시하고 Remote materialization은 `null`을
   유지한다.
2. 기존 Profile update service의 optional input에 기본값을 추가한다. 값이 제공되면 Owner·Local·active 검증
   뒤 세 허용 값만 같은 transaction에서 update하고, 생략하면 기존 값을 유지한다. `DIRECT`와 명시적 `null`은
   write 전에 validation 오류로 거부한다.
3. `Profile.defaultPostVisibility`는 nullable GraphQL field로 두고 로그인 Account와 대상 Profile의
   membership을 batching 가능한 loader로 검증한다. Local Member에게는 저장값 또는 `UNLISTED`를 반환하고,
   Remote·non-member에는 `null`을 반환한다. update mutation payload는 갱신된 Profile을 반환해 Relay record를
   normalized update한다.
4. Profile 설정 component는 Owner가 조회된 Profile fragment를 입력으로 받고, 세 옵션·설명·현재 target
   identity, dirty·pending·success·error·retry를 한 state 경계에서 관리한다. mutation generation과 현재
   Profile/Environment identity를 대조해 늦은 completion을 무시한다. `/settings` route는 만들지 않고 Storybook
   fixture에서 standalone contract를 검증한 뒤 `PROD-653` 통합 지점을 handoff한다.
5. `PostComposer` Profile fragment가 기본값을 요청하고 initial visibility와 성공 reset의 기준으로 사용한다.
   fragment가 `null`이면 `UNLISTED`를 사용한다. mount 뒤 Relay record가 바뀌어도 현재 draft state를 effect로
   덮어쓰지 않는다. selected Profile·Parent·Environment가 바뀌는 기존 remount 경계에서만 새 Profile 기본값으로
   초기화한다.
6. DB migration/schema, core update, GraphQL permission·validation, Composer initial/reset/context, 설정 control
   pending/error/late completion을 각각 focused test로 검증한다. Web interaction/a11y와 Native-compatible render
   contract는 Storybook에서 검증하고 실제 Android·iOS runtime은 Test phase handoff에 기록한다.

### Allowed Alternatives

- 기존 Local Profile을 migration에서 `UNLISTED`로 backfill해도 된다. 다만 Remote row는 `null`을 유지하고,
  rollback과 대규모 row rewrite 영향을 별도로 검증해야 한다.
- Profile update mutation과 같은 Owner·Local·active 권한, Relay Profile payload, atomic update를 유지한다면
  기본값 전용 mutation을 사용할 수 있다. 중복 service나 별도 설정 table은 현재 한 필드만으로 정당화하지 않는다.
- `Profile` field 대신 Profile 소유 설정 object를 둘 수 있으나 Member 조회, normalized Profile identity와
  Composer fragment 소비가 자연스럽고 공개 Profile 조회에 값을 노출하지 않아야 한다.

### Known Traps

- `UNLISTED`를 모든 Profile row의 DB default로 지정해 Remote Profile에도 Local 설정을 생성하지 않는다.
- GraphQL enum에 `DIRECT`가 있다는 이유로 기본값 input에 허용하지 않는다.
- 설정 저장 성공 때 열린 Composer의 state를 즉시 덮어쓰거나, Composer 선택 변경 때 설정 mutation을 호출하지
  않는다.
- Relay cache나 component state를 Profile ID 없이 공유하지 않는다. 이전 Profile의 마지막 값과 늦은
  query/mutation completion을 fallback으로 사용하지 않는다.
- `PROD-653` route를 임시로 복제하거나 standalone 설정 component가 실제 navigation에 통합됐다고 주장하지
  않는다.

## Risks / Trade-offs

- [nullable storage와 non-null Local projection이 어긋날 수 있음] → core/API test에서 Local `null` fallback과
  Remote `null` 비노출을 함께 고정한다.
- [Member 전용 field가 공개 Profile query에 노출될 수 있음] → membership loader와 non-member integration
  test로 field access를 제한한다.
- [Relay record 갱신이 열린 draft를 덮어쓸 수 있음] → default를 mount/reset seed로만 사용하고 state-sync
  effect를 두지 않는다.
- [설정 route 미통합으로 사용자 진입점이 아직 없음] → component와 API를 독립 검증하고 `PROD-653`의 명시적
  페이지 통합·통합 테스트·archive 책임을 handoff한다.
- [Quote 경로 검증 부재] → 공용 Composer Profile fragment 계약을 유지하고 Quote 작성 기능 자체는 해당 기능
  owner가 제공할 때 같은 default seed를 소비하도록 남긴다.

## Migration Plan

1. nullable column을 추가하는 additive migration을 적용한다. 기존 Post와 Profile row를 rewrite하지 않는다.
2. core/API가 Local `null`을 `UNLISTED`로 project하고 지원 값만 write하도록 배포한다.
3. Relay fragment, 설정 component와 Composer seed를 배포한다. API field가 nullable이므로 미설정 값은 안전하게
   fallback한다.
4. `PROD-653`이 component를 `/settings` page shell에 통합하고 page-level Web·Android·iOS 검증을 수행한다.

Rollback은 client component와 API write surface를 먼저 되돌린 뒤 nullable column을 남긴다. column 제거는
저장된 사용자 설정을 잃으므로 별도 contract와 데이터 보존 판단 없이 수행하지 않는다.

## Open Questions

없음.
