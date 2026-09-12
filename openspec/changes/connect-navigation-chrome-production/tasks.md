## 1. PROD-796 공용 navigation chrome 연결 계약

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/icons.md`
- `docs/design/accessibility.md`
- `DSN-41`, `PROD-796`

**Deliverable**

공용 Sidebar·BottomTab·SearchToolbar가 Production adapter에서 기존 시각 트리를 복제하지 않고 실제 link·focus·상태를 표현할 수 있다.

**Guardrails**

- 공용 presentation은 router·Relay·Session을 직접 소유하지 않는다.
- 현재 Production 소비자가 필요로 하지 않는 미래용 prop을 추가하지 않는다.
- 플랫폼별 interaction target, Light/Dark, reduced motion과 disabled·busy 접근성 상태를 유지한다.

**Verification**

- 공용 component test와 Tests story에서 기본 callback, render seam, selected·disabled·busy·error와 focus 동작을 검증한다.

- [x] 1.1 Production link와 logout 상태를 합성하는 최소 공용 presentation 계약을 구현한다.
- [x] 1.2 공용 Sidebar·BottomTab·SearchToolbar의 실행 기반 component test와 Tests story를 정렬한다.

## 2. PROD-796 Production shell과 현재 타임라인 재선택

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/local-timeline.md`
- `docs/design/page-header.md`
- `docs/design/accessibility.md`
- `PROD-475`, `PROD-610`, `PROD-649`, `PROD-796`

**Deliverable**

Production shell이 공용 Sidebar·BottomTab presentation을 사용하면서 기존 ProfileSwitcher·Relay·drawer·navigation·logout을 유지하고, Web의 active Home 진입점과 compact·full 브랜드 마크가 현재 Home 또는 Local을 재선택한다.

**Guardrails**

- 실제 Home link 대상 `/home`, modifier·새 탭, navigation guard와 primary scroll 기록을 유지한다.
- 재선택은 `/home`·`/local` 일반 활성화에만 적용한다. Home은 기존 진행 중 중복 요청 방지를 유지하고 Local은 기존 `RouteBoundary.refetch()`를 재사용한다.
- mobile Web·Android·iOS 브랜드 마크는 비상호작용 요소이며 Native 하단 navigation 재선택·scroll을 추가하지 않는다.
- logout pending·error·retry와 credential 보존 계약을 유지한다.

**Verification**

- NavigationLink·shell·Home·Local 관련 unit test에서 일반 활성화, guard, modifier·새 탭, Home 중복 재선택, Local 기존 refetch와 logout 상태를 검증한다.
- 실제 `Shell.stories.tsx`에서 full·compact·drawer·bottom과 Home/Local 상태를 검증한다.

- [x] 2.1 Production Sidebar·BottomTab adapter를 공용 presentation에 연결하고 기존 ProfileSwitcher·Relay·drawer 동작을 보존한다.
- [x] 2.2 Home·Local route와 Web 브랜드 마크를 현재 타임라인 재선택 lifecycle에 연결한다.
- [x] 2.3 기존 logout action·guard와 pending·error·retry 상태를 공용 Sidebar에 연결한다.
- [x] 2.4 shell·NavigationLink·Home·Local 실행 기반 test와 Production Shell story를 정렬한다.

## 3. PROD-796 Web 검색 route 연결

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-590`, `PROD-796`

**Deliverable**

Web `/search`가 공용 SearchToolbar를 표시하면서 기존 검색 query·tab·focus·drawer·history와 본문 상태를 유지한다.

**Guardrails**

- toolbar만 교체하고 최근 검색·결과·empty·analytics·scroll 소유권은 route에 유지한다.
- clear는 focus를 유지하고 검색 초기화 back은 focus를 해제하며 현재 tab을 유지한다.
- mobile Web drawer trigger와 edge swipe, Android/iOS 검색 header는 변경하지 않는다.

**Verification**

- 검색 route unit test와 실제 `Search.stories.tsx`에서 idle·focused·query result·clear·back·drawer 동작을 검증한다.

- [x] 3.1 Web 검색 route의 인라인 toolbar를 공용 SearchToolbar에 연결하고 query·focus·drawer lifecycle을 보존한다.
- [x] 3.2 검색 route 실행 기반 test와 Production Search story를 정렬한다.

## 4. PROD-796 통합 검증과 인벤토리 정렬

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/icons.md`
- `docs/design/page-header.md`
- `docs/design/local-timeline.md`
- `docs/design/accessibility.md`
- `PROD-796`

**Deliverable**

Production navigation chrome의 문서·Storybook·코드가 같은 계약을 나타내고 Web 반응형·테마 검증과 독립 구현 리뷰를 통과한다.

**Guardrails**

- Android/iOS 실제 runtime을 실행하지 않았다면 완료로 보고하지 않는다.
- API·GraphQL·database·dependency와 화면별 override를 추가하지 않는다.

**Verification**

- OpenSpec strict validation, app check, 관련 unit·Storybook test와 `git diff --check`를 통과시킨다.
- 390·1024·1440 Web의 Light/Dark에서 Sidebar·BottomTab·SearchToolbar geometry와 상호작용을 브라우저로 확인한다.
- 독립 구현 리뷰에서 발견한 유효한 회귀를 반영하고 남은 검증 공백을 기록한다.

- [x] 4.1 Storybook·디자인 인벤토리를 Production 연결 결과와 정렬한다.
- [x] 4.2 OpenSpec·typecheck·관련 unit·Storybook 검증을 통과시킨다.
- [x] 4.3 반응형 Light/Dark 브라우저 QA와 독립 구현 리뷰를 완료한다.
- [x] 4.4 full·drawer Sidebar utility의 chevron·nested inset·footer geometry 계약과 compact rail 범위를 정렬한다.
- [x] 4.5 `/settings` full·drawer disclosure 고정과 compact ActionMenu Link 행 geometry를 Figma·문서·코드·검증에서 정렬한다.
- [x] 4.6 full·drawer ProfileSwitcher와 navigation 행의 `space/24` 왼쪽 기준선을 맞추고, 실제 Production Shell story에서 정렬·긴 이름·picker 위치와 focus 회귀를 검증한다.
- [x] 4.7 사용자 승인 로컬 검토안으로 full·drawer 행의 바깥 여백을 `space/16`으로 줄여 leading content를 프로필의 `space/24`에 맞추고, 넓어진 행·좁은 drawer·기존 상호작용을 검증한다.
- [x] 4.8 Profile Avatar의 `28px` 크기를 유지하며 다른 navigation 아이콘과 가로 중심선 및 full·drawer label 시작점을 맞추고, 기존 Tests story와 Production 미리보기에서 검증한다.
- [x] 4.9 승인된 행 확장·Avatar 정렬을 Figma source와 디자인 문서에 동기화하고, 변형·기존 소비처의 상속을 검증한다.

**4.6 검증 기록 (2026-09-12, 행 확장 전)**

- 최종 static Storybook에서 full Light/Dark·drawer의 `24px` 정렬을 확인했다. Drawer와 full picker interaction은 통과했고, picker 위치·Tab 이동·dismiss focus를 유지했다. 긴 이름은 직접 렌더 실측으로 편집 버튼과 `10px` 간격, 프로필 높이 `260px`를 확인했다.
- 관련 unit test 6개, Storybook build, OpenSpec strict validation, Prettier와 `git diff --check`를 통과했고 독립 리뷰에서 발견 사항은 없었다.
- 전체 검증 통과를 뜻하지 않는다. Full story는 새 정렬 assertion 이후 기존 utility 너비 assertion에서 `209/224px` 불일치로 실패했고, 긴 이름 story는 초기 Suspense 조회 경쟁으로 자동 play가 실패했다. app typecheck는 변경하지 않은 `SettingsLinkRow.test.ts:92`, Storybook Vitest는 dependency import에서 막혔다. Native 실제 runtime은 미검증이다.

**4.7 검증 기록 (2026-09-12)**

- 최종 static build의 공용 Full·Drawer·Narrow Drawer·Compact interaction과 Production Full·Drawer 정렬 play 6종이 통과했다. 공용 가용 폭 `320px`의 행은 `288×45px`, `272px` narrow drawer의 행은 `240×45px`다.
- Production Full Light/Dark에서 배경 시작 `16px`, 프로필·leading icon 시작 `24px`, 행 높이 `45px`를 직접 확인했다. 현재 스크롤바가 있는 미리보기의 실제 행 폭은 `257px`에서 `273px`로 늘었다. 프로필 높이·편집 버튼 geometry와 기존 keyboard·disclosure는 유지했다.
- 4.6의 Full story 실패를 일으켰던 가변 폭의 절대 chevron x assertion은 제거하고 실제 계약인 icon 폭 `24px`·우측 inset `24px` 검증을 유지했다. 고정 폭 공용 story는 변경된 정확한 행 폭과 chevron 위치도 검증한다.
- 관련 unit 6개, Storybook build, Prettier, OpenSpec strict validation과 `git diff --check`를 통과했고 독립 리뷰에서 발견 사항은 없었다. 전체 typecheck·Storybook Vitest 환경 공백과 Native 미검증은 남아 있다. Figma·Linear 원본이나 GitHub 상태는 변경하지 않았다.

**4.8 검증 기록 (2026-09-12)**

- 공통 icon slot의 너비만 `20px`로 고정하고 수평 중앙 정렬했다. Avatar의 `28×28px` 크기, 행 target·높이, 세로 정렬과 navigation lifecycle은 유지한다.
- 최종 static build에서 공용 Full·Compact geometry, Full·Drawer·Compact interaction, Production Full·Drawer의 play 7종이 통과했다. 추가한 geometry assertion은 Avatar 크기·아이콘과의 가로 중심선·Full/Drawer label 시작점을 실제 렌더 결과로 비교한다.
- Production Full·Drawer에서 Avatar와 일반 아이콘의 가로 중심은 동일하고 label 시작점도 일치했다. Full Light/Dark 시각·실측에서 Avatar가 잘리지 않는 것을 확인했다.
- 관련 unit 6개, Storybook build, Prettier, OpenSpec strict validation과 `git diff --check`를 통과했고 독립 리뷰에서 발견 사항은 없었다. 기존 전체 typecheck·Storybook Vitest 환경 공백은 이번에 재실행하지 않았으며 Native 실제 runtime은 미검증이다. 외부 정본·GitHub 상태는 변경하지 않았다.

**4.9 Figma 정본 동기화 기록 (2026-09-12)**

- 사용자 후속 승인으로 `SidebarNavigationItem` (`3124:5162`)의 Expanded 9개 변형에 가운데 정렬 `20px` icon slot과 `288×45px` target을 적용했다. Pressed의 outer target과 98% visual을 유지했다. 내부 primary (`3127:22669`)와 utility (`3253:6279`)의 Expanded source 폭·fill을 맞추고 utility의 `24px` trailing inset과 `32px` nested inset을 유지했다.
- `SidebarNavigation` (`1918:2655`)의 Full·Drawer 34개 변형은 기존 `space/16`에 바깥 여백을 binding했다. Available 27개 변형은 기존 Avatar Size=28 (`2118:254`)을 재사용한다. Expanded는 `20px` 슬롯 안에서 Avatar가 좌우 `4px`씩 확장되고, Compact는 기존 중앙 정렬을 사용한다. 원본 크기를 유지하도록 Avatar 인스턴스의 가로·세로 sizing을 Hug로 설정했다.
- 51개 변형 readback에서 가로·세로 중심과 label 정렬 불일치가 없었다. Full·Drawer는 일반 아이콘과 Avatar 중심 `x=34`, label 시작 `x=60`, 행 폭 `288px`; Compact는 중심 `x=40`, target `44px`다. Available Avatar는 모두 `28×28px`, Unavailable의 기존 UserRound는 `20×20px`로 유지됐다.
- Full·Compact·Drawer source와 기존 Dark 소비처의 screenshot을 확인했다. 기존 Light/Dark 소비처 3개의 source 상속도 readback으로 확인했으며 개별 소비처를 수정하거나 detach하지 않았다. ProfileSwitcher·색상 token·공개 속성·variant 축은 변경하지 않았다.
- Figma Unavailable 변형의 기존 Rest interaction 모델은 이번 geometry 변경에서 유지했다. 코드의 disabled fallback 계약에 대한 Figma 상태 모델 정렬은 별도 범위이며, Linear의 기존 기록도 이번에 수정하지 않았다. Native 실제 runtime 미검증과 4.8의 전체 typecheck·Storybook Vitest 환경 공백은 남아 있다. OpenSpec 전체 완료·archive와 PR merge는 별도다.
