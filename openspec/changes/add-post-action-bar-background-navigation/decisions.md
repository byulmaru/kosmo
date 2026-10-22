이 문서는 현재 맥락의 선택 이유를 남기는 세션 메모다. ADR이나 승인 문서를 대신하지 않는다.

## Session Context

[proposal.md](proposal.md)의 PROD-1168 범위를 main `bfa5a9781cf94570eb9f2c76c21a4804d4bfb4ae`에서 조사했다.

## Choice Notes

### 기존 상세 대상과 액션 대상 유지

- Date: 2026-10-22
- Upstream context: [PROD-1168](https://linear.app/byulmaru/issue/PROD-1168), `docs/design/post-action-bar.md`, `docs/design/post-thread.md`.
- Choice: 각 행의 기존 상세 이동 대상을 사용하고 액션별 fragment·Reply binding은 유지한다.
- Reason: 순수 Repost의 바깥 Reply와 direct Source 소셜 액션은 대상이 서로 다르다. 타래의 현재 Post ID로 모든 행을 바꾸면 기존 의미가 깨진다.
- Alternatives: 전체 행을 현재 Post ID 또는 social action target 하나로 통일하는 방식은 채택하지 않는다.
- Consequences: 일반 Post·Quote·순수 Repost와 조상·현재·하위 행의 목적지를 따로 검증한다.

### 비버튼 host에서 기존 배경 입력 재사용

- Date: 2026-10-22
- Upstream context: PROD-1168의 비버튼 여백·버튼 독립 입력·스크롤 취소 조건과 기존 sibling 배치.
- Choice: 기존 PostDetailBackground와 행 callback을 여백 host에 연결하는 방향을 working approach로 둔다. 구체적인 prop 전달·조합 방식은 구현 중 줄이거나 바꿀 수 있다.
- Reason: 기존의 직접 target 판별을 유지하면서 wrapper·toolbar·trailing group·slot의 빈 부분을 빠짐없이 다룰 수 있다.
- Alternatives: 전체 toolbar Link, 전역 responder의 자식 허용, 버튼 좌표를 복제한 overlay는 우선 사용하지 않는다.
- Consequences: disabled/pending target도 빈 배경과 구분하고 실제 좌표·Native responder 회귀로 확인한다.

## Unresolved Questions

- 없음. Linear와 기존 문서에서 확정된 범위를 재승인받지 않는다.
