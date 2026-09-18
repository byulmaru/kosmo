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
- [ ] 2.5 실제 QuoteNotification API가 준비되면 concrete 목록 연결과 API→알림함 통합을 검증한다.
      현재 Deferred이며, 서버 lifecycle 구현은 PROD-926이 소유한다.
- [ ] 2.6 iOS/Android runtime에서 이동·읽음·접근성 동작을 각각 확인한다.
      미실행 플랫폼은 Web/Storybook 결과와 구분한다.
- [ ] 2.7 최종 sync/archive 시 최신 OpenSpec 정책과 CLI의 선택적 delta 처리 및 `--skip-specs` 동작을 확인한다.
      남은 제품 요구사항·검증은 보존하며, strict 통과만을 위한 delta와 archive-only 변경은 만들지 않는다.

## Verification Evidence

- Result: 확정된 표시 계약을 Quote 전용 Post surface와 기존 Notification wrapper 경계에 반영했다.
  실제 QuoteNotification concrete API 연결은 2.5 Deferred로 유지한다.
- Checks: `pnpm --filter @kosmo/app check`, 대상 파일 ESLint, 대상 문서·코드 Prettier,
  `git diff --check` 통과. Quote contract를 포함한 Notification Storybook 35개와 app unit 594개,
  Web export가 통과했다. Storybook은 기존 Relay fixture로 읽음 실패·Profile actor 격리·조회 불가
  회귀도 함께 확인했다.
- 문서 검증: canonical와 OpenSpec Markdown의 Prettier, `git diff --check` 통과.
  proposal/design/decisions/tasks가 있으며 현행 schema의 applyRequires는 tasks다.
- OpenSpec strict validator는 delta spec이 없다는 이유로 실패한다. 현재 저장소 schema는 proposal/tasks만
  요구하고 specs는 선택 사항이다. validator를 통과시키기 위한 의미 없는 delta를 추가하지 않는다.
  이 상태는 구현 gate가 아니며, 최종 sync/archive 처리 방법은 후속 확인 사항으로 남긴다.
- Limits: main에 QuoteNotification concrete API가 없다. fixture는 실제 API 통합을 증명하지 않는다.
  iOS/Android runtime은 아직 실행하지 않았다.

## Progress

- Status: Active (implementation complete for available client boundary)
- Completed: 최신 main 재확인, 독립 branch와 worktree 확보, Linear 의존성 정정, 기존 fixture 경계 조사,
  Quote presentation/Relay surface 구현, Notification wrapper kind 확장, Storybook·unit·Web 검증.
- Next: QuoteNotification API가 준비되면 2.5 concrete 목록 연결과 API→알림함 통합을 검증한다.
  iOS/Android runtime 확인은 2.6으로 남긴다.
- Last updated: 2026-09-18
