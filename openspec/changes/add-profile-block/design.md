## Context

Profile Block은 Owner → Target 방향으로 저장하지만 조회·상호작용 정책은 양쪽에 적용되는 관계다. Block 실행이 포착한 양방향
Follow Request·Follow Relationship과 제거된 Follow 객체의 직접 원인 Notification을 정리해야 하며, 기존 Reaction·Repost·
Bookmark와 비직접 원인 Notification은 이번 action에서 변경하지 않는다.

`PROD-821`은 additive 저장 관계와 durable cleanup orchestration을, `PROD-822`는 공통 policy·GraphQL을, `PROD-823`은
승인된 presentation을 소비하는 UI·상태 수렴을, `PROD-813`은 네 slice의 cross-slice E2E·canonical sync·archive를 소유한다.
canonical `profile-block.md`는 이 결과와 durable 경계만 정하며, 각 구현 PR이 현재 코드와 검증 결과를 바탕으로 구체 수단을
선택한다.

## Goals / Non-Goals

**Goals:**

- 기존 Profile row를 바꾸지 않는 additive Profile Block 저장 관계와 Owner/Target uniqueness·referential integrity·self-block 불변식을 도입한다.
- Block policy/admission 이후 durable cleanup orchestration을 제공하고, Block 실행이 포착한 양방향 Follow Request·Follow Relationship과 직접 원인 Follow Notification을
  required cleanup으로 정리하며, required cleanup 완료 전에는 Block action을 성공으로 확정하지 않는다. 이미 진입한 Follow transition이 cleanup 뒤
  Follow/Request 또는 그 직접 원인 Notification을 남길 수 있지만 Active Block 동안 공통 정책에서 inactive/invisible로 취급하며, Unblock은
  현재 남아 있는 양방향 Follow/Request와 그 직접 원인 Notification을 정리한 뒤 Block을 제거하고 삭제된 관계를 복구하지 않는다.
- Profile·Post·Media·Follow 후보와 Home·Local·Profile·Hashtag Post List·검색 및 새 로컬 상호작용에 같은 Profile Block policy를 적용한다.
- selected Local Profile을 actor로 사용하는 현재 GraphQL ingress와 Owner-only management connection을 제공한다.
- Confirmation·관리 목록·접근성 등 기존 presentation contract와 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation을 소비하는
  흐름을 제공한다. presentation 결정·이관 자체는 이 change가 소유하지 않으며, UI는 보호된 데이터를 복구하지 않는다.
- `PROD-813`에서 Local·Remote pair와 주요 surface의 cross-slice 결과를 검증하고 canonical·Linear·OpenSpec sync 뒤 archive한다.

**Non-Goals:**

- `PROD-861`이 소유하는 공용 presentation·Storybook 이관 자체.
- 모든 Follow·Follow Request·Reply·Reaction·Repost Notification source에 신규 생성 suppression을 연결하는 `PROD-327` 작업.
- ActivityPub Block/Undo 발신·수신과 remote delivery(`PROD-818`). 현재 remote ingress의 구현은 이 change에 포함하지 않는다.
- 조회 불가 Notification의 schedule/event/queue/worker/scan 물리 cleanup(`PROD-328`).
- Block 생성 시 기존 Reaction cleanup. 이 범위는 현재 action에서 정하지 않으며, 필요하면 별도 후속 계약에서 결정한다.
- Profile Mute, Profile Domain Block, 신고·커뮤니티 관리와 차단된 Profile presentation의 결정·이관 자체.

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
- 저장 방향과 무관한 양방향 blocked policy는 direct 조회·후보·Post list·search·interaction 결과에 적용되어야 하며, pagination/page limit 뒤 client filter가
  policy를 대신할 수 없다.
- GraphQL은 selected Local Profile actor와 Owner scope를 사용하고 중앙 application policy를 호출해야 한다. ADR 0024의 경계에 따라 request-specific DB actor
  state(GUC 등)나 client-only filter로 권한·가시성을 대체하지 않는다.
- UI는 canonical design의 기존 Button·ActionMenu·ModalSheet·Toast·SettingsItem과 기존 Profile/Settings 흐름을 재사용하고, 최신 canonical이 승인한 identity-free
  `blocking`·`blockedBy` route presentation을 소비한다. 이 기능만을 위한 새 범용 safety component나 Settings shell을 추가하지 않으며, presentation 결정·이관 자체는
  이 change가 소유하지 않는다.

### Implementation ownership (non-normative)

각 owning PR은 현재 코드·배포 조건·검증 결과를 바탕으로 자기 Deliverable을 달성할 구체 구현 방식을 선택한다. 이 선택은
규범 계약이 아니며, observable behavior나 durable decision을 바꾸면 해당 PR은 같은 change와 상위 authority를 먼저 갱신한다.

### Known Traps

- Block 실행이 포착한 required cleanup이 남은 상태에서 action 성공을 확정해 부분 성공을 만들지 않는다.
- 일시 오류·재시작에서 이미 처리한 cleanup이 중복되어 Repost·Bookmark·기존 Reaction·비직접 원인 Notification 또는 Read State를 바꾸지 않게 한다.
- Owner → Target 한 방향만 검사해 Target이 Owner의 Profile·Post·Media·Follow 후보를 계속 보게 하지 않는다.
- Profile route·GraphQL·list/search에서 차단된 대상의 최신 상세를 재조회하거나 client 후처리로 보호된 데이터를 복원하지 않는다.
- Block 해제 시 현재 남아 있는 양방향 Follow Request·Follow Relationship과 그 직접 원인 Notification을 먼저 정리한 뒤 Block을 제거하며, 차단 생성 때 제거된
  Follow Request·Follow Relationship을 자동 복구하지 않는다. 기존 Reaction cleanup은 현재 action에서 정하지 않는다.
- `PROD-327` source 신규 Notification suppression, `PROD-818` federation, `PROD-328` async physical cleanup을 현재 task나 완료 증거로 끌어오지 않는다.
- DSN-51·DSN-53/`PROD-861` presentation 결과를 API·cache·Native runtime 완료 증거로 일반화하지 않는다.

## Risks / Trade-offs

- [여러 관계 정리를 durable orchestration으로 묶으면 retry와 작업 범위가 늘어날 수 있다] → 구현 수단과 무관하게 pair 범위의 required cleanup과 재시작·일시 오류
  결과를 검증한다.
- [orchestration이 cleanup 완료 전에 성공하거나 중단될 수 있다] → 명시적인 success gate와 restart·retry fixture로 Block 상태와 cleanup 완료를 확인한다.
- [여러 GraphQL surface가 policy를 빠뜨릴 수 있다] → direct·connection·search·interaction consumer가 같은 양방향 결과와 cursor 전 filtering을 사용하는지
  `PROD-822` integration test에서 검증한다.
- [mutation 뒤 client cache가 stale하거나 actor가 섞일 수 있다] → 서버 확정 결과와 selected actor 격리를 검증하고, 실패 시 optimistic 상태를 성공으로 확정하지 않는다.
- [구버전 workload와 additive schema가 공존할 수 있다] → 기존 row 보존, rollout 중 read/write 공존과 rollback 결과를 `PROD-821`에서 확인한다.
- [Web/Storybook 증거가 Native·federation 완료로 오인될 수 있다] → `PROD-813`에서 환경별 실제 evidence와 미검증 범위를 분리 기록한다.

## Migration Plan

1. `PROD-821`에서 additive Profile Block 관계와 Owner/Target·createdAt·uniqueness·referential integrity·self-block 불변식을 배포하고 기존 domain row를 변경하거나
   backfill하지 않는다.
2. `PROD-821`에서 Block admission, durable cleanup orchestration과 required cleanup success gate를 연결하고 restart/retry·보존·no-restore 결과를 검증한다.
3. `PROD-822`에서 common policy·GraphQL을 연결한다. Profile/Post/Media/Follow candidate와 Home·Local·Profile·Hashtag list/search 및 새 interaction은 같은
   양방향 policy 결과를 사용한다.
4. `PROD-823`에서 최신 canonical이 승인한 identity-free `blocking`·`blockedBy` route presentation과 Settings Block destination, selected actor 상태 수렴을 연결한다.
   `DSN-51`·DSN-53은 presentation 근거이고 `PROD-861`은 선행 구현 증거이며, 해당 presentation의 결정·이관 자체는 이 change가 소유하지 않는다.
5. `PROD-813`에서 Local·Remote pair와 direct/list/search/interaction 및 cross-slice E2E, canonical·Linear·OpenSpec 정합성, 플랫폼별 실제 evidence를 확인한다.
   모든 declared task와 required validation 뒤에만 `add-profile-block`을 archive한다.
6. rollback은 repository의 기존 workflow로 새 relation을 읽지 않게 처리하며, 저장된 Profile Block row를 임의 삭제하거나 차단 전 관계를 복구하지 않는다. `PROD-327`,
   `PROD-818`, `PROD-328`은 각각 독립된 후속 rollout/rollback 경계를 가진다.
