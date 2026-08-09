## Context

이 결정 로그는 지정 Notification ID 일괄 Read 계약, 기존 mutation의 breaking 교체, Web `모두 읽음`의 loaded-ID 범위와 기존 visibility·Relay 경계를 보존하는 구현 지침을 반영한다. 제품 행동은 현재 canonical 문서와 최신 PROD-703·PROD-679 계약에서 파생하며, OpenSpec artifact 자체를 상위 권위로 사용하지 않는다.

## Decision Records

### 기존 Notification Read mutation을 배열 계약으로 교체한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-703`
- Status: Active
- Context / Problem: 단건 `markNotificationRead(input: { id })`만으로는 클라이언트가 확인한 여러 Notification을 한 요청에 지정할 수 없고, 별도 전체 Read mutation은 서버가 입력 밖의 unread를 선택하는 병렬 계약을 만든다.
- Decision Outcome: 기존 field 이름 `markNotificationRead`를 유지하면서 input을 `ids: [ID!]!`, payload를 `notifications`와 중복 없는 `recipientProfiles` 배열로 교체한다. scalar input이나 별도 mutation compatibility path는 유지하지 않는다.
- Alternatives Considered: 별도 `markNotificationsRead` 추가는 두 계약과 테스트 surface를 남기므로 제외했다. 같은 field에서 `id`와 `ids`를 동시에 허용하는 방식은 우선순위·검증 규칙을 불필요하게 만든다.
- Consequences: repository의 기존 단건 consumer, schema, Relay artifact, fixture와 테스트를 같은 slice에서 `{ ids: [id] }`와 배열 payload로 정렬해야 한다. 독립 배포된 legacy consumer가 확인되면 schema rollout을 중단해야 한다.
- Confirmation / Follow-up: PROD-703 API·기존 consumer 검증과 배포 전 consumer inventory로 확인한다.

### 처리할 수 없는 ID를 제외하고 입력 밖의 Notification을 보존한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-703`
- Status: Active
- Context / Problem: 요청 생성과 처리 사이에 Notification이 삭제되거나 hidden이 될 수 있으며, 한 invalid ID 때문에 전체 visible 입력을 실패시키면 일괄 동작이 불안정해진다. 반대로 서버가 입력을 전체 unread로 확장하면 사용자가 확인하지 않은 알림을 Read 처리한다.
- Decision Outcome: 현재 Account가 접근할 수 있는 visible Notification ID만 중복 없이 처리한다. missing·다른 Node type·membership 없음·hidden ID는 이유를 노출하지 않고 제외한다. 빈 입력과 모든 ID가 제외된 입력은 빈 배열을 반환하는 성공한 no-op이며, 이미 Read인 visible 입력은 최초 `readAt`을 보존한 멱등적 결과에 포함한다.
- Alternatives Considered: invalid ID 하나에 전체 `NOT_FOUND`를 반환하는 방식은 자연스러운 stale 입력을 실패시킨다. valid subset만 처리하면서 제외 이유를 반환하는 방식은 existence와 권한 정보를 노출한다. 서버 전체 unread 자동 선택은 입력 경계를 위반한다.
- Consequences: payload는 input과 같은 길이나 순서를 보장하지 않으며, client는 반환 Node와 Profile만 정규화해야 한다. database 처리 실패는 일부 write를 남기지 않아야 한다.
- Confirmation / Follow-up: mixed valid/excluded, empty, duplicate, already Read, concurrent와 database failure API 통합 검증으로 확인한다.

### Web 모두 읽음은 현재 로드된 unread ID만 보낸다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/domain/objects/notification.md`, `PROD-679`, `PROD-703`
- Status: Active
- Context / Problem: Web의 `모두 읽음`이 서버 전체 unread 집합을 처리하면 아직 로드하지 않았거나 클릭 뒤 새로 도착한 Notification까지 Read될 수 있다. 반대로 current connection만 처리하면 서버 count가 0이 아닐 수 있다.
- Decision Outcome: `모두 읽음` 문구를 유지하고, 클릭 시 current Relay connection에 로드된 `readAt = null` ID snapshot만 mutation 한 번에 전달한다. 추가 page를 선행 fetch하지 않으며 성공 뒤 badge는 `recipientProfiles.unreadNotificationCount`로 수렴한다.
- Alternatives Considered: 서버 전체 visible unread 처리와 추가 pagination 후 전체 ID 수집은 사용자가 아직 확인하지 않은 item까지 범위를 넓힌다. `표시된 알림 모두 읽음`으로 copy를 바꾸는 안은 현재 승인된 UI 문구가 아니므로 채택하지 않았다.
- Consequences: loaded unread가 모두 처리되면 action은 disabled지만 아직 처리하지 않은 unread가 있어 badge는 남을 수 있다. 이 상태를 오류로 보거나 count를 0으로 덮어쓰면 안 된다.
- Confirmation / Follow-up: Storybook 상태와 Web E2E에서 loaded item 처리, 입력 밖 item 보존과 non-zero 서버 count 수렴을 확인한다.

### concrete Notification type과 공통 visibility 경계를 함께 적용한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-703`
- Status: Active
- Context / Problem: 배열 입력을 UUID-only 조건으로 단순화하면 global ID typename과 저장 kind 불일치가 처리될 수 있고, 별도 recipient filter는 목록·count·Node와 Read visibility를 분기시킬 수 있다.
- Decision Outcome: 입력 global ID를 concrete Notification typename과 kind pair로 제한하고 기존 목록·count·Node가 사용하는 membership·source visibility 경계를 재사용한다. row를 갱신할 때 최초 `readAt`을 보존하고 명시적 pessimistic lock은 추가하지 않는다.
- Alternatives Considered: UUID-only match와 새 resolver 전용 visibility 조건은 보안·count 정합성 위험 때문에 제외했다. 명시적 row/advisory lock은 정상 DML과 멱등적 update로 충분한 social interaction에 불필요하다.
- Consequences: batch predicate 또는 transaction-scoped kind별 update가 kind pair를 보존해야 한다. Concrete payload field는 기존 kind별 source loader를 사용하며 batch resolver에 Follow Request 전용 snapshot 경계를 추가하지 않는다.
- Confirmation / Follow-up: wrong typename, unavailable source, membership 없음, 동시 호출과 정상 Follow Request payload hydration 통합 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
