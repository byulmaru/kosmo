## Context

이 결정 기록은 `docs/design/breakpoints.md`와 최신 Linear `PROD-619`가 확정한 주요 Web route scroll 정책,
`PROD-219`의 document scroll 소유권, `PROD-610`의 홈 재선택 경계와 `PROD-617`의 통합 검증 책임을 반영한다.
Expo Router 셸의 현재 `GuardedLink`·`usePathname` 실행 흐름과 `web-app-shell` delta를 기준으로 구현자가 반드시
보존할 분류와 lifecycle을 기록한다.

## Decision Records

### 서로 다른 주요 Web route의 실제 forward navigation만 최상단으로 초기화한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-619`; document scroll 전제 `PROD-219`
- Status: Active
- Context / Problem: Pathname이 바뀐다는 사실만으로는 shell 주요 navigation, browser history traversal과 다른
  route 진입을 구분할 수 없고, source route에서 너무 일찍 scroll하면 이동 전 화면이 튄다.
- Decision Outcome: Web 하단 탭, mobile drawer, compact 아이콘 레일과 full sidebar가 현재와 다른 주요 target으로
  실제 forward navigation을 실행하고 target pathname이 반영된 뒤 document top으로 초기화한다.
- Alternatives Considered: Expo Router/browser 기본 동작에 계속 맡기는 방식은 재현된 offset 잔류를 해결하지 못해
  제외한다. 모든 pathname 변화 또는 모든 Link를 초기화하는 방식은 승인 범위보다 넓어 제외한다.
- Consequences: Shell navigation source와 target route commit 사이의 의도를 연결해야 하며, loading·empty 상태와
  연속 navigation의 마지막 target에도 같은 결과가 적용된다.
- Confirmation / Follow-up: mobile bottom tab/drawer와 compact/full sidebar의 targeted component·browser 검증으로
  target pathname 반영 뒤 `window.scrollY`가 top인지 확인한다.

### History·query-only·reselection·Native 경계를 유지한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-619`, `PROD-610`
- Status: Active
- Context / Problem: 주요 route reset이 browser history restoration, 검색 입력 흐름, 현재 홈 재선택 refetch 또는
  Native `ScrollView`까지 확장되면 별도 소유 계약을 침범한다.
- Decision Outcome: Browser back/forward에는 top reset을 강제하지 않고 search query-only 이동의 document
  scroll·focus를 보존한다. 현재 pathname 재선택에는 이 change의 reset/refetch를 적용하지 않으며 현재 홈
  재선택은 `PROD-610`에 남긴다. Android/iOS navigation scroll은 변경하지 않는다.
- Alternatives Considered: `history.scrollRestoration`을 manual로 전환하는 방식, query 변경도 reset하는 방식,
  모든 현재 tab 재선택을 홈과 같이 처리하는 방식은 각각 current browser/search/PROD-610 계약을 위반해 제외한다.
- Consequences: 구현은 forward primary navigation을 명시적으로 분류해야 하고 pathname-only effect나 전역
  history 설정을 사용할 수 없다. Relay refetch를 이 change에 추가할 수 없다.
- Confirmation / Follow-up: Browser back/forward의 restored position, search query-only scroll·focus, current route
  reselect 무동작과 Native no-op을 각각 검증한다.

### 실제 navigation intent와 target pathname commit을 짝짓는다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-619`; navigation guard 계약을 포함한 현재
  `apps/app/src/components/shell` 실행 흐름
- Status: Active
- Context / Problem: `GuardedLink`는 무guard 기본 `Link`와 guard 승인 뒤 imperative navigation 두 경로를 가지며,
  press 시점 marker나 pathname-only effect는 취소된 navigation과 history traversal을 잘못 reset할 수 있다.
- Decision Outcome: Shell 주요 navigation이 실제 action을 실행할 때 current와 다른 target pathname intent를
  기록하고, shell이 commit된 pathname과 일치할 때 Web document top reset을 한 번 소비한다. 연속 intent는 최신
  token/target만 유효하게 하고 이전 지연 callback을 취소한다. 내부 helper·파일명·state 소유 형태는 고정하지 않는다.
- Alternatives Considered: 모든 pathname 변화 effect는 history를 구분하지 못해 제외한다. `popstate`만 별도로
  감시해 skip하는 방식은 Expo Router 내부 navigation과 source 분류가 분산돼 기본안에서 제외한다. Route별 reset
  복제는 surface 정책이 갈라져 제외한다.
- Consequences: Guard가 navigation을 허용한 시점과 marker 생성 시점이 같아야 한다. Browser frame이 필요하면
  target/token을 재확인하고 취소 가능해야 하며 smooth scroll은 사용하지 않는다.
- Confirmation / Follow-up: 무guard·guard 승인·guard 취소, 연속 target 교체와 stale callback 취소를 가까운
  component test로 고정하고 실제 browser timing을 E2E로 확인한다.

### PROD-619가 change 완료와 archive를 소유한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-619`, `PROD-617`; `memory/issue-openspec-workflow.md`
- Status: Active
- Context / Problem: Parent integration issue의 완료를 기다릴지, 독립 하위 issue가 자신의 행동 계약을 언제
  archive할지 명시하지 않으면 active delta의 완료 책임이 모호해진다.
- Decision Outcome: PROD-619 구현 PR이 이 change의 구현, 개별 verification, delta 정합성과 전체 task 완료를
  증명하면 PROD-619 담당자가 archive한다. PROD-617은 다섯 하위 issue 결과의 이후 mobile Web 통합 검증만 소유한다.
- Alternatives Considered: PROD-617 완료까지 active change를 유지하는 방식은 PROD-619와 독립 sibling의
  lifecycle을 불필요하게 결합해 제외한다. Archive-only issue/PR을 추가하는 방식도 별도 결과가 없어 제외한다.
- Consequences: PROD-619의 targeted verification은 parent 통합 검증을 대체하지 않지만, parent 미완료가 이
  change archive를 막지는 않는다.
- Confirmation / Follow-up: 구현·테스트 handoff에 archive owner와 PROD-617로 전달할 evidence를 명시한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Legacy `add-web-app-shell-sticky-rails`의 SvelteKit/browser 기본 path-changing navigation 의존은 Expo Router
  migration과 최신 `docs/design/breakpoints.md`·`PROD-619` 계약으로 더 이상 current 구현 선택이 아니다. 이
  change의 “서로 다른 주요 Web route의 실제 forward navigation만 최상단으로 초기화한다” 결정이 현재 Expo
  Router 셸의 적용 기준을 대신한다. Document/window scroll 소유권과 history restoration 보존 자체는 유지한다.
