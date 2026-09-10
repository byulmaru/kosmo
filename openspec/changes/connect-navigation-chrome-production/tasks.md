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

- [ ] 1.1 Production link와 logout 상태를 합성하는 최소 공용 presentation 계약을 구현한다.
- [ ] 1.2 공용 Sidebar·BottomTab·SearchToolbar의 실행 기반 component test와 Tests story를 정렬한다.

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
- 재선택은 `/home`·`/local` 일반 활성화에만 적용하고 진행 중 추가 network 요청을 만들지 않는다.
- mobile Web·Android·iOS 브랜드 마크는 비상호작용 요소이며 Native 하단 navigation 재선택·scroll을 추가하지 않는다.
- logout pending·error·retry와 credential 보존 계약을 유지한다.

**Verification**

- NavigationLink·shell·Home·Local 관련 unit test에서 일반 활성화, guard, modifier·새 탭, 중복 재선택과 logout 상태를 검증한다.
- 실제 `Shell.stories.tsx`에서 full·compact·drawer·bottom과 Home/Local 상태를 검증한다.

- [ ] 2.1 Production Sidebar·BottomTab adapter를 공용 presentation에 연결하고 기존 ProfileSwitcher·Relay·drawer 동작을 보존한다.
- [ ] 2.2 Home·Local route와 Web 브랜드 마크를 현재 타임라인 재선택 lifecycle에 연결한다.
- [ ] 2.3 기존 logout action·guard와 pending·error·retry 상태를 공용 Sidebar에 연결한다.
- [ ] 2.4 shell·NavigationLink·Home·Local 실행 기반 test와 Production Shell story를 정렬한다.

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

- [ ] 3.1 Web 검색 route의 인라인 toolbar를 공용 SearchToolbar에 연결하고 query·focus·drawer lifecycle을 보존한다.
- [ ] 3.2 검색 route 실행 기반 test와 Production Search story를 정렬한다.

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

- [ ] 4.1 Storybook·디자인 인벤토리를 Production 연결 결과와 정렬한다.
- [ ] 4.2 OpenSpec·typecheck·관련 unit·Storybook 검증을 통과시킨다.
- [ ] 4.3 반응형 Light/Dark 브라우저 QA와 독립 구현 리뷰를 완료한다.
