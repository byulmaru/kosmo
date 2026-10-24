## Session Work

- [ ] 1.1 `apps/api/src/graphql/resolvers/profile/mutation/create.ts`의 신규 Local Profile 기본값을 `PUBLIC`으로 변경한다. 첫 생성과 추가 생성의 기존 검증·transaction·Owner Membership을 보존한다.
- [ ] 1.2 `apps/app/src/components/onboarding/firstProfileOnboardingState.ts`의 초기값을 `PUBLIC`으로 맞춘다. 기존 ‘전체 공개’ 선택지·단계별 저장·생략·바로 시작·실제 저장값 요약을 유지한다.
- [ ] 1.3 API integration에서 실제 첫·추가 생성 mutation의 저장값과 `private.defaultPostVisibility`가 `PUBLIC`인지 확인한다. 기존 테스트 중 생성 성공을 확인하는 기대값만 맞추고, 과거 저장값·null·Remote·권한 fixture는 유지한다.
- [ ] 1.4 온보딩 state·route 실행에서 초기 선택과 기본 저장을 검증한다. 다른 범위 저장, 게시 설정에서 바꾼 뒤 생략, 첫 단계와 생성 후 `바로 시작`이 실제 저장값을 따르는지도 검증한다.
- [ ] 1.5 `apps/web/e2e/first-profile-onboarding.e2e.ts`에서 생성·일반 진행·게시 설정 생략·바로 시작의 DB 결과를 확인하고, 완료 후 새 일반 Composer의 공개 범위를 확인한다. Storybook에서 초기 선택을 나타내는 fixture가 있으면 같은 의미로 맞춘다.
- [ ] 1.6 기존 Composer·프로필 설정 검증에서 저장된 다른 기본값·`UNLISTED` 대체 처리·열린 초안·글별 선택·답글의 더 좁은 초기값·자동 승인 `OPEN`이 유지되는지 확인한다.
- [ ] 1.7 실제 변경 범위에 맞는 API·앱·Web E2E 필수 CI와 타입·표준 문서 검증을 확인한다. Web·iOS·Android·운영 적용 증거를 구분해 구현 PR과 handoff에 기록한다.

## Verification Evidence

- Result: 구현과 행동 테스트 코드를 작성했다. 제품 동작 검증은 GitHub CI 결과를 확인하기 전까지 pending이다.
- Checks: 변경 문서의 윤문·계약/구조 대조·OpenSpec strict validation·Prettier·`git diff --check` 결과를 handoff에 기록한다. 체크박스는 관련 CI 검증이 끝난 뒤 완료로 바꾼다.
- Limits: API integration·앱 테스트·Storybook·Web E2E·CI·iOS·Android runtime·배포와 운영 DB는 미검증이다.
- Migration: 기존 nullable column을 유지하며 schema 변경·SQL migration·backfill은 필요하지 않다. 구현 중 실제 필요성이 드러나면 canonical·Linear 범위를 다시 확인한다.

## Progress

- Status: Active
- Completed: 생성 기본값과 온보딩 초기 선택 변경, API integration·온보딩 state/route·Web E2E 테스트 코드 작성, canonical·디자인 문서 동기화.
- Next: Draft PR을 전달한 뒤 Test 세션에서 1.1~1.7의 CI 결과와 남은 검증을 확인한다.
- Last updated: 2026-10-24
