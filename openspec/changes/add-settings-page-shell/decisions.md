## Context

이 기록은 PROD-653에서 승인한 `/settings` 정보 구조와 PROD-685의 production 조립, PROD-684의 최종
통합·archive 책임, canonical settings 디자인과 현재 Expo Router·UniversalShell·Relay 경계를 고정한다.
Product behavior는 canonical 문서와 최신 Linear 계약에서 파생하고, 여러 구현 slice가 함께 지켜야 할 좁은
구현 경계만 Implementation Choice로 남긴다.

## Decision Records

### `/settings` 하나를 canonical 설정 route로 사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-685`; predecessor `PROD-653`
- Status: Superseded
- Context / Problem: Byulmaru ID Account 외부 진입점과 Kosmo Profile 설정이 서로 다른 Kosmo route 또는 준비
  중인 menu에 배치되면 사용자가 서비스 소유 경계를 찾기 어렵고 shell surface마다 진입점이 달라질 수 있다.
- Decision Outcome: Kosmo 설정 hub의 canonical 내부 route는 `/settings` 하나다. full Web sidebar와 compact
  Web icon rail, mobile Web·Android·iOS drawer가 이 route를 열며 bottom tab과 right rail에는 중복하지 않는다.
  route와 page shell이 함께 동작할 때만 진입점을 노출한다. `/settings`는 Byulmaru ID Account Settings의
  canonical route가 아니며 Kosmo 내부 Account settings nested route를 만들지 않는다.
- Alternatives Considered: `/settings/account`와 `/settings/profile`을 각각 최상위 canonical route로 두는
  방식, generic menu를 영구 진입점으로 사용하는 방식, bottom tab에도 설정을 추가하는 방식. 모두 현재
  canonical 정보 구조와 navigation 위계를 벗어나므로 채택하지 않았다.
- Consequences: shell의 공유 navigation 목록과 mobile Web header 분류가 `/settings`를 인식해야 한다. route가
  준비되지 않은 단계에는 설정 link를 노출할 수 없다.
- Confirmation / Follow-up: full·compact·mobile Web과 Android·iOS drawer에서 href, page-current, drawer close와
  bottom tab/right rail 중복 부재를 확인한다.

### `/settings` route family를 responsive master-detail로 제공한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/breakpoints.md`,
  `docs/design/page-header.md`, `PROD-685`
- Status: Active
- Context / Problem: 장기적으로 다양한 설정을 제공하려면 하나의 긴 form이나 600px 중앙 평면 목록보다
  Settings 내부 navigation과 detail을 단계적으로 탐색할 수 있어야 한다. 동시에 기존 global sidebar와 다른
  route의 feed/right rail 계약을 바꾸면 안 된다.
- Decision Outcome: `/settings`는 canonical hub이고 지원되는 내부 detail은 같은 route family에 속한다. full
  Web은 global sidebar를 유지하고 일반 RightRail을 숨긴 뒤 center+right 폭을 약 320px master와 flexible
  detail workspace로 사용한다. compact/mobile/native는 root 목록과 detail을 한 화면씩 보여 주며 detail의
  back action은 이전 navigation stack과 무관하게 `/settings` root를 명시적으로 연다. Settings navigation은
  root와 내부 detail에서 current 상태를 유지한다.
- Alternatives Considered: 모든 platform의 600px 중앙 column에 master+detail을 동시에 압축하는 방식,
  Mastodon처럼 영구 tree와 긴 form을 한 화면에 표시하는 방식, 모든 platform에서 root/detail을 동시에
  표시하는 방식. 각각 가독성, 가용 폭 또는 작은 화면 navigation과 충돌해 채택하지 않았다.
- Consequences: `UniversalShell`은 full settings route에서만 일반 RightRail visibility와 content max width를
  달리해야 한다. route family는 mobile Web root/detail header와 compact/native route-owned back header를
  구분해야 하며 Web document scroll을 유지해야 한다.
- Confirmation / Follow-up: full workspace 폭·pane 경계·RightRail 부재와 다른 route rail 유지, compact/mobile/
  native root-first·deep link·unrelated-history back·heading 중복 부재를 검증한다.

### Byulmaru ID가 Account Settings를 소유하고 Kosmo는 외부 진입점만 제공한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`; predecessor `PROD-653`; 외부 진입점 소유 `PROD-645`
- Status: Active
- Context / Problem: Account 설정을 Kosmo section의 내부 데이터·form·저장 기능으로 모델링하면 OIDC Provider인
  Byulmaru ID의 소유권을 침범하고 Profile 설정 구현과 혼동한다.
- Decision Outcome: Account Settings의 소유자는 Byulmaru ID다. Kosmo는 `/settings`의 Account 소유 위치에
  Byulmaru ID canonical Account Settings로 이동하는 외부 진입점만 제공하고 행 label·이동 동작·accessible
  name에서 외부 소유권을 전달한다. Web은 HTTPS
  external navigation, Android·iOS는 시스템 브라우저 또는 승인된 external link flow를 사용한다. canonical
  URL·external Link·focus·accessible name은 PROD-645가 소유하고, PROD-685는 해당 결과의 배치와 페이지
  통합만 소유한다.
  Kosmo 내부 Account route·UI·데이터 query·input·save·관리 기능은 만들지 않는다.
- Alternatives Considered: `/settings/account` 내부 화면을 만드는 방식, Account 데이터를 Kosmo GraphQL/Relay로
  조회·저장하는 방식, Profile 설정 form과 하나의 저장 단위로 합치는 방식. 모두 서비스 소유 경계를 침범하므로
  채택하지 않았다.
- Consequences: Account section에는 Kosmo 데이터 loading·empty·save·error·retry 상태가 없다. 브라우저·OS가
  소유하는 외부 이동 lifecycle을 Profile query·mutation 상태와 합치지 않는다.
- Confirmation / Follow-up: Account 진입점의 Byulmaru ID 외부 서비스 label·accessible name, Web HTTPS 이동,
  Android·iOS 승인 flow와 내부 Account route·query·save 부재를 확인한다.

### Account 외부 진입점과 Profile 내부 설정을 순서가 있는 독립 소유 단위로 유지한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`, `PROD-653`, `PROD-645`, `PROD-667`
- Status: Superseded
- Context / Problem: Byulmaru ID가 소유한 Account 외부 진입점과 Kosmo selected Local Profile이 소유한 기본
  공개 범위를 같은 저장 단위나 모호한 category로 표현하면 서비스·대상·권한 경계가 섞인다.
- Decision Outcome: 단일 `설정` heading 아래에 Account 외부 진입점, 현재 Profile identity와 Profile content를
  이 순서로 둔다. Account 행 label·이동 동작·accessible name은 Byulmaru ID 외부 서비스임을 전달하고,
  Profile control accessible name은 Kosmo 내부 기능과 현재 대상을 전달한다. Profile 대상이 없으면 Account
  외부 진입점을 유지한 채 기존 Profile 선택·생성 flow로 연결하는 empty state를 표시하며 다른 Profile의 값을
  fallback으로 쓰지 않는다. 문서·보조기술 읽기 순서는 `설정` page heading → Account 외부 진입점 →
  비상호작용 Profile identity → Profile content로 유지하고, Web keyboard Tab 순서는 Account 외부 진입점 →
  Profile 선택 control(있는 경우) → Profile controls로 별도 정의한다. page heading과 비상호작용 Profile
  identity는 tab stop이 아니다.
- Alternatives Considered: Account/Profile tab으로 페이지 전체를 전환하는 방식, 외부 entry와 내부 control을
  한 form으로 합치는 방식, selected Profile이 없을 때 page 전체를 숨기는 방식. 현재 소유 단위와 empty-state
  계약을 충족하지 않으므로 채택하지 않았다.
- Consequences: 공통 shell은 평면 행 순서·구분선과 Profile identity 배치만 소유하고 Account 외부 이동과
  Profile 저장 상태를 합치지 않는다. 현재 Profile identity와 control data가 같은 actor 결과인지 검증해야 한다.
- Confirmation / Follow-up: selected Profile 유무, Profile 전환 loading과 외부 Account/내부 Profile 행
  순서·accessible name을 component와 runtime에서 확인한다.

### 현재 root에는 두 direct entry만 제공하고 full Web은 Profile detail을 기본 선택한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`, `PROD-645`, `PROD-667`
- Status: Active
- Context / Problem: 현재 승인된 destination은 Account 외부 설정과 Profile 기본 공개 범위뿐인데 미래 구조를
  위해 한 항목짜리 category나 준비 중 entry를 만들면 불필요한 단계와 빈 화면이 생긴다.
- Decision Outcome: Settings root는 시각 label `계정 설정`인 Byulmaru ID 외부 entry와 `게시물 기본 공개 범위` 내부 entry를
  이 순서로 직접 표시한다. full Web `/settings`는 내부 Profile entry를 기본 선택해 detail을 함께 표시하고,
  compact/mobile/native `/settings`는 root 목록부터 표시한다. 미래 category·하위 목록·독립 화면 destination은
  canonical·Linear 승인을 받은 항목이 생길 때 명시적으로 추가하며, 현재 범위에 placeholder나 범용 registry를
  만들지 않는다.
- Alternatives Considered: `계정`과 `프로필` category를 먼저 만들고 각자 한 child를 두는 방식, 미래
  category를 disabled row로 노출하는 방식, full Web detail을 빈 안내 화면으로 시작하는 방식. 현재 항목 수와
  기본 사용 흐름에 불필요한 단계를 추가하므로 채택하지 않았다.
- Consequences: root entry 구성은 명시적이고 Profile data와 무관하다. compact/mobile/native에서 Profile
  control을 보려면 한 번 drill-in하며 full Web은 같은 detail을 즉시 볼 수 있다.
- Confirmation / Follow-up: root에 정확히 두 entry만 있는지, full 기본 selected state와 detail, 좁은 화면의
  root-first와 내부 detail back을 확인한다.

### 소유권은 별도 설명 block 대신 실제 설정 행에서 전달한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`, `PROD-653`
- Status: Superseded
- Context / Problem: section heading, 소유자 label과 설명을 실제 Account/Profile content 앞에 반복하면 설정
  화면의 정보 밀도가 낮아지고 사용자가 실행할 수 있는 행보다 설명 block이 더 두드러진다.
- Decision Outcome: 화면에는 단일 `설정` heading과 실제 Account/Profile content만 표시한다. `계정 설정`·
  `프로필 설정` heading, 소유자 label과 설명을 별도 시각 block 또는 screen reader 전용 heading으로 반복하지
  않는다. Account 외부 진입점은 행 label·이동 동작·accessible name에서 Byulmaru ID 소유권을 전달하고,
  Profile control은 accessible name에서 Kosmo 내부 기능과 현재 Local Profile 대상을 전달한다. chevron은 실제
  외부 navigation 행에만 표시한다.
- Alternatives Considered: 각 소유 단위를 둥근 card와 3줄 설명 header로 감싸는 방식, 시각 heading만 숨기고
  같은 heading을 screen reader 전용으로 유지하는 방식. 전자는 사용자 결정의 평면 행 밀도와 어긋나고 후자는
  동일한 중복 정보를 보조 기술에 남기므로 채택하지 않았다.
- Consequences: Account/Profile child가 자기 행의 정확한 accessible name을 소유해야 한다. 공통 shell의
  component test와 Storybook은 단일 page heading, 행 순서, 평면 구분선과 외부 행 chevron을 검증한다.
- Confirmation / Follow-up: Web과 Native에서 screen reader가 Account 외부 소유권과 Profile 현재 대상을 행의
  accessible name으로 구분하는지 확인한다.

### 소유권은 root entry와 detail heading·control에서 전달한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-685`
- Status: Active
- Context / Problem: master-detail 구조에서 외부 Account destination과 내부 Profile 설정을 같은 평면 content
  순서로 설명하면 실제 navigation hierarchy와 맞지 않는다. 별도 소유자 설명 block을 반복하면 가독성도
  낮아진다.
- Decision Outcome: root/master는 `설정` heading과 두 실제 entry를 제공하고, Account entry label·external
  navigation·accessible name은 Byulmaru ID 소유권을 전달한다. 내부 entry는 selected/current destination을,
  Profile detail heading·identity·control은 Kosmo 내부 기능과 현재 Local Profile 대상을 전달한다. 시각적으로
  없는 category heading이나 owner 설명 block을 screen reader 전용으로 반복하지 않는다.
- Alternatives Considered: 각 entry 앞에 owner section heading과 설명을 추가하는 방식, flat page의 단일 heading
  순서를 유지하는 방식. 전자는 실행 가능한 항목보다 설명을 강조하고 후자는 승인된 master-detail hierarchy와
  맞지 않아 채택하지 않았다.
- Consequences: full Web에는 master `설정` heading과 detail heading이 각각 존재하고, one-pane root/detail은
  현재 화면 heading 하나를 갖는다. Account와 Profile child는 자기 accessible name을 소유한다.
- Confirmation / Follow-up: screen reader heading navigation, master entry 순서·selected state와 Profile detail
  target identity를 Web·Native에서 확인한다.

### Mobile Web과 다른 플랫폼의 settings header 소유권을 분리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/page-header.md`,
  `docs/design/breakpoints.md`, `PROD-685`, `PROD-653`
- Status: Superseded
- Context / Problem: UniversalShell은 mobile Web의 주요 route header를 소유하지만 Native와 compact/full Web은
  route header를 사용한다. 모든 플랫폼에서 route header를 렌더링하면 mobile Web heading과 sticky chrome이
  중복된다.
- Decision Outcome: 768px 미만 Web에서는 UniversalShell이 메뉴 action과 `설정` heading을 렌더링하고 route는
  같은 heading을 렌더링하지 않는다. Android·iOS와 compact/full Web에서는 settings route가 scroll content의
  첫 heading으로 text PageHeader를 렌더링한다.
- Alternatives Considered: 모든 플랫폼에서 shell이 header를 소유하는 방식, 모든 플랫폼에서 route가 header를
  소유하는 방식. 전자는 기존 Native/desktop 소유권을 바꾸고 후자는 mobile Web header를 중복하므로 채택하지
  않았다.
- Consequences: settings route와 shell이 같은 layout 판정을 공유해야 하며 raw breakpoint나 browser global을
  route마다 복제할 수 없다.
- Confirmation / Follow-up: mobile Web은 `설정` heading 하나와 menu action, Native·compact/full Web은 route
  heading 하나와 기존 safe-area/sidebar 구조를 갖는지 검증한다.

### Route는 공통 Profile identity만 조회하고 Account 데이터를 조회하지 않는다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`; Profile data scope `PROD-648`
- Status: Superseded
- Context / Problem: settings page는 두 section이 공유하는 현재 Profile identity를 일관되게 표시해야 하지만
  shell query에 route 전용 field를 누적하거나 공통 shell이 child mutation 상태까지 소유하면 Relay colocation과
  actor 경계가 흐려진다.
- Decision Outcome: settings route의 top-level Relay query가 current session과 공통 selected Profile identity를
  소유한다. PROD-648 Profile child는 route query에 colocate한 fragment 또는 자기 section의 독립 query로
  필요한 데이터를 읽고 자기 pending·mutation·오류 상태를 소유한다. PROD-645 Account 외부 진입점은 Account
  data fragment·query·mutation을 추가하지 않는다. 공통 shell은 Profile 저장 state를 소유하지 않는다.
- Alternatives Considered: UniversalShell query가 settings 데이터를 모두 조회해 scalar prop으로 전달하는 방식,
  `useSession` ID와 local cache만으로 표시값을 조립하는 방식, 모든 child query를 하나의 공통 settings registry에
  모으는 방식. route 책임, normalized data와 최소 구현 경계를 해치므로 기본 선택으로 채택하지 않았다.
- Consequences: selected Profile 또는 Relay actor revision이 바뀌면 Profile route/section data가 새 identity에
  수렴해야 한다. Profile child가 독립 query를 선택해도 이전 actor 결과를 새 identity 아래에 유지할 수 없다.
  Account entry에는 이 전환을 위한 data loading 상태가 생기지 않는다.
- Confirmation / Follow-up: Relay compiler/typecheck와 Profile 전환 회귀에서 identity·fragment 결과 불일치와
  stale result 부재를 확인한다.

### 독립 child 실패를 section 가까이에서 복구한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`; 오류 소유 `PROD-645`, `PROD-648`
- Status: Superseded
- Context / Problem: route boundary 하나만 사용하면 Account external navigation action 또는 Profile 설정 조회
  중 하나의 실패가 정상인 다른 section과 page heading까지 숨길 수 있다.
- Decision Outcome: 공통 route를 구성할 수 없는 오류는 route-level boundary가 한국어 오류와 재시도를
  제공한다. Account 외부 이동과 Profile 기능이 독립적으로 복구 가능한 오류를 가지면 각 child section 가까운
  boundary가 처리하고 정상 section은 유지한다. Account 외부 이동 오류를 Account 데이터 조회·저장 오류로
  해석하지 않는다.
- Alternatives Considered: 모든 loading/error를 page-wide fallback 하나로 처리하는 방식, 공통 shell이 child
  error type을 해석하는 방식. 전자는 독립 복구 계약을 잃고 후자는 child 소유권을 침범하므로 채택하지 않았다.
- Consequences: section boundary가 문서 순서와 retry focus를 보존해야 하며 동일 오류를 route와 section이 중복
  announcement하지 않게 해야 한다.
- Confirmation / Follow-up: Account external-navigation-only와 Profile-data-only error story/test에서 정상
  section과 page heading 유지, 안전한 한국어 fallback과 재시도를 확인한다.

### PROD-653이 자식 통합 뒤 change 정합성 확인과 archive를 소유한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`, `PROD-645`, `PROD-648`
- Status: Superseded
- Context / Problem: 공통 shell 구현만 끝났다는 이유로 change를 archive하면 Account 외부 진입점/Profile 내부
  기능 통합과 페이지 수준 완료 증거가 남지 않는다. 반대로 자식 기능 세부 테스트를 부모에서 반복하면 검증
  책임이 중복된다.
- Decision Outcome: PROD-653은 common route·navigation·정보 구조와 Web·Android·iOS 페이지 통합을 검증하고
  `add-settings-page-shell` 정합성 확인과 archive를 소유한다. PROD-645와 PROD-648의 통합 가능한 결과가
  준비되기 전에는 완료·archive하지 않는다. PROD-645는 외부 navigation 구현·검증을, PROD-648은 Profile
  기능 구현·세부 검증을 소유하며 각자 적용되는 OpenSpec lifecycle을 유지한다.
- Alternatives Considered: common shell만 구현한 뒤 즉시 archive하는 방식, 마지막 자식 이슈가 계층만을
  근거로 부모 change까지 archive하는 방식, 부모가 자식 기능 테스트를 모두 복제하는 방식. 현재 Linear 책임과
  completion gate를 충족하지 않으므로 채택하지 않았다.
- Consequences: 공통 shell 작업은 병렬로 준비할 수 있지만 navigation 활성화·통합 task와 archive는 child
  dependency를 명시적으로 확인해야 한다.
- Confirmation / Follow-up: 최신 Linear relation, 두 child 결과, page-level runtime 증거, delta spec 정합성과
  strict validation을 archive 직전에 다시 확인한다.

### `SettingsItem`은 설정 목록 행의 시각 구조만 공통화한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`
- Status: Active
- Context / Problem: master와 하위 목록의 여러 설정 entry가 같은 행 규칙을 사용하지만 Link·Pressable·focus·
  accessible name과 radio·mutation·save까지 한 공용 component가 소유하면 child 책임이 섞인다.
- Decision Outcome: 새 presentational `SettingsItem`은 Mobile Figma cell을 기준으로 행 높이·padding·divider와
  필수 label·선택적 leading·description·trailing content·selected presentation을 부모 container의 가용 폭에
  맞는 안정적인 조합 API로 제공한다. 새로 승인된 navigation·value·toggle·status·identity 행은 component
  수정이나 feature 이름별 분기 없이 같은 API를 재사용한다.
  PROD-645 Account child는 external Link·focus·accessible name을, PROD-667 Profile child는 자기 상태·persistence
  semantics를 계속 소유한다.
- Alternatives Considered: 기능별로 행 스타일을 복제하는 방식, 공용 component가 모든 interaction과 저장을
  소유하는 settings registry 방식. 전자는 시각 규칙이 갈라지고 후자는 child 계약을 침범하므로 채택하지 않았다.
- Consequences: interactive wrapper는 feature child가 소유하고 `SettingsItem` 자체는 role·navigation·mutation을
  추론하지 않는다. 새 설정 행은 `SettingsItem`을 바꾸는 대신 승인된 slot을 조합한다.
- Confirmation / Follow-up: master와 하위 목록이 container 폭에 맞는 같은 geometry를 사용하면서 각
  accessibility role, focus와 mutation test가 기존 child 경계에 남는지 확인한다.

### Profile query를 Account entry와 분리한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`; Profile data `PROD-667`; Account child `PROD-645`
- Status: Superseded
- Context / Problem: route 전체가 selected Profile query를 suspend하거나 throw하면 데이터 조회가 없는 Account
  external entry와 page heading까지 사라져 독립 소유 계약을 위반한다.
- Decision Outcome: settings page shell은 page heading과 Account entry를 query boundary 밖에 먼저 렌더링한다.
  current session·selected Profile query는 Profile child 가까운 `RouteBoundary`가 loading/error/retry를 처리한다.
  Account entry에는 Account data 또는 external navigation error state를 추가하지 않는다.
- Alternatives Considered: route-wide Relay boundary 하나, shell query에 settings fields 추가. 전자는 정상 Account
  entry를 숨기고 후자는 shell 책임을 확장하므로 채택하지 않았다.
- Consequences: Profile loading/error fallback도 평면 목록 순서 안에서 Account 다음에 남고 retry는 Profile
  query만 다시 평가한다.
- Confirmation / Follow-up: Profile loading/error에서 page heading·Account entry 유지, no-profile action,
  Profile/Relay actor 전환 stale result 부재를 검증한다.

### Profile detail이 자기 데이터와 상태를 소유한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-685`; Profile data·상태 `PROD-667`
- Status: Active
- Context / Problem: Profile query를 Account entry와 같은 평면 page 조립의 별도 boundary로 정의하면 Settings
  shell이 child 오류 격리와 배치까지 불필요하게 소유한다. 승인된 route family에서는 Profile 설정이 독립
  detail 화면이다.
- Decision Outcome: Profile detail은 현재 Profile identity, query·loading·error·empty·content·재시도와 저장
  상태를 자기 화면 안에서 소유한다. Settings shell과 Account entry는 Profile 오류 종류를 해석하거나 공통
  loading/error 상태로 합치지 않는다. 이전 Profile 결과를 새 대상 아래에 표시하지 않으며 구체적인 선택·저장
  interaction은 page shell이 고정하지 않는다.
- Alternatives Considered: page heading과 Account entry를 boundary 밖에 두고 Profile만 별도 section boundary로
  감싸는 방식, route-wide query 하나, shell query에 Profile setting field를 추가하는 방식. 모두 flat page
  조립을 유지하거나 shell 책임을 확장하므로 채택하지 않았다.
- Consequences: Profile detail은 독립 loading/error story와 test를 소유하고, root entry 구성은 Profile data에
  의존하지 않는다. full Web에서는 detail 오류가 detail pane 안에서 표현되고 좁은 화면에서는 detail 화면이
  자기 복구 UI를 표시한다.
- Confirmation / Follow-up: selected/no-profile, loading/error/retry와 Profile/Relay actor 전환 stale result
  부재를 detail component와 runtime에서 확인한다.

### PROD-685가 구현 증거를 만들고 PROD-684가 최종 archive를 소유한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-684`, `PROD-685`, `PROD-645`, `PROD-667`
- Status: Active
- Context / Problem: PROD-653 완료 후 실제 production route·child 조립과 page-level 검증 owner가 PROD-685로
  분리됐고, 전체 Settings 통합·OpenSpec 완료 판단은 parent PROD-684에 배정됐다.
- Decision Outcome: PROD-685는 `/settings` route·navigation, PROD-645/667 child 조립, page-level platform·
  accessibility 검증과 구현 후 새 PROD-685 Figma frames 정렬을 소유한다. 기존 Figma frames는 보존한다.
  PROD-684는 완료 증거를 받아 최종 Settings 통합, change 정합성 확인과 archive를 소유한다. PROD-653은
  predecessor이고 PROD-648은 Backend 계약만 소유한다.
- Alternatives Considered: PROD-653을 계속 archive owner로 유지하는 방식, 마지막 child PR이 계층만으로
  archive하는 방식. 최신 Linear 책임과 일치하지 않아 채택하지 않았다.
- Consequences: PROD-685 PR 완료만으로 change를 archive하지 않고 strict validation·runtime evidence를
  PROD-684에 명시적으로 인계한다.
- Confirmation / Follow-up: 최신 Linear relation, PROD-645/667 결과, page-level runtime, Figma 후속 정렬,
  delta spec 정합성을 archive 전에 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `/settings` 하나를 canonical 설정 route로 사용한다 — 2026-08-06
  `/settings` route family를 responsive master-detail로 제공한다로 대체됐다.
- `Account 외부 진입점과 Profile 내부 설정을 순서가 있는 독립 소유 단위로 유지한다` — 2026-08-06
  `현재 root에는 두 direct entry만 제공하고 full Web은 Profile detail을 기본 선택한다`로 대체됐다.
- `소유권은 별도 설명 block 대신 실제 설정 행에서 전달한다` — 2026-08-06
  `소유권은 root entry와 detail heading·control에서 전달한다`로 대체됐다.
- `Mobile Web과 다른 플랫폼의 settings header 소유권을 분리한다` — 2026-08-06 responsive route family의
  root/detail header·back 계약으로 대체됐다.
- `Route는 공통 Profile identity만 조회하고 Account 데이터를 조회하지 않는다` — 2026-08-06
  `Profile query를 Account entry와 분리한다`를 거쳐 `Profile detail이 자기 데이터와 상태를 소유한다`로
  대체됐다.
- `독립 child 실패를 section 가까이에서 복구한다` — Account external navigation error state를 제거하고
  2026-08-06 `Profile detail이 자기 데이터와 상태를 소유한다`로 대체됐다.
- `Profile query를 Account entry와 분리한다` — 2026-08-06
  `Profile detail이 자기 데이터와 상태를 소유한다`로 대체됐다.
- `PROD-653이 자식 통합 뒤 change 정합성 확인과 archive를 소유한다` — 2026-08-06
  `PROD-685가 구현 증거를 만들고 PROD-684가 최종 archive를 소유한다`로 대체됐다.
