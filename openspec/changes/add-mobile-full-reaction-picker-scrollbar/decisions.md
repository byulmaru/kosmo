## Session Context

`proposal.md`의 PROD-1163 작업 메모다. 사용자 결정을 새 승인으로 대체하지 않는다.

## Choice Notes

### 세 모바일 환경에서 일시 표시와 직접 드래그 제공

- Date: 2026-10-20
- Authority / Provenance: 현재 대화의 사용자 답변, 반영 후 다시 읽은 [PROD-1163](https://linear.app/byulmaru/issue/PROD-1163), `docs/design/reactions.md`, `docs/design/accessibility.md`.
- Decision Date: 2026-10-20
- Decision Class: current_user_agreement
- Status: settled_upstream
- Choice: 모바일 Web·iOS·Android 모두에서 스크롤 중에만 위치를 표시하되 표시된 바를 드래그해 빠르게 이동한다. 잡고 있는 동안에는 바를 유지한다.
- Reason: 현재 위치를 확인하며 긴 목록을 빠르게 탐색하려는 사용자 선택이다.
- Alternatives: 앱만 적용, Web만 적용, 표시 전용 바, 항상 보이는 바는 선택하지 않았다.
- Consequences: 일반 스크롤·바 드래그·검색 결과와 viewport 변경을 같은 목록 위치에 맞춘다. Desktop Web·PROD-1175·PROD-1174는 별도 범위다.

### 구현 수단은 실제 플랫폼 동작을 보고 선택

- Date: 2026-10-20
- Upstream context: `memory/frontend/ui-composition.md`, `memory/coding/tests.md`.
- Choice: 기존 목록과 플랫폼 기능을 먼저 사용하며 필요한 경우 Picker 안에서만 보완한다.
- Reason: 표시기 설정 하나가 직접 드래그를 보장하는지 아직 확인하지 않았다.
- Alternatives: 별도 라이브러리 도입과 전역 스크롤 추상화는 현재 근거가 없다.
- Consequences: 이 선택은 권장 접근이며 다음 구현 세션에서 더 작은 방법으로 바꿀 수 있다.

## Unresolved Questions

- 미정인 제품 결정은 없다. 제보 환경과 플랫폼별 실제 동작은 미확인 사실로 남긴다.
