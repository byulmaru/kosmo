## Session Work

PROD-1199의 구현·검증 작업 목록이다. 구현과 회귀 테스트 코드를 작성했으며 실행 검증은 Test 단계의 GitHub CI에서 확인한다. 체크박스는 필요한 검증까지 확인한 뒤 갱신한다. 필요 없어진 구현 단계는 줄일 수 있다.

- [ ] 1.1 현재 Linear·canonical과 branch/HEAD를 다시 확인하고 공개 조회·로고 변경을 관련 정책·디자인 문서에 반영한다. 공개 첫 화면과 인증 `/local`·Native의 기존 흐름을 구분한다.
- [ ] 1.2 기존 Local query에서 guest의 첫/다음 조회를 허용한다. 후보·정렬·cursor·페이지 상한·기존 접근 필터와 Home·참여 mutation 권한은 유지한다.
- [ ] 1.3 GraphQL 실행 테스트로 guest와 유효 Session/no-profile을 구분하고, 포함·제외 후보·페이지 경계·비가시 원문 Quote·참여 거부를 확인한다. 기존 actor별 mute/block와 선택 Profile 회귀도 확인한다.
- [ ] 1.4 Web confirmed guest `/`에 공용 공개 셸과 기존 Local 목록·상태 처리를 연결한다. valid redirect·Profile 준비·Native Welcome·보호 route와 Relay actor 경계는 유지한다.
- [ ] 1.5 공용 guest intro의 두 문구를 기존 full 로고로 교체한다. 세 페이지의 full·drawer에서 공유하고 compact 구성·가입·로그인·하단 CTA·접근성을 유지한다.
- [ ] 1.6 실제 컴포넌트·Relay 동작으로 guest 첫 조회·pagination·refresh 실패와 재시도, Session error 구분, actor 전환, 공통 방문자 UI와 CTA 닫힘 상태 유지를 검증한다. 기존 인증 Local·Home·Profile 준비·Native 로그인 분기도 확인한다.
- [ ] 1.7 Web E2E와 runtime에서 cookie 없는 `/` 직접 진입·새로고침·다음 페이지·Profile/Post 이동·참여 인증 진입을 확인한다. full·compact·mobile의 로고·drawer·keyboard·focus·CTA 가림과 닫힘을 확인한다.
- [ ] 1.8 변경된 schema·Relay 산출물과 관련 package 검증을 정렬하고 실제 검증 결과·미확인 환경을 PR에 남긴다. 같은 전달 범위 안의 실패를 고친 뒤 다음 검증 세션에 인계한다.

## Verification Evidence

- Result: pending. Implement에서 공개 Local 조회, Web 첫 화면과 공통 로고, 관련 문서와 회귀 테스트 코드를 작성했다. 동작 테스트는 실행하지 않았다.
- Checks: 아래 검증 경로는 최신 PR head의 GitHub CI에서 확인한다. 이전 성공 결과를 새 변경의 증거로 사용하지 않는다.

| 검증 경로                                                             | 입력과 기대 결과                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API integration: `apps/api/tests/integration/graphql/profile.test.ts` | guest/no-profile의 기존 일괄 null 기대를 상태별로 갱신한다. PUBLIC 일반·Quote만 포함하고 UNLISTED/FOLLOWERS/DIRECT·Remote·Reply·순수 Repost·unavailable 후보를 제외한다. 첫/다음/마지막·빈 페이지, ID 순서·20개 상한을 확인한다.                                 |
| API 권한·관계 회귀                                                    | 비가시/삭제 Source의 PUBLIC Quote는 자체 Content를 유지하고 원문은 숨긴다. guest Home·참여 mutation의 기존 거부와 DB 미변경, 인증 actor별 mute/block·selected Profile 경계를 확인한다.                                                                           |
| App unit·Relay                                                        | `app-index.test.ts`, `UniversalShell.test.ts`, Sidebar 테스트와 `TimelineRefresh.relay.test.ts`를 확장한다. confirmed guest·valid/no-profile·Session error, 실제 UI/Store·edge/cursor·재시도 결과를 관찰한다.                                                    |
| Storybook·Web runtime                                                 | 기존 Local/PublicContentInvitation/Sidebar 검증 기반에 guest 조합을 추가한다. 390/1024/1440 폭과 320px·zoom/reflow, 로고 이름, 독립 인증 action, drawer 닫기·focus 복귀와 CTA가 콘텐츠를 가리지 않는지 확인한다.                                                 |
| Web E2E                                                               | `apps/web/e2e/timelines.e2e.ts` 및 공개 온보딩 E2E 기반에서 guest 첫/다음 조회와 세 route 탐색, 참여 시 인증 진입·mutation 미실행을 확인한다.                                                                                                                    |
| 기존 검증 entrypoint                                                  | `pnpm --filter @kosmo/api test`, `pnpm --filter @kosmo/app test`, `pnpm test:e2e`와 `.github/workflows/test.yml`의 API/App/Web E2E 경로를 변경 범위에 맞게 사용한다. 구현 세션은 필요한 테스트 코드를 포함하고 Test phase는 최신 PR head의 GitHub CI를 확인한다. |

- Limits: 현재 실행 결과, 운영 비용, 배포·실기기·보조 기술 결과는 없다. 소스 검사·문서 strict validation은 이 동작 검증을 대신하지 않는다.

## Progress

- Status: Active
- Completed: 현재 Linear·canonical 대조, API·Web 구현, 정책·디자인 문서 정렬, API·컴포넌트·Relay·Storybook·Web E2E 회귀 테스트 코드 작성. 소스 교차 검토와 Relay compiler 확인.
- Next: Test 단계에서 최신 PR head의 Test·Lint 결과와 수동 검증 공백을 확인한다. 실행 전인 위 체크박스는 유지한다.
- Last updated: 2026-10-23
