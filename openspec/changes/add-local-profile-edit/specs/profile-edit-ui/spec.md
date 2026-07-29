## ADDED Requirements

### Requirement: Controlled universal Profile edit presentation

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-491` — universal client는 route·GraphQL과 독립된 controlled Profile edit screen/form으로 displayName, bio, `followPolicy`, avatar/header와 Profile Tag presentation을 제공해야 한다(MUST). 제출 callback이 없거나 draft가 초기값과 같을 때 저장 action을 disabled로 표현하고 저장 성공이나 local persistence를 가장하지 않아야 한다(MUST NOT).

#### Scenario: Render the disconnected presentation safely

- **WHEN** Profile edit form에 표시 값과 controlled state를 주고 submit callback을 제공하지 않는다
- **THEN** form은 displayName, bio, avatar/header와 Profile Tag UI를 렌더한다
- **AND** 저장 action을 disabled와 접근성 상태로 표현한다
- **AND** route 이동, GraphQL 요청, local persistence나 성공 navigation을 실행하지 않는다

#### Scenario: Render controlled save and image states

- **WHEN** 상태 카탈로그가 dirty, validation, upload-wait, saving, failure 또는 retry state를 제공한다
- **THEN** form은 해당 상태를 색 외의 text와 accessibility state로 구분한다
- **AND** 이미지 upload error는 해당 field의 `<label> 이미지 업로드에 실패했어요. 다시 시도해 주세요.` 문구로 안내한다
- **AND** failure와 retry state에서 현재 text, Tag 목록과 image draft를 유지한다

#### Scenario: Keep untouched image fields as their current draft

- **WHEN** form이 현재 avatar와 header로 초기화되고 사용자가 한 이미지 field만 편집한다
- **THEN** 해당 preview의 draft만 교체·제거·upload state로 변경된다
- **AND** 건드리지 않은 이미지 field는 현재 값을 draft로 유지한다
- **AND** 별도의 `유지` action이나 두 이미지의 공통 `유지`·`교체`·`제거` action row를 표시하지 않는다

### Requirement: Follow Approval Policy uses the Profile edit draft boundary

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-491`, `PROD-492`, `PROD-531` — Profile edit presentation은 설명 없는 한 줄 `팔로우 요청 자동 승인` Switch를 controlled `followPolicy` enum draft로 제공해야 한다(MUST). Switch가 켜지면 `OPEN`, 꺼지면 `APPROVAL_REQUIRED`를 같은 submit callback으로 제출해야 하며(MUST), 정책 변경을 별도 즉시 저장이나 별도 mutation seam으로 실행해서는 안 된다(MUST NOT).

#### Scenario: Map the policy switch to the controlled enum draft

- **WHEN** 초기 `followPolicy`가 `OPEN` 또는 `APPROVAL_REQUIRED`로 주어지고 사용자가 `팔로우 요청 자동 승인` Switch를 토글한다
- **THEN** Switch는 각각 켜짐 또는 꺼짐 상태를 표시한다
- **AND** 토글만 바뀌어도 Profile draft가 dirty가 되고 저장 action이 활성화된다
- **AND** submit callback에는 현재 displayName·bio·avatar/header와 함께 정확한 `OPEN` 또는 `APPROVAL_REQUIRED` 값이 전달된다

#### Scenario: Keep the policy draft until the shared save completes

- **WHEN** 정책만 변경한 뒤 저장 중이거나 저장이 실패한다
- **THEN** Switch는 저장 중 다시 변경할 수 없고 현재 선택과 draft를 유지한다
- **AND** 별도 즉시 저장이나 별도 mutation 요청을 실행하지 않는다
- **AND** 실패 뒤 재시도할 때 같은 `followPolicy` enum이 다른 Profile draft와 함께 제출된다

### Requirement: Profile edit fields and Profile Tag interaction

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-491`, `PROD-522` — Profile edit presentation은 1~40자 displayName, 500자 이하 bio와 avatar/header별 controlled 편집 control을 제공해야 하며(MUST), 개수 상한 없이 Profile Tag를 inline chip으로 추가·제거할 수 있어야 한다(MUST). 순서·재정렬 control을 제공해서는 안 되며(MUST NOT), 승인되지 않은 field를 표시해서는 안 된다(MUST NOT).

#### Scenario: Edit approved text and image fields

- **WHEN** 사용자가 displayName, bio 또는 avatar/header control을 편집한다
- **THEN** form은 승인된 길이와 각 이미지 field의 교체·제거·upload-wait·error state를 표현한다
- **AND** 초기값과 다른 field가 하나라도 있을 때 현재 draft를 저장할 수 있는 dirty state를 표현한다
- **AND** Profile Link, handle, location, website, gender, pronouns, contacts와 pinned post를 표시하지 않는다

#### Scenario: Add and remove Profile Tags locally

- **WHEN** 사용자가 유효한 Profile Tag를 추가하거나 기존 TagChip을 제거한다
- **THEN** form은 정규화된 이름에 `#`를 한 번 붙인 chip 목록을 즉시 표시한다
- **AND** 개수 상한 없이 1~20자 문자·숫자·밑줄과 정규화 뒤 canonical identity 중복을 입력
  가까이에 안내한다
- **AND** 순서 변경 control이나 drag gesture를 표시하지 않는다
- **AND** 자동완성·추천·trend·검색 link를 표시하지 않는다

### Requirement: Header image editing surface preserves a 3:1 aspect ratio

**Authority / Provenance:** `docs/design/profile-edit.md`, `PROD-491` — header 이미지 변경 영역은 Web·Android·iOS의 모든 지원 폭에서 가로:세로 `3:1`을 유지해야 하며(MUST), avatar overlap과 편집 action을 담는 hero wrapper나 고정 높이가 preview 비율을 왜곡해서는 안 된다(MUST NOT). 원본 이미지 비율이 다르면 `3:1` 경계 안에서 중앙 기준 cover crop해야 한다(MUST).

#### Scenario: Resize the header preview responsively

- **WHEN** Profile edit surface의 가로 폭이 `W`로 바뀐다
- **THEN** header 이미지 변경 영역은 가로 `W`, 세로 `W / 3`으로 렌더된다
- **AND** `390px` mobile에서는 `390×130`, `600px` 중앙 surface에서는 `600×200`을 유지한다
- **AND** avatar와 image action을 배치하는 hero wrapper 높이는 preview 비율 계산에 포함되지 않는다

#### Scenario: Preview a source image with another aspect ratio

- **WHEN** 현재 또는 교체 대상으로 선택한 header 원본 이미지가 `3:1`이 아니다
- **THEN** preview는 `3:1` container를 유지한 채 중앙 기준 cover crop으로 이미지를 표시한다
- **AND** 선택·업로드 대기·오류 state 사이에서 container 비율을 바꾸지 않는다

### Requirement: Responsive accessible Profile edit layout

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `PROD-491` — Profile edit presentation은 Web shell 중앙 최대 600px surface와 mobile/native 정보 구조를 공유해야 한다(MUST). Profile Tag 제거 action은 시각 크기 `32×32`와 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`를 분리하고, text action은 최소 높이 `36`과 대상·상태를 설명하는 accessibility label/state를 제공해야 한다(MUST).

#### Scenario: Render desktop shell layouts

- **WHEN** Web viewport가 1440 또는 1024 단계다
- **THEN** form은 각각 full sidebar/right rail 또는 icon rail 다음의 최대 600px 중앙 surface에 렌더된다
- **AND** 중앙 content를 별도 internal scroller로 바꾸지 않고 shell document scroll을 유지한다

#### Scenario: Operate compact controls accessibly

- **WHEN** 사용자가 header·avatar 편집, Tag 제거 또는 저장 action을 사용한다
- **THEN** form은 각 action의 대상·동작·disabled 상태를 accessibility label/state로 전달한다
- **AND** Profile Tag 제거 action은 `32×32` visual과 Web `32×32 CSS px`, iOS `44×44 pt`, Android
  `48×48 dp` 실제 입력 target을 제공한다
- **AND** 색만으로 validation·disabled·saving·failure 상태를 구분하지 않는다

### Requirement: Protected selected Owner Profile edit route

**Authority / Provenance:** `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492` — production `/profile-edit` route는 usingProfile 경계를 통과한 selected Active/Normal Local Profile과 Owner Membership을 server-authoritative하게 확인하고 초기값과 submit을 연결할 때만 제공해야 한다(MUST). client는 selected Profile id나 Local origin만으로 Owner 권한을 추측해서는 안 된다(MUST NOT).

#### Scenario: Enter the route as selected Local Owner

- **WHEN** usingProfile 경계의 selected Profile이 Active/Normal Local이고 현재 Account Membership이 Owner다
- **THEN** route는 서버가 반환한 초기값과 submit callback을 가진 Profile edit form을 제공한다
- **AND** 저장 성공 뒤 갱신된 Profile로 복귀한다

#### Scenario: Reject non-owner or ineligible route access

- **WHEN** selected Profile이 Remote·inactive·suspended이거나 현재 Account가 Owner가 아닌 상태로 직접 URL에 접근한다
- **THEN** client는 Profile edit content와 enabled 저장 action을 제공하지 않는다
- **AND** selectedProfileId 또는 Local origin만으로 접근을 허용하지 않는다
