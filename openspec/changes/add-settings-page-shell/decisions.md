## Context

이 기록은 PROD-653의 승인된 `/settings` 공통 route·정보 구조, canonical settings 디자인, 자식 이슈 책임과
현재 Expo Router·UniversalShell·Relay 경계를 구현 전에 고정한다. Product behavior는 canonical 문서와 최신
Linear 계약에서 파생하고, 여러 구현 slice가 함께 지켜야 할 좁은 구현 경계만 Implementation Choice로 남긴다.

## Decision Records

### `/settings` 하나를 canonical 설정 route로 사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-653`
- Status: Active
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

### Byulmaru ID가 Account Settings를 소유하고 Kosmo는 외부 진입점만 제공한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`; 외부 이동 소유 `PROD-645`
- Status: Active
- Context / Problem: Account 설정을 Kosmo section의 내부 데이터·form·저장 기능으로 모델링하면 OIDC Provider인
  Byulmaru ID의 소유권을 침범하고 Profile 설정 구현과 혼동한다.
- Decision Outcome: Account Settings의 소유자는 Byulmaru ID다. Kosmo는 `/settings`의 `계정 설정` section에
  Byulmaru ID canonical Account Settings로 이동하는 외부 진입점과 소유권 설명만 제공한다. Web은 HTTPS
  external navigation, Android·iOS는 시스템 브라우저 또는 승인된 external link flow를 사용한다. canonical
  URL·플랫폼 이동·실패 복구는 PROD-645가 소유하고, PROD-653은 해당 결과의 배치와 페이지 통합만 소유한다.
  Kosmo 내부 Account route·UI·데이터 query·input·save·관리 기능은 만들지 않는다.
- Alternatives Considered: `/settings/account` 내부 화면을 만드는 방식, Account 데이터를 Kosmo GraphQL/Relay로
  조회·저장하는 방식, Profile 설정 form과 하나의 저장 단위로 합치는 방식. 모두 서비스 소유 경계를 침범하므로
  채택하지 않았다.
- Consequences: Account section에는 Kosmo 데이터 loading·empty·save 상태가 없다. 외부 이동 실패만 PROD-645
  interaction 경계에서 복구하며 Profile query·mutation 상태와 합치지 않는다.
- Confirmation / Follow-up: Account 진입점의 Byulmaru ID 외부 서비스 label·accessible name, Web HTTPS 이동,
  Android·iOS 승인 flow와 내부 Account route·query·save 부재를 확인한다.

### Account 외부 진입점과 Profile 내부 설정을 순서가 있는 독립 section으로 유지한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`, `PROD-645`, `PROD-648`
- Status: Active
- Context / Problem: Byulmaru ID가 소유한 Account 외부 진입점과 Kosmo selected Local Profile이 소유한 기본
  공개 범위를 같은 저장 단위나 모호한 category로 표현하면 서비스·대상·권한 경계가 섞인다.
- Decision Outcome: 단일 `설정` heading 아래에 `계정 설정`, `프로필 설정` section을 이 순서로 둔다. Profile
  section은 Kosmo 내부 기능과 현재 대상의 표시 이름·`relativeHandle`을 함께 표시한다. Account section은
  Byulmaru ID 외부 서비스 진입점임을 표시한다. Profile 대상이 없으면 Account 외부 진입점을 유지한 채 기존
  Profile 선택·생성 flow로 연결하는 empty state를 표시하며 다른 Profile의 값을 fallback으로 쓰지 않는다.
- Alternatives Considered: Account/Profile tab으로 페이지 전체를 전환하는 방식, 외부 entry와 내부 control을
  한 form으로 합치는 방식, selected Profile이 없을 때 page 전체를 숨기는 방식. 현재 소유 단위와 empty-state
  계약을 충족하지 않으므로 채택하지 않았다.
- Consequences: 공통 shell은 section layout과 소유권 설명만 소유하고 Account 외부 이동과 Profile 저장 상태를
  합치지 않는다. 현재 Profile identity와 control data가 같은 actor 결과인지 검증해야 한다.
- Confirmation / Follow-up: selected Profile 유무, Profile 전환 loading과 외부 Account/내부 Profile
  heading·설명·accessible name을 component와 runtime에서 확인한다.

### Mobile Web과 다른 플랫폼의 settings header 소유권을 분리한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/page-header.md`,
  `docs/design/breakpoints.md`, `PROD-653`
- Status: Active
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
- Status: Active
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
- Status: Active
- Context / Problem: route boundary 하나만 사용하면 Account external navigation action 또는 Profile 설정 조회
  중 하나의 실패가 정상인 다른 section과 page heading까지 숨길 수 있다.
- Decision Outcome: 공통 route를 구성할 수 없는 오류는 route-level boundary가 한국어 오류와 재시도를
  제공한다. Account 외부 이동과 Profile 기능이 독립적으로 복구 가능한 오류를 가지면 각 child section 가까운
  boundary가 처리하고 정상 section은 유지한다. Account 외부 이동 오류를 Account 데이터 조회·저장 오류로
  해석하지 않는다.
- Alternatives Considered: 모든 loading/error를 page-wide fallback 하나로 처리하는 방식, 공통 shell이 child
  error type을 해석하는 방식. 전자는 독립 복구 계약을 잃고 후자는 child 소유권을 침범하므로 채택하지 않았다.
- Consequences: section boundary가 heading hierarchy와 retry focus를 보존해야 하며 동일 오류를 route와 section이
  중복 announcement하지 않게 해야 한다.
- Confirmation / Follow-up: Account external-navigation-only와 Profile-data-only error story/test에서 정상
  section과 page heading 유지, 안전한 한국어 fallback과 재시도를 확인한다.

### PROD-653이 자식 통합 뒤 change 정합성 확인과 archive를 소유한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `PROD-653`, `PROD-645`, `PROD-648`
- Status: Active
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

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
