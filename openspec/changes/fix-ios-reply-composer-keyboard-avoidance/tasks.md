## Session Work

- [ ] 1.1 구현 담당: 최신 Linear·canonical·branch/HEAD를 재확인하고 실제 iOS Reply 키보드 가림을 재현한다. 키보드 전후 화면·좌표, OS·앱 버전·소스와 OTA 확인 상태를 기록한다.
- [x] 1.2 구현 담당: 1.1의 근거로 keyboard avoidance·safe area·높이 경계의 최소 수정을 적용한다. 초안·첨부·CW·제출 계약과 기존 공용 작성기를 보존한다. iOS `ReplyComposerSurface`에 공통 작성기와 같은 `height` 회피와 top inset offset 후보를 적용했다. Native 확인 전까지 해결 확정으로 보지 않는다.
- [x] 1.3 구현 담당: 변경으로 영향받는 입력·CW 조작·이미지 제거·제출 상태의 행동 테스트를 보강한다. 기존 테스트가 충분하면 재사용하며 prop이나 소스 문자열 검사로 layout 검증을 대신하지 않는다. Reply/Quote의 KAV 설정 테스트를 추가했고, 본문·CW·제출·Media action은 기존 App unit/Storybook 행동 테스트를 재사용한다. 이 설정 테스트는 Native 배치를 증명하지 않는다.
- [ ] 1.4 검증 담당: 1.2 이후 실제 iOS에서 이미지·CW·긴 본문, 키보드 표시·해제·재진입, safe area와 footer 조작을 확인한다. 일반·인용 작성기도 회귀 확인한다. 공용 경계를 수정했다면 영향받는 다른 플랫폼도 확인한다.
- [ ] 1.5 검증 담당: 최종 변경 HEAD의 관련 CI·타입·lint·행동 테스트 결과와 Native 관찰을 구분해 PR/handoff에 기록한다. 미실행 또는 실패한 acceptance는 pending으로 남긴다.

## Verification Evidence

- Result: pending. 구현·제품 테스트·Native 재현은 이번 Spec 세션에서 실행하지 않았다.
- Checks: `ReplyComposerSurface.test.ts`, `PostComposerHost.test.ts`, `PostComposer.test.ts`와 관련 Storybook을 변경 범위에 따라 선택한다. 기존 앱 검증 경로는 `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/app test:unit`, `pnpm --filter @kosmo/app test:storybook`이다. Test phase의 자동 검증은 해당 workflow에 따라 최신 HEAD의 GitHub CI에서 확인한다.
- Native acceptance: 키보드 상단보다 footer 조작 영역이 위에 있는지 같은 화면 좌표로 확인하고 버튼을 실제로 탭한다. 긴 입력의 caret·첨부 접근, 전환 후 공백·겹침과 초안 유지도 함께 기록한다. 측정값에 임의의 기준을 붙여 새 제품 계약으로 만들지 않는다.
- Limits: 기존 모의 KeyboardAvoidingView, Web 자동화와 정적 keyboard story는 iOS 레이아웃을 증명하지 않는다. 테스트 계정·실기기 접근 가능 여부는 다음 세션에서 확인한다.

## Progress

- Status: Active; Native acceptance and CI pending
- Completed: Linear·canonical·최신 main 재확인; Reply/Quote KAV 후보 구현과 configuration regression test; 기존 Composer behavior tests 재사용.
- Next: 실제 iOS Reply 키보드 재현·관찰, 최종 PR HEAD CI 확인.
- Last updated: 2026-10-09

## Implement Evidence

- iOS Simulator: iPhone 17 Pro / iOS 26.5; installed `moe.kos` app `0.0.1 (1)` opened the signed-in Home feed. This differs from the reported TestFlight `0.0.1 (36836991687001)` / iOS 26.7. The installed app Info.plist did not expose `EXUpdatesRuntimeVersion` or `EXUpdatesURL`.
- No Reply surface or keyboard interaction was exercised. Orca UI control could not start: `Unable to determine Orca.app path from symlink: /usr/local/bin/orca`.
- Keep tasks 1.1, 1.4, and 1.5 pending. The code change is a candidate from the issue report and the existing Post-vs-Reply avoidance difference; it is not a confirmed Native fix. App CI is the `Test (App)` matrix job running `pnpm --filter @kosmo/app test`.
