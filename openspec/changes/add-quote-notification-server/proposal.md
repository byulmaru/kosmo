## Why

PROD-903은 Local·Remote Quote 알림의 생성·중복·조회·정리 정책을 확정했다. 현재 서버에는 Quote Type과 승인 후 최초 판단이 연결되어 있지 않다. PROD-926은 이를 Notification API까지 구현하고 검증할 계약을 마련한다.

## What Changes

- 승인된 Quote의 direct Source Author에게 Quote Notification을 제공한다. Profile 단위 자기 인용 억제, Profile Mute·Block과 Quote·Source 조회 권한을 적용한다.
- 최초 판단을 Notification 물리 삭제와 독립적으로 보존한다. 같은 Post·Recipient의 Reply → Quote → Mention 선택과 선생성 알림·읽음 상태 보존을 연결한다.
- `QuoteNotification`을 기존 GraphQL connection·Node·unread·지정 읽음 API에 추가하고, 모든 표면에 동일한 가용성 판정을 적용한다.
- 승인 철회·삭제·조회 제한은 즉시 숨김과 기존 Best Effort cleanup으로 처리한다.
- 비소급 도입 경계, 동시 처리, migration·rollback 및 실제 upstream 결과를 사용하는 서버 통합 검증을 구체화한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`의 관계·지정 읽음·Quote Notification·조회 정책, `docs/domain/decisions/0028-quote-notification-policy.md`의 결정.
- Canonical: `docs/domain/objects/post.md`의 인용 승인·조회 정책, `docs/domain/objects/profile-mute.md`, `docs/domain/objects/profile-block.md`. `docs/design/notifications.md`는 읽음 동작과 클라이언트 소비 경계만 참조한다.
- Linear Contract: [PROD-903](https://linear.app/byulmaru/issue/PROD-903) Done 및 [PROD-926](https://linear.app/byulmaru/issue/PROD-926)의 2026-09-16 수정된 Issue Gate. 사용자는 같은 날짜에 Issue Gate와 서버 OpenSpec 작성·strict validation을 명시적으로 승인했다. Spec Gate·구현 착수 승인은 아직 없다.
- Linear Implementations: PROD-926/정혜주가 이 change의 전체 서버 구현·검증·sync·archive를 소유한다.
- 결과 제공 계약: [PROD-431](https://linear.app/byulmaru/issue/PROD-431), [PROD-792](https://linear.app/byulmaru/issue/PROD-792), [PROD-924](https://linear.app/byulmaru/issue/PROD-924)의 작성·승인 lifecycle, [PROD-911](https://linear.app/byulmaru/issue/PROD-911)의 inbound Mention, [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 공통 Profile Mute·Block, [PROD-328](https://linear.app/byulmaru/issue/PROD-328)의 cleanup. 이들의 기존 change 소유권은 이전하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: Quote 서버 lifecycle과 Reply·Quote·Mention 교차 Type 단일 결과, Quote GraphQL·읽음·cleanup 계약을 추가한다. 기존 UI requirements는 변경하지 않는다.

## Impact

- `packages/core`의 Notification enum·DB·생성 정책·visibility, 승인 결과 이후 effect 연결, `apps/worker`의 Notification Activity·cleanup, `apps/api`의 concrete object·Node·SDL·목록·읽음에 영향을 준다.
- 기존 enum·열·unique key를 제거하거나 재해석하지 않는 additive storage를 기본으로 한다. 새 Type 활성화 전 모든 관련 reader/writer의 호환을 검증한다. 구버전 바이너리로의 무조건 rollback을 보장하지 않는다.
- upstream은 OpenSpec 작성·착수 blocker가 아니다. 실제 결과가 필요한 최종 서버 통합 검증 dependency이며, 결과가 준비되지 않은 상태를 fixture·가정으로 완료 처리하지 않는다.

## Scope and ownership

- Word Mute·Hashtag Mute·Post Notification Mute의 기반 구현과 Quote 연결은 현재 delivery·검증·완료 조건에서 제외한다. 장기 canonical/PROD-903 정책은 유지하며 후속 담당자·이슈·일정 확정을 기다리지 않는다. 새 이슈를 만들지 않는다.
- [PROD-953](https://linear.app/byulmaru/issue/PROD-953)은 표시 계약·알림함 UI·Quote 상세 이동·클라이언트 통합 및 별도 OpenSpec·완료·archive를 소유한다. PROD-926은 PROD-953 완료를 기다리지 않는다.
- Local Mention 신규 생성, FCM·Push, Local Reply+Quote 동시 작성 UI/API, 승인 프로토콜 자체와 전체 Notification grouping 재설계는 제외한다.
- 이번 산출물은 서버 Spec Gate 검토용이다. 구현·커밋·push·PR 생성·archive는 수행하지 않는다.
