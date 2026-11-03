# PROD-1199 세션 기록

## Why

비로그인 첫 화면이 가입 진입에 집중되어 있어 가입 전에 게시글과 대화를 둘러보기 어렵다.

## What Changes

비로그인 Web 방문자가 `/`에서 로컬 공개 타임라인을 읽고 다음 페이지를 조회하며, 공개 프로필·게시글로 탐색을 이어간다. `/`, `/@{handle}`, `/@{handle}/{postId}`의 방문자 안내는 같은 긴 코스모 로고를 사용한다.

## Non-goals

Native 비로그인 화면, 추천·랭킹 변경, 첫 프로필 온보딩 재설계, 로그인 뒤 둘러보던 콘텐츠로 자동 복귀, 인증 전에 시도한 참여 행동의 자동 실행은 포함하지 않는다.

## Constraints

- 기존 로컬 타임라인의 후보 정책, 공개 범위, 정렬, 페이지네이션과 필터를 유지한다. 공개 조회가 참여 권한을 확대하지 않는다.
- 기존 인증 진입과 인증 사용자 `/home`, `/local`, 프로필 준비 흐름을 유지한다.
- 범위는 [Linear PROD-1199](https://linear.app/byulmaru/issue/PROD-1199)가 정한다. 지속되는 정책과 디자인 기준은 [공개 콘텐츠 온보딩 정책](../../../../docs/domain/policies/public-content-onboarding.md), [게시글 목록 정책](../../../../docs/domain/policies/post-list.md), [공개 콘텐츠 온보딩 디자인](../../../../docs/design/public-content-onboarding.md)에 있다.

## Evidence

PR [#1260](https://github.com/byulmaru/kosmo/pull/1260)에 API·Web 구현, 문서와 회귀 테스트 변경이 포함됐다. 이번 정리 이전 PR head `73622ecc5d605747766c3fcfa07c974479a78f14`에서 2026-10-23 기준 GitHub CI 16개 검사가 모두 통과했다. 당시 PR은 열려 있었고 병합되지 않았다.

## Limits

위 CI 결과는 이번 정리 이전 PR head의 증거이며 현재 로컬 변경의 검증 결과가 아니다. 수동 브라우저, 실기기, 보조 기술, 프로덕션 동작과 배포는 확인하지 않았다.
