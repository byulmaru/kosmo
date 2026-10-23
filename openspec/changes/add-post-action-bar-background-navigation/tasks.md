이 체크리스트는 다음 구현 세션의 working note다. 현재 사용자 요청과 canonical·Linear를 다시 확인하고, 불필요해진 구현 항목은 줄일 수 있다.

## Session Work

- [x] 1.1 PostListItem의 일반 Post·Quote·순수 Repost와 상세 route의 현재 행에서 올바른 상세 callback을 Action Bar까지 전달한다. 타래 조상·하위 행과 기존 Reply·social action 대상은 유지한다.
- [x] 1.2 상단 내부 여백·toolbar·trailing group·control slot의 비버튼 배경에 이동과 Web pointer를 연결한다. count와 확장 target, disabled/pending 버튼, 메뉴·CW·미디어·본문 링크 입력을 분리한다.
- [ ] 1.3 실제 렌더된 surface의 여백 좌표로 목적지·단일 이동을 검증하는 회귀 테스트를 추가한다. 버튼별 action과 navigation의 동시 실행, 차단 입력 우회, 드래그·영역 이탈·스크롤 취소를 확인한다.
- [ ] 1.4 공용 UI 변경 시 iOS·Android의 실제 target, 기존 버튼 입력과 스크롤 양보를 runtime에서 확인하고 JS renderer·simulator/emulator·실기기 증거를 구분한다. 실행하지 못한 항목은 미검증으로 남긴다.
- [x] 1.5 새 상호작용을 `docs/design/post-action-bar.md`와 `docs/design/post-thread.md`에 반영한다. Reaction Summary·작성자 여백·기존 cursor 점검의 범위는 확대하지 않는다.
- [ ] 1.6 담당 코드·문서와 회귀 테스트를 검증하고 PR head별 CI, 화면·플랫폼·입력 방식·빌드 head와 남은 runtime 확인을 기록한다. 다음 Test phase에서는 GitHub CI를 사용한다.

## Verification Evidence

- Result: 구현·문서·회귀 테스트 코드 작성 완료. 런타임과 CI 결과는 pending이며 체크리스트 완료로 대신하지 않는다.
- Checks: 기존 `PostActionControl.test.ts`, `PostActionBar.test.ts`, `PostDetailBackground.test.ts`, `postDetailBackgroundResponder.test.ts`, `PostListItem.native.test.ts`의 실행 경계와 `Posts.stories.tsx`의 navigation fixture를 조사했다.
- Plan: `pnpm --filter @kosmo/app check`, 변경 경계의 focused unit·Storybook 테스트, 표준 lint·Prettier를 적용한다. GitHub CI의 `Test (App)`은 `pnpm --filter @kosmo/app test`로 check·unit·Storybook을 실행한다. 추가가 필요한 시나리오가 자동화 대상에 실제 포함되는지도 확인한다.
- Coordinate checks: 실제 button rectangle 밖의 아이콘 사이·slot 빈 부분·상단 padding을 측정한다. 각 입력은 기대 상세 요청 1회 또는 기존 action만 실행해야 하며, drag·outside release·scroll·disabled/pending target은 상세 요청 0회여야 한다.
- Limits: 이번 Spec 세션은 제품 코드·테스트 코드를 변경하거나 앱 테스트·브라우저·Native runtime을 실행하지 않았다.

## Progress

- Status: Implement source checkpoint; Test pending
- Completed: 행별 callback, 비버튼 host responder·Web pointer, disabled target 보호, 디자인 문서와 좌표 기반 Storybook 6개·Native JS renderer 회귀 코드 작성. 변경 파일 ESLint와 Prettier 검사, actual diff 점검.
- Next: 공식 Stack으로 push·Draft PR을 전달한 뒤 최신 head의 GitHub CI에서 Test (App)·Lint를 검증한다. Web 좌표 테스트와 Native JS renderer는 아직 실행하지 않았으며 iOS·Android simulator/emulator·실기기 버튼/스크롤·AT 검증도 미실행이다.
- Last updated: 2026-10-22
