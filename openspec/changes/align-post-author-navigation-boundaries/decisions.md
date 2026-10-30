## Session Context

PROD-1176의 기존 사용자 결정을 다음 구현 세션에서 적용하기 위한 메모다. 이 파일은 ADR이나 새 승인 기록이 아니다.

## Choice Notes

### 확정된 프로필 경계와 기존 목적지를 적용한다

- Date: 2026-10-22
- Upstream context: PROD-1176 본문의 2026-10-20 사용자 결정, `docs/domain/objects/post.md`, accepted ADR 0027.
- Choice: 작성자 위쪽은 프로필로, 이름·핸들 중 더 넓게 표시된 경계 오른쪽은 해당 Post 상세로 이동한다.
- Reason: 사용자가 누른 위치의 기대와 실제 목적지를 맞추기 위한 확정된 결과다.
- Alternatives: 기존의 넓은 프로필 링크를 유지하거나, 모든 여백을 상세로 보내는 안은 확정된 결과와 맞지 않는다.
- Consequences: 일반 Post·Quote·순수 Repost 각각에서 표시 작성자와 기존 Post identity를 함께 확인한다.

### 하나의 구현 범위를 OpenSpec과 handoff로 인계한다

- Date: 2026-10-22
- Upstream context: 현재 Spec Workflow 요청, `memory/issue-openspec-workflow.md`, PROD-1176과 관련 이슈의 범위.
- Choice: 새 입력 동작을 OpenSpec에 정리하고 구현은 다음 세션에서 진행한다. 실제 화면·플랫폼 검증 계획을 함께 인계한다.
- Reason: 기존 동작 복구만으로 분류할 수 없는 경계 변경이며, 일반 행과 Quote 작성자 조합을 함께 검증해야 한다.
- Alternatives: handoff-only 분기는 이번 동작 변경에 해당하지 않는다. 별도 구현 slice나 새 Linear 이슈를 만들 이유는 없다.
- Consequences: PROD-1075·1165의 기존 동작은 회귀로 보존하고 PROD-1167·1168의 독립 범위를 확장하지 않는다.

## Unresolved Questions

- 없음. 구현 수단은 non-binding working note이며 새 제품 결정을 대신하지 않는다.
