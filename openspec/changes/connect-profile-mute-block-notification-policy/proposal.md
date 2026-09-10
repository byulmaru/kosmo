## Why

현재 Follow, Follow Request, Reply, Reaction, Repost의 Notification 생성 경로에는 실제 Profile Mute·Profile Block 판정이 연결되어 있지 않다. Recipient가 Mute하거나 Block 관계인 상대의 행동에서도 새 알림이 저장될 수 있으므로, 기존 capability를 공통 생성 정책에 연결한다.

## What Changes

- 다섯 source가 저장 전에 같은 Notification 정책 경계에서 Recipient Profile과 Related Profile을 판정한다.
- Recipient가 Related Profile을 영구 Mute했거나 어느 방향으로든 Profile Block이 존재하면 새 Notification을 억제한다. 콘텐츠 직접 조회가 허용되는 방향에도 Notification의 양방향 Block 정책을 독립 적용한다.
- 정책 deny는 생성하지 않는 정상 결과이며, 평가 실패도 생성하지 않는다. 평가 오류의 관찰과 기존 retry를 유지하고 이미 commit된 source action을 되돌리지 않는다.
- Profile별 정책 격리, 해제 뒤 새 행동, duplicate·retry, 기존 Notification·Read State 보존을 source별로 검증한다.
- 기간 Mute, Domain Block, 기존 unavailable cleanup, UI, Push, 새 Quote·Mention source와 source lifecycle retry 변경은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`의 Type별 생성 관계·조회 정책, `docs/domain/objects/profile-mute.md`의 상태·관계·조회 정책·제외/보류, `docs/domain/objects/profile-block.md`의 조회 정책.
- Architecture: `docs/architecture/core-services.md`, `memory/coding-style.md`, `memory/temporal-workflows.md`.
- Design scope: `docs/design/notifications.md`, `docs/design/profile-mute-block.md`는 표시·상호작용의 소유 문서다. 이번 change는 UI 계약을 변경하지 않는다.
- Linear Contract / Implementation: [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 전달 결과·포함/제외 범위·완료 조건과 `Domain / Issue Gate 승인 — 2026-09-10`. 이 작업의 사용자 메시지 `정정안 승인, OpenSpec 작성`으로 upstream 정정과 OpenSpec 작성 전환을 승인받았다.
- Upstream: [PROD-273](https://linear.app/byulmaru/issue/PROD-273)·[PROD-276](https://linear.app/byulmaru/issue/PROD-276)의 기존 source 계약, [PROD-813](https://linear.app/byulmaru/issue/PROD-813)·[PROD-814](https://linear.app/byulmaru/issue/PROD-814)의 capability와 [PROD-822](https://linear.app/byulmaru/issue/PROD-822)의 최신 Block 정책을 소비한다. source 생성 연결과 이 change 전체의 구현·통합 검증·동기화·archive는 PROD-327이 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: 기존 capability에 다섯 source의 공통 영구 Mute·양방향 Block 생성 정책과 failure isolation 회귀 계약을 추가한다.

## Impact

- Core Notification 생성 service, 공통 capability 조회 경계, 기존 Worker Notification Activity와 관련 Core/API/Worker 통합 검증이 영향 대상이다.
- 기존 source commit, Notification 고유성, 읽음 처리, 공개 GraphQL shape와 UI 흐름을 유지한다. 새 테이블·migration·의존성은 필요하지 않다.
- OpenSpec은 먼저 작성하되 구현 착수는 PROD-813·814 완료와 실제 capability 반영을 재확인한 뒤 진행한다. 작성 시 PROD-813은 Done, PROD-814·822는 In Review이며 문서 계약과 main runtime의 반영 상태는 다를 수 있다.
- Quote·Mention 규범은 최신 canonical에 있지만 현재 main의 생성 source는 다섯 종류다. 구현 시 새 source가 이미 제공되면 Linear 범위를 먼저 정렬하고 공통 정책을 적용한다.
- 이 change는 PROD-271의 첫 전달이나 PROD-817의 Domain Block 연동과 별도 lifecycle이다. 전체 tasks·통합 검증·delta 동기화·strict validation 완료 뒤 PROD-327의 완료 증거를 소유한 구현 PR이 archive한다.
