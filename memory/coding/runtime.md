# Coding Style: Runtime And Tooling

## Runtime And Tooling

- 날짜·시간 도메인 값과 UI 포맷은 `Date`나 `Date.now()`로 재구현하지 않고 `Temporal.Instant`과 `@kosmo/core/datetime`을 사용한다. GraphQL `DateTime` 문자열은 클라이언트 경계에서 `Temporal.Instant.from(...)`으로 변환한다.
- dependency, runtime API, CI command, platform workaround를 바꿀 때는 왜 바뀌는지와 target runtime/platform 제약을 확인한다.
- Node/Web/OS별 API 지원 여부를 확인하지 않고 polyfill이나 대체 구현으로 바꾸지 않는다.
- CI/security scanner는 실패를 성공으로 삼키지 않는다. `continue-on-error`를 쓰면 후속 step에서 실패 여부를 판정해야 한다.
- runner 변경은 실제 target runner에서 실행해 확인한다.
