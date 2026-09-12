## Context

PROD-938과 현재 Reaction 도메인·디자인을 직접 대조하고 2026-09-12 사용자 승인 계획을 적용했다.

## Decision Records

### 전용 route와 URL 선택 복원

- Decision Date: 2026-09-12
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/reactions.md`의 Reaction People route, PROD-938의 URL·Back·선택 Type 확정 범위와 2026-09-12 사용자 승인.
- Status: Active
- Context / Problem: 모달은 공유·직접 진입과 독립 화면 Back을 제공하지 못한다.
- Decision Outcome: 기존 Post 경로 아래 `/reactions`를 두고 `type` query로 선택을 복원한다. 진입은 push, 필터는 현재 history 갱신, 직접 진입 Back은 canonical Post 상세를 사용한다.
- Alternatives Considered: 화면 내부 선택만 보존하면 새로고침·공유 링크에서 복원되지 않는다. 필터마다 push하면 Back이 필터 이력을 순회한다.
- Consequences: 유효하지 않은 Type을 서버 첫 양수 Type으로 정규화하며 프로필 방문 복귀·scroll·focus를 기존 router lifecycle에 연결한다.
- Confirmation / Follow-up: 직접 진입·필터·프로필 방문·Back E2E.

### 공용 UI와 기존 Reaction lifecycle 재사용

- Decision Date: 2026-09-12
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, `docs/design/reactions.md`, PROD-938.
- Status: Active
- Context / Problem: presentation 이관 중 toggle·조회 권한·Follow·actor 캐시를 바꾸면 기존 행동이 달라진다.
- Decision Outcome: 한 줄 요약·필터·Bio 없는 Profile 행을 공용 컴포넌트로 조립하고 기존 controller·FollowButton·Relay connection과 actor Environment를 재사용한다.
- Alternatives Considered: 별도 Reaction 전용 Profile 행·수동 edge 누적은 기존 소유권과 중복된다.
- Consequences: API·저장 Type·count 순서·권한은 유지하며 실패와 재시도는 기존 경계에 남는다.
- Confirmation / Follow-up: token target, 최초·추가 오류, 재시도, actor 전환과 cache 재방문 테스트.

### 기존 Viewer 진입점과 지원 Type 검증 경계

- Decision Date: 2026-09-12
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/reactions.md`의 PROD-938 범위, `docs/domain/objects/reaction.md`의 허용 Type, PROD-938의 Viewer 정렬 범위와 2026-09-12 사용자 승인.
- Status: Active
- Context / Problem: Compact에는 기존 요약이 없고 현재 정상 서버 데이터는 여섯 Type이다.
- Decision Outcome: 현재 노출된 목록·상세·답글 알림·Wide Viewer를 이관하고 Wide 이동 시 Viewer 정리를 검증한다. 필터의 6종 초과 계약은 독립 UI Tests로 검증한다.
- Alternatives Considered: Compact 새 노출과 API Type 확장은 현재 이관 범위를 넓힌다.
- Consequences: Production Playground·서버 E2E는 실제 여섯 Type만 사용한다. Compact 새 진입점은 PROD-849와 정렬한다.
- Confirmation / Follow-up: Wide 이동·focus 검증과 UI/서버/Native 증거 구분.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음. 기존 active spec의 모달·가로 스크롤 행동은 이번 delta가 완료될 때 동기화한다.
