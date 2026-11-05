## Session Context

PROD-1287의 확인 알림을 위한 짧은 작업 메모다. 이 파일은 ADR이나 별도 승인 기록이 아니다.

## Choice Notes

### 파일 업로드와 보호 처리 대기 구분

- Date: 2026-11-04
- Upstream context: PROD-1287, `docs/domain/objects/media.md`, `PostComposer.tsx`와 `PostComposerMediaControls.tsx`의 게시 전 업로드 완료 조건.
- Choice: 이미지 파일 업로드가 끝나고 게시를 요청한 뒤 HOPE 보호 처리를 기다리는 기존 카드의 취소에 확인을 추가한다.
- Reason: 첨부 파일 업로드는 게시 전에 끝나고, 이번 문제는 게시 요청 후 보호 처리 대기에서 발생한다.
- Alternatives: HOPE 이외 업로드 대기라는 새 사용자 흐름이나 필터 식별용 API를 추가하지 않는다.
- Consequences: 기존 요청 카드의 취소 진입점에 집중하며, 공개 API·서버 상태·게시 처리 정책을 바꾸지 않는다.

### 기존 확인 UI 재사용

- Date: 2026-11-04
- Upstream context: `docs/design/accessibility.md`, `ModalSheet.tsx`, `ConfirmationContent.tsx`, `memory/frontend/ui-composition.md`.
- Choice: `ModalSheet`와 `ConfirmationContent`를 조합하는 구현 방향을 제안한다.
- Reason: 기존 modal의 닫기·focus·접근성 동작을 그대로 쓸 수 있다.
- Alternatives: 별도 플랫폼 alert나 새 확인 컴포넌트는 현재 요구에 필요하지 않다.
- Consequences: 이는 비권위 구현 제안이다. 구현 과정에서 같은 요구를 더 작게 만족하는 방법으로 바꿀 수 있다.

## Unresolved Questions

- 없음.
