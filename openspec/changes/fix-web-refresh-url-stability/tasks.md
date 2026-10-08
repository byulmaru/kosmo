## Session Work

모든 task는 PROD-1103의 현재 결과를 위한 임시 checklist다. 수정 방향 선택 전에 구현을 시작하지 않는다. Spec 작성·문법 검증과 제품 구현·runtime 검증의 상태를 각각 기록한다.

- [ ] 1.1 Implement owner: 최신 Linear·canonical·branch/HEAD를 다시 확인하고 수정 방향을 구체화한다. A 또는 B가 기존 loading·인가·호환성·공개 URL을 바꾸는지 확인하고, 미정인 차이가 있으면 사용자에게 설명해 결정받는다. Acceptance: 선택 근거와 영향 범위가 명확하고 #688을 자동 상속하지 않는다.
- [ ] 1.2 Implement owner, depends on 1.1: 실제 앱·API·격리 DB fixture에서 정상 응답과 지연 응답의 직접 접근·reload 회귀 테스트를 추가한다. Acceptance: 기존 구현에서 잘못된 전체 history를 검출하며 정적·Profile·Post·중첩 route를 다룬다.
- [ ] 1.3 Implement owner, depends on 1.2: 선택한 공통 경계를 수정한다. Acceptance: 유효한 원래 URL을 유지하고 일시적인 게시물·부모 경로와 불필요한 query를 기록하지 않으며 기존 인가·loading·error·actor 동작을 보존한다. Migration: 없음. Rollout: merge·배포는 이 task에 포함하지 않는다. Rollback: 해당 scoped 구현 변경을 되돌린다.
- [ ] 1.4 Implement owner, depends on 1.3: 내부 이동·query-only 이동·뒤로/앞으로·인증 redirect·유효/없는 Profile·Post·query 오류·retry 회귀를 검증한다. 공유 경계 변경이 Native에 영향을 주면 해당 navigation·Shell 동작도 검증한다. Acceptance: 기존 결과와 route 준비 후의 화면·focus·scroll이 유지된다.
- [ ] 1.5 Implement owner, depends on 1.3: 실제 PostHog SDK가 활성화된 격리 browser에서 pageview 전송을 interception해 검사한다. Acceptance: 정상 pageview positive control이 존재하고 잘못된 URL의 `$pageview`가 없으며 실제 운영으로 테스트 telemetry를 보내지 않는다.
- [ ] 1.6 Implement/Test owners, depends on 1.4 and 1.5: 변경에 맞는 타입·lint·focused runtime 검증과 현재 PR head의 필수 GitHub CI를 완료한다. Acceptance: 실행·미실행·실패·운영 미확인을 구분해 남기고 구현에 의해 생긴 실패를 수정한다. 필요한 문서만 갱신하며 이 하네스의 archive는 제품 완료 gate로 추가하지 않는다.

## Verification Evidence

- Result: pending. Spec-only 세션이며 제품 수정·runtime 테스트·CI는 실행하지 않았다.
- Checks: 이 세션은 current Linear·코드·기존 runtime JSON·PR metadata/diff·공식 npm source를 조사했다. 윤문 후 strict validation 결과는 handoff에 기록한다.
- Planned focused E2E: `node scripts/test-db.mjs run -- sh -c 'pnpm db:test:push && pnpm --filter @kosmo/web test:e2e -- auth-routes.e2e.ts routing-url-stability.e2e.ts analytics.e2e.ts'`로 schema 준비와 E2E를 같은 격리 환경에서 실행한다. 테스트 파일명은 구현 세션에서 조정 가능한 working note다. runner의 DB·port 격리 옵션은 실행 전에 현재 help로 확인한다.
- Planned static checks: `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/web check`, 영향 파일의 ESLint·Prettier, `git diff --check`.
- Limits: localhost의 analytics 비활성 E2E는 pageview 증거가 아니다. 과거 진단 pass는 버그 재현 성공이며 수정 완료 또는 최신 main 검증이 아니다. 운영 acceptance는 미확인이다.

## Progress

- Status: Active
- Completed: issue 범위·기존 코드·관련 PR과 정식 dependency source 조사, 전용 브랜치 확보
- Next: 수정 방향을 정하고 새 Implement 세션에서 실행
- Last updated: 2026-10-09
