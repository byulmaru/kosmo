## Session Context

[proposal.md](./proposal.md)의 조사·구현 메모다. 상위 계약이나 ADR을 대신하지 않는다.

## Choice Notes

### 사진과 게시글의 목적지 분리

- Date: 2026-10-10
- Authority / Provenance: PROD-1078의 범위와 완료 기준; `docs/domain/objects/notification.md`.
- Decision Date: 2026-10-10
- Decision Class: Existing business requirement
- Status: Settled upstream
- Upstream context: 사진은 표시된 행위자의 프로필로, 나머지 게시글 영역은 기존 대상 게시글로 이동한다.
- Choice: 한 활성화에 이동과 Best Effort Read를 각각 한 번 시작한다.
- Reason: 사진을 눌렀을 때 게시글로 이동하는 제보를 해결하고 기존 읽음 동작을 보존한다.
- Alternatives: 전체 알림을 행위자 프로필로 보내는 방식은 게시글 이동 요구를 만족하지 못한다.
- Consequences: Reaction/Repost의 consumer 입력과 표시 이동 영역을 함께 정렬한다.

### Reaction/Repost 사진 겹침 제거

- Date: 2026-10-10
- Authority / Provenance: 이번 대화의 사용자 선택 `반응·재게시만 겹침 제거 (권장)`; PROD-1078 추가 디자인 결정;
  `docs/design/notifications.md`, `docs/design/accessibility.md`.
- Decision Date: 2026-10-10
- Decision Class: User-approved presentation
- Status: Settled upstream
- Upstream context: 서로 다른 사진의 입력 영역이 겹치지 않아야 한다.
- Choice: Reaction/Repost 사진은 28px·최대 3개를 유지하고 겹침만 제거한다. Follow 계열 배치는 유지한다.
- Reason: 각 사진을 독립적으로 선택하면서 기존 플랫폼별 입력 기준도 충족한다.
- Alternatives: 기존 겹침 유지 방향은 사용자에게 제시했으나 선택되지 않았다.
- Consequences: 좁은 화면과 Native의 실제 입력·보조 기술 경계를 검증한다.

### 기존 데이터와 공통 이동 경계 재사용

- Date: 2026-10-10
- Authority / Provenance: 조사 기준 `6681db72670757f53e130a599114a38a6217a55c`의 코드·GraphQL schema;
  `memory/frontend/route-platform.md`, `memory/frontend/relay-operation-env-cache.md`.
- Decision Date: 2026-10-10
- Decision Class: Suggested implementation
- Status: Working note
- Upstream context: 실제 목록 fragment와 공용 표시 컴포넌트를 연결해야 한다.
- Choice: 기존 `relativeHandle`, Expo Router 링크와 `useNotificationRead`를 재사용한다.
- Reason: 필요한 필드와 읽음 mutation이 이미 있으며 별도 API나 조회 lifecycle을 추가할 이유가 없다.
- Alternatives: 별도 profile query와 중첩 interactive target은 현재 범위에 불필요한 복잡성을 남긴다.
- Consequences: Relay compiler를 실행하고 generated artifact는 commit하지 않는다. 구현자는 이 메모를 수정할 수 있다.

## Unresolved Questions

- 제품·디자인 결정: 없음.
- 전체 계획 승인: pending. 사진 배치 선택을 전체 구현 계획 승인으로 해석하지 않는다.
