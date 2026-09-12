## Context

PROD-785의 공용 Profile/Follow 기반 위에서 기존 `PostReactionSummary → ReactionProfilesModal → ReactionProfileConnection → ReactionProfileList` 흐름을 이관한다. 현재 요약과 pill 필터는 가로 스크롤이며, Profile 행은 bio를 항상 전달한다. 조회 API와 actor별 Relay Environment는 이미 존재한다.

## Goals / Non-Goals

**Goals:** 승인된 한 줄 요약, 전용 화면, URL/Back, 공용 Profile 행, inline 오류와 캐시·페이지네이션 회귀 검증.

**Non-Goals:** Full Picker·새 Type·API·저장 모델·정렬 정책·Compact Viewer의 새 진입점·PROD-218 전체 Bio 이관·범용 navigation 또는 측정 프레임워크.

## Implementation Guidance

### Current Constraints

- 직접 진입은 모달을 열었던 부모의 counts를 전달받지 못하므로 route가 Post와 counts를 확보해야 한다. 유효한 선택 Type이 정해진 뒤 기존 목록 query를 연결한다.
- 기존 pagination은 `filters: [type]`, 20개 단위이며 오류여도 기존 edge를 유지한다. actor 격리는 상위 Environment 교체가 소유한다.
- pill TabList는 항상 가로 ScrollView다. 필요한 layout 지원만 확장하고 role·키보드 선택 동작은 재사용한다.
- Viewer provider는 pathname을 감시하지 않으며 내부 close 또는 unmount로 정리된다. 링크 이동에서 close와 목적지 focus가 충돌하지 않도록 실제 경계를 연결한다.
- Web은 document scroll, Native는 PaginationScrollView가 목록 scroll을 소유한다. 공용 shell의 route header 중복 억제도 연결해야 한다.

### Recommended Approach

먼저 요약의 실제 token/control 폭을 native onLayout으로 측정하고 표시할 prefix를 계산한다. 필터·Bio 표시·프로필 행과 실제 Production 컴포넌트의 스토리를 정렬한다. 다음으로 route adapter에서 URL·Post query·Back을 소유하고 표시 컴포넌트에 fragment ref와 callback을 전달한다. 목록 조회에는 기존 RouteBoundary와 store-and-network, pagination fragment를 재사용한다. 마지막으로 공용 PostReactionSummary와 Viewer의 기존 진입·종료 경계를 연결한다.

### Allowed Alternatives

좁은 feature 내부에서 측정 계산을 두거나 직접 동작 테스트가 필요한 순수 함수로 분리할 수 있다. 기존 pagination wrapper를 사용하는 위치는 달라도 Web/Native의 단일 scroll 소유권과 필터 focus를 보존해야 한다.

### Known Traps

- `+N`을 숨겨진 count 합으로 계산하거나 측정용 token을 접근성 tree에 중복 노출하는 것.
- Type query 변경을 매번 push해 Back이 필터 이력만 순회하게 하거나 이전 Type의 목록을 보여 주는 것.
- 필터까지 query error boundary 안에서 사라지게 하거나 row마다 별도 identity/Follow lifecycle을 만드는 것.
- Viewer close의 기존 trigger focus 복귀가 새 route 제목의 focus를 빼앗는 것.
- 6종 초과 테스트 데이터를 현재 서버 지원 Type 또는 Production Playground 상태로 제시하는 것.

## Risks / Trade-offs

- 실제 글꼴·count 폭 변화 → onLayout 재측정과 좁은 consumer 폭의 브라우저 검증.
- query가 없는 직접 진입의 counts/목록 순차 조회 → 최초 Type을 추측하지 않고 기존 cache를 재사용한다.
- 플랫폼별 focus·scroll → 자동 검증과 Web·iOS·Android 실행 결과를 분리 기록한다.

## Migration Plan

PROD-785 위에서 UI·스토리, route·조회, 진입점·Viewer, 검증을 순서대로 연결하고 마지막 consumer 이관 후 모달을 제거한다. API·데이터 migration은 없다. rollback은 이 PR의 route/진입점 변경을 함께 되돌리는 방식이다. PROD-938이 통합 검증과 change 정합성·archive를 소유하며, 구현 승인에 push·PR·archive 승인을 포함하지 않는다.

## Open Questions

제품 결정 미결정 없음. URL query와 기존 Viewer 진입점 범위는 2026-09-12 승인된 계획을 적용한다. Native runtime 증거는 실제 실행 가능 여부와 결과를 검증 기록에 남긴다.
