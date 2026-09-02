## Context

Profile Block은 Owner → Target 방향으로 저장하지만 조회·상호작용 정책은 양쪽에 적용되는 관계다. 생성 시 양방향
Follow Request·Follow Relationship과 제거된 Follow 객체의 직접 원인 Notification을 정리해야 하며, 기존 Reaction·Repost·
Bookmark와 비직접 원인 Notification은 이번 action에서 변경하지 않는다.

`PROD-821`은 additive 저장 관계와 durable cleanup orchestration을, `PROD-822`는 공통 policy·GraphQL을, `PROD-823`은
승인된 presentation을 소비하는 UI·Relay를, `PROD-813`은 네 slice의 cross-slice E2E·canonical sync·archive를 소유한다.

현재 Follow removal 경계는 removal transition과 effect plan을 DB transaction 결과로 반환하고, 효과를 FIFO로 drain하는
계약을 가진다. Unfollow workflow는 이 public wrapper로 남는다. Profile Block은 그 계약을 양방향 Follow 정리에 재사용하고,
pending request와 직접 원인 Follow Notification cleanup을 durable orchestration에서 함께 처리해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 Profile row를 바꾸지 않는 additive Profile Block 저장 관계와 Owner/Target unique·foreign-key·self 불변식을 도입한다.
- Block policy/admission 이후 기존 Follow removal transition/effect-plan을 양방향에 재사용하는 durable Temporal cleanup orchestration을
  제공하고, required cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다.
- Profile·Post·Media·Follow 후보와 Home·Local·Profile·Hashtag Post List·검색 및 새 로컬 상호작용에 같은 Profile Block policy를 적용한다.
- selected Local Profile을 actor로 사용하는 현재 GraphQL ingress와 Owner-only management connection을 제공한다.
- Confirmation·관리 목록·접근성 등 기존 presentation contract를 소비하는 흐름을 제공한다. route 유지 여부·shell·handle·상태 문구·
  unblock 위치는 후속 승인된 presentation authority에서 정한다. UI는 보호된 데이터를 복구하지 않는다.
- `PROD-813`에서 Local·Remote pair와 주요 surface의 cross-slice 결과를 검증하고 canonical·Linear·OpenSpec sync 뒤 archive한다.

**Non-Goals:**

- `PROD-861`이 소유하는 공용 presentation·Storybook 이관 자체.
- 모든 Follow·Follow Request·Reply·Reaction·Repost Notification source에 신규 생성 suppression을 연결하는 `PROD-327` 작업.
- ActivityPub Block/Undo 발신·수신과 remote delivery(`PROD-818`). 현재 remote ingress의 구현은 이 change에 포함하지 않는다.
- 조회 불가 Notification의 schedule/event/queue/worker/scan 물리 cleanup(`PROD-328`).
- Block 생성 시 기존 Reaction cleanup.
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 차단된 Profile의 구체 route presentation.

## Implementation Guidance

### Current Constraints

- 현재 저장 schema에는 Profile Block 관계가 없으므로 독립 additive relation과 조합 제약이 필요하다. 기존 Profile·Follow·Reaction·
  Notification·Post row를 backfill하거나 기존 상태 column으로 대체하지 않는다.
- Profile Block action은 여러 관계를 건드리고 worker 재시작·일시 오류를 견뎌야 한다. 로컬 DB transaction 하나를 전체 lifecycle의 성공
  조건으로 삼으면 durable retry와 effect settlement를 보장할 수 없다.
- Follow removal transition/effect plan은 source row와 effect를 deterministic하게 계산하고 terminal effect를 drain하는 기존 경계다.
  양방향 정리에서 이 계약을 우회해 ad hoc delete를 추가하면 재시도·중복·Notification 원인 추적이 달라진다.
- Profile/Post/Notification helper, GraphQL resolver/loader와 Post List consumer가 각자 Block 조건을 조합하면 direct Node와 connection,
  search와 interaction 사이에 정책 누락이 생긴다.
- GraphQL ingress는 selected Local Profile actor 경계를 사용하지만 Profile Block 도메인 자체를 특정 Account/Membership 상태에 종속하지
  않는다. remote ActivityPub ingress는 `PROD-818`의 별도 경계다.
- selected Profile 전환은 Relay Environment와 Store의 교체 경계다. Block connection·cursor·optimistic state를 process 전역에 두지 않는다.

### Recommended Approach

1. Profile Block relation을 Owner Profile·Target Profile foreign key, immutable 생성 시각, Owner/Target unique와 self-block check/index를
   가진 additive table로 추가한다. migration 안전성·schema snapshot·구버전 공존은 기존 Drizzle workflow와 821 guardrail로 검증한다.
2. Block action admission에서 공통 Block policy와 ingress admission을 확인한 뒤 durable Temporal orchestration을 시작한다. orchestration은
   양방향 Follow Request·Follow Relationship에 기존 removal transaction/transition과 effect-plan contract를 재사용하고, deterministic drain
   helper로 pending request·직접 원인 Follow Notification cleanup을 재개 가능하게 처리한다. 기존 Unfollow workflow는 public wrapper로 유지하고
   같은 removal 계약을 새 child Workflow type이나 Block 전용 query로 복제하지 않는다.
3. orchestration이 required cleanup 완료를 확인하기 전에는 Block action 성공을 반환하지 않는다. 기존 Reaction·Repost·Bookmark와 직접 원인이
   아닌 기존 Notification·Read State는 건드리지 않고, Unblock은 Block relation만 제거하며 정리된 Follow Request·Follow Relationship을 복구하지
   않는다.
4. 저장 방향을 `(viewer, target)` 입력으로 정규화하는 공통 blocked predicate를 만들고 Profile/Post/Media direct query, Follow 후보, Home·
   Local·Profile·Hashtag Post List, search와 interaction consumer가 후보 반환·payload 생성·write validation 전에 사용하게 한다.
5. GraphQL은 selected Local Profile actor 기반 Block 생성·해제와 Owner-only connection을 제공한다. resolver·loader·Node·connection은 중앙
   application policy를 호출하고 client-only filter나 request-specific DB actor GUC를 권한/visibility 대체로 사용하지 않는다.
6. UI는 DSN-53과 `PROD-861`의 공용 confirmation·Settings destination·accessibility contract를 소비하고, route 유지 여부·shell·handle·
   상태 문구·unblock 위치는 후속 승인된 presentation authority에서 정한다. Block과 Mute destination은 분리하며, UI는 보호된
   Profile/Post/Media/Notification을 optimistic 상태로 복구하지 않는다.
   Relay는 selected Profile actor Store 안에서만 좁게 cache를 수렴한다.
7. `PROD-813`은 Local·Remote Target, 양방향 relation, cleanup/no-restore, direct/list/search/interaction, Profile switch와 platform evidence를
   하나의 cross-slice 흐름으로 검증한다.

### Allowed Alternatives

- Durable orchestration은 기존 Follow removal transition/effect-plan과 deterministic drain을 재사용해야 한다. 이를 Profile Block Workflow 안에서
  조합하는 helper 배치와 orchestration topology는 구현 세부사항이지만, 새 child Workflow type이나 Block 전용 removal query로 같은 계약을
  복제해서는 안 된다.
- 공통 predicate는 기존 visibility module 확장 또는 동등한 core policy adapter로 둘 수 있다. resolver·loader·client가 predicate를 복제하거나
  page limit 뒤 client filter로 보안을 구현하는 방식은 허용하지 않는다.
- GraphQL connection membership 갱신은 Relay connection directive 또는 영향 범위가 확인된 좁은 updater를 사용할 수 있다. 광범위한 store reset은
  actor 경계를 보존할 때만 사용한다.
- UI는 기존 Expo Router Settings/Profile convention과 승인된 presentation을 따르는 destination layout을 재사용할 수 있다. 이 change를 위한
  새 navigation shell·범용 safety component·별도 UI package를 만들지 않는다.

### Known Traps

- Block row를 먼저 성공으로 확정하고 cleanup을 비동기로 남기거나, required cleanup 전에 성공 응답을 반환하지 않는다.
- 기존 Follow removal transition/effect-plan을 우회해 양방향 request·relationship·Notification을 별도 delete path로 중복 구현하지 않는다.
- 일시 오류나 worker 재시작에서 이미 처리한 effect를 중복 적용하지 않고, 미완료 effect는 deterministic하게 재개한다.
- Owner → Target 한 방향만 검사해 Target이 Owner의 Profile·Post·Media·Follow 후보를 계속 보게 하지 않는다.
- Profile route/GraphQL에서 차단된 대상의 최신 상세를 재조회하거나 client filter만으로 보안을 구현하지 않는다. UI는 보호된 데이터를 복구하지 않는다.
- Block 해제 시 기존 Follow Request·Follow Relationship을 자동 복구하거나 Repost·Bookmark·비직접 원인 Notification을 삭제하지 않는다. 기존
  Reaction은 이 action에서 변경하지 않는다.
- `PROD-327` source 신규 Notification suppression, `PROD-818` federation, `PROD-328` async physical cleanup을 task나 완료 증거로 끌어오지 않는다.
- DSN-53/`PROD-861` Storybook static 결과를 production API/cache/native runtime 증거로 일반화하지 않는다.
- 특정 Post List에 별도 Block predicate나 client filter를 만들지 않는다. 공통 Post List policy가 cursor/page limit 전에 적용되어야 한다.

## Risks / Trade-offs

- [여러 관계 정리를 durable orchestration으로 묶으면 retry와 lock 범위가 늘어날 수 있다] → pair/index 조건으로 bounded work를 계산하고
  existing removal effect-plan·deterministic drain과 idempotency를 검증한다.
- [orchestration이 cleanup 완료 전에 성공하거나 중단될 수 있다] → required cleanup completion을 명시적인 success gate로 두고 restart·retry
  fixture에서 Block action 상태를 확인한다.
- [여러 GraphQL surface가 policy를 빠뜨릴 수 있다] → direct·connection·search·interaction consumer가 공통 fixture와 predicate를 사용하는지
  822 integration test에서 검증하고 client 후처리를 허용하지 않는다.
- [mutation 뒤 Relay cache가 stale하거나 actor가 섞일 수 있다] → 성공 payload의 정확한 ID와 좁은 updater를 사용하고, failure는 optimistic 상태를
  확정하지 않으며 actor 전환 시 Environment를 교체한다.
- [구버전 workload와 additive schema가 공존할 수 있다] → 독립 table/index만 먼저 확장하고 migration/rollback safety와 기존 row 보존을 821에서
  확인한다. 실제 rollback command는 repository workflow에 따른다.
- [Web/Storybook 증거가 Native·federation 완료로 오인될 수 있다] → 813에서 환경별 실제 evidence와 미검증 범위를 분리 기록한다.

## Migration Plan

1. Profile Block table·foreign key·unique/check/index를 additive Drizzle migration으로 배포하고 기존 Profile·Follow·Reaction·Notification·
   Bookmark·Post row를 변경하거나 backfill하지 않는다.
2. `PROD-821`에서 Block admission과 durable cleanup orchestration, existing removal effect-plan 재사용과 success gate를 연결하고 migration·
   restart/retry·보존/no-restore 검증을 수행한다.
3. `PROD-822`에서 common policy·GraphQL을 연결한다. Profile/Post/Media/Follow candidate와 Home·Local·Profile·Hashtag list/search 및 새
   interaction은 같은 predicate를 사용한다.
4. 후속 presentation authority의 승인과 evidence가 준비된 뒤 `PROD-823`에서 승인된 presentation, Settings Block destination과 Relay/cache
   actor isolation을 연결한다.
5. `PROD-813`에서 Local·Remote pair와 direct/list/search/interaction 및 cross-slice E2E, canonical·Linear·OpenSpec 정합성, 플랫폼별 실제
   evidence를 확인한다. 모든 declared task와 required validation 뒤에만 `add-profile-block`을 archive한다.
6. rollback은 app/API 배포를 되돌려 새 relation을 읽지 않게 하는 기존 workflow로 수행하며, 저장된 Profile Block row를 임의 삭제하거나 차단 전
   관계를 복구하지 않는다. `PROD-327`, `PROD-818`, `PROD-328`은 각각 독립된 후속 rollout/rollback 경계를 가진다.

## Open Questions

없음.
