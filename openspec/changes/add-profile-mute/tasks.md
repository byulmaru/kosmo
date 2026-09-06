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

검증된 Owner가 Local 또는 Remote Target을 영구 Mute하고 해제할 수 있으며, Owner·Target·`expires_at` 조건으로
현재 적용 여부와 Owner별 목록을 조회할 수 있다.

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
- [x] 2.3 PROD-824의 Owner 목록·Node·viewer-relative query에서 Owner·Target·`expires_at` 조건으로 단건 적용 여부와 Owner별 묶음 조회를 수행한다.
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
- Post 목록의 Profile Mute 적용, 새 Notification 생성 억제, UI·Relay·E2E와 archive를 이번 변경에 포함하지
  않는다.

**Verification**

- 관계와 상호작용이 있는 검증 데이터에서 Mute 생성·해제 전후의 상태가 같은지 통합 테스트로 비교한다.
- Core migration·service 테스트, API schema·type·unit·integration 테스트와 저장소 lint를 통과시킨다.
- strict OpenSpec validation을 다시 실행하고 구현 결과가 `PROD-824` 범위를 벗어나지 않았는지 diff로 확인한다.

- [x] 4.1 기존 관계·상호작용·Notification·Read State 불변성과 Target 알림 부재를 검증하는 회귀 테스트를 추가한다.
- [x] 4.2 `pnpm --filter @kosmo/core test:migrate`, `test:migrate:smoke`, `test:services:database`를 통과시킨다.
- [x] 4.3 `pnpm --filter @kosmo/api lint:schema`, `lint:tsc`, `test:unit`, `test:integration`을 통과시킨다.
- [x] 4.4 저장소 ESLint·Prettier와 strict OpenSpec validation을 통과시키고, 결과와 제외 범위를 PR에 기록한다.

## 5. PROD-825 현재 Post List의 Profile Mute 정책

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/profile-mute.md`
- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/design/profile-mute-block.md`
- `PROD-814`
- `PROD-825`

**Deliverable**

기존 Post 조회 경계에 Mute 정책을 통합한다. Home·Local은 전체 적용하고 Profile.posts는 방문한 Profile ID만
예외로 허용하며 Bookmark·직접 조회·상호작용은 전체 무시를 명시한다. 다른 muted Source Author의
Repost·Quote는 Profile에서도 cursor·limit 전에 제외한다.

**Guardrails**

- 현재 selected Profile의 Owner·Target·`expires_at IS NULL` 조건을 기존 `postAccessWhere` 안에서 합성한다.
- 별도 public `profileMuteWhere`나 Home 전용 Mute 조립, 후보별 DB 호출과 조회 후 필터를 만들지 않는다.
- 적용 정책을 모든 호출부의 필수 인수로 명시하고 Content가 있는 Quote도 direct Source Author를 판정한다.
- 방문한 Profile ID 예외는 해당 ID에만 적용하며 기존 Visibility·Eligibility와 목록별 후보 정책을 넓히지 않는다.
- Source chain을 재귀 확장하지 않고 모든 Mute 제외를 cursor·limit 전에 끝낸다.
- PostConnection과 공개 schema, 관계 데이터·index를 유지하며 migration이나 Mute 전용 field를 추가하지 않는다.
- Hashtag runtime은 PROD-827, UI·Relay·cross-slice E2E·공유 change archive는 PROD-814가 소유한다.

**Verification**

- Home·Local·Profile·Bookmark의 실제 GraphQL 호출 경로에서 정책별 결과를 검증한다.
- outer Author만 Mute, direct Source Author만 Mute, 둘 다 Mute와 방문한 Profile ID 예외를 검증한다.
- 일반 Post·Reply·Content 없는 Repost·Quote와 Local 고유 후보 조건을 검증한다.
- 제외 후보 사이의 eligible Post로 페이지가 채워지고 양방향 cursor·pageInfo가 유지되는지 확인한다.
- selected Profile 전환·해제 뒤 새 조회·비로그인 Profile 조회와 non-null expiresAt 비적용을 검증한다.
- Bookmark 생성·목록, Post Node 직접 조회와 기존 Visibility·Eligibility·권한을 유지하는지 확인한다.

- [x] 5.1 `postAccessWhere`에 Mute 조건과 필수 적용 정책을 통합하고 별도 public helper를 제거한다.
- [x] 5.2 Home·Local에 전체 Mute를 적용하고 모든 제외를 cursor·limit 전에 끝낸다.
- [x] 5.3 outer Author와 direct Source Author를 함께 판정하고 Content 없는 Repost·Quote를 검증한다.
- [x] 5.4 Profile의 방문한 Profile ID 예외와 Bookmark·직접 조회·상호작용 전체 무시를 명시한다.
- [x] 5.5 실제 GraphQL 경로, 양방향 pagination, selected Profile 격리·해제·접근 정책 회귀 테스트를 추가한다.
- [x] 5.6 Core·API 검증과 strict OpenSpec validation을 통과시키고 범위·결과를 PR에 기록한다.

## 6. PROD-814 UI·Relay 통합과 공유 change 완료

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/profile-mute.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- `docs/design/profile-mute-block.md`
- `PROD-814`
- `PROD-825`
- `PROD-823`
- presentation prerequisite evidence `PROD-858` (정본 아님)

**Deliverable**

`PROD-825`가 검증한 Home·Local·Profile 조회 정책과 Bookmark 비적용 결과를 UI·Relay에서 소비한다.
Profile action·관리 목록·Relay 상태를 연결하고 Home·Local·Profile·Repost 흐름을
종단 간 검증한 뒤 공유 OpenSpec을 완료한다.

**Guardrails**

- Local의 서버 후보 정책과 API 회귀 검증은 PROD-825가 소유한다. 이 이슈는 해당 결과를 소비해
  UI·Relay와 실제 runtime에서 selected Profile·outer Author·direct Source Author 정책을 검증한다.
- Local 고유 후보·정렬·Visibility·Eligibility는 Local query가 소유하고, Profile Mute 제외는 page limit과
  cursor 계산 전에 끝낸다.
- Profile surface에는 viewer-relative Mute 상태와 해제 action을 표시하지만 직접 `Profile.posts`에는 Mute
  전용 Collapse·reveal을 적용하지 않는다.
- Relay store와 connection 갱신은 selected Profile별 관계 identity를 섞지 않고, Mute 해제 뒤 새 조회가
  제거된 관계를 사용하지 않게 한다.
- `PROD-858`의 재사용 가능한 Production 공용 UI와 Storybook 검증 증거를 소비한다. 공용 presentation을
  다시 구현하거나 Storybook 증거를 Web·Native runtime 완료 증거로 일반화하지 않는다.
- `뮤트 및 차단` 공통 Settings 진입점과 destination 순서는 `PROD-814`와 `PROD-823` 중 실제 구현에 먼저
  착수한 이슈가 최초 구현·통합 검증을 소유하고 이 책임을 해당 이슈와 PR에 기록한다. 나중에 착수한 이슈는
  선행 구현의 repository 상태와 PR 증거를 재사용하고 같은 Settings shell·navigation을 다시 만들지 않는다.
- Hashtag Post List API·projection·runtime은 `PROD-827`의 별도 계약으로 남기며 이 change의 archive를 막지
  않는다.
- `PROD-824`·`PROD-825`·`PROD-814`가 맡은 task와 검증을 모두 마치기 전에는 이 change를 archive하지 않는다.

**Verification**

- Local에서 바깥 Author만 Mute한 후보, direct Source Author만 Mute한 Quote와 둘 다 Mute하지 않은 후보를
  page limit 전 판정하고, Content 없는 Repost는 기존 후보 정책으로 먼저 제외하는지 확인한다.
- 제외 후보 뒤의 eligible Post로 Local 페이지가 채워지고 cursor와 `hasNextPage`가 유지되는지 확인한다.
- 같은 Account의 selected Profile 전환과 Mute 해제 뒤 Home·Local·Profile·관리 목록의 새 조회 결과를
  검증한다.
- Local·Remote Target의 Web·iOS·Android 흐름과 접근성, 기존 관계·상호작용·Notification·Read State 불변성을
  통합 검증한다.
- 공통 Settings IA의 최초 owner와 선행 구현의 repository 상태·PR 증거를 기록하고, 후행 이슈가 같은
  shell·navigation을 중복 구현하지 않았는지 확인한다.
- canonical·Linear·OpenSpec을 최종 대조하고 archive 전후 strict validation을 통과시킨다.

- [ ] 6.1 PROD-825의 Local 서버 후보 정책 구현·API 검증 증거를 확인하고 기존 Local UI에 연결한다.
- [ ] 6.2 PROD-825의 Local API 회귀 증거를 재사용하고 selected Profile 전환·Mute 해제 뒤 Local 화면과
      Relay connection이 최신 서버 결과에 맞춰 갱신되는지 runtime에서 검증한다.
- [ ] 6.3 `PROD-858`의 공용 UI 결과를 Profile action·관리 목록·완료 피드백에 재사용하고 Relay
      store·connection 갱신을 기존 GraphQL 관계에 연결한다. 공통 Settings IA는 먼저 착수한 runtime 이슈의
      결과를 사용한다.
- [ ] 6.4 직접 Target Profile의 정상 Post 표시와 Mute 상태·해제 action을 Web·iOS·Android 및 접근성 경계에서
      검증한다.
- [ ] 6.5 Home·Local·Profile·Repost와 기존 관계·상호작용 상태를 연결하는 cross-slice E2E를 통과시킨다.
- [ ] 6.6 모든 적용 이슈와 artifact를 최종 대조하고 delta spec을 동기화한 뒤 OpenSpec을 archive해 archive 후
      strict validation을 통과시킨다.
