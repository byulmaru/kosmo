## MODIFIED Requirements

### Requirement: Controlled universal Profile edit presentation

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/icons.md`, `docs/design/foundations.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, DSN-45, PROD-490, PROD-491, PROD-941 — universal client는 route·GraphQL과 독립된 controlled Profile edit screen/form으로 displayName, bio, `followPolicy`, avatar/header와 Profile Tag presentation을 제공해야 한다(MUST). 제출 callback이 없거나 draft가 초기값과 같을 때 저장 action을 disabled로 표현하고 저장 성공이나 local persistence를 가장하지 않아야 한다(MUST NOT).

#### Scenario: Render the disconnected presentation safely

- **WHEN** Profile edit form에 표시 값과 controlled state를 주고 submit callback을 제공하지 않는다
- **THEN** form은 displayName, bio, avatar/header와 Profile Tag UI를 렌더한다
- **AND** 저장 action을 disabled와 접근성 상태로 표현한다
- **AND** route 이동, GraphQL 요청, local persistence나 성공 navigation을 실행하지 않는다

#### Scenario: Render controlled save and image states

- **WHEN** 상태 카탈로그가 dirty, validation, upload-wait, saving, failure 또는 retry state를 제공한다
- **THEN** form은 해당 상태를 색 외의 text와 accessibility state로 구분한다
- **AND** 이미지 upload error는 해당 field의 `<label> 이미지 업로드에 실패했어요. 다시 시도해 주세요.` 문구로 안내한다
- **AND** 내부 오류 detail이나 caller가 제공한 임의 문구를 사용자에게 그대로 표시하지 않는다
- **AND** failure와 retry state에서 현재 text, Tag 목록과 image draft를 유지한다

#### Scenario: Keep untouched image fields as their current draft

- **WHEN** form이 현재 avatar와 header로 초기화되고 사용자가 한 이미지 field만 편집한다
- **THEN** 해당 preview의 draft만 교체·제거·upload state로 변경된다
- **AND** 건드리지 않은 이미지 field는 현재 값을 draft로 유지한다
- **AND** 별도의 `유지` action이나 두 이미지의 공통 `유지`·`교체`·`제거` action row를 표시하지 않는다

#### Scenario: Open the image action appropriate to the current draft

- **WHEN** 사용자가 현재 이미지가 있는 avatar/header preview를 누른다
- **THEN** `이미지 변경`, `이미지 삭제`, `취소` action을 표시한다
- **AND** 사용자가 현재 이미지가 없는 preview를 누르면 action menu 없이 system picker를 연다

#### Scenario: Use each image preview as the only edit button

- **WHEN** header 또는 avatar 편집 callback이 제공되고 form이 편집 가능한 상태다
- **THEN** header의 `3:1` preview 전체와 Mobile의 `96×96`, Compact·Full의 `128×128` avatar frame 전체를 각각 하나의 button으로 제공한다
- **AND** avatar frame 안의 이미지 content는 각각 `88×88`, `120×120`으로 렌더한다
- **AND** avatar frame은 왼쪽 `16px` inset에서 preview와 각각 `48px`, `64px` 겹치고 이를 담는 row는 각각 `64px`, `80px` 높이를 유지한다
- **AND** 각 button 중앙에 `40×40` 반투명 원형 scrim과 `20px` 흰색 camera icon을 표시하고 press 중 이미지 전체에 옅은 veil을 표시한다
- **AND** 별도의 연필 button이나 중첩 focus target을 표시하지 않는다
- **AND** callback이 없거나 form이 disabled/saving 상태면 해당 preview button을 disabled와 접근성 상태로 표현한다

### Requirement: Profile edit fields and Profile Tag interaction

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `docs/design/typography.md`, `docs/design/foundations.md`, `docs/domain/objects/hashtag.md`, DSN-45, PROD-491, PROD-522, PROD-526, PROD-941 — Profile edit presentation은 새로 입력하거나 변경한 값에 Unicode code point 기준 1~40 displayName, 앞뒤 공백을 제거한 뒤 500자 이하 bio와 avatar/header별 controlled 편집 control을 제공해야 한다(MUST). displayName·bio·Profile Tag section의 외부 label은 `Label/L` `16/24/600`, label-control 간격은 `8px`, field section 간격은 `16px`를 사용해야 한다(MUST). 개수 상한 없이 Profile Tag를 inline chip으로 추가·제거할 수 있어야 하고(MUST), 순서·재정렬 control을 제공해서는 안 되며(MUST NOT), 승인되지 않은 field를 표시해서는 안 된다(MUST NOT). Profile Tag의 canonical identity는 Hashtag의 NFKC·locale 비종속 `toLowerCase()` 규칙을 사용하되 chip은 최초 입력의 NFKC 표기를 유지해야 한다(MUST).

#### Scenario: Edit approved text and image fields

- **WHEN** 사용자가 displayName, bio 또는 avatar/header control을 편집한다
- **THEN** form은 승인된 길이와 각 이미지 field의 교체·제거·upload-wait·error state를 표현한다
- **AND** 초기값과 다른 field가 하나라도 있을 때 현재 draft를 저장할 수 있는 dirty state를 표현한다
- **AND** Profile Link, handle, location, website, gender, pronouns, contacts와 pinned post를 표시하지 않는다

#### Scenario: Render approved field hierarchy

- **WHEN** form이 displayName, bio와 Profile Tags를 렌더한다
- **THEN** 각 section의 외부 label은 `Label/L` `16/24/600`으로 표시된다
- **AND** label과 첫 control 사이에는 `8px`, 인접 field section 사이에는 `16px` 간격이 유지된다
- **AND** 기존 TextField·TextArea의 focus, validation, disabled와 support text 동작을 유지한다

#### Scenario: Preserve an unchanged legacy display name

- **WHEN** 초기 displayName이 40 code point를 초과하고 사용자가 그 원문을 정확히 유지한 채 다른 field만 편집한다
- **THEN** form은 legacy displayName만을 이유로 저장을 막지 않는다
- **AND** displayName이 원문에서 한 글자라도 달라지면 새 값에 Unicode code point 기준 1~40 validation을 적용한다
- **AND** 사용자가 값을 변경했다가 원문과 정확히 같게 되돌리면 unchanged legacy 값으로 취급한다

#### Scenario: Add and remove Profile Tags locally

- **WHEN** 사용자가 유효한 Profile Tag를 추가하거나 기존 TagChip을 제거한다
- **THEN** form은 최초 입력의 NFKC 표기에 `#`를 한 번 붙인 chip 목록을 즉시 표시한다
- **AND** 개수 상한 없이 1~20자 문자·숫자·밑줄과 정규화 뒤 canonical identity 중복을 입력 가까이에 안내한다
- **AND** 순서 변경 control이나 drag gesture를 표시하지 않는다
- **AND** 자동완성·추천·trend·검색 link를 표시하지 않는다

### Requirement: Header image editing surface preserves a 3:1 aspect ratio

**Authority / Provenance:** `docs/design/profile-edit.md`, `PROD-491`, `PROD-941` — header 이미지 변경 영역은 Web·Android·iOS의 모든 지원 폭에서 가로:세로 `3:1`을 유지해야 하며(MUST), avatar overlap과 편집 action을 담는 hero wrapper나 고정 높이가 preview 비율을 왜곡해서는 안 된다(MUST NOT). 이미지와 아래 surface 경계에는 current theme의 `border/default` 1px 하단선을 표시해야 한다(MUST). 원본 이미지 비율이 다르면 `3:1` 경계 안에서 중앙 기준 cover crop해야 한다(MUST).

#### Scenario: Resize the header preview responsively

- **WHEN** Profile edit surface의 가로 폭이 `W`로 바뀐다
- **THEN** header 이미지 변경 영역은 가로 `W`, 세로 `W / 3`으로 렌더된다
- **AND** `390px` mobile에서는 `390×130`, `600px` 중앙 surface에서는 `600×200`을 유지한다
- **AND** 이미지와 아래 surface 경계에는 current theme의 `border/default` 1px 하단선이 유지된다
- **AND** avatar와 image action을 배치하는 hero wrapper 높이는 preview 비율 계산에 포함되지 않는다

#### Scenario: Preview a source image with another aspect ratio

- **WHEN** 현재 또는 교체 대상으로 선택한 header 원본 이미지가 `3:1`이 아니다
- **THEN** preview는 `3:1` container를 유지한 채 중앙 기준 cover crop으로 이미지를 표시한다
- **AND** 선택·업로드 대기·오류 state 사이에서 container 비율을 바꾸지 않는다

### Requirement: Responsive accessible Profile edit layout

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/icons.md`, `docs/design/typography.md`, DSN-45, PROD-491, PROD-941 — Profile edit presentation은 Web shell 중앙 최대 `600px` surface와 mobile/native 정보 구조를 공유해야 한다(MUST). safe-area를 제외한 상단 navigation header는 정확히 `64px` 높이와 `16px` horizontal inset을 사용해야 하며(MUST), 제목은 `uiHeadingS` `20/26/700`으로 표시해야 한다(MUST). 뒤로가기 action은 `44×44` layout target 안의 `ArrowLeft` `24px`를 사용하되 Android에서는 hit slop을 포함한 실제 입력 target을 최소 `48×48dp`로 제공해야 한다(MUST). 저장 action은 Web에서 `64×40` visual을 사용하고 iOS·Android에서는 각각 최소 `44pt`, `48dp` 실제 입력 높이를 제공해야 한다(MUST). Profile Tag 제거 action은 시각 크기 `32×32`와 실제 입력 target Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`를 분리하고, 다른 text action은 최소 높이 `36`과 대상·상태를 설명하는 accessibility label/state를 제공해야 한다(MUST).

#### Scenario: Render desktop shell layouts

- **WHEN** Web viewport가 1440 또는 1024 단계다
- **THEN** form은 각각 full sidebar/right rail 또는 icon rail 다음의 최대 `600px` 중앙 surface에 렌더된다
- **AND** 중앙 content를 별도 internal scroller로 바꾸지 않고 shell document scroll을 유지한다

#### Scenario: Operate compact controls accessibly

- **WHEN** 사용자가 header·avatar 편집, Tag 제거 또는 저장 action을 사용한다
- **THEN** form은 각 action의 대상·동작·disabled 상태를 accessibility label/state로 전달한다
- **AND** safe-area를 제외한 상단 navigation header content는 `64px`, 뒤로가기 layout target은 `44×44`이고 glyph는 `ArrowLeft` `24px`이다
- **AND** Android의 뒤로가기 실제 입력 target은 layout을 늘리지 않는 hit slop을 포함해 최소 `48×48dp`이다
- **AND** 제목은 `uiHeadingS` `20/26/700`으로 표시되고 Web 저장 action은 `64×40`이다
- **AND** header·avatar의 camera icon은 접근성 tree에서 숨기고 각 preview button 하나만 focus target으로 제공한다
- **AND** Profile Tag 제거 action은 `32×32` visual과 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp` 실제 입력 target을 제공한다
- **AND** 색만으로 validation·disabled·saving·failure 상태를 구분하지 않는다

#### Scenario: Preserve the mobile header boundary

- **WHEN** Profile edit presentation이 Mobile Web 또는 Android/iOS에서 렌더된다
- **THEN** shell이 platform safe-area를 header 바깥에서 제공하고 Profile edit header content는 `64px`를 유지한다
- **AND** 제목과 저장 action은 `16px` horizontal inset 안의 같은 header 행에서 정렬되며 font scaling이나 좁은 폭에서도 action의 입력 target과 겹치지 않는다
- **AND** iOS·Android 저장 action은 각각 최소 `44pt`, `48dp` 입력 높이를 유지한다
