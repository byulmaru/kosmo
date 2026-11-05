## Current Constraints

이 문서는 현재 코드에 맞춘 구현 제안이다. 제품 요구사항의 근거는 PROD-1287과 기존 canonical 문서다.

- `PostComposerMediaControls.tsx`는 업로드가 끝난 첨부를 `ready`로 두고, `PostComposer.tsx`는 모든 첨부가 `ready`가 될 때까지 게시 버튼을 비활성화한다. 이때 파일 업로드는 끝났으며, 게시 요청 뒤 HOPE 보호 처리를 기다리는 상태와 다르다.
- `PostRequestCard.tsx`의 `취소`는 `cancel`을 바로 호출한다. `cancel`은 기존 request ID로 `cancelPostRequest` mutation을 실행하고 오류가 나면 상태를 다시 조회한다.
- 같은 카드가 `QUEUED`·`PROCESSING`에서 취소 버튼을 표시한다. 기존 fragment·mutation·polling과 서버의 상태 판정은 재사용할 수 있다.
- `ModalSheet`의 `alertdialog` 경로와 `ConfirmationContent`가 이미 있다. `PostDeletionAction.tsx`는 조합 예시이며, 그 action의 ref·effect와 비동기 조정까지 복사하지 않는다.

## Practical Approach

- 기존 취소 버튼을 누르면 로컬 확인 알림을 연다. 알림을 열기만 해서는 mutation을 보내지 않는다.
- `ModalSheet`와 `ConfirmationContent`를 카드에 조합한다. 문구 제안은 제목 `게시 요청을 취소할까요?`, 대기 유지 버튼 `계속 기다리기`, 확정 버튼 `게시 취소`다. 문구는 구현 시 기존 UI 문체에 맞게 다듬을 수 있다.
- 대기 유지와 공용 닫기 경로는 알림만 닫는다. 확정한 경우에만 기존 `cancel`을 실행한다. mutation pending과 오류 뒤 재조회는 기존 경로를 따른다.
- 알림이 열려 있어도 기존 상태 조회를 계속한다. 취소할 수 없는 상태로 바뀌면 현재 상태에 맞춰 알림의 유효성과 확정 action을 정하고, 게시·취소 경쟁의 최종 결과는 서버 판정을 따른다. 이를 위해 새 요청 추적 상태 기계나 snapshot을 만들지 않는다.
- Web의 초기 focus·닫힌 뒤 focus와 keyboard containment는 공용 modal 경계에서 검증한다. 필요한 imperative focus에는 기존 ref API만 사용한다. Native의 back·닫기·접근성은 별도로 확인한다.
- 구현 PR에서 `docs/design/post-composer.md`의 요청 상태 문단에 확인·대기 유지·닫기 동작을 반영한다.

## Alternatives and Traps

- 공용 확인 UI 재사용을 제안한다. 플랫폼별 alert를 따로 추가하면 이미 있는 dismiss·focus·테마 동작을 다시 맞춰야 한다.
- HOPE 적용 여부를 위한 새 API 필드나 분기, 이미지 업로드 중 취소 기능은 추가하지 않는다. 현재 대기 카드의 취소 진입점에 확인을 둔다.
- 클릭 즉시 취소로 표시하거나 상태 조회를 멈추면 기존 서버 확정·대기 동작을 바꾸게 된다.

## Risks / Limits

- 확인 중 게시가 시작될 수 있다. 기존 서버는 `PUBLISHING`·`CONFIRMING`·`PUBLISHED`의 취소를 거절한다. 이를 클라이언트의 취소 성공으로 덮지 않는다.
- `PostRequestCard.test.ts`에는 취소 버튼 클릭 직후 mutation을 기대하는 기존 사례가 있다. 확인을 거친 뒤의 기대값으로 고치고 거절·dismiss 경로를 함께 검증한다.
- 이 Spec 세션에서는 애플리케이션 테스트·CI·Web·Native runtime을 실행하지 않았다. OpenSpec validation은 문서 구조만 검증한다.

## Open Questions

없음.
