## Scope Context

2026-10-14·2026-10-16에 정한 방문자 안내의 배치와 닫힘을 유지한다. 2026-10-19 사용자 선택에 따라 인증 후 출발 콘텐츠 복귀는 이번 범위에서 제외하며 필요성은 재논의 대상이다. 이후 구현을 약속하거나 가정하지 않는다.

2026-10-20 합의에 따라 공개 화면의 `가입하기`, `로그인`과 `KOSMO에서 계속하기`는 홈을 거치지 않고 `/login`에서 기존 인증을 바로 시작한다. 인증 전 참여 행동을 자동 실행하지 않는다.

현재 head에서는 사이드바의 `가입하기`와 `로그인`이 별도 control로 렌더링된다. 이 세션 기록은 현재 UI만 적으며, control 구성을 합치거나 분리할 향후 제품 결정을 추가하지 않는다.

현재 제품 기준은 `docs/domain/policies/public-content-onboarding.md`, `docs/design/public-content-onboarding.md`와 Linear PROD-836이다. 이 artifact는 세션 기록이며 제품 정책을 추가하지 않는다.
