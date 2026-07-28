## Context

`AccountProfileRole`은 core enum에서 Drizzle PostgreSQL enum과 GraphQL enum을 함께 만든다. 현재 값 집합은
`OWNER`, `ADMIN`, `MEMBER`이며 `updateProfile`만 Admin에 Profile 운영 권한을 부여한다. integration test의
Admin fixture는 Profile 운영 계약이 아니라 Membership 또는 selected Profile 행동을 검증하기 위해 사용된다.

PostgreSQL은 enum value 직접 삭제를 지원하지 않으므로 `ADMIN` 제거는 enum type 재구성이 필요하다. 대상은
구버전 호환성과 무중단 rollout을 보장하지 않는 dev 환경이고 실제 DB에 `ADMIN` row가 없다. 적용된 Drizzle
migration과 snapshot 이력은 수정할 수 없다.

## Goals / Non-Goals

**Goals:**

- application, GraphQL과 PostgreSQL의 Account Profile Role을 Owner와 Member로 일치시킨다.
- Profile 수정의 Admin 예외를 제거하고 Owner-only 권한 오류를 일관되게 노출한다.
- 기존 Owner/Member selected Profile 행동과 Membership 기반 조회가 유지됨을 검증한다.
- 새 forward migration으로 dev DB enum을 정렬한다.

**Non-Goals:**

- Profile 수정 mutation을 `usingProfile` 경계나 새 필드 계약으로 전환하지 않는다.
- 기존 `ADMIN` row 전환, backfill, 구버전 호환성과 rollback window를 제공하지 않는다.
- 적용된 migration 또는 과거 snapshot을 다시 쓰지 않는다.
- 프로필 수정 UI, Media 관계와 Profile Link를 구현하지 않는다.

## Implementation Guidance

### Current Constraints

- core enum 값 변경은 Drizzle schema와 GraphQL enum SDL에 동시에 영향을 준다.
- PostgreSQL enum value 제거는 기존 type을 이름 변경하고 Owner/Member 전용 type을 만든 뒤
  `account_profile.role`을 text cast로 전환하는 형태의 migration이 필요하다.
- migration 생성은 현재 schema head를 기준으로 새 directory와 snapshot을 만들어야 하며, 기존 migration
  history를 수정하면 안 된다.
- `updateProfile`은 현재 `login` scope와 입력 Profile ID를 유지한다. 이 이슈는 Admin 권한 분기만 제거한다.

### Recommended Approach

먼저 core enum에서 `ADMIN`을 제거하고 Drizzle migration generator로 새 forward migration과 snapshot을 만든다.
생성 SQL이 기존 enum을 Owner/Member type으로 재구성하고 `account_profile.role`을 안전하게 cast하는지 검토한다.
실제 계약과 다른 `ADMIN` row가 있으면 migration이 조용히 다른 Role로 바꾸지 않고 실패하게 둔다.

GraphQL SDL을 runtime schema에서 다시 생성해 `AccountProfileRole`에서 `ADMIN`이 사라졌음을 확인한다.
`updateProfile`은 Owner만 허용하고 권한 오류도 Owner 기준으로 바꾼다. Membership 존재만 필요한 notification
fixture는 Member로, Profile 운영 주체가 필요한 fixture는 Owner로 바꾸고 selected Profile의 일반 소셜 행동
테스트는 Owner/Member 두 역할을 검증한다.

### Allowed Alternatives

Drizzle generator가 enum value 삭제 SQL을 만들지 못하면 같은 새 migration directory에서 동등한 enum type
재구성 SQL을 명시적으로 작성할 수 있다. 과거 migration을 수정하거나 `ADMIN`을 `MEMBER`로 자동 변환하는
대안은 허용하지 않는다.

### Known Traps

- 과거 snapshot의 `ADMIN` 문자열을 일괄 삭제하면 migration history가 손상된다.
- Terraform IAM의 `*Admin` role 이름은 Account Profile Role과 무관하므로 변경하면 안 된다.
- 모든 Admin fixture를 Owner로 바꾸면 Membership만 있으면 되는 행동이 Owner 전용인 것처럼 테스트 계약을
  왜곡한다.
- GraphQL runtime enum만 바꾸고 committed `apps/api/schema.graphql`을 갱신하지 않으면 Relay schema와 어긋난다.

## Risks / Trade-offs

- [Risk] enum type 재구성 중 `account_profile` table lock과 일시적인 dev 오류가 발생한다. → dev downtime을
  허용하고 기존 migration runner의 단일 실행·PreSync gate를 사용한다.
- [Risk] 확인과 달리 `ADMIN` row가 존재하면 cast가 실패한다. → 자동 강등하지 않고 migration을 실패시켜
  데이터 상태를 다시 확인한다.
- [Risk] 외부 GraphQL consumer가 `ADMIN` enum 값을 전제로 하면 깨진다. → 의도된 breaking 제거로 보고 generated
  SDL과 API integration 검증에서 Owner/Member 값 집합을 고정한다.

## Migration Plan

1. core enum과 runtime 권한·테스트를 Owner/Member 계약으로 변경한다.
2. 새 Drizzle forward migration과 최신 snapshot을 생성하고 enum 재구성 SQL을 검토한다.
3. 기존 migration runner 검증으로 전체 migration history가 빈 DB에 적용되고 재실행되는지 확인한다.
4. GraphQL schema와 integration test를 검증한다.
5. dev 배포에서는 기존 PreSync migration Job으로 같은 main image의 migration을 먼저 적용한다.

구버전 호환 rollback은 제공하지 않는다. 정정이 필요하면 적용된 migration을 수정하지 않고 새 forward
migration으로 해결한다.

## Open Questions

없음.
