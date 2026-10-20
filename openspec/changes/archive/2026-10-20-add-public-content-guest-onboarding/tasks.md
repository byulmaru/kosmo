## Progress

- [x] Web 공개 Profile·Post의 guest 사이드바·drawer와 하단 CTA, 탭 단위 닫힘을 제공한다.
- [x] 사이드바의 `가입하기`·`로그인`과 하단 CTA가 홈을 거치지 않고 `/login`에서 기존 인증을 바로 시작하게 한다.
- [x] 복귀 관련 코드·테스트·문서를 제거하고, 인증 전에 시도한 참여 행동은 자동 실행하지 않는다.
- [x] 현재 head의 사이드바 control 표현을 snapshot으로 기록하고, 향후 합치거나 나누는 제품 결정을 추가하지 않는다.

## Validation

PR #1191 head `5040676f1a542908f3e593bf7eefbaf847394327`에서 CI 16/16이 성공했다: [Test 14개 작업(Web E2E 3개 shard 포함)](https://github.com/byulmaru/kosmo/actions/runs/39281506949), [Lint](https://github.com/byulmaru/kosmo/actions/runs/39281506615), [Semgrep](https://github.com/byulmaru/kosmo/actions/runs/39281506621). E2E는 테스트용 OIDC·서비스를 사용한다.

## Limits

CI는 실제 OIDC 제공자나 production API의 동작을 검증하지 않는다. Native 기기 검증도 이 증거에 포함되지 않는다.
