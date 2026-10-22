## Session Work

아래 항목은 PROD-1138의 다음 구현 세션에 필요한 작업이다. 구현 수단은 재현 결과에 맞춰 줄이거나 바꿀 수 있다.

- [ ] 1.1 iOS와 Android에서 token 복원 중 / `SessionProviderQuery` / `UniversalShellQuery` / `HomePageQuery` pending을
      나눠 잠금·복귀를 재현한다. 빌드·OS·AppState·operation·실패 종류·잠금 시간·반복 횟수·복구 결과를 기록한다.
      Android에서 재현되지 않으면 그 조건과 관측 결과를 남긴다.
- [ ] 1.2 확인한 실패 경계에서 초기 조회의 자동 복구 1회를 구현한다. 정상 성공·일반 요청·mutation·HTTP/GraphQL
      오류로 범위를 넓히지 않고, credential·프로필 선택·무관한 Store·내비게이션을 보존한다.
- [ ] 1.3 실제 transport와 Relay 실행 경로로 성공, 잠금 중 실패, 복귀 후 늦은 실패, 지속 실패 후 수동 재시도,
      중복·연속 복귀를 회귀 검증한다. 자동 재시도 횟수, 화면 출력, 실제 요청 수와 오류 전달을 확인한다.
- [ ] 1.4 actor·auth 전환 뒤 늦은 응답, 최초 token 복원 pending, 확인된 guest/인증 만료, root 수동 runtime 복구와
      route-local Store 보존을 검증한다. Web의 기존 동작도 회귀 확인한다.
- [ ] 1.5 iOS와 Android Native에서 수정 후 같은 단계·조건의 복구를 실행한다. 기존 정상 진입·데이터·프로필 격리와
      계속 오프라인일 때의 오류·수동 복구를 확인한다. 자동 테스트·시뮬레이터·에뮬레이터·실기기 증거를 구분한다.
- [ ] 1.6 실제 diff에 맞는 lint·typecheck·관련 자동 검증과 문서를 마무리하고 PR에 결과·제한을 남긴다. 사용한 하네스는
      가능하면 같은 구현 PR에서 `--skip-specs`로 archive하되, 그 정리를 제품 완료 조건으로 추가하지 않는다.

## Verification Evidence

- Result: 앱 동작 검증은 pending. 이 세션의 문서 윤문·계약 대조·strict validation은 통과했다.
- Checks: `openspec validate recover-native-startup-after-lock --strict`와 문서·metadata의 Prettier check 통과.
- Planned automated checks: `pnpm --filter @kosmo/app check`와 변경 경계의 transport·Session·actor·root·route 실제 동작 검증.
  기존 `network.test.ts`, `SessionProvider.test.ts`, `RelayActorProvider.test.ts`, `AppProviders.test.ts`,
  `RouteBoundary.test.ts`, `RouteBoundary.relay.test.ts`를 바탕으로 필요한 검증만 추가한다.
- Limits: 앱 테스트·CI·Native 실행은 이 Spec 세션에서 수행하지 않는다. mock AppState 테스트가 실제 잠금·네트워크
  중단을 증명한다고 기록하지 않는다. 원 제보의 빌드·OS와 별도 조건에서의 결과도 구분한다.

## Progress

- Status: Active
- Completed: 최신 main 코드·canonical·Linear 조사, 사용자 재시도 정책 확인, 전용 Stack 브랜치 확보, 계획 작성·윤문·문서 검증.
- Next: 다음 구현 세션에서 1.1의 Native 재현부터 시작한다. 앱 구현과 동작 검증은 아직 수행하지 않았다.
- Last updated: 2026-10-22
