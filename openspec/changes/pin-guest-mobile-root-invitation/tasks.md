## Session Work

이 목록은 PROD-1232의 다음 구현 세션을 위한 메모다. 같은 결과를 더 작은 구현으로 충족할 수 있으면 이 목록을 수정할 수 있다.

- [ ] 1.1 `UniversalShell`에서 비로그인 모바일 Web의 정확한 `/` 조건에만 하단 탭과 탭용 여백을 제거하고, 안내를 닫은 뒤에도 같은 결과를 유지한다.
- [ ] 1.2 기존 방문자 안내 전체를 이 범위에서 하단 고정한다. 작은 viewport에서도 fixed를 유지하고 safe area를 포함한 실제 높이만 예약해 마지막 콘텐츠까지 접근하게 한다. 안내 닫힘·높이 변경 때 여백을 갱신한다.
- [ ] 1.3 기존 문구·닫기·`/login` 직접 인증·팀 소개·`/privacy`와 상단 메뉴를 보존한다. 다른 route·로그인 상태·데스크톱·Native의 기본 배치를 바꾸지 않는다.
- [ ] 1.4 `publicContentInvitationLayout.test.ts`, `UniversalShell.test.ts`, `PublicContentInvitation.test.ts`의 실행 결과로 배치·탭 가시성·높이·닫힘 전이를 검증한다. 필요한 mock은 실제 route·session·viewport 입력을 구분하게 한다.
- [ ] 1.5 `apps/web/e2e/auth-routes.e2e.ts`의 기존 모바일 탭 기대를 루트만 갱신한다. 직접 진입·새로고침·스크롤 전후 고정 위치·마지막 콘텐츠 접근·닫은 뒤 여백·상단 메뉴 인증 진입을 브라우저에서 검증한다.
- [ ] 1.6 `docs/design/public-content-onboarding.md`, `docs/design/breakpoints.md`, `docs/domain/policies/public-content-onboarding.md`에 이번 이슈의 결과와 루트 예외를 반영한다. 구현 세부는 코드·PR에 남긴다.

## Verification Evidence

- Result: pending. 구현·회귀 테스트 코드를 작성했다. 실행 결과는 최신 PR head의 GitHub CI에서 확인한다.
- Checks: 단위·component 검증은 `apps/app`의 기존 Node test 경로를, 브라우저 검증은 기존 Playwright auth-routes 경로를 사용한다. 구현 이후 해당 head의 GitHub CI와 focused runtime 결과를 기록한다.
- Matrix: `390×844`, `320×480`, `767px`·`768px` 경계, `1024px`·`1440px`, 0·양수 safe area, 줄바꿈·확대·reflow. guest 루트의 안내 표시·닫힘, 다른 공개 route, 인증·session error, iOS·Android 셸 입력을 구분한다.
- Limits: geometry와 스크롤·focus 가림은 브라우저 동작으로 검증한다. 소스 문자열 검색이나 renderer style assertion만으로 runtime 결과를 대신하지 않는다. Native mock 결과를 실제 기기 검증으로 보고하지 않는다.

## Progress

- Status: Active
- Completed: 모바일 guest 루트의 탭·탭용 공간 제거, 안내 전체 fixed·실측 여백, 기존 action 유지, 회귀 테스트와 canonical/design 문서 작성.
- Next: Test (App)·Web E2E·Lint의 최신 head 결과와 실제 safe area·확대/reflow 검증. 완료 후 필요하면 같은 구현 PR에서 `--skip-specs`로 세션 하네스를 archive한다. 이는 PR 완료 gate가 아니다.
- Last updated: 2026-10-27
