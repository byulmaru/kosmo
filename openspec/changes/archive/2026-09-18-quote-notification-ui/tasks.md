## Spec Session Work

- [x] 1.1 최신 main·canonical·Linear·coordination을 재확인하고 독립 PROD-953 Stack을 확보한다.
- [x] 1.2 PR #921을 착수 blocker에서 실제 API 최종 통합 검증 의존성으로 정정한다.
- [x] 1.3 확정된 표시 계약을 canonical·Linear·design/decision 기록에 반영한다.
- [x] 1.4 문서를 검증하고 handoff·구현 세션 시작 프롬프트를 완성한다.

## Implement Session Work

아래 작업은 별도 Implement 세션에서 수행한다. 이번 Spec 세션에서는 구현·commit·push·PR 생성을 하지 않는다.

- [x] 2.1 기존 PROD-953 worktree의 HEAD·dirty 문서, 최신 main·policy·Linear·서버 API와 coordination을
      재확인하고 필요한 쓰기 소유권을 확보한다. 표시 계약은 다시 질문하지 않는다.
- [x] 2.2 기존 Post·Notification 조합과 읽음 mutation을 재사용하는 Quote UI·Relay 경계를 구현한다.
- [x] 2.3 기존 Relay fixture로 표시·이동·읽음 실패·Profile 전환·조회 불가 동작을 검증한다.
- [x] 2.4 Relay·TypeScript·lint·format·공용 Notification 및 Post action 회귀와 Web build를 확인한다.

## Verification Evidence

- Result: 확정된 표시 계약을 Quote 전용 Post surface와 기존 Notification wrapper 경계에 반영했다.
  실제 QuoteNotification concrete API 통합은 Linear·PR의 남은 제한으로 보존한다.
- Checks: `pnpm --filter @kosmo/app check`, 대상 파일 ESLint, 대상 문서·코드 Prettier,
  `git diff --check` 통과. Quote contract를 포함한 Notification Storybook 35개와 app unit 594개,
  Web export가 통과했다. Storybook은 기존 Relay fixture로 읽음 실패·Profile actor 격리·조회 불가
  회귀도 함께 확인했다.
- 문서 검증: canonical와 OpenSpec Markdown의 Prettier, `git diff --check` 통과.
  proposal/design/decisions/tasks가 있으며 현행 schema의 applyRequires는 tasks다.
- delta spec이 없는 선택적 세션 하네스이므로 `--skip-specs`로 archive했다. 이후
  `openspec validate --all --strict`는 134개 항목이 모두 통과했다.
- Limits: main에 QuoteNotification concrete API가 없다. fixture는 실제 API 통합을 증명하지 않는다.
  iOS/Android runtime은 아직 실행하지 않았다.

## Progress

- Status: Complete (available client boundary)
- Completed: 최신 main 재확인, 독립 branch와 worktree 확보, Linear 의존성 정정, 기존 fixture 경계 조사,
  Quote presentation/Relay surface 구현, Notification wrapper kind 확장, Storybook·unit·Web 검증.
- Remaining limits: 실제 QuoteNotification API 통합과 iOS/Android runtime 증거는 Linear·PR에 보존하며,
  완료한 세션 하네스의 task로 유지하지 않는다.
- Last updated: 2026-09-18
