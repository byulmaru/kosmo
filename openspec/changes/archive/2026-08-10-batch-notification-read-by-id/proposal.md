## Why

현재 `markNotificationRead`는 Notification 하나만 처리하고, Web의 후속 `모두 읽음` 동작은 서버가 요청 시점의 전체 unread 집합을 임의로 선택하면 사용자가 아직 확인하지 않은 새 알림까지 Read 처리할 수 있다. 클라이언트가 확인한 ID만 한 요청으로 전달하고 서버가 같은 visibility·count 계약으로 처리하도록 기존 Read 경계를 확장해야 한다.

## What Changes

- **BREAKING** `markNotificationRead` 입력을 단일 `id`에서 `ids: [ID!]!`로 교체한다.
- **BREAKING** 성공 payload의 `notification`과 `recipientProfile`을 각각 `notifications`와 중복 없는 `recipientProfiles` 배열로 교체한다.
- 입력한 ID 중 현재 Account가 접근할 수 있는 visible Notification만 멱등적으로 Read 처리하고, missing·다른 Node type·권한 없음·hidden ID는 조용히 제외한다.
- 빈 입력, 모든 ID가 제외된 입력과 중복 입력을 성공한 no-op 또는 멱등적 결과로 처리하며, 입력하지 않은 Notification은 변경하지 않는다.
- 기존 제품의 단건 활성화 흐름은 같은 mutation에 `{ ids: [id] }`를 전달하도록 갱신한다.
- Web `모두 읽음`은 클릭 시점에 현재 Relay connection에 로드된 unread ID만 한 번에 전달하고, 반환된 Notification과 Profile count로 목록·전역 인디케이터를 수렴시킨다.
- 처리하지 않은 unread Notification이 남으면 Web 전역 인디케이터는 0이 아닐 수 있으며, 추가 page를 선행 fetch하거나 서버 전체 집합으로 입력을 확장하지 않는다.
- Web 일괄 Read가 실패하면 기존 Unread 상태를 유지하고 앱의 기존 toast로 실패와 `다시 시도` action을 알리며, 재시도 시점의 loaded unread ID를 새로 수집한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`, `docs/design/page-header.md`, `docs/design/colors.md`, `docs/design/breakpoints.md`
- Linear Contract: `PROD-703`, `PROD-679`
- Linear Implementations: `PROD-703` — API·기존 단건 소비자 호환·API 통합 검증; `PROD-679` — Web 컨트롤·Relay 수렴·Storybook·Web E2E·최종 통합·정합성 확인·archive

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: 지정 ID 일괄 Read API, 기존 단건 소비자 호환, 현재 로드된 unread ID만 처리하는 Web `모두 읽음`과 서버 count 수렴 계약을 추가한다.

## Impact

- API: `apps/api/src/graphql/resolvers/notification/mutation/mark-read.ts`, `apps/api/schema.graphql`
- API 검증: `apps/api/tests/integration/graphql/notification.test.ts`, 기존 Notification Read를 직접 호출하는 인접 API 테스트
- App/Relay: `apps/app/src/components/notification/NotificationListItem.tsx`, 생성 Relay artifact, 관련 단위 테스트와 Storybook fixture
- Web: `/notifications` header action, Relay connection 기반 ID 수집, Web E2E
- 문서: canonical Notification 계약과 `notification` OpenSpec capability
- DB schema, migration, 새 dependency와 Fedify 동작에는 영향이 없다.
