## Session Work

모든 항목은 PROD-922 구현·검증 담당 범위다. 아래 접근과 작업 분할은 수정할 수 있지만 canonical·Linear의 결과는 유지한다.

- [x] 1.1 공용 목록에서 A attribution 아래 B 표준 행과 nullable C preview를 표시하고 Relay 생성물을 갱신한다. 기존 B target·A Reply disabled·한 단계 cutoff를 보존한다.
- [x] 1.2 `PureRepostOfQuote`, `ProductionRepostQuoteListIntegration`, Bookmark `RepostQuoteUsesOneSourceDepth` fixture를 실제 A→B→C·A→B→C→D로 검증한다. C/B unavailable, Content Warning·Media와 단일 article·Action Bar·divider를 관찰한다.
- [x] 1.3 B/C/각 Author/외부 URL의 pointer·keyboard 이동, padding 비이동, 중첩 Link 부재, B mutation·Reaction Summary target과 A Reply disabled를 실행 결과로 검증한다.
- [ ] 1.4 순수 Repost ID의 B 상세 replace redirect와 history, B 상세의 C preview·Reply 정책을 통합 검증한다. Home·Profile 및 기존 Quote·Reply+Quote 목록·상세·thread, 일반 `QuoteOfQuote` cutoff를 회귀 검증한다.
- [ ] 1.5 Relay 생성·typecheck·표적 Storybook·필요한 API/route integration과 Web Light·Dark·대표 좁은/넓은 viewport·긴 Content/Author·focus 검증 결과를 남긴다. Native touch·VoiceOver·TalkBack 미검증은 Native 출시 gate에 별도로 기록한다.

## Verification Evidence

- Result: 목록 표시와 상호작용(1.1–1.3)을 구현하고 검증했다. 순수 Repost 상세의 replace·C preview·한 단계 cutoff·Reply 정책·browser history를 확인하는 격리 DB Playwright test도 통과했다. Test 단계에서는 1.4의 기존 route regression과 1.5의 Web theme/viewport 시각 검토를 이어간다.
- Checks: `pnpm --filter @kosmo/app check` (Relay 163 reader/104 normalization/182 operation text + TypeScript), `pnpm --filter @kosmo/web check`, focused Storybook 8 tests, full app Storybook 133 files/873 tests, and isolated-DB Playwright route test 1/1 passed. `pnpm exec prettier --check` on the four changed source files and `git diff --check` passed.
- Limits: Storybook mock tests verify component interactions and presentation contracts; the Playwright test verifies the target route and browser history on a disposable DB. The full existing route regression suite and manual Web Light/Dark, narrow/wide visual review remain for Test. Native touch, VoiceOver, and TalkBack were not verified and remain a Native release gate.

## Progress

- Status: Implementation complete; handing off to Test
- Completed: Linear와 canonical의 확정 범위 안에서 1.1–1.3을 구현하고 검증했다. 순수 Repost 상세의 replace 경로를 확인하는 DB-backed E2E도 추가했다. 새 제품 결정은 없었다.
- Next: Test 단계에서 1.4의 기존 route regression과 1.5의 Web Light/Dark 및 좁은/넓은 viewport 검증을 보완한다. Native touch·VoiceOver·TalkBack은 별도 Native release gate로 남긴다.
- Last updated: 2026-09-30
- 정리 메모: 범위 완료 후 가능하면 같은 구현 PR에서 `--skip-specs`로 archive한다. 하네스 정리는 제품 완료나 PR Ready의 gate가 아니다.
