# settings-page-shell Specification

## Purpose

Kosmo의 canonical `/settings` route family, responsive master-detail/one-pane shell, Byulmaru ID Account 외부
진입점과 Kosmo Profile 내부 설정의 소유·접근성·통합 계약을 정의한다.

## Requirements

### Requirement: Canonical Settings route family와 진입점

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-685`; 선행 정보 구조 `PROD-653` — 인증된 universal client는 Kosmo 설정 hub의 canonical 내부 route로 `/settings`를 제공해야 하며(MUST), 지원되는 내부 detail을 같은 Settings route family에서 열 수 있어야 한다(MUST). 이 route family를 Byulmaru ID Account Settings의 내부 canonical route로 취급해서는 안 된다(MUST NOT). full Web sidebar와 compact Web icon rail은 `설정` 주요 navigation을 제공해야 하고(MUST), mobile Web과 Android·iOS는 mobile drawer에 같은 진입점을 제공해야 한다(MUST). 하단 탭 바와 일반 우측 레일은 `설정` 진입점을 중복해서는 안 된다(MUST NOT). 진입점은 실제 route와 page shell이 함께 동작할 때만 노출되어야 한다(MUST).

#### Scenario: full Web sidebar에서 설정을 연다

- **WHEN** 인증 사용자가 `full` Web shell의 `설정` navigation을 실행한다
- **THEN** 시스템은 `/settings` hub를 연다
- **AND** sidebar의 `설정` 항목을 route family의 page-current 상태로 노출한다

#### Scenario: compact Web rail에서 설정을 연다

- **WHEN** 인증 사용자가 `compact` Web icon rail의 접근 가능한 이름 `설정`인 navigation을 실행한다
- **THEN** 시스템은 `/settings` root 목록을 연다
- **AND** icon rail의 `설정` 항목을 page-current 상태로 노출한다

#### Scenario: mobile drawer에서 설정을 연다

- **WHEN** mobile Web, Android 또는 iOS 사용자가 drawer의 `설정` navigation을 실행한다
- **THEN** 시스템은 `/settings` root 목록을 열고 drawer를 닫는다
- **AND** 하단 탭 바와 일반 우측 레일에는 별도 `설정` 항목을 표시하지 않는다

#### Scenario: 내부 category와 detail에서도 설정 current 상태를 유지한다

- **WHEN** 사용자가 지원되는 Settings 내부 category 또는 detail route를 연다
- **THEN** shell의 `설정` navigation은 현재 route family를 page-current로 노출한다

#### Scenario: 준비되지 않은 진입점을 노출하지 않는다

- **WHEN** build에 `/settings` route family와 공통 page shell이 포함되지 않았다
- **THEN** shell은 `설정` navigation을 placeholder 또는 없는 route로 연결하지 않는다

### Requirement: 현재 Settings root와 공통 item 정보 구조

**Authority / Provenance:** `docs/design/settings.md`, `PROD-685`; 기능 경계 `PROD-645`, `PROD-667` — Settings root는 시각 label `계정 설정`인 Byulmaru ID 외부 진입점과 `게시물 기본 공개 범위` 내부 진입점을 이 순서로 직접 제공해야 한다(MUST). 현재 두 entry를 위해 한 항목짜리 `계정`·`프로필` category를 만들어서는 안 되며(MUST NOT), 별도 canonical·Linear 승인이 없는 미래 category를 disabled item·placeholder·범용 registry로 노출해서는 안 된다(MUST NOT). 공통 presentational `SettingsItem`은 부모 container 폭에 맞는 row geometry와 필수 label·선택적 leading·description·trailing content·selected presentation을 조합할 수 있어야 한다(MUST). `SettingsItem`이 Link·Pressable·focus·accessible name·feature 조회·저장·persistence semantics를 추론하거나 소유해서는 안 된다(MUST NOT).

#### Scenario: 현재 승인된 두 entry를 직접 표시한다

- **WHEN** 인증 사용자가 `/settings` root를 연다
- **THEN** root는 첫 번째 시각 label `계정 설정`의 Byulmaru ID 외부 entry와 두 번째 `게시물 기본 공개 범위` 내부 entry를 표시한다
- **AND** `계정` 또는 `프로필` 한 항목짜리 category를 중간 단계로 표시하지 않는다

#### Scenario: 같은 item 문법을 다른 폭에서 사용한다

- **WHEN** Settings entry가 master pane, 하위 목록 또는 one-pane root에 표시된다
- **THEN** `SettingsItem`은 해당 부모 container의 가용 폭을 채운다
- **AND** label·description·trailing content는 text scaling과 reflow에서 잘리거나 불필요한 가로 scroll을 만들지 않는다

#### Scenario: 미래 category를 선제 노출하지 않는다

- **WHEN** 알림 설정 또는 Follow Approval Policy처럼 별도 canonical·Linear 승인이 없는 category가 있다
- **THEN** Settings root는 해당 category를 disabled item, 준비 중 placeholder 또는 빈 하위 목록으로 표시하지 않는다

### Requirement: Account 설정은 Byulmaru ID 외부 navigation으로만 제공한다

**Authority / Provenance:** `docs/design/settings.md`, `PROD-685`; 외부 진입점 소유 `PROD-645` — Account Settings의 소유자는 Byulmaru ID(OIDC Provider)여야 하며(MUST), Kosmo는 Settings root에 Byulmaru ID canonical Account Settings 페이지로 이동하는 외부 진입점만 제공해야 한다(MUST). Kosmo는 내부 Account 설정 route·UI·Account 데이터 조회·입력·저장 또는 Account 관리 기능을 구현해서는 안 된다(MUST NOT). Account 진입점은 PROD-645가 제공하는 플랫폼별 external `Link` 계약을 그대로 사용해야 하며(MUST), Kosmo는 브라우저·OS가 소유하는 외부 이동에 별도 loading·error·retry lifecycle을 추가해서는 안 된다(MUST NOT).

#### Scenario: Web에서 Byulmaru ID Account Settings로 이동한다

- **WHEN** Web 사용자가 Settings root의 Account 외부 진입점을 실행한다
- **THEN** 시스템은 PROD-645가 제공한 canonical HTTPS Account Settings URL로 external navigation한다
- **AND** Kosmo 내부 Account settings detail이나 form을 열지 않는다

#### Scenario: Native에서 승인된 외부 link flow를 사용한다

- **WHEN** Android 또는 iOS 사용자가 Settings root의 Account 외부 진입점을 실행한다
- **THEN** 시스템은 시스템 브라우저 또는 승인된 external link flow로 Byulmaru ID canonical Account Settings를 연다
- **AND** Kosmo 화면을 Account 데이터 조회·저장 UI로 대체하지 않는다

#### Scenario: Kosmo가 Account 상태를 소유하지 않는다

- **WHEN** Settings root가 Account entry를 렌더링한다
- **THEN** entry는 Byulmaru ID 소유권과 외부 이동을 전달한다
- **AND** Kosmo Account 값, 입력 control, save action 또는 Account 데이터 loading·empty·error 상태를 표시하지 않는다

### Requirement: Full Web workspace와 one-pane responsive navigation

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-685`, `PROD-838` — full Web의 Settings route family는 전역 sidebar를 유지하고 일반 `RightRail`을 숨긴 뒤 기존 center+right 영역을 Settings wide workspace로 사용해야 한다(MUST). workspace는 약 320px master pane과 남은 폭을 채우는 detail pane을 제공해야 하며(MUST), `/settings` hub는 `게시물 기본 공개 범위` entry를 기본 selected 상태로 두고 Profile detail을 표시해야 한다(MUST). compact Web, mobile Web, Android와 iOS의 `/settings`는 root 목록부터 표시하고 내부 entry를 선택했을 때 한 화면짜리 category 또는 detail destination으로 이동해야 한다(MUST). 모든 내부 destination은 명시적인 parent를 가져야 하고(MUST), back navigation은 이전 history·navigation stack과 무관하게 해당 parent를 열어야 한다(MUST). root의 직접 entry가 여는 1단계 destination의 parent는 `/settings` root여야 하며(MUST), 중첩 destination의 parent는 바로 위 category여야 한다(MUST). 다른 route의 center 600px·RightRail visibility와 기존 `compact=768`, `full=1280` breakpoint를 변경해서는 안 된다(MUST NOT).

#### Scenario: full Web에서 Settings master-detail을 표시한다

- **WHEN** `full` Web 사용자가 `/settings`를 연다
- **THEN** global sidebar 다음에 약 320px master pane과 flexible detail pane을 표시한다
- **AND** 일반 `RightRail`의 Composer와 개인정보 처리방침 링크를 표시하지 않는다
- **AND** master의 `게시물 기본 공개 범위` entry를 selected 상태로 표시하고 Profile detail을 함께 표시한다

#### Scenario: settings 밖 full Web shell을 유지한다

- **WHEN** 사용자가 Settings route family 밖의 기존 full Web route를 연다
- **THEN** shell은 기존 중앙 최대 600px와 일반 RightRail visibility를 유지한다

#### Scenario: compact와 mobile에서 root부터 1단계 destination으로 이동한다

- **WHEN** compact Web, mobile Web, Android 또는 iOS 사용자가 `/settings`를 연다
- **THEN** 화면은 승인된 entry가 있는 root 목록부터 표시한다
- **AND** root의 직접 entry를 선택하면 해당 1단계 destination 한 화면으로 이동한다
- **AND** back action은 명시적인 parent인 Settings root 목록으로 돌아간다

#### Scenario: 중첩 destination에서 바로 위 category로 돌아간다

- **WHEN** compact Web, mobile Web, Android 또는 iOS 사용자가 Settings category에서 중첩 destination을 연다
- **AND** 사용자가 중첩 destination의 back action을 실행한다
- **THEN** 시스템은 `/settings` root로 건너뛰지 않고 바로 위 category를 연다

#### Scenario: 이전 navigation stack과 무관하게 명시적인 parent로 돌아간다

- **WHEN** compact Web, mobile Web, Android 또는 iOS 사용자가 unrelated 화면이 이전 history 또는 navigation stack에 남아 있는 상태에서 direct/deep link로 내부 Settings category 또는 detail destination을 연다
- **AND** 사용자가 destination의 back action을 실행한다
- **THEN** 시스템은 이전 unrelated 화면을 열지 않고 해당 destination의 명시적인 parent를 연다

#### Scenario: mobile Web heading을 중복하지 않는다

- **WHEN** mobile Web 사용자가 Settings root 또는 category·detail destination을 연다
- **THEN** `UniversalShell`은 root에서 menu+`설정`, category·detail destination에서 back+현재 destination heading을 표시한다
- **AND** route content는 같은 heading을 복제하지 않는다

#### Scenario: compact와 Native heading을 중복하지 않는다

- **WHEN** Android·iOS 또는 compact Web 사용자가 Settings root 또는 category·detail destination을 연다
- **THEN** route는 현재 destination의 text header를 첫 heading으로 표시하고 category·detail destination에 back action을 제공한다
- **AND** Android·iOS에서는 하나의 vertical `ScrollView`가 route header와 root·category·detail content 전체를 포함한다
- **AND** 긴 destination title은 leading action 다음의 가용 폭 안에서 여러 줄로 reflow한다

### Requirement: Profile detail 상태 소유

**Authority / Provenance:** `docs/design/settings.md`, `PROD-685`; Profile 데이터·전환·저장 경계 `PROD-667` — Profile detail은 현재 Local Profile identity와 Profile query·loading·error·empty·content·retry 상태를 자기 화면 안에서 소유해야 한다(MUST). Profile loading 중 확인되지 않은 값을 확정된 것처럼 표시해서는 안 되며(MUST NOT), Profile 전환 뒤 이전 Profile 결과를 새 대상 아래에 표시해서는 안 된다(MUST NOT). 오류에는 backend 원문이 아닌 안전한 한국어 설명과 재시도 action을 제공해야 한다(MUST). Settings shell과 Account entry가 Profile 오류 종류나 저장 상태를 공통 상태로 해석하거나 재구현해서는 안 된다(MUST NOT). page shell은 공개 범위 control의 inline·dropdown·sheet 또는 즉시·명시적 저장 interaction을 고정해서는 안 된다(MUST NOT).

#### Scenario: 선택한 Profile detail을 표시한다

- **WHEN** selected Local Profile이 있는 사용자가 Profile 기본 공개 범위 detail을 연다
- **THEN** detail은 현재 Profile의 표시 이름·`relativeHandle`과 Profile 설정 content를 표시한다
- **AND** Profile control의 accessible name은 Kosmo 내부 기능과 현재 대상을 전달한다

#### Scenario: 설정 대상 Profile이 없다

- **WHEN** Account가 접근할 수 있는 Local Profile이 없거나 session에 selected Profile이 없다
- **THEN** Profile detail은 대상이 없다는 설명과 기존 Profile 선택·생성 흐름으로 이동하는 action을 표시한다
- **AND** 이전 또는 다른 Profile의 설정값을 현재 값처럼 표시하지 않는다

#### Scenario: Profile 조회를 재시도한다

- **WHEN** Profile detail의 query가 실패한다
- **THEN** detail은 안전한 한국어 오류 설명과 재시도 action을 표시한다
- **AND** Settings shell이나 Account entry는 Profile error type을 해석하거나 Account data error state를 만들지 않는다

#### Scenario: Profile 전환의 늦은 결과를 표시하지 않는다

- **WHEN** 설정 대상 Profile이 바뀐 뒤 이전 Profile 요청이 늦게 완료된다
- **THEN** detail은 이전 결과를 새 Profile identity 아래에 표시하지 않는다
- **AND** 새 Profile의 identity와 데이터가 일치할 때만 설정 control을 content 상태로 표시한다

### Requirement: Settings 접근성 계약

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-685` — root 화면과 full master pane은 `설정` heading을, one-pane category·detail 화면과 full detail pane은 현재 destination heading을 programmatic하게 노출해야 한다(MUST). 시각적으로 없는 category heading을 screen reader 전용으로 반복해서는 안 된다(MUST NOT). root/master 목록의 문서·보조기술 순서는 `설정` heading → 시각 label `계정 설정`의 Byulmaru ID 외부 entry → `게시물 기본 공개 범위`여야 하며(MUST), full Web에서는 이어서 detail heading과 Profile content를 노출해야 한다(MUST). Account entry는 accessible name에서 Byulmaru ID 외부 서비스로 이동함을 전달해야 하고(MUST), 내부 entry는 selected/current destination을, Profile control은 Kosmo 내부 기능과 현재 대상을 전달해야 한다(MUST). heading과 비상호작용 identity는 tab stop이어서는 안 된다(MUST NOT). Web pointer target은 24×24 CSS px minimum 또는 공식 예외를 충족해야 하고(MUST), iOS는 기본 44×44pt, Android는 48×48dp touch target을 사용해야 한다(MUST).

#### Scenario: screen reader가 master와 detail을 구분한다

- **WHEN** screen reader 사용자가 full Web `/settings`를 heading과 control 단위로 탐색한다
- **THEN** `설정` heading과 두 root entry 다음에 `게시물 기본 공개 범위` detail heading과 현재 Profile content가 노출된다
- **AND** Account 외부 destination, selected 내부 entry와 현재 Profile control을 accessible name과 state로 구분할 수 있다

#### Scenario: keyboard로 full workspace를 탐색한다

- **WHEN** Web keyboard 사용자가 full Settings workspace의 interactive control을 순서대로 이동한다
- **THEN** Tab focus는 master의 Account·Profile entry 다음 detail의 interactive control로 이동한다
- **AND** heading과 비상호작용 Profile identity는 tab stop이 아니다
- **AND** focus-visible, selected, disabled와 busy 상태를 색상만으로 전달하지 않는다

#### Scenario: 작은 화면과 font scaling에서 정보를 유지한다

- **WHEN** 사용자가 Web reflow 또는 Android·iOS font scaling으로 Settings root나 category·detail destination을 확대한다
- **THEN** label·description·현재 Profile identity와 action을 계속 사용할 수 있다
- **AND** 핵심 기능이 불필요한 가로 scroll이나 잘린 text에 의존하지 않는다

### Requirement: Account 외부 진입점과 Profile 내부 기능의 페이지 수준 통합

**Authority / Provenance:** `docs/design/settings.md`, `PROD-685`, `PROD-645`, `PROD-667`; 최종 통합·archive `PROD-684`, backend `PROD-648` — PROD-645의 Byulmaru ID Account 외부 진입점과 PROD-667의 Kosmo Profile 기본 게시 공개 범위 control은 Settings root/detail의 각 소유 경계 안에서 함께 동작해야 한다(MUST). 공통 shell은 Account 기능을 구현하거나 자식의 외부 이동, Profile 저장·권한·GraphQL·DB·Relay와 Composer 계약을 재구현해서는 안 된다(MUST NOT). PROD-685의 페이지 수준 완료 검증은 자식 기능의 세부 테스트를 반복하는 대신 지원 navigation surface, root/detail 전환, full workspace와 외부/내부 소유 경계를 자동화로 확인해 PROD-684에 인계해야 한다(MUST). 자동화·source/unit 결과를 실제 Web 보조기술 또는 Android·iOS runtime 통과 증거로 일반화해서는 안 된다(MUST NOT).

#### Scenario: 두 자식 결과를 root/detail에 배치한다

- **WHEN** PROD-645와 PROD-667의 통합 가능한 구현 결과가 준비됐다
- **THEN** PROD-645의 Byulmaru ID 외부 진입점은 Settings root의 첫 entry로 표시된다
- **AND** PROD-667의 Kosmo Profile 기능은 두 번째 entry가 여는 detail에 현재 대상과 함께 표시된다
- **AND** Account 외부 이동과 Profile 조회·저장은 각각 자기 자식 기능 경계가 처리한다

#### Scenario: 페이지 수준 통합을 검증한다

- **WHEN** PROD-685 완료 검증을 수행한다
- **THEN** full·compact·mobile Web의 Settings 진입, root/detail navigation과 외부 Account/내부 Profile 소유 경계를 자동화로 확인한다
- **AND** 공용 Android·iOS route와 layout 계약을 source/unit 수준에서 확인한다
- **AND** PROD-645의 외부 링크와 PROD-667·PROD-648의 GraphQL·DB·Composer 세부 테스트를 PROD-685 테스트로 복제하지 않는다
- **AND** 자동화·source/unit 결과를 실제 Web 보조기술 또는 Android·iOS runtime 통과 증거로 일반화하지 않는다
