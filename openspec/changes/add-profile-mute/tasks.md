## 1. PROD-824 Profile Mute 저장 계약

**Authority / Provenance**

- `docs/domain/objects/profile-mute.md`
- `PROD-814`
- `PROD-824`

**Deliverable**

Owner와 Target을 잇는 영구 Profile Mute를 중복 없이 저장하고, 기존 환경에 데이터 전환 없이 배포할 수 있다.

**Guardrails**

- Owner·Target 조합은 데이터베이스에서 하나의 현재 관계로 제한한다.
- `expires_at`은 nullable로 두되 `PROD-824`의 모든 생성 경로는 `null`만 저장한다.
- 기존 migration history를 고치거나 운영 rollback 과정에서 관계 테이블을 즉시 삭제하지 않는다.
- Profile이 물리적으로 삭제되면 이를 참조하는 Mute 관계도 정리한다.

**Verification**

- schema와 생성된 migration에서 컬럼, foreign key, unique constraint와 조회 index를 확인한다.
- 빈 데이터베이스와 누적 migration 데이터베이스에서 migration test와 smoke test를 통과시킨다.
- 같은 Owner·Target의 중복 row 거부, nullable `expires_at`과 Profile 삭제 정리를 데이터베이스 테스트로 확인한다.

- [x] 1.1 `profile_mute` 저장 계약과 Core DB export를 추가한다.
- [x] 1.2 새 테이블·constraint·index만 포함하는 additive migration과 snapshot을 생성해 검토한다.
- [x] 1.3 schema·migration·constraint 동작을 검증하는 데이터베이스 테스트를 추가하고 migration 검증을 통과시킨다.

## 2. PROD-824 Core 생성·해제·적용 판정

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/profile-mute.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `PROD-814`
- `PROD-824`

**Deliverable**

검증된 Owner가 Local 또는 Remote Target을 영구 Mute하고 해제할 수 있으며, 호출자는 두 Profile 사이의 현재 적용 여부를 transport와 무관하게 조회할 수 있다.

**Guardrails**

- Owner는 Active·Normal Local Profile이어야 하며 Target과 달라야 한다.
- 생성과 해제 action이 검증, transaction과 중복 수렴을 소유한다.
- 같은 Owner·Target의 반복·동시 생성은 하나의 관계와 같은 성공 의미로 수렴한다.
- 같은 Owner·Target의 기존 non-null `expires_at` row를 다시 생성하면 같은 ID를 유지하고 `expires_at`을 `null`로 바꿔 영구 관계로 활성화한다.
- 해제는 Owner와 Profile Mute 관계 ID를 함께 확인하며 다른 Owner의 관계를 바꾸거나 존재를 드러내지 않는다.
- Profile이나 관계 row에 비관적 lock을 추가하지 않는다.

**Verification**

- Local·Remote Target 성공, self-target, 자격 없는 Owner와 존재하지 않는 Target 거부를 서비스 테스트로 확인한다.
- 순차·동시 중복 생성, 반복 해제와 다른 Owner의 해제 시도를 격리된 데이터베이스에서 검증한다.
- 관계 생성 시 `expires_at`이 `null`이고 생성·해제 전후 적용 판정이 맞는지 확인한다.
- 기존 미래 `expires_at` row가 같은 ID의 영구 관계로 수렴하는지 확인한다.

- [x] 2.1 영구 Profile Mute 생성 action과 도메인 오류 경계를 구현한다.
- [x] 2.2 Owner 범위를 지키는 해제 action을 구현한다.
- [x] 2.3 단건 적용 여부와 Owner별 묶음 조회에 재사용할 수 있는 읽기 경계를 제공한다.
- [x] 2.4 자격·Local/Remote Target·중복·동시성·해제·적용 판정 서비스 테스트를 추가해 Core 데이터베이스 테스트를 통과시킨다.

## 3. PROD-824 Owner 전용 GraphQL 계약

**Authority / Provenance**

- `docs/domain/objects/profile-mute.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/design/profile-mute-block.md`
- `PROD-814`
- `PROD-824`

**Deliverable**

인증된 사용자는 현재 selected Profile의 Mute 목록과 Target별 상태를 조회하고, Profile Target을 지정해 Mute를 만들며 Profile Mute relation global ID를 지정해 해제할 수 있다.

**Guardrails**

- `ProfileMute` Node는 non-null `targetProfile: Profile!`과 `createdAt`을 제공하며 Owner가 아닌 요청과 비가시화된 Target 관계에는 노출하지 않는다.
- 현재 Profile에는 Owner 전용 `profileMutes` Relay connection을, `ProfileViewerState`에는 nullable `profileMute`를 제공한다.
- `muteProfile`은 concrete `Profile` global ID를, `unmuteProfile`은 concrete `ProfileMute` global ID를 입력으로 받고 Owner는 session의 selected Profile에서 정한다.
- `muteProfile`은 DISABLED Profile 또는 SUSPENDED Instance의 Target을 거부하고 관계를 만들지 않는다.
- 생성 payload는 `profileMute`, 해제 payload는 nullable `profileMuteId`를 반환한다.
- 공개 schema에 기간·만료 입력이나 `expires_at`에 대응하는 필드를 추가하지 않는다.
- 같은 Account의 다른 selected Profile도 별도 Owner로 취급한다.

**Verification**

- schema 단위 검사에서 Node, connection, viewer-relative field, mutation 입력과 payload 형태를 확인한다.
- Node 직접 조회, 목록 양방향 pagination, Target 상태와 Local·Remote Target mutation을 GraphQL 통합 테스트로 검증한다.
- 다른 Account, 같은 Account의 다른 selected Profile, Target과 비-Local Owner가 관계를 조회하거나 변경하지 못하는지 확인한다.
- Target을 DISABLED로 바꾼 뒤 `ProfileMute` Node와 Owner connection에서 관계를 제외하고 retained `ProfileMute` global ID 기반 해제를 확인한다.

- [x] 3.1 Owner 조건을 포함한 `ProfileMute` Node 조회와 Target 관계를 GraphQL schema에 추가한다.
- [x] 3.2 현재 Profile의 `profileMutes` connection과 `ProfileViewerState.profileMute`를 추가하고 요청 단위 묶음 조회를 적용한다.
- [x] 3.3 `muteProfile`·`unmuteProfile` mutation을 Core action에 연결하고 결정된 payload를 반환한다.
- [x] 3.4 생성된 `apps/api/schema.graphql`을 source schema와 동기화한다.
- [x] 3.5 성공·pagination·Node 접근·권한·selected Profile 격리 GraphQL 테스트를 추가한다.

## 4. PROD-824 범위 회귀와 완료 검증

**Authority / Provenance**

- `docs/domain/objects/profile-mute.md`
- `docs/domain/policies/post-list.md`
- `docs/design/profile-mute-block.md`
- `PROD-814`
- `PROD-824`

**Deliverable**

Profile Mute 기반이 기존 관계와 상호작용 상태를 건드리지 않고 후행 콘텐츠·UI 정책과 분리된 채 검증된다.

**Guardrails**

- Mute 생성·해제는 Follow Relationship, Follow Request, Reaction, Repost Post와 Bookmark를 바꾸지 않는다.
- 기존 Notification과 Read State를 바꾸지 않고, Target에게 새 Notification이나 ActivityPub activity를 만들지 않는다.
- Post 목록 Exclude·Collapse, 새 Notification 생성 억제, UI·Relay·E2E와 archive를 이번 변경에 포함하지 않는다.

**Verification**

- 관계와 상호작용이 있는 검증 데이터에서 Mute 생성·해제 전후의 상태가 같은지 통합 테스트로 비교한다.
- Core migration·service 테스트, API schema·type·unit·integration 테스트와 저장소 lint를 통과시킨다.
- strict OpenSpec validation을 다시 실행하고 구현 결과가 `PROD-824` 범위를 벗어나지 않았는지 diff로 확인한다.

- [x] 4.1 기존 관계·상호작용·Notification·Read State 불변성과 Target 알림 부재를 검증하는 회귀 테스트를 추가한다.
- [x] 4.2 `pnpm --filter @kosmo/core test:migrate`, `test:migrate:smoke`, `test:services:database`를 통과시킨다.
- [x] 4.3 `pnpm --filter @kosmo/api lint:schema`, `lint:tsc`, `test:unit`, `test:integration`을 통과시킨다.
- [x] 4.4 저장소 ESLint·Prettier와 strict OpenSpec validation을 통과시키고, 결과와 제외 범위를 PR에 기록한다.
