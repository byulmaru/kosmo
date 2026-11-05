## Session Work

- [ ] 1.1 `PostRequestCard.tsx`의 기존 취소 action 앞에 공용 확인 알림을 연결한다. 확정한 경우에만 기존 mutation을 실행하고, 대기 유지·닫기는 알림만 닫는다. 기존 취소 가능 상태·polling·pending·오류 재조회는 유지한다.
- [ ] 1.2 `PostRequestCard.test.ts`에서 첫 클릭·대기 유지·닫기는 mutation을 실행하지 않는지, 확정은 기존 request ID로 취소하는지 검증한다. 기존 취소 성공·오류 사례도 확인 단계를 거치게 수정하고, 확인 중 취소 불가 상태로 바뀐 경우를 포함한다.
- [ ] 1.3 기존 `PostRequestCard.stories.tsx`의 production 컴포넌트와 Relay fixture를 사용해 확인 알림·거절·닫기·확정 interaction을 보강한다. Web keyboard·focus·dismiss와 테마·반응형 표시는 기존 공용 UI 계약으로 확인한다.
- [ ] 1.4 `docs/design/post-composer.md`에 확인·대기 유지·닫기 동작을 반영하고, 최신 PR head의 필수 CI와 App 검증 결과를 확인한다. Android·iOS에서 실제 닫기·back·접근성 검증의 실행 여부와 결과를 별도로 기록한다.

## Verification Evidence

- Result: 확인 알림·행동 테스트·Storybook interaction·디자인 문서 구현 반영. 동작 검증은 GitHub CI 대기.
- Checks: 다음 Test 세션에서 `.github/workflows/test.yml`의 App suite(`pnpm --filter @kosmo/app test`)와 최신 PR head의 필수 CI를 확인한다. 테스트는 로컬에서 실행하지 않는다.
- Limits: 단위 테스트의 mocked modal은 실제 dismiss·focus를 증명하지 않는다. Storybook Web 검증은 Android·iOS runtime 검증을 대체하지 않는다. OpenSpec strict validation 결과는 handoff에 별도로 남긴다.

## Progress

- Status: Implementation written; verification pending
- Completed: 기존 확인 UI 연결, 첫 클릭·거절·닫기·확정·상태 전환·오류 재조회 회귀 테스트 코드와 production Storybook interaction, 디자인 문서 갱신.
- Next: Test에서 최신 PR head의 필수 CI·App suite를 확인한다. Android·iOS back·닫기·접근성 runtime은 아직 실행하지 않았다.
- Last updated: 2026-11-05

- Local static checks: Prettier, TypeScript transpile syntax diagnostics, `git diff --check` 통과. ESLint는 초기 로컬 `source-map-js` 누락 뒤 의존성 연결이 복구되어 재실행에 통과했다. CI Lint는 별도로 확인한다.
