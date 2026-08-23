# profile-tag-ui Specification

## Purpose

TBD - created by archiving change add-profile-tags. Update Purpose after archive.

## Requirements

### Requirement: Profile Tag editor

**Authority / Provenance:** `docs/design/profile-tags.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-491`, `PROD-527` — 기존 Profile 편집 화면은 Local Profile Owner가 현재 Profile Tag를 확인하고 추가·제거할 수 있는 `프로필 태그` 섹션을 제공해야 한다(MUST). 저장된 chip에는 Hashtag가 보존한 Display Hashtag Name 앞에 `#`를 한 번만 표시해야 하며(MUST), 새로 추가한 저장 전 draft chip에는 로컬 정규화한 입력 표기 후보를 표시해야 한다(MUST). 저장 성공 뒤에는 서버 payload의 first-write-wins Display Hashtag Name으로 동기화해야 한다(MUST). canonical lowercase 이름은 identity·중복 판정에만 사용해야 한다(MUST). Profile Tag 개수와 저장·노출 순서는 제품 계약이 아니다.

#### Scenario: Add and remove Profile Tags

- **WHEN** Owner가 유효한 Profile Tag를 추가한다
- **THEN** 편집기는 로컬 정규화한 입력 표기 후보에 `#`를 한 번 붙인 chip을 현재 draft 목록에 추가한다
- **AND** 저장 성공 전에는 기존 Hashtag identity의 first-write-wins Display Hashtag Name을 조회했다고 가정하지 않는다
- **AND** Owner가 chip을 제거하면 해당 Profile Tag 관계를 draft에서 제거한다

### Requirement: Profile Tag editor validation and save states

**Authority / Provenance:** `docs/design/profile-tags.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-491`, `PROD-527` — Profile Tag 편집기는 Hashtag가 정의한 빈 값·허용하지 않는 문자·정규화 뒤 20 code point 초과를 저장 전에 입력 가까이에 알려야 한다(MUST). Profile Tag 입력은 Hashtag identity로 resolve한 뒤 같은 canonical identity가 중복되는 경우도 알려야 한다(MUST). Profile Tag 목록은 다른 Profile 편집 값과 같은 저장 action에 포함해야 하며(MUST), 저장 중 중복 제출을 막고 실패 뒤 draft 입력을 보존해야 한다(MUST).

#### Scenario: Show client validation near the input

- **WHEN** Owner가 비어 있거나 Hashtag가 허용하지 않는 범위를 벗어나거나 Hashtag identity로 resolve한 뒤 중복되는 Profile Tag를 추가 또는 저장하려 한다
- **THEN** 편집기는 원인을 입력 또는 관련 chip 가까이에 표시한다
- **AND** 색만으로 오류 상태를 구분하지 않는다

#### Scenario: Prevent duplicate submission

- **WHEN** Profile 저장 요청이 진행 중이다
- **THEN** 편집기는 같은 저장 action의 중복 제출을 막는다
- **AND** 저장 중 상태를 보이는 표현과 접근성 상태로 알린다

#### Scenario: Preserve draft after server failure

- **WHEN** Profile Tag를 포함한 Profile 저장이 서버 validation 또는 일시적 오류로 실패한다
- **THEN** 편집기는 Owner가 입력한 현재 Tag draft와 다른 Profile draft를 유지한다
- **AND** 서버 validation을 해당 입력에 연결해 보여 주고 같은 draft로 재시도할 수 있게 한다

#### Scenario: Synchronize the saved Profile

- **WHEN** Profile Tag를 포함한 Profile 저장이 성공한다
- **THEN** 클라이언트는 mutation이 반환한 Profile의 Hashtag Node 목록으로 편집 화면과 공개 Profile cache를 동기화한다
- **AND** 서버가 반환한 Hashtag global `id`와 Display Hashtag Name `name`으로 동기화하며 배열 순서를 계약으로 해석하지 않는다

### Requirement: Accessible universal Profile Tag controls

**Authority / Provenance:** `docs/design/profile-tags.md`, `docs/design/accessibility.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-491`, `PROD-527` — Profile Tag 편집·표시 UI는 React Native primitive와 기존 theme token으로 Web·Android·iOS에서 같은 정보 구조를 사용해야 한다(MUST). 편집기와 공개 Profile이 공유하는 TagChip은 시각 높이 `32`를 유지하고 표시 text를 한 줄과 tail ellipsis로 제한하되, 접근성 이름에는 생략하지 않은 전체 `#<Display Hashtag Name>`을 제공해야 한다(MUST). 제거 action은 compact `32×32` 시각 크기와 별도로 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp` 실제 target 및 동작을 설명하는 accessibility label·state를 제공해야 한다(MUST). iOS `44×44 pt`와 Android `48×48 dp`로 시각 크기보다 확장된 실제 target은 인접한 다른 TagChip 제거 action target과 겹치지 않아야 하며(MUST), 여러 줄 wrapping에서도 이 비중첩 조건을 유지해야 한다(MUST). Profile Tag 순서 변경 control은 제공하지 않는다.

#### Scenario: Keep a long shared TagChip compact and accessible

- **WHEN** 편집기 또는 공개 Profile이 너비보다 긴 유효한 Display Hashtag Name을 TagChip에 표시한다
- **THEN** TagChip은 시각 높이 `32`와 한 줄을 유지하고 넘치는 text를 tail ellipsis로 생략한다
- **AND** TagChip의 접근성 이름은 생략하지 않은 전체 `#<Display Hashtag Name>`을 제공한다
- **AND** 시각적 생략은 저장된 Display Hashtag Name을 변경하지 않는다

#### Scenario: Operate removal with pointer, touch, assistive technology, or Web keyboard

- **WHEN** 사용자가 pointer·touch 또는 보조 기술로 Profile Tag 제거 action을 탐색하거나 Web에서 Tab으로 제거 action에 focus한다
- **THEN** 제거 control은 compact `32×32` 시각 크기를 유지한다
- **AND** 실제 target은 Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp`를 제공한다
- **AND** Web에서 Tab으로 도달한 제거 action은 focus-visible 표시를 유지한다
- **AND** Web에서 Enter 또는 Space를 입력하면 pointer·touch와 동일한 Tag 제거 결과를 실행한다
- **AND** 대상 Tag를 포함한 accessibility label을 제공한다
- **AND** disabled·validation·선택 상태를 색만으로 전달하지 않는다

#### Scenario: Render the shared states on every platform

- **WHEN** Profile Tag 편집·표시 component의 기본, validation, 저장 중, 실패와 임의 개수의 긴 목록 상태를 검증한다
- **THEN** Web·Android·iOS 공용 component와 상태 카탈로그가 같은 정보 구조와 theme token으로 렌더된다
- **AND** Profile Tag 전용 foundation token 또는 별도 breakpoint를 요구하지 않는다
