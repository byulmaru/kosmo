## Session Work

아래 항목은 PROD-1078의 구현·검증에 사용하는 임시 체크리스트다. Spec phase에서는 구현 task를 완료로 표시하지 않는다.

- [ ] 1.1 Implement: 현재 Linear·기준 문서·branch/HEAD를 다시 확인하고, Reaction/Repost fragment와 사진 입력에 각 행위자의 프로필 목적지를 연결한다.
- [ ] 1.2 Implement: 사진별 프로필 링크와 기존 게시글 영역을 분리한다. 28px·최대 3개를 유지하면서 겹침을 제거하고 플랫폼별 입력·focus·이름 기준을 적용한다.
- [ ] 1.3 Implement: 한 활성화당 읽음 요청 한 번과 이동 한 번, 지연·실패 중 이동, 기존 pending/disabled·CW·sensitive 처리를 보존한다.
- [ ] 2.1 Implement: 두 유형의 단일·복수 사진, 기본 사진, 같은 이름의 서로 다른 Profile, 원격 handle, 좁은 폭과 keyboard 활성화를 실제 표시 컴포넌트로 검증하는 Storybook interaction을 작성한다.
- [ ] 2.2 Implement: 실제 consumer와 Relay mutation의 성공·실패를 검증하고, Web E2E에서 두 유형의 사진·게시글 URL과 읽음 요청 횟수·지연·실패를 확인하는 회귀 테스트를 작성한다.
- [ ] 2.3 Test: 최신 PR head의 필수 GitHub CI를 확인한다. App·Web E2E·Lint의 실제 결과와 다른 알림 유형의 기존 회귀 결과를 기록한다.
- [ ] 2.4 Test / 사용자 기기 확인: iOS의 사진·본문 touch와 VoiceOver, Android의 touch·TalkBack 및 최대 3개 사진의 입력 영역 비중첩을 확인한다. 실행하지 못한 플랫폼은 pending으로 남긴다.

## Verification Evidence

- Result: pending implementation
- Checks: 실제 application test, GitHub CI와 Native runtime은 이번 Spec에서 실행하지 않았다.
- 검증 계획: `pnpm --filter @kosmo/app test`는 Relay/check·unit·Storybook build/interaction을 실행한다.
  `.github/workflows/test.yml`의 Web E2E는 `node scripts/test-db.mjs run -- pnpm test:e2e:database --shard=<n>/<total>`을 실행한다.
  `.github/workflows/lint.yml`의 표준 lint도 확인한다. Test phase는 GitHub CI 결과를 사용한다.
- Limits: Storybook·Web 성공은 TestFlight 제보 재현이나 Native touch·assistive technology 성공을 증명하지 않는다.

## Progress

- Status: Active
- Completed: 현재 코드·Linear·기준 문서 조사와 사용자 사진 배치 선택, 기준 문서·Linear 정렬.
- Next: 계획 승인과 인계 후 위 구현·검증 범위 실행.
- Last updated: 2026-10-10
