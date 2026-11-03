## Why

비로그인 모바일 Web 첫 화면에서 하단 탭과 방문자 안내가 화면 하단을 함께 차지한다. PROD-1232는 불필요한 탭을 없애고 기존 안내 전체를 화면 맨 아래에 고정하는 변경이다.

## Goal

비로그인 모바일 Web의 `/`에서 하단 탭과 탭용 여백을 제거한다. 방문자 안내 전체는 safe area를 고려해 하단에 고정하고, 마지막 콘텐츠까지 스크롤로 접근할 수 있게 한다.

## What Changes

- 안내가 보이거나 닫힌 상태 모두에서 이 경로의 하단 탭을 숨긴다.
- 안내가 보이면 실제 높이만큼 콘텐츠 공간을 확보하고, 닫으면 그 공간도 해제한다.
- 작은 viewport에서도 이 경로의 안내는 하단 고정을 유지한다. 기존 문구·닫기·인증 직접 진입·보조 링크와 상단 메뉴를 보존한다.

## Non-Goals

로그인 사용자, 데스크톱 Web, 다른 route와 Native 앱의 배치·동작, 공개 조회·참여 권한, 인증 후 복귀 정책은 바꾸지 않는다.

## Constraints

- 기존 `breakpoints.compact` 미만의 Web에서 서버가 확인한 guest 상태에만 적용한다.
- 버튼만 떼어 고정하지 않고 기존 방문자 안내 컴포넌트 전체를 재사용한다.
- document/window scroll과 현재 탭 단위의 안내 닫힘을 유지한다.
- 이 문서는 변경 가능한 세션 메모다. 제품 요구사항은 현재 canonical과 Linear가 소유한다.

## Verification

직접 진입·새로고침, 스크롤 중 안내 위치, 마지막 콘텐츠 접근, 닫은 뒤 여백 해제, 상단 메뉴의 인증 진입을 검증한다. 작은 폭·높이, safe area, 확대·reflow와 768px 경계 양쪽을 포함하고, 다른 route·인증 상태·Native 셸의 회귀를 확인한다.

## Business Context

- Product canonical: `docs/domain/policies/public-content-onboarding.md`.
- Visual design source: `docs/design/public-content-onboarding.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`. 시각 구조·상태 표현·접근성·상호작용 표현에 한해 참조한다.
- Linear: [PROD-1232](https://linear.app/byulmaru/issue/PROD-1232). 기존 동작 근거는 [PROD-1199](https://linear.app/byulmaru/issue/PROD-1199)와 [PROD-836](https://linear.app/byulmaru/issue/PROD-836).
- User agreement: 2026-10-27 사용자가 PROD-1232에 대해 Spec Workflow를 요청했다. 새로운 제품 선택 없이 이슈에 명시된 결과를 계획한다.

## Session Status

- Status: Active
- Last updated: 2026-10-27
