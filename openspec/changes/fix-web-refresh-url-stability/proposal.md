# PROD-1103 버그 수정 계획

## 목표와 근거

[PROD-1103](https://linear.app/byulmaru/issue/PROD-1103)에 기록된 Web 새로고침 URL 오류를 수정한다. 이 문서는 기존 동작을 복구하기 위한 작업 메모다. 완료 조건은 Linear와 적용되는 canonical 문서를 따르며, 별도의 delta spec은 만들지 않는다.

새로고침 중 하위 navigation state가 준비되기 전에 URL을 계산하면서 정적 화면은 `/undefined/undefined`, 프로필은 `/@프로필/undefined`로 바뀐다. 게시물에서는 불필요한 query가 붙거나 `/reactions`가 잠시 사라진다. 최종 URL만 확인하면 이 오류를 놓친다.

## 범위와 제약

- 특정 화면의 링크가 아니라 공통 Web routing 경계를 수정한다.
- 기존 공개 URL, 의도된 redirect, Session·인가, loading·error 동작과 내부 이동·back/forward·not-found를 보존한다.
- SDK 전체 upgrade, 새 routing 정책, DB 변경, analytics 정책 변경은 이 계획에 포함하지 않는다.
- PR #688의 구현과 중단 의견은 참고 자료다. 사용자의 작업이나 이번 수정 방향에 대한 승인으로 취급하지 않는다.

기존 계약 안의 구현 방식과 파일·테스트 배치는 구현 단계에서 판단한다. 관찰 가능한 동작, 보안, 호환성, rollout 또는 유지 책임을 바꿔야 하는 선택이 생기면 그 차이와 영향을 설명하고 사용자에게 질문한다.

## 검증과 현재 상태

직접 접근과 실제 새로고침을 실행하고 document·pushState·replaceState 전체 이력을 기대 URL과 비교한다. 정상 응답과 지연된 Relay 응답에서 정적·프로필·게시물·중첩 경로를 확인한다. PostHog SDK가 활성화된 격리 환경에서 실제 전송 payload도 확인한다.

원인과 수정 후보는 `design.md`, 실행 순서와 회귀 검증은 `tasks.md`에 정리한다. 공통 Web linking 경계에 좁은 Expo Router patch와 회귀 E2E 코드를 추가했다. 수정 후 runtime과 CI 검증은 아직 실행하지 않았고 배포하지 않았다.
