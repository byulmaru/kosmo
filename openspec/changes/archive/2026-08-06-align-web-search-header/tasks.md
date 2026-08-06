## 1. PROD-590 검색 헤더 계약 정렬

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`

**Deliverable**

PageHeader·breakpoint canonical 문서와 OpenSpec이 Web 검색 상단바의 geometry, 소유권, 상태별 leading action과 플랫폼 경계를 같은 계약으로 설명한다.

**Guardrails**

- 모든 Web breakpoint의 `64px` 도구막대와 `56px` 입력을 명시한다.
- 모바일 Web의 단일 route-owned 검색 상단바와 shell-owned drawer·edge swipe 경계를 유지한다.
- Android/iOS 검색 헤더를 현재 변경 범위에 포함하지 않는다.

**Verification**

- PROD-590의 포함·제외 범위와 canonical/OpenSpec 문구를 대조한다.
- active change를 strict mode로 검증한다.

- [x] 1.1 PageHeader와 breakpoint canonical 문서를 승인된 PROD-590 계약으로 정렬한다.
- [x] 1.2 OpenSpec requirement·scenario·decision이 canonical 문서와 Linear 범위를 벗어나지 않는지 확인하고 strict validation을 통과시킨다.

## 2. PROD-590 Web 검색 상단바 구현

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`

**Deliverable**

Web `/search`가 모든 breakpoint에서 중앙 컬럼 최상단의 `64px` 도구막대와 `56px` 입력을 사용하고, 모바일 Web에서는 검색 상태에 맞는 단일 leading action으로 drawer 또는 검색 초기화를 실행한다.

**Guardrails**

- 검색 route가 도구막대와 `q`·`tab`·포커스·검색 phase를 소유하고 셸은 drawer state·Modal·edge swipe를 소유한다.
- 입력 내부 지우기는 포커스를 유지하고 검색 초기화 뒤로가기는 현재 `tab`을 유지한 채 입력·`q`를 비우고 blur한다.
- browser history를 검색 초기화 수단으로 직접 이동하지 않고 query-only 위치·포커스와 deep link 계약을 유지한다.
- 공용 `PageHeader`, 검색 API·결과·랭킹·필터, sidebar/right rail, Android/iOS 검색 헤더와 외부 의존성을 변경하지 않는다.

**Verification**

- 최초·입력·결과 상태에서 도구막대 높이와 본문 시작 위치가 안정적인지 확인한다.
- 모바일 drawer button과 edge swipe, clear/back focus와 `q`·`tab`·history 동작을 확인한다.

- [x] 2.1 기존 shell-to-route 경계로 검색 route의 모바일 drawer trigger가 셸 소유 drawer를 열고, `/search`에서 모바일 Web 셸 헤더가 중복되지 않게 한다.
- [x] 2.2 검색 도구막대와 아래 상태 콘텐츠의 여백을 분리해 모든 Web breakpoint의 `64px`/`56px` geometry를 구현한다.
- [x] 2.3 최초·입력·결과 leading action과 기존 clear·back·query navigation 동작을 승인 계약대로 유지한다.

## 3. PROD-590 회귀 검증

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`

**Deliverable**

검색 상단바 변경이 target viewport의 geometry와 검색·drawer 상호작용을 만족하며 관련 앱 정적 검증과 테스트를 통과한다.

**Guardrails**

- 테스트 코드 범위: 모바일 Web `/search`의 shell header 소유권 단위 테스트와 기존 검색 Web E2E의 geometry·leading·drawer·focus 회귀 assertion.
- 테스트 필요성: `390px`·`900px`·`1400px`의 `64px`/`56px` geometry, 모바일 중복 헤더 제거, drawer button·edge swipe, clear/back focus와 `tab` 유지가 승인 동작을 직접 증명해야 한다.
- 테스트 제외 범위: 관련 없는 coverage 확대, 중복 viewport 조합, 새 fixture·helper·harness, 광범위한 snapshot·Storybook interaction test와 테스트 인프라 변경.

**Verification**

- 변경 동작을 직접 다루는 unit·Web E2E, 앱 TypeScript·lint/format 검증을 실행한다.
- 실제 Web runtime에서 세 target viewport의 layout과 모바일 edge swipe를 확인하고 자동화 증거와 구분해 기록한다.

- [x] 3.1 모바일 Web `/search`의 route-owned header 예외와 다른 route·platform 분류 보존을 최소 단위 테스트로 검증한다.
- [x] 3.2 기존 검색 Web E2E에 세 target viewport geometry, 모바일 hamburger/back 전환, drawer와 clear/back focus·`tab` 보존의 최소 회귀 검증을 추가한다.
- [x] 3.3 관련 unit·Web E2E와 앱 정적 검증을 실행하고 실제 Web runtime의 geometry·edge swipe 결과를 기록한다.

## 4. PROD-590 통합 완료와 archive

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`

**Deliverable**

PROD-590의 전체 구현·검증 증거가 갖춰진 경우 이 변경의 canonical spec을 동기화하고 OpenSpec change를 archive한다.

**Guardrails**

- 이 issue와 구현 PR이 전체 change의 구현·통합 검증·archive 책임을 소유한다.
- target viewport geometry, 검색 동작과 모바일 drawer runtime gate 중 하나라도 미확인인 동안 change를 archive하지 않는다.
- PR Ready 전환, Linear 상태 변경과 merge는 별도 승인 없이 수행하지 않는다.

**Verification**

- archive 전 전체 task와 검증 증거를 대조한다.
- archive 후 canonical sync, strict validation과 formatting/diff를 다시 확인한다.

- [x] 4.1 독립 구현 리뷰와 남은 runtime gate를 포함해 PROD-590 전체 완료 조건을 대조한다.
- [x] 4.2 전체 완료 조건이 충족된 경우 canonical `web-app-shell` spec을 동기화하고 change를 archive한 뒤 strict validation을 다시 통과시킨다.
