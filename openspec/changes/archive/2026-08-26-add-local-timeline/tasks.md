## 1. PROD-649 Local Post List 계약

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `docs/design/local-timeline.md`
- `PROD-649`

**Deliverable**

Local 후보·제어와 Home/Local route·상태 계약이 canonical 및 구현 delta에 일관되게 기록된다.

**Guardrails**

- Profile Block/Mute의 결정은 Exclude로 기록하되 runtime 연결은 PROD-813/814 책임으로 유지한다.
- 기존 Home/Profile/Hashtag 후보 정책을 변경하지 않는다.

**Verification**

- 문서 link·format 검사와 OpenSpec strict validation을 통과시킨다.

- [x] 1.1 Local Post List와 Home/Local 화면 계약을 canonical 문서에 반영한다.
- [x] 1.2 proposal, delta specs, design, decisions와 tasks를 작성한다.
- [x] 1.3 OpenSpec strict validation을 통과시킨다.

## 2. PROD-649 Local timeline API

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `PROD-649`

**Deliverable**

selected Profile이 있는 인증 요청이 configured Local Instance의 Public Content Post와 Quote를 최대 20개 단위
Relay connection으로 조회한다.

**Guardrails**

- 원격 작성자, Public이 아닌 Post, Reply와 Content 없는 Repost를 limit 전에 제외한다.
- 현재 Post access 정책을 재사용하고 Block/Mute 임시 구현을 추가하지 않는다.
- DB migration과 새 dependency를 추가하지 않는다.

**Verification**

- candidate matrix, null auth, filter-before-limit, cursor pagination과 page 상한을 실제 DB 통합 검증으로 확인한다.
- GraphQL schema lint와 API type/check를 통과시킨다.

- [x] 2.1 Local 후보·권한·pagination 계약을 실패하는 API 통합 검증으로 먼저 고정한다.
- [x] 2.2 Local timeline GraphQL connection을 최소 구현하고 생성 schema를 갱신한다.
- [x] 2.3 focused API 통합 검증과 관련 schema/type 검사를 통과시킨다.

## 3. PROD-649 Home/Local 앱 화면

**Authority / Provenance**

- `docs/design/local-timeline.md`
- `docs/design/accessibility.md`
- `PROD-649`

**Deliverable**

사용자가 `/home`과 `/local`을 공통 상단 탭으로 전환하고 Local 목록을 refresh·pagination·복구할 수 있다.

**Guardrails**

- 기존 `Tabs`, `PostListItem`, Profile/Post detail route, actor/store 격리와 공통 pagination을 재사용한다.
- Local 전용 목록 primitive, client 후보 filter, 새 dependency와 중첩 ScrollView를 추가하지 않는다.
- 별도 Local primary navigation 항목을 추가하지 않는다.

**Verification**

- 탭 route·reselect와 Local state/pagination을 관찰 가능한 app 검증으로 확인한다.
- Relay compile, app type/check와 관련 unit 검증을 통과시킨다.

- [x] 3.1 Home/Local 탭의 route 전환과 selected Local refresh를 실패하는 검증으로 먼저 고정한다.
- [x] 3.2 `/home`과 `/local`에 공통 탭 및 Local Relay 목록·상태·pagination을 최소 구현한다.
- [x] 3.3 Relay artifact와 focused app 검증을 갱신하고 관련 type/check를 통과시킨다.

## 4. PROD-649 통합 검증과 완료 gate

**Authority / Provenance**

- `docs/domain/policies/post-list.md`
- `docs/design/local-timeline.md`
- `docs/design/accessibility.md`
- `PROD-649`

**Deliverable**

실제 route에서 Local 후보, 탭, 목록 상태, 상세 이동과 접근성이 통합되어 검증된다.

**Guardrails**

- 자동화와 실제 Web·Android·iOS runtime 증거를 구분한다.
- 현재 완료 기준은 배포·실행 가능한 Web Light이며, 인증된 Native runtime 미검증은 기록하되 완료·archive
  blocker로 사용하지 않는다.
- 전체 scope와 required validation 전에는 OpenSpec을 archive하지 않는다.

**Verification**

- 실제 DB fixture를 사용하는 targeted Web E2E와 390/1024/1440 browser QA를 수행한다. 현재 app-wide runtime이
  지원하는 Light를 검증하고, Dark가 전역에서 활성화되지 않은 경우 그 경계를 별도로 기록한다.
- Android/iOS 공용 route와 component를 유지하고, 인증된 Native runtime 증거가 없는 범위와 후속 검증 책임을
  기록한다.

- [x] 4.1 `/local` 후보·순서·탭·상태·Profile/Post 이동을 실제 Web E2E로 검증한다.
- [x] 4.2 지원 viewport와 현재 지원하는 Web Light 및 키보드·스크린리더 상태를 browser에서 검증한다.
- [x] 4.3 전체 검증 결과와 Native 미검증 위험을 정리하고 archive 준비 여부를 판정한다.
- [x] 4.4 Profile `PUBLIC` 기본값 저장부터 Composer·`createPost`·Local 재선택까지 production wiring을 실제
      Web E2E로 검증한다.

### 2026-08-25 검증 기록

- 실제 DB Web E2E: Local 후보·순서, `홈`/`로컬` keyboard 전환, selected Local 재선택 refresh, 빈 상태, 최초
  오류 retry, Profile/Post 이동과 20개 이후 pagination을 검증했다.
- Browser Light QA: 390px 모바일 header/bottom tabs, 1024px compact sidebar, 1440px full sidebar/right rail에서
  `/local`, selected `로컬` tab, Home primary active와 공용 상태의 접근성 tree를 확인했다.
- Dark: `app.config.ts`의 `userInterfaceStyle`과 `AppProviders`의 `ThemeProvider`가 Light로 고정되어 실제 Local Dark
  surface는 검증하지 못했다. Local 범위에서 전역 theme 기능을 추가하지 않으며 완료 blocker로 사용하지 않는다.
- Native: iOS 26.5 simulator와 Android AVD 설치는 확인했지만 실제 인증된 `/local` 화면은 실행하지 못했다. 공용
  route와 component는 유지하고, Native 전달·QA 재개 시점에 지원 범위와 후속 검증 책임을 다시 정한다.
- Production wiring: Settings에서 Profile 기본값을 `PUBLIC`으로 저장하고 Composer 초기값·`createPost` 입력·새
  `/local` Post 노출과 selected Local 재선택 뒤 재조회를 실제 DB Web E2E로 검증했다.
- Actor isolation: selected Profile 전환 뒤 새 `LocalPageQuery`가 새 Post와 cursor에 수렴함을 Web E2E로 확인했고,
  Relay actor 단위 검증에서 이전 Local connection·edge·cursor record가 새 Store에 없음을 확인했다.
- Archive readiness: **Yes**. 현재 지원하는 Web Light 검증과 production wiring·actor 격리 증거가 완료됐고,
  Dark·Native runtime 미검증은 위 경계대로 기록했으며 완료 blocker가 아니다.
