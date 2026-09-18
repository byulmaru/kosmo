## Context

Profile Block은 Owner → Target 방향으로 저장하며 Profile identity, 콘텐츠 직접 조회, 탐색 목록, 상호작용과 Notification에 surface별
정책을 적용하는 관계다. 새 Profile Block 관계를 저장하는 Block transaction만 현재 양방향 Follow Request·Follow Relationship과 제거된 Follow
객체의 직접 원인 Notification을 정리하며, 새 관계의 commit이 성공 결과다. 기존 Reaction·Repost·Bookmark와 비직접 원인 Notification·Read
State는 이번 action에서 변경하지 않고, commit 뒤 effect의 성공·실패는 관계 성공을 바꾸지 않는다. 이미 관계가 있거나 이후 겹치는 관계는
duplicate/Unblock cleanup이 아니라 Active Block 표면 정책으로 처리한다.

`PROD-821`은 additive 저장 관계와 transaction cleanup을, `PROD-822`는 공통 policy·GraphQL을, `PROD-823`은
기존 레거시 Profile·Settings UI를 사용하는 UI·상태 수렴과 통합을, `PROD-813`은 네 slice의 cross-slice E2E·canonical sync·archive를 소유한다.
canonical `profile-block.md`는 이 결과와 durable 관계 경계만 정하며, 각 구현 PR이 현재 코드와 검증 결과를 바탕으로 구체 수단을
선택한다.

## Goals / Non-Goals

**Goals:**

- 기존 Profile row를 바꾸지 않는 additive Profile Block 저장 관계와 Owner/Target uniqueness·referential integrity·self-block 불변식을 도입한다.
- Block policy/admission 이후 새 Profile Block 관계를 저장하는 transaction에서만 현재 양방향 Follow Request·Follow Relationship과 직접 원인
  Follow Notification을 정리하고 Profile Block 관계를 commit한다. 관계가 Block action의 성공 결과이며, commit 뒤 effect의 성공·실패는 성공을
  바꾸지 않는다. 같은 조합의 Block이 이미 있으면 기존 관계를 성공 결과로 관찰하고 새 cleanup을 실행하지 않는다. 이미 관계가 존재한 뒤
  동시성이나 후속 경로로 뒤늦게 관찰되는 Follow·Request·Notification은 Active Block 표면 정책으로 처리한다. Unblock은 Owner가 지정한 정확한
  Profile Block ID 관계만 제거하며 Follow/Request/Notification을 추가로 정리하거나 차단 생성 때 제거된 관계를 복구하지 않는다.
- Profile Node·handle route·일반 Profile 검색은 기존 Profile 조회 정책을 적용한다. Post·Media 직접 조회와 Profile Post List는 viewer 방향의
  콘텐츠 정책을 적용하고, Home·Local·Hashtag Post List·Post 검색·Follow 후보·새 로컬 상호작용·Notification은 양방향 보호 정책을 적용한다.
- selected Local Profile을 actor로 사용하는 현재 GraphQL ingress와 Owner-only management connection을 제공한다.
- Confirmation·관리 목록·접근성 등 기존 레거시 Profile·Settings UI와 최신 canonical이 정한 direct Profile route 계약을 구현·통합하는 흐름을 제공한다.
  양쪽 route는 기본 Profile 정보를 표시하고, `blocking` route는 frontend 콘텐츠 경고 뒤 허용된 콘텐츠와 `차단 해제` action을 제공하며,
  `blockedBy` route는 콘텐츠 차단 상태를 표시한다. 경고 문구·표시 기간은 후속 디자인 계약으로 남기고, `PROD-917` 신규 UI 교체는 이 change와 분리한다.
- `PROD-813`에서 Local·Remote pair와 주요 surface의 cross-slice 결과를 검증하고 canonical·Linear·OpenSpec sync 뒤 archive한다.

**Non-Goals:**

- 공용 presentation·Storybook 이관은 `PROD-861`의 별도 후속 범위로 관리한다.
- 모든 Follow·Follow Request·Reply·Reaction·Repost Notification source에 신규 생성 suppression을 연결하는 `PROD-327` 작업.
- ActivityPub Block/Undo 발신·수신과 remote delivery(`PROD-818`). 현재 remote ingress의 구현은 이 change에 포함하지 않는다.
- 조회 불가 Notification의 schedule/event/queue/worker/scan 물리 cleanup(`PROD-328`).
- Block 생성 시 기존 Reaction cleanup. 이 범위는 현재 action에서 정하지 않으며, 필요하면 별도 후속 계약에서 결정한다.
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 `PROD-917` 신규 UI 교체.

## Implementation Guidance

이 절은 authority-backed durable guardrail과 구현 선택을 구분한다. 아래 **Durable guardrails**는 관찰 가능한 결과와
canonical·ADR에서 파생한 제약이다. **Implementation options**는 비규범적 예시이며, owning PR은 같은 Deliverable·Guardrails·
Verification을 보존하는 다른 수단을 선택할 수 있다. 그 선택으로 공개 결과나 durable decision이 바뀌면 구현 중 같은 change와
상위 authority를 먼저 갱신한다.

### Durable guardrails

- Profile Block은 기존 Profile·Follow·Reaction·Notification·Post row를 backfill하거나 변경하지 않는 additive 관계여야 하며, Owner/Target 참조 무결성,
  pair uniqueness와 self-block 거부를 보장해야 한다.
- 새 Profile Block 관계를 저장하는 Block transaction은 현재 Follow Request·Follow Relationship과 직접 원인 Notification을 관계와 함께 원자적으로
  정리해야 한다. Profile Block 관계가 성공 결과이며, commit 뒤 effect의 재시도·일시 오류·실패는 이미 성공한 관계를 실패로 되돌리거나 성공을
  바꾸지 않는다.
- 동일한 Owner/Target 관계가 이미 있으면 기존 Profile Block을 관찰해 성공으로 반환하고 새 cleanup을 소유하지 않는다. 이미 관계가 존재한 뒤
  동시성이나 후속 경로로 뒤늦게 관찰되는 관계·Notification은 Active Block 표면 정책으로 처리한다. Unblock은 Owner가 지정한 정확한 Profile Block
  ID만 삭제하며 pair의 Follow/Request/Notification을 조회·정리하거나 복구하지 않는다.
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

### Known Traps

- 같은 Owner/Target의 duplicate가 기존 관계를 관찰한 뒤 새 cleanup을 시작하거나 현재 Follow/Notification을 삭제하지 않게 한다.
- 차단 관계가 이미 존재한 뒤 동시성이나 후속 경로로 남거나 관찰되는 Follow·Request·Notification은 Active Block 정책으로 처리하며, duplicate
  Block이나 Unblock을 지연 보상 cleanup 경로로 만들지 않는다.
- commit 뒤 effect의 재시도·일시 오류·실패를 Profile Block 성공·실패로 혼합하지 않는다. Unblock도 정확한 relation ID 이외의 pair 관계를
  삭제하거나 정리하지 않는다.
- Profile route는 기본 Profile 정보와 viewer 방향의 콘텐츠 상태를 기존 정책에 따라 표시하고, `blocking` route의 frontend 경고는 콘텐츠 결과 표시와
  별도의 presentation 상태로 제공한다.
- 차단 생성 transaction에서 제거한 Follow Request·Follow Relationship을 Unblock에서 자동 복구하지 않는다. 기존 Reaction cleanup은 현재 action에서
  정하지 않는다.
- `PROD-327` source 신규 Notification suppression, `PROD-818` federation, `PROD-328` async physical cleanup을 현재 task나 완료 증거로 끌어오지 않는다.
- 기존 레거시 UI의 구현·통합 결과와 API·cache·Native runtime 결과를 `PROD-813`에서 환경별 실제 evidence로 기록한다. `PROD-861` 공용 presentation 이관·Storybook 확정과
  `PROD-917` 신규 UI 교체는 이 change의 완료 조건과 별도 후속 범위로 관리한다.

## Risks / Trade-offs

- [Block transaction의 현재 관계 정리가 동시 변경과 겹칠 수 있다] → transaction 경계와 Active Block의 surface policy를 검증하고, post-commit effect가
  별도 결과로 처리되는지 확인한다.
- [post-commit effect가 실패할 수 있다] → 관계 transaction의 성공과 effect 성공을 분리해 기록하고, effect 실패가 이미 성공한 Block relation을
  되돌리거나 실패로 보고하지 않는지 검증한다.
- [여러 GraphQL surface가 policy를 빠뜨릴 수 있다] → Profile identity, directional direct content, bilateral list/search/interaction/Notification consumer가
  각각의 policy와 cursor 전 filtering을 사용하는지 `PROD-822` integration test에서 검증한다.
- [mutation 뒤 client cache가 stale하거나 actor가 섞일 수 있다] → 서버 확정 결과와 selected actor 격리를 검증하고, 실패 시 optimistic 상태를 성공으로 확정하지 않는다.
- [구버전 workload와 additive schema가 공존할 수 있다] → 기존 row 보존, rollout 중 read/write 공존과 rollback 결과를 `PROD-821`에서 확인한다.
- [기존 Web 실행 결과가 Native·federation 완료로 오인될 수 있다] → `PROD-813`에서 기존 레거시 UI의 Web/iOS/Android 통합 결과와 미검증 범위를 환경별 실제 evidence로 분리 기록한다.

## Migration Plan

1. `PROD-821`에서 additive Profile Block 관계와 Owner/Target·createdAt·uniqueness·referential integrity·self-block 불변식을 배포하고 기존 domain row를 변경하거나
   backfill하지 않는다.
2. `PROD-821`에서 Block admission과 현재 관계 cleanup을 하나의 transaction에 연결하고, Profile Block relation success·duplicate no-op cleanup·post-commit
   effect 분리·Unblock exact-ID 삭제와 보존·no-restore 결과를 검증한다.
3. `PROD-822`에서 surface별 policy·GraphQL을 연결한다. Profile identity는 기존 Profile 조회 정책을, 직접 Post·Media와 Profile Post List는 viewer 방향
   콘텐츠 정책을, Home·Local·Hashtag list/search와 Follow candidate·새 interaction·Notification은 각 canonical 양방향 보호 정책을 사용한다.
4. `PROD-823`에서 최신 canonical이 정한 direct Profile route 계약과 Settings Block destination, selected actor 상태 수렴을 기존 레거시 Profile·Settings UI에 연결한다.
   `blocking` route의 frontend 경고와 `blockedBy` route의 콘텐츠 차단 상태를 표시하고, `PROD-861` 공용 presentation 이관·Storybook 확정과 `PROD-917` 신규 UI 교체는
   각각 후속 범위로 유지한다.
5. `PROD-813`에서 Local·Remote pair와 direct/list/search/interaction 및 cross-slice E2E, canonical·Linear·OpenSpec 정합성, 플랫폼별 실제 evidence를 확인한다.
   모든 declared task와 required validation 뒤에만 `add-profile-block`을 archive한다.
6. rollback은 repository의 기존 workflow로 새 relation을 읽지 않게 처리하며, 저장된 Profile Block row를 임의 삭제하거나 차단 전 관계를 복구하지 않는다. `PROD-327`,
   `PROD-818`, `PROD-328`은 각각 독립된 후속 rollout/rollback 경계를 가진다.
