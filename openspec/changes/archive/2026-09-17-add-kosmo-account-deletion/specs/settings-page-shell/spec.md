## MODIFIED Requirements

> This delta spec is a non-authoritative historical session record. Durable Settings behavior authority remains in
> the referenced canonical documents and Linear issues; the requirement keywords below provide implementation
> context only and do not create an independent product completion gate.

### Requirement: 현재 Settings root와 공통 item 정보 구조

**Durable authority references (session context):** `docs/design/settings.md`, `docs/design/profile-mute-block.md`, `PROD-685`, `DSN-53`, `DSN-54`, `PROD-970`; 기능 경계 `PROD-645`, `PROD-667`, 테마 runtime `PROD-812`, Mute·Block runtime `PROD-814`, `PROD-823`, `PROD-813` — Settings root는 시각 label `계정 설정`인 Byulmaru ID 외부 진입점, `프로필 설정`, `뮤트 및 차단`, 현재 선택값을 함께 보여 주는 `테마`, `정보`, `코스모 탈퇴` 내부 진입점을 이 순서로 직접 제공해야 한다(MUST). `프로필 설정`은 `/settings/profile` detail을 열어야 하며(MUST), `테마`는 `/settings/theme`, `정보`는 `/settings/info`, `코스모 탈퇴`는 `/settings/account-deletion` detail을 열어야 한다(MUST). `뮤트 및 차단`은 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 제공하는 category를 열어야 한다(MUST). 두 Mute·Block 상태를 하나의 혼합 목록으로 표시해서는 안 된다(MUST NOT). `게시물 기본 공개 범위`를 root에 중복 노출하거나 현재 entry를 위해 한 항목짜리 `계정`·`화면 설정`·`프로필` category를 만들어서는 안 되며(MUST NOT), 별도 canonical·Linear 승인이 없는 미래 category를 disabled item·placeholder·범용 registry로 노출해서는 안 된다(MUST NOT). 공통 presentational `SettingsItem`은 부모 container 폭에 맞는 row geometry와 필수 label·선택적 leading·description·trailing content·selected presentation을 조합할 수 있어야 한다(MUST). `SettingsItem`이 Link·Pressable·focus·accessible name·feature 조회·저장·persistence semantics를 추론하거나 소유해서는 안 된다(MUST NOT).

#### Scenario: 현재 승인된 root entry를 직접 표시한다

- **WHEN** 인증 사용자가 `/settings` root를 연다
- **THEN** root는 `계정 설정` 외부 entry, `프로필 설정`, `뮤트 및 차단`, 현재 선택값을 함께 보여 주는 `테마`, `정보`, `코스모 탈퇴`를 이 순서로 표시한다
- **AND** `프로필 설정`을 선택하면 `/settings/profile` detail을, `테마`를 선택하면 `/settings/theme` detail을, `정보`를 선택하면 `/settings/info` detail을, `코스모 탈퇴`를 선택하면 `/settings/account-deletion` detail을 연다
- **AND** `뮤트 및 차단`을 선택하면 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 제공한다
- **AND** `게시물 기본 공개 범위`를 root의 별도 entry로 중복 표시하거나 `계정`, `화면 설정` 또는 `프로필` 한 항목짜리 category를 중간 단계로 표시하지 않는다

#### Scenario: 같은 item 문법을 다른 폭에서 사용한다

- **WHEN** Settings entry가 master pane, 하위 목록 또는 one-pane root에 표시된다
- **THEN** `SettingsItem`은 해당 부모 container의 가용 폭을 채운다
- **AND** label·description·trailing content는 text scaling과 reflow에서 잘리거나 불필요한 가로 scroll을 만들지 않는다

#### Scenario: 미래 category를 선제 노출하지 않는다

- **WHEN** 알림 설정 또는 Follow Approval Policy처럼 별도 canonical·Linear 승인이 없는 category가 있다
- **THEN** Settings root는 해당 category를 disabled item, 준비 중 placeholder 또는 빈 하위 목록으로 표시하지 않는다

### Requirement: Settings 접근성 계약

**Durable authority references (session context):** `docs/design/settings.md`, `docs/design/profile-mute-block.md`, `docs/design/accessibility.md`, `PROD-685`, `DSN-53`, `DSN-54`, `PROD-970` — root 화면과 full master pane은 `설정` heading을, one-pane category·detail 화면과 full detail pane은 현재 destination heading을 programmatic하게 노출해야 한다(MUST). 시각적으로 없는 category heading을 screen reader 전용으로 반복해서는 안 된다(MUST NOT). root/master 목록의 문서·보조기술 순서는 `설정` heading → 시각 label `계정 설정`의 Byulmaru ID 외부 entry → `프로필 설정` → `뮤트 및 차단` → `테마`와 현재 선택값 → `정보` → `코스모 탈퇴`이어야 하며(MUST), full Web에서는 이어서 detail heading과 현재 선택된 content를 노출해야 한다(MUST). Account entry는 accessible name에서 Byulmaru ID 외부 서비스로 이동함을 전달해야 하고(MUST), 내부 entry는 selected/current destination을, Profile control은 Kosmo 내부 기능과 현재 대상을 전달해야 한다(MUST). `코스모 탈퇴`는 Kosmo 내부 action과 `/settings/account-deletion` destination을 accessible name에서 전달해야 하며(MUST). 탈퇴 detail은 blocker의 Active Profile 개수와 이유, acknowledgement checkbox의 checked·disabled 상태, 확정 action의 busy·disabled 상태, 오류의 `다시 시도`와 성공 후 login 이동을 보조기술에 전달해야 한다(MUST). heading과 비상호작용 identity는 tab stop이어서는 안 된다(MUST NOT). Web pointer target은 24×24 CSS px minimum 또는 공식 예외를 충족해야 하고(MUST), iOS는 기본 44×44pt, Android는 48×48dp touch target을 사용해야 한다(MUST).

#### Scenario: screen reader가 master와 detail을 구분한다

- **WHEN** screen reader 사용자가 full Web `/settings`를 heading과 control 단위로 탐색한다
- **THEN** `설정` heading과 여섯 root entry가 정해진 순서로 노출된 다음 `프로필 설정` detail heading과 현재 Profile content가 노출된다
- **AND** `테마` entry의 현재 선택값을 accessible name과 state로 구분할 수 있다
- **AND** `코스모 탈퇴` entry는 Kosmo 내부 action과 destination을, Account 외부 destination·selected 내부 entry·현재 Profile control은 각 소유 경계를 accessible name과 state로 구분할 수 있다

#### Scenario: keyboard로 full workspace를 탐색한다

- **WHEN** Web keyboard 사용자가 full Settings workspace의 interactive control을 순서대로 이동한다
- **THEN** Tab focus는 master의 `계정 설정`·`프로필 설정`·`뮤트 및 차단`·`테마`·`정보`·`코스모 탈퇴` entry 다음 detail의 interactive control로 이동한다
- **AND** heading과 비상호작용 Profile identity는 tab stop이 아니다
- **AND** focus-visible, selected, disabled와 busy 상태를 색상만으로 전달하지 않는다

#### Scenario: 작은 화면과 font scaling에서 정보를 유지한다

- **WHEN** 사용자가 Web reflow 또는 Android·iOS font scaling으로 Settings root나 category·detail destination을 확대한다
- **THEN** label·description·현재 Profile identity와 action을 계속 사용할 수 있다
- **AND** 핵심 기능이 불필요한 가로 scroll이나 잘린 text에 의존하지 않는다
