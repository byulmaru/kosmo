## Session Context

PROD-1075의 기존 상세 진입 계약을 복구하기 위한 세션 메모다. 다음 선택은 영구 ADR이나 승인 기록이 아니다.

## Choice Notes

### 상세 진입 영역과 CW 공개를 분리한다

- Decision Date: 2026-10-10
- Authority / Provenance: PROD-1075 범위·완료 기준, `docs/design/figma.md`의 PROD-989 CW 공유 상태 계약.
- Decision Class: Existing contract restoration
- Status: Settled upstream
- Choice: 카드 여백을 통한 이동은 기존 canonical 상세 대상을 사용하며 CW store를 변경하지 않는다.
- Reason: CW를 먼저 펼치지 않아도 진입할 수 있어야 하며 숨긴 내용은 공개하지 않아야 한다.
- Alternatives: navigation 시 CW 자동 공개는 상위 계약과 맞지 않는다.
- Consequences: 접힘·펼침·상세·Back과 Quote/Source의 독립 상태를 검증한다.

### 카드 조합 경계에서 여백 입력을 보완한다

- Decision Date: 2026-10-10
- Authority / Provenance: PROD-1075 독립 액션·중복 이동 완료 기준, `docs/design/post-action-bar.md`의 sibling·Source navigation 계약, 현재 `PostListItem.tsx`.
- Decision Class: Session implementation note
- Status: Suggested approach
- Choice: root `View`와 action sibling을 보존하고 별도의 여백 입력 영역을 둔다. 배경 sibling `Pressable`을 우선 검토하며 실제 hit testing 결과에 따라 여백을 분할할 수 있다.
- Reason: 전체 navigation wrapper로 인해 자식 action·Source preview·접근성 경계가 바뀔 위험을 줄인다.
- Alternatives: root 전체 wrapper와 본문 `hitSlop`만 확대하는 방식은 design의 제약과 맞지 않는다.
- Consequences: 새 API·전역 registry·ref coordination 없이 기존 조합 경계를 우선 사용한다. 이 기술 선택은 구현자가 바꿀 수 있다.

### 간헐적 본문 누락은 별도 증거로 판단한다

- Decision Date: 2026-10-10
- Authority / Provenance: PROD-1075의 코드 원인과 runtime 미확인 구분, Estimate 불확실성.
- Decision Class: Existing scope boundary
- Status: Settled upstream
- Choice: 여백과 CW 구조 문제를 먼저 복구하고 정상 본문 탭의 누락은 실제 iOS에서 따로 관찰한다.
- Reason: 현재 코드는 여백 문제를 설명하지만 정상 본문 입력의 간헐적 누락까지 증명하지 않는다.
- Alternatives: 추정으로 임계값·debounce·gesture capture를 도입하지 않는다.
- Consequences: 남는 누락의 재현 조건과 별도 원인·재산정 필요성을 기록한다. PROD-1016·PROD-1039 완료를 주장하지 않는다.

## Unresolved Questions

- 새로운 제품 선택은 없다. Native hit testing과 본문 누락은 기술적 검증이 남아 있다.
- 구현 승인: Pending. 현재 사용자 요청은 Spec phase이며 implementation approval reference를 만들지 않았다.
