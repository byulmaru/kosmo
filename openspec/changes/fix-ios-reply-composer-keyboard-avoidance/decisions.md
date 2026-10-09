## Session Context

PROD-1080의 기존 iOS 답글 작성 동작을 복구하기 위한 계획이다. 아래 선택은 이 세션의 조사 방향이며 새 제품 승인이나 ADR이 아니다.

## Choice Notes

### 회피 경계부터 조사한다

- Date: 2026-10-09
- Upstream context: PROD-1080의 문제·조사 근거·완료 기준, `docs/design/post-composer.md`의 공용 작성 UI와 Native keyboard 검증 계약.
- Choice: `ReplyComposerSurface`와 일반 작성기의 keyboard avoidance 차이를 먼저 측정하고 최소 변경을 선택한다.
- Reason: 공통 footer를 사용하지만 이를 감싸는 경계가 다르다는 코드 근거가 있다.
- Alternatives: 공용 shell 높이 제약 조정은 해당 경계의 문제가 관찰될 때 검토한다. 작성기 전체 재설계는 현재 범위가 아니다.
- Consequences: `height`와 top offset은 후보이지 확정된 해결책이 아니다. 실제 Native 결과로 선택을 바꿀 수 있다.

### 기존 범위와 검증 책임을 유지한다

- Date: 2026-10-09
- Upstream context: PROD-1080 완료 기준, `docs/domain/objects/post.md`, Accepted ADR 0014.
- Choice: Reply를 수정 대상으로, 일반·Quote를 회귀 대상으로 둔다. PROD-1032와 PROD-1033의 독립 문제를 합치지 않는다.
- Reason: 기존 작성·초안 계약을 유지하면서 키보드 가림을 해결하는 요청이다.
- Alternatives: 없음.
- Consequences: 컴포넌트 테스트 성공과 실제 iOS 검증을 별도로 기록한다. 새 정책이 없어 canonical·Linear 본문은 변경하지 않는다.

## Unresolved Questions

- 없음. Native 재현과 적용 prop의 선택은 기술적 조사 항목이며 사용자에게 제품 결정을 다시 요구하지 않는다.
