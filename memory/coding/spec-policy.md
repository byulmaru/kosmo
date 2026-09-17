# Coding Style: Spec And Policy Sync

## Spec And Policy Sync

- 구현과 공개 schema·payload·error·connection·UI 수치는 canonical·Linear가 정한 비즈니스 결과와 서로 맞아야
  한다. OpenSpec session harness가 있으면 현재 구현·검증을 설명하도록 맞추되, 거기에만 있는 필드·scenario·
  수치를 추가 계약으로 취급하지 않는다.
- 코드가 하네스와 다르면 먼저 canonical·Linear와 실제 runtime 동작을 source of truth로 대조한다. 하네스만을
  만족시키기 위해 구현을 넓히지 말고, 필요한 경우 하네스를 줄이거나 고친다.
- 검증 문서와 테스트는 승인된 계약을 증명하는 artifact이며, 승인되지 않은 사용자 행동이나 Requirement를 새로 만들지 않는다. 기술 구현·cache 전략을 `docs/design`에 적어 제품·정책의 영구 MUST로 승격하지 않는다.
- 계약을 바꿀 때는 canonical·Linear의 비즈니스 결과를 먼저 갱신하고 같은 PR에서 구현·테스트를 정렬한다.
  OpenSpec이 사용 중이면 세션 메모도 함께 줄이거나 고치되, `openspec validate --all --strict`의 통과를 의미
  합의나 권위의 증거로 보지 않는다.
- 현재 범위에서 의도적으로 미룬 제품 정책은 canonical 문서나 Linear의 pending/follow-up 범위로 검색 가능하게
  남긴다. 단순한 구현 task를 OpenSpec의 남은 결정으로 영구 보관하지 않는다.
- OpenSpec session-harness 메모에 날짜나 provenance를 남길 수는 있지만 그것만으로 상위 계약을 덮거나 다음
  세션에 자동 상속하지 않는다. 지속되어야 할 비즈니스 보장·요구사항만 canonical·Linear에 기록하고,
  implementation choice는 코드와 PR의 맥락으로 남긴다.
- 장기적으로 유지될 규칙은 task-specific skill보다 `memory/`에 남긴다.
