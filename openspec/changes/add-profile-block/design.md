## Context

Profile Block은 Owner → Target 방향으로 저장하며 Profile identity, 콘텐츠 직접 조회, 탐색 목록, 상호작용과 Notification에 surface별
정책을 적용하는 관계다. Block 실행이 포착한 양방향 Follow Request·Follow Relationship과 제거된 Follow 객체의 직접 원인 Notification을 정리해야 하며, 기존 Reaction·Repost·
Bookmark와 비직접 원인 Notification은 이번 action에서 변경하지 않는다.

`PROD-821`은 additive 저장 관계와 durable cleanup orchestration을, `PROD-822`는 그 결과를 소비하는 공통 policy·GraphQL을, `PROD-823`은
최신 canonical이 승인한 presentation을 기존 레거시 Profile·Settings UI에 구현·통합해 UI·상태를 수렴하고, `PROD-813`은 네 slice의 cross-slice E2E·canonical sync·archive를 소유한다.
presentation 결정·공용 이관 자체는 이 change가 소유하지 않는다.
canonical `profile-block.md`는 이 결과와 durable 경계만 정하며, 각 구현 PR이 현재 코드와 검증 결과를 바탕으로 구체 수단을
선택한다.

## Goals / Non-Goals

**Goals:**

- 기존 Profile row를 바꾸지 않는 additive Profile Block 저장 관계와 Owner/Target uniqueness·referential integrity·self-block 불변식을 도입한다.
- Block policy/admission 이후 durable cleanup orchestration을 제공하고, Block 실행이 포착한 양방향 Follow Request·Follow Relationship과 직접 원인 Follow Notification을
  required cleanup으로 정리하며, required cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다. 이미 진입한 Follow transition이 cleanup 뒤
  Follow/Request 또는 그 직접 원인 Notification을 남길 수 있지만 Active Block 동안 공통 정책에서 inactive/invisible로 취급하며, Unblock은
  현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Block을 제거하고 삭제된 관계를 복구하지 않는다.
- Profile Node·handle route·일반 Profile 검색은 기존 Profile 조회 정책을 적용한다. Post·Media 직접 조회와 Profile Post List는 viewer 방향의
  콘텐츠 정책을 적용하고, Home·Local·Hashtag Post List·Post 검색·Follow 후보·새 로컬 상호작용·Notification은 양방향 보호 정책을 적용한다.
- selected Local Profile을 actor로 사용하는 현재 GraphQL ingress와 Owner-only management connection을 제공한다.
- Confirmation·관리 목록·접근성 등 기존 레거시 Profile·Settings UI와 최신 canonical이 정한 direct Profile route 계약을 구현·통합하는 흐름을 제공한다.
  양쪽 route는 기본 Profile 정보를 표시하고, `blocking` route는 frontend 콘텐츠 경고 뒤 허용된 콘텐츠와 `차단 해제` action을 제공하며,
  `blockedBy` route는 콘텐츠 차단 상태를 표시한다. 경고 문구·표시 기간은 후속 디자인 계약으로 남기고, `PROD-917` 신규 UI 교체는 이 change와 분리한다.
- Profile·Post·Media·Follow 후보와 Home·Local·Profile·Hashtag Post List·검색 및 새 로컬 상호작용에 같은 Profile Block policy를 적용한다.
- selected Local Profile을 actor로 사용하는 GraphQL Block 생성·해제와 Owner-only management 조회를 제공한다.
- Confirmation·관리 목록·접근성 등 기존 presentation contract와 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation을 소비하는
  흐름을 제공한다. presentation 결정·이관 자체는 이 change가 소유하지 않으며, UI는 보호된 데이터를 복구하지 않는다.
- `PROD-813`에서 Local·Remote pair와 주요 surface의 cross-slice 결과를 검증하고 canonical·Linear·OpenSpec sync 뒤 archive한다.
- `PROD-813`에서 Local·Remote pair와 주요 surface의 cross-slice 결과를 검증하고 canonical·Linear·OpenSpec sync 뒤 archive한다.

**Non-Goals:**

- 공용 presentation·Storybook 이관은 `PROD-861`의 별도 후속 범위로 관리한다.
- 모든 Follow·Follow Request·Reply·Reaction·Repost Notification source에 신규 생성 suppression을 연결하는 `PROD-327` 작업.
- ActivityPub Block/Undo 발신·수신과 remote delivery(`PROD-818`). 현재 remote ingress의 구현은 이 change에 포함하지 않는다.
- 조회 불가 Notification의 schedule/event/queue/worker/scan 물리 cleanup(`PROD-328`).
- Block 생성 시 기존 Reaction cleanup. 이 범위는 현재 action에서 정하지 않으며, 필요하면 별도 후속 계약에서 결정한다.
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 `PROD-917` 신규 UI 교체.
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 차단된 Profile presentation의 결정·이관 자체.
- 아직 없는 Hashtag Post List·Post 검색 endpoint의 신규 구현과 실제 endpoint E2E. 해당 경로는 공통 후보 정책 검증으로 이번 change의 완료 조건을 충족한다.

## Implementation Guidance

이 절은 authority-backed durable guardrail과 구현 선택을 구분한다. 아래 **Durable guardrails**는 관찰 가능한 결과와
canonical·ADR에서 파생한 제약이다. **Implementation options**는 비규범적 예시이며, owning PR은 같은 Deliverable·Guardrails·
Verification을 보존하는 다른 수단을 선택할 수 있다. 그 선택으로 공개 결과나 durable decision이 바뀌면 구현 중 같은 change와
상위 authority를 먼저 갱신한다.

### Durable guardrails

- Profile Block은 기존 Profile·Follow·Reaction·Notification·Post row를 backfill하거나 변경하지 않는 additive 관계여야 하며, Owner/Target 참조 무결성,
  pair uniqueness와 self-block 거부를 보장해야 한다.
- Block action은 필수 Follow 및 직접 원인 Notification cleanup이 유실되지 않고 재시작·일시 오류 뒤에도 완료될 수 있어야 한다. required cleanup 완료 전에는
  성공을 확정하지 않으며, 이미 처리한 효과가 보존 대상 데이터를 바꾸지 않게 한다.
- 저장 방향을 양쪽 viewer 정책으로 평가하는 Profile Block 관계 판정은 surface별 계약에 적용되어야 한다. Profile identity에는 기존 Profile 조회
  정책을, 직접 Post·Media 조회에는 viewer 방향 콘텐츠 정책을, Home·Local·Hashtag Post List·Post 검색·Follow 후보·interaction·Notification에는
  양방향 보호 정책을 적용하고 pagination/page limit 뒤 client filter가 policy를 대신하지 않게 한다.
- GraphQL은 selected Local Profile actor와 Owner scope를 사용하고 중앙 application policy를 호출해야 한다. ADR 0024의 경계에 따라 request-specific DB actor
  state(GUC 등)나 client-only filter로 권한·가시성을 대체하지 않는다.
- UI는 canonical design의 기존 Button·ActionMenu·ModalSheet·Toast·SettingsItem과 기존 Profile/Settings 흐름을 재사용하고, 최신 canonical이 정한 direct
  Profile route 계약을 구현·통합한다. 이 기능만을 위한 새 범용 safety component나 Settings shell을 추가하지 않으며, `PROD-861` 공용 presentation 이관·Storybook 확정과
  `PROD-917` 신규 UI 교체는 각각 후속 범위로 관리한다.

### Implementation ownership (non-normative)

각 owning PR은 현재 코드·배포 조건·검증 결과를 바탕으로 자기 Deliverable을 달성할 구체 구현 방식을 선택한다. 이 선택은
규범 계약이 아니며, observable behavior나 durable decision을 바꾸면 해당 PR은 같은 change와 상위 authority를 먼저 갱신한다.

### Current Constraints — PROD-822

2026-09-06 조사 기준 main `75358903`에는 `ProfileBlocks` 테이블과 migration만 있다. cleanup
[PR #726](https://github.com/byulmaru/kosmo/pull/726)은 `a6ebdee77e63adc889835c556c6ab5b13a9afd67`에서 Open·Draft다.
`PROD-822`는 #726을 부모 layer로 삼아 Stack을 쌓고 그 durable action·success gate를 소비한다. #726의 저장·cleanup 구현 책임과 검증은
`PROD-821`에 남으며, `PROD-822`는 정책·GraphQL만 소유한다. 부모 PR이 Draft여도 자식 layer 구현을 시작할 수 있지만, 자식 PR의 검증 base에는
#726 결과가 포함되어야 한다.

| 경계                      | 현재 코드와 구현 시 확인할 점                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 공통 Profile policy       | `packages/core/visibility/profile.ts`의 `visibleProfileWhere`는 viewer 입력 없이 Profile·Instance 상태만 검사한다. 인증용 actor 조회와 viewer별 Target 조회를 구분해야 한다.                                                                           |
| Post·Repost·Media         | `packages/core/visibility/post.ts`, `apps/api/src/graphql/resolvers/post/access/visibility.ts`에서 기존 Visibility와 Follow 조건을 조합한다. PostContent Node, Repost Source, Bookmark, avatar/header와 Media grant도 확인한다.                        |
| Profile 검색·관련 Profile | `apps/api/src/graphql/resolvers/profile/query/by-handle.ts`, `hashtag/field/related-profiles.ts`의 SQL 후보에 정책을 적용한다. 기존 exact/partial 검색과 명시적인 Remote materialization 조건은 유지한다.                                              |
| 목록                      | `post/query/home-timeline.ts`, `post/query/local-timeline.ts`, `post/field/profile.ts`는 이미 후보 SQL 뒤에 cursor·limit을 적용한다. 조사한 `apps/api/src`와 `apps/api/schema.graphql`에는 Hashtag Post List·Post 검색 endpoint가 없다.                |
| Follow                    | `packages/core/services/profile-follow-command.ts`, `profile-follow-transaction.ts`가 FOLLOW·APPROVE·ACCEPT와 관계 쓰기를 처리한다. 앞단에서 승인 여부만 확인하면 이미 존재하는 Request·Follow를 반환하는 경로가 정책을 우회할 수 있다.                |
| 새 Post interaction       | `packages/core/services/post.ts`, `reaction.ts`의 transaction에서 실제 대상·Source visibility와 pair 조건을 적용한다. GraphQL 사전 검사만으로 core caller의 우회를 막을 수 없다.                                                                       |
| Notification              | `packages/core/visibility/notification.ts`의 source availability를 API connection·Unread·Node·mark-read가 공유한다. Notification별 Recipient와 Related Profile·Post를 기준으로 판단하며 Account membership 범위를 selected actor 하나로 줄이지 않는다. |
| GraphQL 관리              | `apps/api/src/graphql/resolvers/profile/{mutation,field,loader}/mute.ts`와 `profile/ref.ts`가 relation payload·Owner connection의 선례다. Block Target은 일반 Profile 조회가 불가능하므로 Mute의 Target loader를 그대로 복사할 수 없다.                |

표의 `post/`, `profile/`, `hashtag/` 상대 경로는 `apps/api/src/graphql/resolvers/` 아래를 뜻한다.

### Recommended Approach — PROD-822

1. `packages/core/visibility`에서 검증된 viewer identity와 대상 Profile identity로 양방향 Block을 평가하는 공통 조건을 제공한다.
   SQL 후보용 조건과 action의 거부 판정은 같은 pair 정의를 공유한다. 기존 Profile·Instance 상태 조건은 유지하고,
   인증·Account 소유권 조회와 viewer별 공개 조회에 필요한 입력을 명확히 구분한다. 다른 계층의 타입이나 GraphQL context를 core로 전달하지 않는다.
2. direct Profile·Post·PostContent와 기존 목록·검색 query에 공통 조건을 합성한다. Repost는 Author와 Source Author를 모두 확인한다.
   Follow 후보는 viewer와 후보 Profile의 차단뿐 아니라 저장된 Follow/Request 참여자 사이의 Active Block도 확인한다.
   잔존 Follow를 Home 또는 `FOLLOWERS` 가시성의 근거로 사용하지 않는다. Reaction Profile 목록은 필터링하되 기존 Reaction count는 유지한다.
3. 기존 Follow transaction의 생성·승인 경로가 새 관계를 쓰거나 잔존 관계를 성공으로 반환하기 전에 현재 pair 정책을 평가한다.
   Reply·Reaction·Repost의 실제 쓰기 경계도 같은 정책을 적용한다. 이미 진행 중이던 Follow와 cleanup의 overlap은 허용하고
   새 pair lock이나 전체 lifecycle 직렬화로 계약을 강화하지 않는다. 자동화 검증은 Block 이후 새 admission과 기존 in-flight 잔존 row를 구분한다.
4. 기존 Notification availability에 Recipient별 Block 조건을 합성한다. read 목록·count·Node·mark-read에 같은 결과를 적용하고,
   source 신규 생성 함수에 일괄 suppression을 연결하는 `PROD-327` 작업과 섞지 않는다. shared helper 변경이 source 생성 의미까지 바꾸는지 확인한다.
5. GraphQL은 기존 Mute 문법에 맞춘 `blockProfile`·`unblockProfile`, `ProfileBlock` 관계와 Owner connection을 기본안으로 검토한다.
   생성 input의 대상과 해제 input의 관계 ID만 받고 Owner는 selected Local Profile에서 얻는다. `usingProfile`만으로 Local 조건이
   보장된다고 추정하지 않는다. mutation은 부모 layer #726이 제공하는 durable action을 호출하며 cleanup 구현을 `PROD-822`에 복제하지 않는다.
   일반 Target loader에서 차단된다는 이유로 자기 Block을 관리할 수 없게 하거나, 관리 목적으로 일반 Target 조회 권한을 열지 않는다.
6. Owner 관리 payload는 관계 ID·생성 시각과 관계 식별에 필요한 Target projection으로 제한한다. 일반 `Profile` ref에 예외 권한을 주기보다
   허용 field만 가진 관리 전용 projection을 우선 검토한다. 정확한 field·nullability·error mapping은 기존 schema와 정렬해 구현 PR에서 확정한다.
   해제 결과는 실제 삭제한 관계 ID를 반환하며, stale ID 재시도가 새 Block 세대를 삭제하지 않도록 선행 action의 generation 계약을 유지한다.
   직접 route는 handle과 현재 selected actor로 자신의 차단 여부·해제 관계 ID를 얻을 수 있어야 한다. 일반 Target Profile을 조회했거나
   기존 관리 목록의 client cache가 있어야 한다는 조건을 두지 않는다. 자신의 Block이 없고 Profile을 조회할 수 없으면 해제 관계를 반환하지 않으며,
   UI는 상대에게 차단된 경우 actionless 화면을 표시한다. 구체 query·projection 배치는 구현 선택으로 남긴다.
7. Block·Unblock 성공과 같은 operation의 `selectProfile` 이후에 request-scoped loader와 scope가 이전 정책 결과를 재사용하지 않게 한다.
   다음 HTTP request에서는 현재 관계와 저장된 selected Profile을 다시 평가한다. client cache 수렴은 `PROD-823`이 이 공개 결과를 소비한다.
8. viewer별 Block predicate를 일반 Profile visibility에 적용하되, Owner 전용 Mute 관리 connection과 `ProfileMute` 관계·viewer 상태 loader에는 적용하지 않는다.
   같은 Target의 Mute·Block 관계는 독립적으로 관리할 수 있어야 하며, Mute 관리 관계를 유지하는 일이 일반 Target Profile payload를 공개하는
   예외 권한이 되지는 않는다.

### Allowed Alternatives — PROD-822

- pair 판정을 기존 visibility 모듈에 두거나 전용 모듈로 나눌 수 있다. SQL의 `NOT EXISTS`, 동등한 join/anti-join이나
  action용 조회 방식은 동일한 양방향 결과·후보 필터링·공통 정책 재사용을 증명하면 허용한다.
- API field와 관리 projection의 배치는 기존 object 소유권과 generated schema에 맞게 정할 수 있다. 일반 Profile의 보호된 field를
  관리 projection으로 열거나 actor 입력을 client에 맡기는 방식은 허용하지 않는다.
- loader invalidation과 actor별 key 방식 중 현재 request context에 맞춰 수단을 선택할 수 있다. 선택 자체를 새 공용 cache 추상화나
  모든 loader의 일괄 재작성 요구로 확대하지 않는다.

### Delivery Boundary — PROD-822 / PROD-813

2026-09-06 사용자 결정과 `PROD-822`·`PROD-813` 최신 본문에 따라, 아직 없는 Hashtag Post List·Post 검색은 공통 Block 후보 정책
검증까지만 이 shared change의 완료 기준으로 삼는다. 신규 endpoint 구현이나 실제 endpoint E2E는 archive 조건이 아니다.
공통 정책의 실행 결과와 실제 API 검증의 미실행을 구분해 기록한다. 현재 consumer와 검증 시점에 이미 제공되는 endpoint는 실제 공개 결과로
검증하며, archive 이후 추가되는 endpoint의 연결·검증은 해당 기능 이슈가 소유한다. 이 경계는 canonical의 모든 Post List·검색 Exclude 정책을 바꾸지 않는다.

### Known Traps

- Block 실행이 포착한 required cleanup이 남은 상태에서 action 성공을 확정해 부분 성공을 만들지 않는다.
- 일시 오류·재시작에서 이미 처리한 cleanup이 중복되어 Repost·Bookmark·기존 Reaction·비직접 원인 Notification 또는 Read State를 바꾸지 않게 한다.
- Profile route는 기본 Profile 정보와 viewer 방향의 콘텐츠 상태를 기존 정책에 따라 표시하고, `blocking` route의 frontend 경고는 콘텐츠 결과 표시와
  별도의 presentation 상태로 제공한다.
- Block 해제 시 현재 남아 있는 양방향 Follow Request·Follow Relationship과 그 직접 원인 Notification을 먼저 정리한 뒤 Block을 제거하며, 차단 생성 때 제거된
  Follow Request·Follow Relationship을 자동 복구하지 않는다. 기존 Reaction cleanup은 현재 action에서 정하지 않는다.
- `PROD-327` source 신규 Notification suppression, `PROD-818` federation, `PROD-328` async physical cleanup을 현재 task나 완료 증거로 끌어오지 않는다.
- 기존 레거시 UI의 구현·통합 결과와 API·cache·Native runtime 결과를 `PROD-813`에서 환경별 실제 evidence로 기록한다. `PROD-861` 공용 presentation 이관·Storybook 확정과
  `PROD-917` 신규 UI 교체는 이 change의 완료 조건과 별도 후속 범위로 관리한다.
- DSN-51·DSN-53/`PROD-861` presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다.
- Block을 일반 Profile loader에만 넣고 Follow Node·viewer 상태·Reaction Profile 목록·PostContent·Bookmark 경로를 빠뜨리지 않는다.
- 차단된 Target의 일반 Profile ref를 관리 payload에 반환한 뒤 nested field를 client가 요청하지 않을 것이라고 가정하지 않는다.
- Notification 가시성을 selected Profile 하나로 계산해 같은 Account의 다른 Recipient 알림을 잘못 노출하거나 숨기지 않는다.
- 아직 없는 Hashtag Post List·Post 검색의 공통 후보 정책 검증을 실제 endpoint 통합 검증으로 보고하지 않는다.

### Verification Plan — PROD-822

| 검증 묶음            | 완료를 증명하는 결과                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공통 pair 정책       | Local/Remote Owner·Target의 4개 조합, 한 방향·서로 차단·차단 없음, 양쪽 viewer와 제삼자를 검증한다. 한쪽 해제 뒤 반대 Block이 남는 경우도 포함한다.                                                                                                      |
| 잔존 Follow          | Block 뒤 남긴 Follow/Request fixture가 Node·목록·viewer 상태·Home·`FOLLOWERS` 권한에서 비활성·비노출이다. Block 완료 뒤 시작한 FOLLOW·로컬 APPROVE는 새 관계를 남기지 않는다.                                                                            |
| 직접·목록·검색       | Profile/handle/partial search, Hashtag.relatedProfiles, Post/PostContent, Media relation, Home·Local·Profile·Bookmark와 Reaction Profile 목록을 실제 GraphQL로 검증한다. 제외 후보가 정렬 앞부분을 차지해도 정상 후속 후보와 cursor/pageInfo가 유지된다. |
| 미구현 consumer      | Hashtag Post List·Post 검색은 Author·Source Author 공통 후보 조건을 DB fixture로 검증한다. 신규 endpoint는 생성하지 않으며 실제 API 통합 증거는 미실행으로 남긴다. 구현 착수 때 endpoint가 추가돼 있으면 소비 경로와 공개 회귀를 함께 연결한다.          |
| 로컬 interaction     | 양쪽 방향 Reply·Reaction·Repost와 Follow 입력의 실패 뒤 새 row가 없다. 기존 Reaction·Repost·Bookmark와 Reaction count는 보존된다.                                                                                                                        |
| GraphQL ingress·관리 | guest, selected Profile 없음, membership mismatch, Remote selected actor, arbitrary Owner ID, 타인 Block ID와 A/B 전환을 검증한다. Owner 관리 성공과 일반 Profile·nested field 우회 실패를 함께 확인한다.                                                |
| durable 결과·cache   | cleanup 지연·실패·timeout이 조기 성공을 만들지 않는다. Unblock은 정확한 관계 ID와 no-restore를 지킨다. 같은 Mutation의 후속 field와 다음 요청이 현재 actor·Block 상태를 반영한다.                                                                        |
| Notification         | 현재 구현된 Follow·Follow Request·Reply·Reaction·Repost source별 connection·Unread·Node·mark-read의 동일 비노출, A/B Recipient와 중복·숨겨진 ID의 no-op, 비직접 row·Read State 보존을 검증한다.                                                          |

구현 뒤 Core의 `test:unit`·`test:services`, API의 `test:integration`·`lint:schema`·`lint:tsc`와 변경된 파일의
ESLint·Prettier를 실행한다. 기존 Mute·Follow·Post visibility·Notification 회귀를 함께 실행하고, shared core consumer를
변경했으면 해당 Worker·Fedify 회귀도 확인한다. 명령은 `pnpm --filter @kosmo/core ...`, `pnpm --filter @kosmo/api ...` 등
현재 workspace script를 사용한다. 이 Spec 세션의 문서 validation을 runtime 검증 결과로 기록하지 않는다.

## Risks / Trade-offs

- [여러 관계 정리를 durable orchestration으로 묶으면 retry와 작업 범위가 늘어날 수 있다] → 구현 수단과 무관하게 pair 범위의 required cleanup과 재시작·일시 오류
  결과를 검증한다.
- [orchestration이 cleanup 완료 전에 성공하거나 중단될 수 있다] → 명시적인 success gate와 restart·retry fixture로 Block 상태와 cleanup 완료를 확인한다.
- [여러 GraphQL surface가 policy를 빠뜨릴 수 있다] → Profile identity, directional direct content, bilateral list/search/interaction/Notification consumer가
  각각의 policy와 cursor 전 filtering을 사용하는지 `PROD-822` integration test에서 검증한다.
- [mutation 뒤 client cache가 stale하거나 actor가 섞일 수 있다] → 서버 확정 결과와 selected actor 격리를 검증하고, 실패 시 optimistic 상태를 성공으로 확정하지 않는다.
- [구버전 workload와 additive schema가 공존할 수 있다] → 기존 row 보존, rollout 중 read/write 공존과 rollback 결과를 `PROD-821`에서 확인한다.
- [기존 Web 실행 결과가 Native·federation 완료로 오인될 수 있다] → `PROD-813`에서 기존 레거시 UI의 Web/iOS/Android 통합 결과와 미검증 범위를 환경별 실제 evidence로 분리 기록한다.

## Migration Plan

1. `PROD-821`에서 additive Profile Block 관계와 Owner/Target·createdAt·uniqueness·referential integrity·self-block 불변식을 배포하고 기존 domain row를 변경하거나
   backfill하지 않는다.
2. `PROD-821`의 cleanup PR #726에서 Block admission, durable cleanup orchestration과 required cleanup success gate를 연결하고
   restart/retry·보존·no-restore 결과를 검증한다.
3. `PROD-822`를 #726 위의 자식 layer로 쌓아 Profile identity, directional direct content/Profile Post List, bilateral list/search/interaction/Notification과
   GraphQL policy를 연결한다. Profile/Post/Media/Follow candidate와 Home·Local·Hashtag list/search는 각 surface의 정책 결과를 사용한다.
4. `PROD-823`에서 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation과 Settings Block destination, selected actor 상태 수렴을
   기존 레거시 Profile·Settings UI에 연결한다. `DSN-51`·DSN-53은 presentation 근거이고 `PROD-861`은 선행 구현 증거이며, 해당 presentation의 결정·이관 자체와
   `PROD-917` 신규 UI 교체는 이 change와 분리된 후속 범위로 유지한다.
5. `PROD-813`에서 Local·Remote pair와 현재 구현된 direct/list/search/interaction 및 cross-slice E2E, canonical·Linear·OpenSpec 정합성, 플랫폼별 실제 evidence를 확인한다.
   미구현 Hashtag Post List·Post 검색은 공통 후보 정책 검증 결과와 실제 API 미실행 기록으로 완료 기준을 충족한다. 이 검증 범위에 따른 모든 declared task와
   required validation 뒤에만 `add-profile-block`을 archive한다.
6. rollback은 실제 배포한 slice와 Active Block 사용 여부를 확인해 범위를 정한다. 저장된 Profile Block row를 임의 삭제하거나 차단 전 관계를 복구하지 않는다.
   `PROD-327`, `PROD-818`, `PROD-328`은 각각 독립된 후속 rollout/rollback 경계를 가진다.

`PROD-822`는 별도 schema나 backfill 없이 `PROD-821`의 저장·cleanup 결과 위에 정책과 API를 배포하는 것을 기본안으로 한다.
외부 Block mutation은 policy consumer와 durable action을 함께 검증한 뒤 노출한다. 이미 Active Block을 사용하는 환경에서
정책만 제거하는 rollback은 접근 제한을 해제하므로 자동 실행하지 않는다. 문제가 생기면 새 mutation 노출 중단과 기존 차단
보호를 유지하는 복구 범위를 검토하고, 저장 row 삭제나 Follow 복구를 rollback 수단으로 사용하지 않는다.

## Open Questions

- 구현 Stack 조건은 #726을 `PROD-822`의 부모 layer로 두는 것이다. #726은 저장·cleanup 책임을 유지하고 `PROD-822`는 정책·GraphQL 책임만 소유한다.
- 미구현 endpoint의 범위는 확정됐으며, `Delivery Boundary — PROD-822 / PROD-813`을 따른다. 이 범위에 남은 인간 결정은 없다.
- 구체 GraphQL field·payload·관리 projection의 field 목록은 구현 PR이 canonical의 최소 정보와 기존 naming 계약 안에서 정한다.
  이는 새 제품 권한을 정할 권한을 부여하지 않는다.
