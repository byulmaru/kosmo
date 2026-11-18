## Why

게시글 작성자를 누르려던 입력이 상세로 이동하고, 작성자 오른쪽의 넓은 여백은 프로필로 이동한다.
[PROD-1176](https://linear.app/byulmaru/issue/PROD-1176)에 확정된 이동 경계를 적용하기 위한 계획을 정리한다.

## Goal

작성자 바로 위의 여백은 프로필로, 닉네임·핸들 중 더 넓게 표시된 텍스트의 오른쪽 경계 밖 여백은
해당 게시글 상세로 한 번 이동하게 한다. 이 Spec 세션은 조사와 다음 구현 세션의 인계까지 담당한다.

## What Changes

- 닉네임과 핸들에 같은 프로필 영역 경계를 적용한다. 짧은 줄의 묶음 내부 여백도 프로필 영역에 포함한다.
- 짧은 문자열, 긴 문자열과 화면 폭에 따른 잘림을 실제 표시 기준으로 확인한다.
- 일반 Post·Quote·순수 Repost와 목록·타래에서 각 작성자와 게시글의 기존 목적지를 유지한다.

## Non-Goals

프로필 표시·편집, 이동 지연, Reaction Summary와 Action Bar 여백 동작, 서버·GraphQL·저장 구조 변경은 제외한다.
이번 세션에서는 제품 코드·테스트 코드·PR·배포를 변경하지 않는다.

## Constraints

- 범위와 결과는 PROD-1176의 2026-10-20 사용자 결정과 현재 canonical을 따른다. 이 하네스는 요구사항을 추가하지 않는다.
- 프로필 아래 배경·본문·작성 시각과 독립 링크·버튼의 기존 입력을 보존하며 중복 이동하지 않는다.
- Quote와 순수 Repost의 직접 Source 대상을 더 깊은 Source로 평탄화하지 않는다.
- 기존 attribution, 비대화형 Composer preview와 이번 경계가 적용되지 않는 소비자의 동작을 유지한다.

## Verification

구현 세션에서 표시 폭·잘림·작성자 위쪽의 실제 좌표 입력과 이동 대상을 확인한다. 일반 Post·Quote·순수
Repost, 목록·타래, 독립 컨트롤과 스크롤 회귀를 함께 확인한다. Web browser·Native runtime·실기기·CI·배포
결과는 구분한다. 이 Spec 세션은 문서 구조와 OpenSpec strict validation만 검증한다.

## Business Context

- Product canonical: `docs/domain/objects/post.md`의 Post 상세, accepted `docs/domain/decisions/0027-repost-of-quote-source-presentation.md`.
- Visual design source: `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `docs/design/accessibility.md`. 시각 구조·입력 영역·접근성 범위에서 참조한다.
- Linear: [PROD-1176](https://linear.app/byulmaru/issue/PROD-1176).
- User agreement: 이슈에 기록된 2026-10-20 결정과 현재 `kosmo-spec-workflow PROD-1176` 요청. 미정인 제품 결정은 없다.

## Session Status

- Status: Active
- Last updated: 2026-10-22
