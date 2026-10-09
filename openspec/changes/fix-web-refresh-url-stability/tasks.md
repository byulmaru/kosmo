# 재현과 회귀 검증

이 체크리스트에 작업 순서를 기록한다. 제품 완료 조건은 [PROD-1103](https://linear.app/byulmaru/issue/PROD-1103)을 따른다. 아래 항목은 아직 실행하지 않았다.

- [ ] 1.1 최신 branch·main과 Linear를 확인하고 실제 앱·API·격리 DB에서 핵심 경로의 직접 접근·새로고침을 재현한다. 정상 응답과 Shell/Profile query 지연을 구분하고 document·pushState·replaceState 전체 이력을 수집한다. 과거 진단 통과를 수정 후 결과로 재사용하지 않는다.
- [ ] 1.2 원인과 두 수정 후보를 대조해 기존 계약을 보존하는 가장 작은 공통 경계 변경을 선택·구현한다. `/home` 개별 우회나 무조건적인 SDK upgrade로 끝내지 않는다. 실제 계약·보안·호환성·rollout·유지 책임을 바꾸는 선택이 생기면 구현 전에 질문한다.
- [ ] 1.3 재현 경로의 직접 접근·실제 reload에서 초기부터 안정화까지 기대 URL을 유지하는 회귀 테스트를 실행한다. 정적 화면, Profile home/following, Post detail/reactions와 `/privacy`를 포함하고 불필요한 query·부모 경로 축약도 확인한다.
- [ ] 1.4 내부 이동, query-only 이동, back/forward, 기존 인증 redirect와 not-found를 검증한다. 변경한 loading·error·retry 경계와 영향을 받는 actor·focus·scroll 동작을 확인한다. 공유 navigation 코드를 바꾸면 영향 범위에 맞춰 Native도 검증한다.
- [ ] 1.5 PostHog SDK가 활성화된 격리 환경에서 정상 pageview 전송과 새로고침 전체 구간의 payload를 확인한다. 잘못된 URL의 pageview가 새로 기록되지 않는지 검증하고 운영 telemetry는 변경하지 않는다.
- [ ] 1.6 변경 범위의 lint·typecheck와 focused E2E를 실행하고 실패를 수정한다. 실행 조건·결과·남은 한계를 PR과 handoff에 기록한다. 원격 전달과 현재 PR head의 CI 확인은 해당 workflow와 저장소 지침을 따른다.

E2E는 기존 `auth-routes.e2e.ts`, `analytics.e2e.ts`와 라우팅 회귀 테스트를 활용한다. 새 파일명·fixture·명령은 구현 시 실제 runner에 맞춰 정한다. 문서 형식 검증, OpenSpec artifact 상태, 테스트 파일 작성만으로 제품 동작이 검증됐다고 표시하지 않는다.
