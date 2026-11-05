## Why

HOPE 이미지 보호를 기다리는 동안 `취소`를 누르면 게시 요청이 바로 취소된다. 취소 전에 요청을 유지할지 선택할 기회가 필요하다.

## Goal

처리 대기 중 취소 여부를 먼저 묻고, 사용자가 확정한 경우에만 기존 게시 요청 취소 동작을 실행한다.

## What Changes

- 대기 카드의 취소 action에 확인 알림을 추가한다.
- 취소하지 않거나 알림을 닫으면 게시 요청을 유지하고 계속 대기한다.
- 이미지 파일 업로드가 끝나고 게시를 요청한 뒤 HOPE 보호 처리를 기다리는 기존 요청 카드를 대상으로 한다.

## Non-Goals

서버의 취소 가능 상태, 게시·취소 경쟁 판정, API·Temporal·Media 처리, 재시도·초안·이력·알림 정책은 바꾸지 않는다.

## Constraints

- 취소는 기존 `QUEUED`·`PROCESSING` 경계에서만 요청한다. `PUBLISHING`·`CONFIRMING`은 취소할 수 없다.
- 취소 완료 여부는 서버 결과로 판단한다. 확인 버튼을 눌렀다는 이유만으로 `CANCELLED`로 표시하지 않는다.
- 공용 확인 UI와 플랫폼별 접근성·닫기 동작을 따른다.
- 이 세션은 조사·계획·handoff만 작성한다. 애플리케이션 구현과 동작 테스트는 다음 세션에서 진행하며 테스트는 CI에서 실행한다.

## Verification

처음 취소를 누르거나 알림에서 거절·닫기를 선택했을 때 mutation이 실행되지 않고 대기가 이어지는지 확인한다. 확정했을 때 기존 request ID로 취소가 실행되는지, 오류 뒤 재조회와 서버 상태 반영이 유지되는지 검증한다. Web에서는 keyboard·focus·dismiss를, Android·iOS에서는 실제 닫기·접근성 동작을 별도로 확인한다.

## Business Context

- Product canonical: `docs/domain/objects/post.md`의 Local Post 접수·publication·취소 경계, `docs/domain/objects/media.md`의 이미지 보호 처리.
- Visual design source: `docs/design/post-composer.md`의 요청 상태·취소 표시, `docs/design/accessibility.md`의 `ModalSheet` 계약. 디자인 문서의 권위는 표시와 상호작용에 한정한다.
- Linear: [PROD-1287](https://linear.app/byulmaru/issue/PROD-1287), 관련 [PROD-1257](https://linear.app/byulmaru/issue/PROD-1257).
- User agreement: 2026-11-04 `kosmo-spec-workflow PROD-1287` 명시 호출. 이미지 파일 업로드 뒤 게시를 요청하고 보호 처리를 기다리는 기존 흐름을 대상으로 한다. 이 문서는 비권위 세션 메모이며 별도의 제품 승인 근거가 아니다.

## Session Status

- Status: Active
- Last updated: 2026-11-04
