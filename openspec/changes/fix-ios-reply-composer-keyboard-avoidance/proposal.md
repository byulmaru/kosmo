## Why

iOS 답글에서 키보드를 열면 이미지 첨부·CW 버튼과 글자 수 영역이 가려진다는 제보가 있다. 일반 작성기 수정은 별도 답글 surface에 적용되지 않았다. 원인 후보와 실제 Native 검증을 연결해 기존 작성 흐름을 복구한다.

## Goal

키보드가 열린 iOS 답글에서 작성 도구를 조작하고 글자 수를 확인할 수 있으며, 긴 본문과 첨부 내용에도 접근할 수 있게 한다.

## What Changes

답글의 키보드 회피와 safe area 경계를 조사해 필요한 최소 레이아웃 수정을 계획한다. 키보드 표시·해제·재진입, 이미지·CW·긴 본문에서 확인하고 일반·인용 작성기의 회귀를 점검한다.

## Non-Goals

PROD-1032의 본문·이미지 간격 문제와 PROD-1033의 알림 진입 스크롤 문제는 별도 범위다. 작성기 전체 재설계, 새 작성 상태·API·DB 변경, 신규 dependency와 배포는 포함하지 않는다. 이 Spec 세션에서는 구현하거나 제품 테스트를 실행하지 않는다.

## Constraints

초안 유지, 이미지 첨부·제거, CW 설정과 답글 제출 흐름을 보존한다. 인용은 같은 surface를 쓰는 회귀 대상으로 다루며 동일 증상이 재현됐다고 가정하지 않는다. safe area는 기존 overlay 경계에서 한 번만 소비한다.

## Verification

실제 iOS 소프트 키보드를 열어 footer의 화면 내 위치와 버튼 조작, 입력 위치·첨부 스크롤, 전환 후 겹침·불필요한 빈 공간을 확인한다. 컴포넌트 테스트와 Storybook은 Native 레이아웃 검증을 대체하지 않는다. 환경·소스 revision·관찰 결과와 미확인 항목을 구분해 남긴다.

## Business Context

- Product canonical: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`의 기존 Reply 관계·작성 계약을 보존한다.
- Visual design source: `docs/design/post-composer.md`; `docs/design/reply-composer.md`는 통합 문서로 연결한다.
- Linear: https://linear.app/byulmaru/issue/PROD-1080 (2026-10-08 갱신 본문, 2026-10-09 조회; 댓글 없음).
- User agreement: 2026-10-09 PROD-1080의 `kosmo-spec-workflow` 실행 요청. 새 제품 결정은 없다.

## Session Status

- Status: Active
- Last updated: 2026-10-09
- 조사 기준: `5e46484fb97a1a52a3afdfc41e8c54ecfaa1bcc5`.
- Native 재현 및 수정 검증: 미실행. 다음 구현·검증 세션의 책임이다.
