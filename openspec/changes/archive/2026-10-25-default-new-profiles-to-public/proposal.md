## Why

온보딩을 준비하면서 새 프로필의 게시물 기본 공개 범위를 ‘조용한 공개’에서 ‘공개’로 바꾸기로 했다.
별도 설정 없이 시작하는 사람도 새 글을 공개로 작성하도록 생성 결과와 초기 선택을 맞춘다.

## Goal

첫 프로필과 추가 프로필은 Public으로 시작하고, 온보딩에서 게시 설정을 저장하거나 생략한 뒤에도
저장된 기본값과 새 일반 글쓰기의 초기 선택이 일치한다.

## What Changes

- 새 Local Profile의 생성 기본값과 첫 프로필 온보딩의 초기 선택을 Public으로 맞춘다.
- 기존 ‘전체 공개’ 선택지를 사용하고, 현재 정책 문서와 안내의 기본값을 같은 의미로 정리한다.
- 현재 `profile` capability에 신규 기본값과 온보딩 결과의 변경분만 기록한다.

## Non-Goals

- 기존 프로필 설정·게시물의 일괄 변경, 데이터 마이그레이션과 공개 범위 종류·권한 변경.
- 조회 실패·저장값 없음의 Unlisted 대체 처리와 답글의 초기 공개 범위 규칙 변경.
- 열린 초안·개별 선택 덮어쓰기, 팔로우 자동 승인·온보딩 순서·UI 문구 재설계.

## Constraints

사용자가 저장한 다른 기본값과 Remote Profile의 기존 동작을 보존한다. 게시 설정의 생략은 미저장 입력을
저장하지 않으며 생성 시 정해진 값을 유지한다. ‘조용한 공개’와 ‘팔로워만’ 선택지는 그대로 제공한다.

## Verification

프로필 생성의 저장값·조회 결과, 온보딩의 초기 선택·저장·생략·바로 시작, 새 글쓰기의 초기값을 실행으로 확인한다.
기존 저장값·Unlisted 대체 처리·열린 초안·답글 제한의 회귀도 확인한다. 완료한 검증과 실행하지 않은 항목은
`tasks.md`와 PR #1286에 기록한다.

## Business Context

- Product canonical: `docs/domain/objects/profile.md`, `docs/domain/policies/first-profile-onboarding.md`.
- Visual design source: `docs/design/first-profile-onboarding.md`, `docs/design/settings.md`, `docs/design/post-composer.md`.
- Linear: [PROD-1226](https://linear.app/byulmaru/issue/PROD-1226). 관련 PROD-1146·PROD-667·PROD-1101의 기존 경계를 보존한다.
- User agreement: 2026-10-24 ‘기본 공개 설정을 조용한 공개에서 공개로 바꾸는 이슈’ 요청과 해당 이슈의 Spec Workflow 호출.

## Session Status

- Status: Archived
- Last updated: 2026-10-25
