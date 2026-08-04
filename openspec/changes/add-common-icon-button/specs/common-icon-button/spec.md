## ADDED Requirements

### Requirement: 공통 IconButton 적용 경계

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-548` — 앱은 icon, glyph, 짧은 기호 문자 또는 loading indicator를 content로 사용하는 single-action compact square control에 공통 `IconButton`을 사용해야 한다(MUST). 실제 interactive element는 button role, 필수 accessible name과 현재 action의 접근성 상태를 제공해야 한다(MUST).

#### Scenario: 단일 compact action을 렌더링한다

- **WHEN** 화면이 icon, glyph, 짧은 기호 문자 또는 loading indicator로 하나의 action을 제공한다
- **THEN** action은 공통 `IconButton`을 사용하고 실제 interactive element에 button role과 accessible name을 제공한다

#### Scenario: 다른 의미의 control은 전환하지 않는다

- **WHEN** control이 상태 선택·토글·count, pill·tab·switch, Link·row, whole-preview/content 또는 compound control이다
- **THEN** 앱은 그 control을 공통 `IconButton` 적용 대상으로 간주하지 않고 기존 semantic owner를 유지한다

### Requirement: 플랫폼 최소 interaction target

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-548` — 공통 `IconButton`은 Web에서 `32×32 CSS px`, iOS에서 `44×44 pt`, Android에서 `48×48 dp` 이상의 interaction target을 제공해야 한다(MUST). Public target override와 caller style은 해당 플랫폼 floor를 낮출 수 없어야 하며(MUST), component-specific larger target은 유지해야 한다(MUST).

#### Scenario: caller가 floor보다 작은 값을 요청한다

- **WHEN** caller가 현재 플랫폼 floor보다 작은 target size나 width·height style을 전달한다
- **THEN** 실제 interactive element는 현재 플랫폼 floor보다 작아지지 않는다

#### Scenario: caller가 더 큰 target을 사용한다

- **WHEN** 기존 surface가 현재 플랫폼 floor보다 큰 interaction target을 소유한다
- **THEN** 공통 `IconButton`은 더 큰 target을 유지한다

#### Scenario: Web target을 검증한다

- **WHEN** Web에서 공통 `IconButton`의 pointer와 keyboard focus target을 측정한다
- **THEN** 렌더된 interactive element가 최소 `32×32 CSS px`를 제공하고 `hitSlop`만으로 floor 충족을 주장하지 않는다

#### Scenario: 기존 hit region을 공용 target으로 옮긴다

- **WHEN** 작은 visual box와 `hitSlop`을 결합해 target을 확장하던 action을 전환한다
- **THEN** 전환 후 effective input region은 줄어들거나 기존 expansion과 공용 floor가 중복 적용되지 않는다

### Requirement: Visual geometry와 interaction target 분리

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/page-header.md`, `docs/design/feedback.md`, `docs/design/post-media-gallery.md`, `docs/design/reactions.md`, `docs/design/reply-composer.md`, `docs/design/profile-edit.md`, `docs/design/profile-tags.md`, `PROD-548` — 공통 `IconButton`은 visible glyph·background·control geometry와 interaction target을 독립적으로 표현해야 한다(MUST). 기존 surface의 glyph 크기, visual box, 배치, 색상, focus 표시와 pressed·disabled feedback은 전환 전과 같아야 하며(MUST), 확장 target은 인접 action과 겹치거나 부모 clipping으로 잘리지 않아야 한다(MUST).

#### Scenario: 작은 visual control을 유지한다

- **WHEN** visual control이 현재 플랫폼 target보다 작다
- **THEN** visible geometry와 화면상 중심 위치는 유지되고 interaction target만 플랫폼 floor를 충족한다

#### Scenario: surface별 feedback을 유지한다

- **WHEN** 기존 action이 고유한 pressed background, opacity 또는 disabled 표현을 사용한다
- **THEN** 공통 `IconButton`은 하나의 전역 feedback을 강제하지 않고 해당 표현을 그대로 유지한다

#### Scenario: 인접 target과 clipping을 검증한다

- **WHEN** expanded target이 row, overlay 또는 absolute-positioned surface에 배치된다
- **THEN** 서로 다른 action target은 겹치지 않고 부모 bounds에 의해 유효 target이 잘리지 않는다

### Requirement: 상태와 제품 동작 전달

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-548` — 공통 `IconButton`은 disabled, pending, busy, expanded를 포함한 접근성 상태와 focus ref, press state, `onPressIn`을 포함한 event handler를 실제 interactive element에 전달해야 한다(MUST). 전환은 navigation, persistence, upload, modal 또는 session 제품 동작을 바꾸지 않아야 한다(MUST).

#### Scenario: expanded menu action을 전환한다

- **WHEN** menu action이 expanded 상태와 기존 pressed feedback을 전달한다
- **THEN** 전환 후 같은 상태와 feedback이 실제 button에 유지된다

#### Scenario: focus 보존 handler를 전환한다

- **WHEN** search action이 `onPressIn`으로 입력 focus를 유지한다
- **THEN** 전환 후 같은 handler 순서와 focus 결과를 유지한다

#### Scenario: pending action을 전환한다

- **WHEN** compact Logout action이 pending 상태에서 spinner, busy와 disabled를 표현한다
- **THEN** 전환 후 같은 content와 접근성 상태를 제공하고 session 동작을 변경하지 않는다

### Requirement: Production과 열린 PR inventory 전환

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-548` — PROD-548은 구현 시작과 merge 직전에 production 및 열린 PR inventory를 다시 확인해야 한다(MUST). 현재 production의 Profile back·Tag remove, UniversalShell menu/back, Post detail back, ModalSheet close, ReplyComposer close, search clear/recent-delete, Post Composer media add/remove, ReactionSummary more와 compact Logout action은 공통 `IconButton`을 사용해야 한다(MUST). PR #486의 FeedbackOverlay close와 PR #510의 PostMediaViewer close/previous/next는 merge 순서와 관계없이 최종 production 또는 merge 가능한 branch에 직접 `Pressable` 구현으로 남지 않아야 한다(MUST).

#### Scenario: 관련 PR이 공통 component보다 먼저 merge된다

- **WHEN** PR #486 또는 PR #510의 대상 action이 공통 `IconButton`보다 먼저 production branch에 들어온다
- **THEN** PROD-548 branch는 최신 production을 반영해 해당 action을 같은 change에서 전환한다

#### Scenario: 관련 PR이 공통 component merge 뒤에도 열려 있다

- **WHEN** PR #486 또는 PR #510이 공통 `IconButton` merge 뒤에도 열려 있다
- **THEN** 해당 PR은 최신 production을 반영하고 자신이 추가한 대상 action을 merge 전에 공통 component로 전환한다

#### Scenario: merge 직전 inventory를 재확인한다

- **WHEN** PROD-548 또는 후속 소비자 PR이 merge readiness를 판단한다
- **THEN** production과 열린 PR을 다시 검색해 새 대상의 누락, 제외 대상의 잘못된 전환과 직접 플랫폼 target 계산 잔존을 기록한다

### Requirement: 플랫폼별 검증 증거를 구분한다

**Authority / Provenance:** `docs/design/accessibility.md`, `PROD-548` — 공통 `IconButton`은 component 자동화와 Web runtime에서 target, semantics, state 전달, visual geometry와 overlap·clipping을 검증해야 한다(MUST). iOS·Android mapping은 공용 source와 자동화에 유지해야 하지만(MUST), 그 결과나 Web runtime을 Native 실제 기기·simulator 검증 완료로 보고해서는 안 된다(MUST NOT).

#### Scenario: Web 완료 증거를 기록한다

- **WHEN** Web component·surface 자동화와 runtime 검증을 완료한다
- **THEN** 검증한 viewport·입력·focus·geometry와 실행하지 않은 Native runtime 범위를 분리해 기록한다

#### Scenario: Native mapping만 확인한다

- **WHEN** iOS·Android 실제 기기나 simulator를 실행하지 않고 공용 source mapping만 확인한다
- **THEN** 결과를 source-level mapping 증거로만 기록하고 Native touch·focus·assistive technology 완료로 표현하지 않는다
