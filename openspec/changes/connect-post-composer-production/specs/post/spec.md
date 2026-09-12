## ADDED Requirements

### Requirement: 공용 Post Composer Production presentation 연결

**Authority / Provenance:** `docs/design/figma.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/media-upload-errors.md`, `docs/design/icons.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, DSN-43, PROD-797 — 유니버설 앱은 공용 `PostComposer` Rail·Overlay presentation과 Media presentation/editor를 기존 일반 Post 작성 상태, Media upload lifecycle과 `createPost` mutation에 MUST 연결한다. presentation은 작성 상태나 Relay·route·upload 소유권을 새로 만들지 MUST NOT 하며, Poll·Emoji 동작 또는 이미지 crop·회전·초점 편집을 구현된 기능처럼 노출하지 MUST NOT 한다.

#### Scenario: Rail과 Overlay에서 같은 draft 사용

- **WHEN** Full Web Rail의 작성자가 본문, Content Warning, 공개 범위 또는 Media 상태를 변경한 뒤 Expand action을 실행한다
- **THEN** 시스템은 같은 작성 상태를 공용 Overlay presentation에 표시한다
- **AND** 별도 composer state, Relay environment 또는 `createPost` mutation 경계를 만들지 않는다
- **AND** Overlay에서는 composer-level Expand action을 숨긴다

#### Scenario: 기존 작성 계약을 공용 presentation에 표시

- **WHEN** Production Post Composer가 유효한 selected Profile과 함께 Rail, desktop Overlay 또는 모바일 전체 화면에 표시된다
- **THEN** 시스템은 기존 본문, optional Content Warning, `PUBLIC`·`UNLISTED`·`FOLLOWERS` 공개 범위, 남은 글자수와 게시 action을 공용 presentation에 연결한다
- **AND** 최대 4개의 Media preview, upload 진행·실패, 항목별 재시도·제거, nullable Alt Text와 Post 단위 Sensitive Media 상태를 연결한다
- **AND** 제출 가능 여부, pending, 안전한 오류와 재제출 상태는 기존 작성·upload 계약에서 파생한다

#### Scenario: Content Warning 입력을 접었다가 다시 열기

- **WHEN** 사용자가 Content Warning 문구를 입력한 뒤 toolbar action으로 입력 영역을 끄고 다시 켠다
- **THEN** 시스템은 작성 중인 Content Warning 문구를 예고 없이 지우지 않고 다시 표시한다
- **AND** 별도 Content Warning 글자수 제한을 만들지 않고 기존 본문과의 합산 길이 정책을 유지한다

#### Scenario: desktop Rail 또는 Overlay에 CW 또는 Media 추가

- **WHEN** desktop Rail 또는 Overlay에서 Content Warning을 열거나 Media를 추가한다
- **THEN** 시스템은 `PostComposer` 외곽과 author·editor header·footer의 위치를 유지한다
- **AND** Rail은 404px, Overlay는 624px 외곽 높이를 유지한다
- **AND** body·Content Warning·Media가 가운데 작성 영역을 함께 사용하고 넘치는 내용만 그 영역에서 scroll한다
- **AND** 짧은 viewport의 Overlay에서는 Host의 제한 높이 안으로 외곽을 줄이고 author·editor header·footer를 계속 표시한다
- **AND** 모바일 전체 화면의 기존 높이·scroll 계약을 변경하지 않는다

#### Scenario: 모바일 공개 범위 menu 열기

- **WHEN** 모바일 전체 화면 Composer에서 사용자가 공개 범위 menu를 연다
- **THEN** 시스템은 menu의 오른쪽 경계를 화면 오른쪽에서 16px 떨어진 위치에 표시한다

#### Scenario: Media editor에서 작성 상태 보존

- **WHEN** 사용자가 Ready Media의 thumbnail, ALT·민감 상태 또는 편집 action으로 `ComposerMediaEditor`를 연다
- **THEN** 시스템은 같은 상위 Overlay 안에서 composer content를 editor content로 교체한다
- **AND** 별도 modal 또는 scrim을 중첩하지 않는다
- **AND** Back은 본문과 Media draft를 유지한 채 composer로 돌아간다
- **AND** 완료는 선택 attachment의 Alt Text 또는 Post 단위 Sensitive Media 변경을 draft에 반영하고 composer로 돌아간다
- **AND** 이미지 편집 preview는 crop·회전·초점 결과를 저장하는 action을 제공하지 않는다

#### Scenario: 일반 Post 제출 성공

- **WHEN** Rail, desktop Overlay 또는 모바일 전체 화면에서 일반 Post 작성이 성공한다
- **THEN** 시스템은 기존 계약대로 작성 상태와 오류를 기본값으로 초기화한다
- **AND** 열린 Overlay 또는 모바일 전체 화면 surface를 닫는다
- **AND** Web은 생성 Post 경로로 이동하지 않고 현재 timeline route를 유지한다
- **AND** 모바일은 Home timeline으로 돌아간다

#### Scenario: 일반 Post 제출 실패

- **WHEN** 공용 presentation에서 `createPost`가 실패한다
- **THEN** 시스템은 열린 작성 surface와 본문, Content Warning, 공개 범위, Media, Alt Text와 Sensitive Media draft를 유지한다
- **AND** 안전한 한국어 오류와 재제출 경로를 제공한다

#### Scenario: Profile 또는 Relay actor 전환

- **WHEN** 열린 composer의 selected Profile 또는 Relay actor가 변경된다
- **THEN** 시스템은 기존 actor environment 재생성과 Composer context isolation 계약을 유지한다
- **AND** 이전 Profile의 draft, pending, 오류 또는 성공 결과를 새 Profile의 composer에 노출하지 않는다

#### Scenario: Reply 작성 회귀 방지

- **WHEN** 목록 또는 상세에서 Reply composer를 연다
- **THEN** 시스템은 기존 Parent 문맥, surface presentation, close·focus, 작성 상태와 `replyParentId` 제출 계약을 유지한다
- **AND** 일반 Post의 Rail·Overlay 연결을 이유로 Reply presentation을 교체하지 않는다

### Requirement: Post Composer surface 접근성과 viewport lifecycle

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/icons.md`, DSN-43, PROD-797 — Production composer host는 Web modal과 모바일 전체 화면의 dismiss, focus, viewport와 keyboard lifecycle을 MUST 소유한다. 공용 presentation은 모든 플랫폼에서 동등한 role, accessible name, disabled·busy·error state를 MUST 제공하며, Storybook fixture 동작을 Production lifecycle로 사용하지 MUST NOT 한다.

#### Scenario: Web Overlay keyboard와 focus lifecycle

- **WHEN** Web 사용자가 Rail Expand 또는 compact icon rail의 글쓰기 trigger로 composer Overlay를 연다
- **THEN** 시스템은 이름이 있는 modal dialog 하나를 표시하고 초기 작성 control로 focus를 이동한다
- **AND** focus를 Overlay 안에 유지한다
- **AND** Escape, backdrop 또는 닫기 action은 같은 dismiss 경계로 Overlay를 닫는다
- **AND** 닫힌 뒤 Overlay를 연 trigger로 focus를 복귀한다

#### Scenario: 모바일 back과 keyboard 대응

- **WHEN** mobile Web, Android 또는 iOS의 전체 화면 composer에서 platform back을 실행하거나 keyboard가 표시된다
- **THEN** platform back은 상위 composer surface의 dismiss 경계로 전달된다
- **AND** safe area와 keyboard가 header, 현재 focus, footer action을 가리지 않는다
- **AND** 짧은 viewport 또는 font scaling에서도 content 내부 scroll로 모든 작성 control에 접근할 수 있다

#### Scenario: 닫기와 editor Back 구분

- **WHEN** Media editor가 열린 상태에서 사용자가 Back action을 실행한다
- **THEN** 시스템은 composer surface를 닫지 않고 같은 draft의 composer view로 돌아간다
- **WHEN** 사용자가 Close action을 실행한다
- **THEN** 시스템은 상위 composer surface 전체를 닫는다

#### Scenario: 미완성 draft를 닫았다가 다시 열기

- **WHEN** 사용자가 미완성 draft가 있는 composer surface를 닫은 뒤 같은 Profile lifecycle에서 다시 연다
- **THEN** 시스템은 기존 draft와 진행 중인 upload 상태를 다시 표시한다
- **AND** 이 변경은 별도 discard confirmation을 추가하지 않는다
