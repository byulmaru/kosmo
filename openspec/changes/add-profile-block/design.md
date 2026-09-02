## Context

Profile Block의 제품 계약은 `docs/domain/objects/profile-block.md`에 이미 정의되어 있다. 관계는 Owner → Target
방향을 가지지만 조회·상호작용 제한은 양쪽에 적용되고, 생성 시 Follow Request·Follow Relationship·Target Reaction과
그 Follow 객체를 직접 원인으로 하는 Notification을 정리한다. `PROD-821`은 저장과 transaction을, `PROD-822`는 공통
조회·상호작용 policy와 GraphQL을, `PROD-823`은 UI·Relay를, `PROD-813`은 완료된 `PROD-649` Local Timeline을 포함한
cross-slice E2E·canonical sync·archive를 소유한다.

현재 저장 schema는 `packages/core/db/tables.ts`의 Profile·Follow·Reaction·Notification·Bookmark·Post 관계를 사용하고,
core transaction은 `packages/core/services`에 있다. Profile/Post/Notification 가시성은 `packages/core/visibility`의
공통 query helper와 GraphQL resolver/loader가 함께 계산한다. 앱은 `apps/app/src/relay/RelayActorProvider.tsx`와
`RelayEnvironmentBoundary.tsx`에서 selected Profile·Session별 Relay Environment를 교체하며, Settings와 Profile surface는
기존 공용 component를 사용한다.

## Goals / Non-Goals

**Goals:**

- additive Profile Block 저장 관계와 단일 생성 transaction을 도입한다.
- 직접 조회, Profile/Post/Media/Follow 후보, Home·Local·Profile·Hashtag 목록, 검색과 새 로컬 상호작용에 같은 Block
  policy를 적용한다.
- GraphQL actor/owner 경계와 Profile Block 관리 connection을 제공한다.
- DSN-53 presentation을 소비하는 Block 확인·목록·최소 Profile 셸과 selected Profile별 Relay/cache 수렴을 제공한다.
- 완료된 `PROD-649`의 Local Timeline 후보·cursor·actor 격리를 유지하면서 Block Author/Source Author 회귀를 검증한다.

**Non-Goals:**

- `PROD-861`이 소유하는 공용 presentation·Storybook 이관 자체.
- 현재 Follow·Follow Request·Reply·Reaction·Repost Notification source에 새 생성 억제 policy를 연결하는 `PROD-327` 작업.
- ActivityPub Block/Undo 발신·수신(`PROD-818`)과 remote delivery.
- 조회 불가 Notification의 schedule/event/queue/worker/scan 물리 cleanup(`PROD-328`).
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 새 Settings shell.

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`에는 Profile Block 관계가 없으므로 Profile row의 기존 상태를 복제하지 않는 별도 additive
  relation이 필요하다. Profile Block 생성은 Follow Request·Follow Relationship·Reaction·Notification을 함께 변경하므로
  여러 public action을 순서대로 호출해 부분 commit을 만들면 안 된다.
- 현재 Profile/Post/Notification helper는 기본 상태·visibility를 계산하지만 Profile Block 양방향 조건을 모두 소비하지
  않는다. Profile object ref, Post connection, Media loader, Follow candidate, search와 Notification availability가 각각
  다른 조건을 조합하면 정책 우회가 생긴다.
- GraphQL의 `withAuth({ usingProfile: true })`는 Session·Active Account·selected Profile membership 경계를 소유하고,
  core service는 검증된 actor와 domain input을 소유한다. resolver마다 Account 권한이나 Block predicate를 재구현하면
  actor 격리와 오류 경계가 달라진다.
- 앱의 selected Profile 전환은 Relay Environment와 Store의 교체 경계다. Block 목록이나 optimistic 결과를 process 전역
  store 또는 route-local scalar 상태로 유지하면 다른 Owner로 누수될 수 있다.
- `PROD-861`의 Storybook 결과는 presentation 선행 증거이지 route·GraphQL·cache·runtime 완료 증거가 아니다. 현재 Notification
  source 생성 억제와 ActivityPub·비동기 cleanup도 이 change의 로컬 완료 조건이 아니다.

### Recommended Approach

1. Profile Block relation을 Profile foreign key 두 개, immutable 생성 시각과 Owner/Target 조합 unique 경계를 가진 additive
   table로 추가한다. 기존 migration 순서와 runtime role을 유지하고, migration과 schema snapshot을 기존 Drizzle workflow에
   맞춰 검증한다.
2. Core Block action이 한 transaction에서 owner/target 검증, Block insert, 양방향 Follow Request·Follow Relationship
   삭제, Target의 Owner Post Reaction 삭제와 직접 원인 Follow Notification 삭제를 수행하게 한다. Repost·Bookmark·다른
   Notification은 건드리지 않으며, 해제는 relation만 삭제하고 새 후속 요청에서 최신 policy를 평가한다.
3. Profile Block의 방향을 `(viewer, target)` policy 입력으로 정규화해 양방향 차단 조건을 만든다. Profile/Post/Media 직접
   조회, Follow 후보, 네 종류 Post List·검색, Follow·Reply·Reaction·Repost 입력 검증과 Notification 기존 item 가시성이
   같은 core/application helper를 소비하게 한다. 후보를 page limit로 자른 뒤 client에서 제거하지 않는다.
4. GraphQL은 selected Profile을 actor로 하는 Block 생성·해제와 Owner 전용 Block connection을 노출하고, Profile·Post·Media·
   Notification ref/loader가 같은 policy를 사용하게 한다. mutation 응답은 Relay가 정확한 relation/affected node를 갱신할
   수 있는 식별자를 포함하며, 구체 field·payload 이름은 기존 GraphQL naming과 구현 시 generated schema에 맞춘다.
5. UI는 `PROD-861`의 공용 ConfirmationContent·Button·ModalSheet·Toast·Settings/Profile shell을 재사용한다. Block과
   Mute 목록은 별도 destination으로 유지하고, `blocking`/`blockedBy` route는 이미 알려진 handle과 최소 상태만 표시한다.
   Relay connection은 현재 actor Store에서만 좁게 갱신하고, selected Profile·Session 전환 시 Environment reset으로 이전
   connection·cursor·optimistic state를 폐기한다.
6. `PROD-813`에서 Local·Remote Target, 양방향 relation, 기존 Follow/Reaction/Notification, Repost/Bookmark 보존·비복구,
   직접 조회·목록·검색·새 interaction, Profile 전환과 Local Timeline Author/Source Author 제외를 하나의 Web/API E2E 흐름으로
   연결한다. Storybook·Web·Native 결과와 실제 runtime 경계를 분리해 기록한다.

### Allowed Alternatives

- Core action은 기존 service primitive를 조합하거나 Block 전용 transaction query를 사용할 수 있다. 어느 방식이든 모든
  변경이 동일한 commit/rollback 경계에 있고 Profile Block specs의 보존·비복구 규칙을 만족해야 한다.
- 공통 Block predicate는 기존 visibility module 확장 또는 동등한 core policy adapter로 둘 수 있다. resolver·loader·client가
  각자 predicate를 복제하거나 DB session actor GUC로 요청 정책을 계산하는 방식은 허용하지 않는다.
- GraphQL connection membership 갱신은 Relay connection directive 또는 영향 범위가 확인된 좁은 updater를 사용할 수 있다.
  광범위한 store reset은 actor 경계를 보존해야 할 때만 사용한다.
- UI route는 기존 Expo Router Settings/Profile route convention을 따르는 한 destination layout을 재사용하거나 새 leaf
  route를 추가할 수 있다. 새 navigation shell·범용 safety component·UI package를 만들지 않는다.

### Known Traps

- Block row를 먼저 commit한 뒤 cleanup을 비동기로 실행하거나 Follow·Reaction deletion service를 별도 transaction으로 호출해
  부분 차단을 남기지 않는다.
- Owner → Target 한 방향만 검사해 Target이 Owner의 Profile·Post·Media·Follow 후보를 계속 보게 하지 않는다.
- Profile route/GraphQL에서 차단된 대상의 최신 상세를 재조회하거나, 목록에서 숨긴 뒤 client filter로만 보안을 구현하지 않는다.
- Block 해제 시 기존 Follow·Reaction을 자동 복구하거나 Repost·Bookmark를 생성 시 삭제하지 않는다.
- `PROD-327`의 현재 source 신규 Notification 억제, `PROD-818`의 federation, `PROD-328`의 async cleanup을 이 change의 task나
  완료 증거로 끌어오지 않는다.
- `PROD-861` Storybook static 결과를 production API/cache/native runtime 증거로 일반화하지 않는다.
- Local Timeline에서 별도 client filter를 만들거나 block 대상을 page limit 이후에 제거해 cursor pagination을 깨뜨리지 않는다.

## Risks / Trade-offs

- [한 transaction에서 여러 관계를 정리하면 lock 범위와 latency가 커질 수 있다] → pair/index 조건을 사용한 bounded delete와
  transaction integration test를 적용하고, Notification source generation·async cleanup을 기다리지 않는다.
- [다수 GraphQL surface가 policy를 빠뜨릴 수 있다] → core predicate를 직접 조회·connection·search·interaction별 테스트에서
  공통 fixture로 검증하고 client 후처리를 허용하지 않는다.
- [mutation 뒤 Relay connection과 이미 표시된 Post/Notification이 stale할 수 있다] → 성공 payload의 정확한 ID와 좁은
  connection updater를 사용하고, 실패 시 optimistic 상태를 확정하지 않으며 actor 전환 시 Environment를 교체한다.
- [구버전 workload와 additive schema가 함께 실행될 수 있다] → 독립 table/index만 먼저 확장하고, rollback 시 table을 삭제하지
  않고 구버전 read/write를 보존한다.
- [Web/Storybook 증거가 Native 또는 federation 완료로 오인될 수 있다] → 각 task의 실행 환경과 미검증 범위를 별도 기록한다.

## Migration Plan

1. Profile Block table·foreign key·unique/index를 additive Drizzle migration으로 배포하고 기존 Profile·Follow·Reaction·
   Notification·Bookmark·Post row를 변경하지 않는다.
2. `PROD-821` Core transaction과 `PROD-822` policy/GraphQL을 배포해 저장·조회 경계를 연결한다. 기존 client는 새 Block field를
   요청하지 않아도 기존 API contract를 사용할 수 있어야 한다.
3. `PROD-861` presentation 선행 증거가 준비된 뒤 `PROD-823` route·UI·Relay/cache를 배포한다. mutation 실패와 actor 전환 시
   기존 서버 확정 상태를 유지한다.
4. `PROD-813`에서 Local Timeline을 포함한 cross-slice E2E, canonical·Linear·OpenSpec 정합성과 지원 플랫폼별 실제 증거를
   확인한다. 이후에만 전체 change를 archive한다.
5. rollback은 app/API 배포를 되돌려 새 relation을 읽지 않게 하는 방식으로 수행하며, 이미 저장된 Profile Block row를 임의로
   삭제하거나 차단 전 관계를 복구하지 않는다. `PROD-327`, `PROD-818`, `PROD-328`은 각각 독립된 후속 rollout/rollback 경계를
   가진다.

## Open Questions

없음.
