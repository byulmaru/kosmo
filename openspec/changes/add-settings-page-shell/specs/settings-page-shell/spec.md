## ADDED Requirements

### Requirement: Canonical 설정 route와 진입점

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-653` — 인증된 universal client는 Kosmo 설정 hub의 canonical 내부 route로 `/settings`를 제공해야 한다(MUST). 이 route를 Byulmaru ID Account Settings의 내부 canonical route로 취급해서는 안 된다(MUST NOT). full Web sidebar와 compact Web icon rail은 `설정` 주요 navigation을 제공해야 하고(MUST), mobile Web과 Android·iOS는 mobile drawer에 같은 진입점을 제공해야 한다(MUST). 하단 탭 바와 우측 레일은 `설정` 진입점을 중복해서는 안 된다(MUST NOT). 진입점은 실제 route와 page shell이 함께 동작할 때만 노출되어야 한다(MUST).

#### Scenario: full Web sidebar에서 설정을 연다

- **WHEN** 인증 사용자가 `full` Web shell의 `설정` navigation을 실행한다
- **THEN** 시스템은 `/settings` page를 연다
- **AND** sidebar의 `설정` 항목을 page-current 상태로 노출한다

#### Scenario: compact Web rail에서 설정을 연다

- **WHEN** 인증 사용자가 `compact` Web icon rail의 접근 가능한 이름 `설정`인 navigation을 실행한다
- **THEN** 시스템은 `/settings` page를 연다
- **AND** icon rail의 `설정` 항목을 page-current 상태로 노출한다

#### Scenario: mobile drawer에서 설정을 연다

- **WHEN** mobile Web, Android 또는 iOS 사용자가 drawer의 `설정` navigation을 실행한다
- **THEN** 시스템은 `/settings` page를 열고 drawer를 닫는다
- **AND** 하단 탭 바와 우측 레일에는 별도 `설정` 항목을 표시하지 않는다

#### Scenario: 준비되지 않은 진입점을 노출하지 않는다

- **WHEN** build에 `/settings` route와 공통 page shell이 포함되지 않았다
- **THEN** shell은 `설정` navigation을 placeholder 또는 없는 route로 연결하지 않는다

### Requirement: Byulmaru ID Account 외부 진입점과 Kosmo Profile 설정 정보 구조

**Authority / Provenance:** `docs/design/settings.md`, `PROD-653`; 기능 경계 `PROD-645`, `PROD-648` — 설정 페이지는 단일 최상위 `설정` heading 아래에 Byulmaru ID Account 외부 진입점과 현재 Local Profile의 Kosmo 설정 content를 평면 행 구조로 이 순서에 제공해야 한다(MUST). `계정 설정`·`프로필 설정` heading, 소유자 label과 설명을 별도 시각 block으로 반복해서는 안 된다(MUST NOT). Account 진입점은 행 label·이동 동작·accessible name에서 Byulmaru ID가 소유한 외부 서비스임을 전달해야 하고(MUST), Profile control은 accessible name에서 Kosmo 내부 기능임과 현재 설정 대상 Local Profile을 전달해야 한다(MUST). 두 소유 단위를 하나의 저장 단위 또는 모호한 공통 `설정` category로 합쳐서는 안 된다(MUST NOT).

#### Scenario: 선택한 Profile이 있는 설정 페이지를 표시한다

- **WHEN** 인증 session에 selected Local Profile이 있는 사용자가 `/settings`를 연다
- **THEN** 페이지는 Byulmaru ID Account 외부 진입점 다음에 현재 Profile identity와 Kosmo Profile content를 표시한다
- **AND** Account 진입점의 행 label·이동 동작·accessible name은 Byulmaru ID 외부 서비스임을 전달한다
- **AND** Profile identity는 현재 대상 Profile의 표시 이름과 `relativeHandle`을 표시한다
- **AND** Profile control의 accessible name은 Kosmo 내부 기능과 현재 대상을 전달한다
- **AND** 실제 content 앞에 `계정 설정`·`프로필 설정` heading, 소유자 label이나 설명 block을 반복하지 않는다

#### Scenario: 설정 대상 Profile이 없다

- **WHEN** Account가 접근할 수 있는 Local Profile이 없거나 session에 selected Profile이 없다
- **THEN** 페이지는 Profile 데이터와 무관한 Byulmaru ID Account 외부 진입점을 계속 표시한다
- **AND** Profile content 위치는 대상이 없다는 empty state와 기존 Profile 선택·생성 흐름으로 이동하는 action을 표시한다
- **AND** 이전 또는 다른 Profile의 설정값을 현재 값처럼 표시하지 않는다

#### Scenario: 미래 설정 category를 선제 노출하지 않는다

- **WHEN** 알림 설정 또는 Follow Approval Policy처럼 별도 canonical·Linear 승인이 없는 category가 있다
- **THEN** 페이지는 해당 category를 disabled item이나 준비 중 placeholder로 표시하지 않는다

### Requirement: Account 설정은 Byulmaru ID 외부 navigation으로만 제공한다

**Authority / Provenance:** `docs/design/settings.md`, `PROD-653`; 외부 이동 소유 `PROD-645` — Account Settings의 소유자는 Byulmaru ID(OIDC Provider)여야 하며(MUST), Kosmo는 `/settings` 안에 Byulmaru ID canonical Account Settings 페이지로 이동하는 외부 진입점만 제공해야 한다(MUST). Kosmo는 내부 Account 설정 route·UI·Account 데이터 조회·입력·저장 또는 Account 관리 기능을 구현해서는 안 된다(MUST NOT). Web은 canonical HTTPS URL로 external navigation해야 하고(MUST), Android·iOS는 시스템 브라우저 또는 승인된 external link flow를 사용해야 한다(MUST). canonical URL 결정, 플랫폼별 이동과 실패 복구 구현은 PROD-645가 소유해야 한다(MUST).

#### Scenario: Web에서 Byulmaru ID Account Settings로 이동한다

- **WHEN** Web 사용자가 `/settings`의 Account 외부 진입점을 실행한다
- **THEN** 시스템은 PROD-645가 제공한 canonical HTTPS Account Settings URL로 external navigation한다
- **AND** Kosmo 내부 Account settings route나 form을 열지 않는다

#### Scenario: Native에서 승인된 외부 link flow를 사용한다

- **WHEN** Android 또는 iOS 사용자가 `/settings`의 Account 외부 진입점을 실행한다
- **THEN** 시스템은 시스템 브라우저 또는 승인된 external link flow로 Byulmaru ID canonical Account Settings를 연다
- **AND** Kosmo 화면을 Account 데이터 조회·저장 UI로 대체하지 않는다

#### Scenario: Kosmo가 Account 상태를 소유하지 않는다

- **WHEN** `/settings`가 Account section을 렌더링한다
- **THEN** section은 Byulmaru ID 소유권과 외부 이동 진입점을 표시한다
- **AND** Kosmo Account 값, 입력 control, save action 또는 Account 데이터 loading·empty 상태를 표시하지 않는다

### Requirement: 플랫폼별 settings header와 responsive page shell

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-653` — mobile Web의 `/settings`는 `UniversalShell`이 메뉴 action과 `설정` 제목을 가진 공용 header를 렌더링해야 하고(MUST), route가 같은 heading을 복제해서는 안 된다(MUST NOT). Android·iOS와 compact/full Web에서는 settings route가 scroll content의 첫 heading으로 `설정` text header를 렌더링해야 한다(MUST). 페이지는 기존 중앙 column, native safe area와 `compact=768`, `full=1280` shell 경계를 유지해야 한다(MUST).

#### Scenario: mobile Web에서 shell header를 한 번 표시한다

- **WHEN** 폭 768px 미만 Web에서 사용자가 `/settings`를 연다
- **THEN** shell은 메뉴 action과 `설정` heading을 가진 header를 표시한다
- **AND** route content는 두 번째 `설정` heading을 렌더링하지 않는다

#### Scenario: compact와 full Web에서 route header를 표시한다

- **WHEN** 폭 768px 이상 Web에서 사용자가 `/settings`를 연다
- **THEN** settings route는 중앙 column의 첫 heading으로 `설정` text header를 표시한다
- **AND** 기존 sidebar·right rail breakpoint와 document scroll layout을 유지한다

#### Scenario: Native에서 route header와 safe area를 유지한다

- **WHEN** Android 또는 iOS 사용자가 `/settings`를 연다
- **THEN** settings route는 scroll content의 첫 heading으로 `설정` text header를 표시한다
- **AND** mobile shell은 header 바깥의 native safe area를 계속 소유한다

### Requirement: Settings 상태와 Profile 데이터 격리

**Authority / Provenance:** `docs/design/settings.md`, `PROD-653`; Profile 전환 경계 `PROD-648`, Account 이동 경계 `PROD-645` — 설정 page shell은 loading, error, empty와 content 상태에서 Byulmaru ID Account 외부 진입점/Kosmo Profile 내부 설정의 소유 구조를 유지해야 한다(MUST). Profile loading 중에는 확인되지 않은 Profile 값을 확정된 값처럼 표시해서는 안 되고(MUST NOT), Account 진입점을 Kosmo Account 데이터 loading·empty·save 상태로 모델링해서는 안 된다(MUST NOT). route-level error는 안전한 한국어 설명과 재시도 action을 제공해야 한다(MUST). Profile 대상 전환 중에는 이전 Profile의 데이터를 새 대상의 설정값처럼 표시해서는 안 된다(MUST NOT). 독립적으로 복구할 수 있는 Account 외부 이동 오류와 Profile 데이터 오류는 정상인 다른 section을 불필요하게 숨겨서는 안 된다(MUST NOT).

#### Scenario: route 데이터를 불러오는 중이다

- **WHEN** settings route의 Profile identity 또는 Profile section 데이터가 아직 loading 중이다
- **THEN** 페이지는 loading 상태를 보조 기술에 알린다
- **AND** 아직 확인되지 않은 Profile 설정값을 확정된 값처럼 표시하지 않는다
- **AND** Account 진입점을 Account 데이터 loading 상태로 표시하지 않는다

#### Scenario: route-level 조회를 재시도한다

- **WHEN** settings route를 구성하는 공통 조회가 실패해 page content를 표시할 수 없다
- **THEN** 페이지는 backend 원문이 아닌 안전한 한국어 오류 설명과 재시도 action을 표시한다
- **AND** 재시도는 같은 `/settings` route와 shell 안에서 수행된다

#### Scenario: 외부 이동 오류와 Profile 데이터 오류를 격리한다

- **WHEN** PROD-645의 Account 외부 이동 action 또는 PROD-648의 Profile 조회·저장 중 하나만 실패한다
- **THEN** 실패한 section은 자기 오류와 복구 action을 표시한다
- **AND** 정상인 다른 section과 page heading은 계속 표시한다
- **AND** Account 외부 이동 실패를 Account 데이터 조회·저장 실패로 표현하지 않는다

#### Scenario: Profile 전환의 늦은 결과를 표시하지 않는다

- **WHEN** 설정 대상 Profile이 바뀐 뒤 이전 Profile 요청이 늦게 완료된다
- **THEN** page shell은 이전 결과를 새 Profile identity 아래에 표시하지 않는다
- **AND** 새 Profile의 identity와 데이터가 일치할 때만 Profile 설정 control을 content 상태로 표시한다

### Requirement: Settings 접근성 계약

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-653` — 설정 페이지는 `설정`을 단일 page heading으로 programmatic하게 노출해야 하며(MUST), 시각적으로 제거한 `계정 설정`·`프로필 설정` heading을 screen reader 전용 중복 heading으로 다시 만들어서는 안 된다(MUST NOT). 문서·보조기술 읽기 순서는 `설정` page heading → Account 외부 진입점 → 비상호작용 Profile identity → Profile control을 따라야 하고(MUST), Web keyboard Tab 순서는 Account 외부 진입점 → Profile 선택 control(있는 경우) → Profile control이어야 한다(MUST). page heading과 비상호작용 Profile identity는 tab stop이 아니어야 한다(MUST NOT). Account 진입점의 행 label과 accessible name은 Byulmaru ID 외부 서비스로 이동한다는 사실을 전달해야 하고(MUST), Profile control은 accessible name에서 Kosmo 내부 기능과 현재 대상을 전달해야 한다(MUST). navigation과 page action은 실제 동작에 맞는 role, accessible name과 current·disabled·busy 상태를 노출해야 한다(MUST). text scaling과 reflow에서 현재 Profile identity와 action을 잃어서는 안 된다(MUST NOT). Web pointer target은 24×24 CSS px minimum 또는 공식 예외를 충족해야 하고(MUST), iOS는 기본 44×44pt, Android는 48×48dp touch target을 사용해야 한다(MUST).

#### Scenario: screen reader가 설정 소유 단위를 구분한다

- **WHEN** screen reader 사용자가 `/settings`를 heading과 control 단위로 탐색한다
- **THEN** `설정` page heading 다음에 Account 외부 진입점, 비상호작용 Profile identity와 Profile control이 이 문서 순서로 노출된다
- **AND** Account 진입점의 accessible name에서 Byulmaru ID 외부 서비스로 이동함을 알 수 있다
- **AND** Profile control의 accessible name에서 Kosmo 내부 기능과 현재 설정 대상을 알 수 있다

#### Scenario: keyboard로 설정 페이지를 탐색한다

- **WHEN** Web keyboard 사용자가 `/settings`의 interactive control을 순서대로 이동한다
- **THEN** Tab focus는 Account 외부 진입점 다음 Profile 선택 control(있는 경우)과 Profile control을 순서대로 지난다
- **AND** page heading과 비상호작용 Profile identity는 tab stop이 아니다
- **AND** focus-visible, disabled와 busy 상태를 색상만으로 전달하지 않는다

#### Scenario: 작은 화면과 font scaling에서 정보를 유지한다

- **WHEN** 사용자가 Web reflow 또는 Android·iOS font scaling으로 설정 페이지를 확대한다
- **THEN** 현재 Profile identity와 action을 사용할 수 있다
- **AND** 핵심 기능이 불필요한 가로 scroll이나 잘린 text에 의존하지 않는다

### Requirement: Account 외부 진입점과 Profile 내부 기능의 페이지 수준 통합

**Authority / Provenance:** `docs/design/settings.md`, `PROD-653`, `PROD-645`, `PROD-648` — PROD-645의 Byulmaru ID Account 외부 진입점과 PROD-648의 Kosmo Profile 기본 게시 공개 범위 control은 canonical `/settings`의 각 소유 section 안에서 함께 동작해야 한다(MUST). 공통 shell은 Account 기능을 구현하거나 자식의 외부 이동, Profile 저장·권한·GraphQL·DB·Relay와 Composer 계약을 재구현해서는 안 된다(MUST NOT). 페이지 수준 완료 검증은 PROD-645 외부 navigation과 PROD-648 Profile 기능의 세부 테스트를 반복하는 대신 지원 navigation surface, 외부/내부 소유 경계, 현재 Profile 대상과 Web·Android·iOS 통합을 확인해야 한다(MUST).

#### Scenario: 두 자식 결과를 한 페이지에 배치한다

- **WHEN** PROD-645와 PROD-648의 통합 가능한 구현 결과가 준비됐다
- **THEN** PROD-645의 Byulmaru ID 외부 진입점은 `/settings`의 `계정 설정` section에 표시된다
- **AND** PROD-648의 Kosmo Profile 기능은 현재 대상이 명시된 `프로필 설정` section에 표시된다
- **AND** Account 외부 이동과 Profile 저장은 각각 자기 자식 기능 경계가 처리한다

#### Scenario: 페이지 수준 통합을 검증한다

- **WHEN** PROD-653 완료 검증을 수행한다
- **THEN** full·compact·mobile Web과 Android·iOS에서 `/settings` 진입과 외부 Account/내부 Profile 소유 경계를 확인한다
- **AND** keyboard·screen reader·작은 화면에서 단일 page heading, 행 순서, 현재 대상과 navigation 흐름을 확인한다
- **AND** PROD-645의 외부 링크와 PROD-648의 GraphQL·DB·Composer 세부 테스트를 PROD-653 테스트로 복제하지 않는다
