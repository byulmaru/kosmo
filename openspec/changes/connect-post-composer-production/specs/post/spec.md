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
- **THEN** Rail은 풀 사이드바와 같은 `320px` 우측 column에서 본문, Media gallery와 footer를 순서대로 HUG한다
- **AND** Media가 있으면 본문은 최소 `100px`만 확보하고 gallery를 바로 다음에 배치하며 별도 빈 공간을 예약하지 않는다
- **AND** Overlay는 `640px` 폭으로 viewport 상단 `48px`에 배치하고 내용과 함께 늘어난다
- **AND** Rail·Overlay의 본문 입력은 텍스트 줄 수에 따라 늘어나며 Media·CW도 같은 content-flow에 합류한다
- **AND** Rail은 외곽에 고정 최대 높이를 두지 않고 content를 HUG한다
- **AND** Rail의 본문 TextInput만 `300px`에서 내부 scroll로 전환한다
- **AND** Rail의 `112px` Media gallery는 본문 scroller 밖 별도 영역에 표시하고 footer는 항상 가시 상태로 유지한다
- **AND** Overlay가 상·하 `48px` gutter를 제외한 최대 높이에 도달하면 author·editor header·CW·footer를 유지하고 body·Media만 가운데 scroller에서 scroll한다
- **AND** Rail의 editor outline과 개인정보 처리방침 footer는 우측 column 왼쪽에서 16px인 같은 기준선에 맞춘다
- **AND** Rail 본문에 focus가 있으면 TextInput 자체가 아니라 editor outline 전체를 primary 색으로 표시하고, Overlay·모바일 본문과 CW·ALT에는 이 외곽 강조를 적용하지 않는다
- **AND** Rail editor header의 공개 범위와 Expand control은 본문 작성 영역의 좌우 기준선에 맞춘다
- **AND** Content Warning은 editor header 다음에 표시하고 Media gallery보다 앞에 둔다
- **AND** 모바일 전체 화면의 기존 높이·scroll 계약을 변경하지 않는다

#### Scenario: Web Composer scrollbar contract

- **WHEN** Web Post Composer가 Rail 또는 Overlay에서 KOSMO-owned vertical scroller를 표시한다
- **THEN** vertical scrollbar는 `borderStrong` thumb와 투명 track을 사용하는 얇은 스타일로 표시된다
- **AND** Overlay만 stable gutter를 예약해 scrollbar가 content 위를 덮지 않는다
- **AND** Rail은 scrollbar gutter를 추가하지 않는다
- **AND** horizontal gallery 또는 tab scroller처럼 시각적 scrollbar를 숨기는 기능별 예외는 기존 navigation·swipe·keyboard 도달 계약과 함께 유지한다

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

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, `docs/design/icons.md`, DSN-43, PROD-797 — Production composer host는 Web modal과 모바일 전체 화면의 dismiss, focus, viewport와 keyboard lifecycle을 MUST 소유한다. 기존 공용 composer dismiss boundary는 제출 pending 중 Web의 Escape·backdrop·닫기 action과 Native의 platform back을 모두 차단해 열린 surface, draft와 pending 상태를 유지해야 한다(MUST). 공용 presentation은 모든 플랫폼에서 동등한 role, accessible name, disabled·busy·error state를 MUST 제공하며, Storybook fixture 동작을 Production lifecycle로 사용하지 MUST NOT 한다.

#### Scenario: Web Overlay keyboard와 focus lifecycle

- **WHEN** Web 사용자가 Rail Expand 또는 compact icon rail의 글쓰기 trigger로 composer Overlay를 연다
- **THEN** 시스템은 이름이 있는 modal dialog 하나를 표시하고 초기 작성 control로 focus를 이동한다
- **AND** focus를 Overlay 안에 유지한다
- **AND** Escape, backdrop 또는 닫기 action은 같은 dismiss 경계로 Overlay를 닫는다
- **AND** 닫힌 뒤 Overlay를 연 trigger로 focus를 복귀한다

#### Scenario: 제출 pending 중 모든 composer dismiss 차단

- **WHEN** composer 제출이 pending인 동안 사용자가 Web의 Escape·backdrop·닫기 action 또는 Native의 platform back을 실행한다
- **THEN** 기존 공용 composer dismiss boundary는 해당 dismiss 입력을 모두 차단하고 composer surface를 닫지 않는다
- **AND** draft와 pending 제출 상태를 유지한다

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

#### Scenario: Web 문서 unload에서 미완성 draft 보호

- **WHEN** Production Post Composer의 본문, Content Warning, Media(업로드 중·실패 상태 포함) 또는 기본값과 다른 공개 범위가 남아 있는 동안 Web 문서를 새로고침하거나 탭을 닫는다
- **THEN** 시스템은 브라우저 기본 unload 확인을 요청한다
- **AND** draft가 clean 상태가 되면 unload 확인 listener를 제거한다
- **AND** Composer surface의 내부 close에는 unload 확인을 표시하지 않고 같은 Profile lifecycle의 draft를 유지한다
- **AND** Android·iOS 강제 종료 전 확인이나 종료 후 draft 영속화를 이 동작의 완료 증거로 주장하지 않는다

## MODIFIED Requirements

### Requirement: Post composer usage boundary

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, PROD-461, PROD-553, DSN-43, PROD-797 — 유니버설 앱은 새 글 작성 컴포넌트 사용처에서 인증과 active profile 부재 상태를 처리해야 한다(MUST). 지원되는 shell composer 사용처는 `currentSession.selectedProfile`과 새 글 작성 컴포넌트가 요구하는 `Profile` fragment를 선언해야 하며(MUST), 이미 열린 composer surface에서 프로필 전환이 성공하면 새 actor의 Relay environment에서 사용처 query를 다시 실행해 작성 프로필을 반영해야 한다(MUST). direct `/compose` route는 작성 사용처나 compatibility entry로 제공하지 않는다(MUST NOT).

#### Scenario: 사용처 로딩 상태

- **WHEN** 새 글 작성 컴포넌트가 놓인 사용처가 현재 session과 active profile 정보를 불러오는 중이다
- **THEN** 시스템은 로딩 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 인증되지 않은 사용자

- **WHEN** 인증 session이 없는 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 게시글을 작성하려면 로그인이 필요하다는 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 선택 프로필이 없는 사용자

- **WHEN** 로그인했지만 active profile이 선택되지 않은 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 홈(`/home`)으로 이동해 프로필을 만들거나 선택하도록 안내하고, 홈으로 이동하는 링크/버튼을 제공한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: shell composer 사용처

- **WHEN** 로그인한 사용자의 active profile이 선택된 상태에서 지원되는 shell composer trigger가 실행된다
- **THEN** composer 사용처 query는 `currentSession.selectedProfile`에서 새 글 작성 컴포넌트가 선언한 `Profile` fragment를 spread한다
- **AND** composer 사용처는 query 결과의 selected profile fragment ref를 작성 프로필로 사용한다
- **AND** 시스템은 selected profile이 있을 때만 새 글 작성 컴포넌트에 해당 fragment ref를 전달한다
- **AND** composer 사용처는 본문 입력, 공개 범위, 글자수, mutation 제출 로직을 직접 소유하지 않는다

#### Scenario: 이미 열린 composer에서 active profile 전환

- **WHEN** 사용자가 composer surface를 열어 둔 상태에서 앱 셸의 프로필 전환을 성공시킨다
- **THEN** 시스템은 새 selected profile ID를 actor key로 사용해 Relay environment를 재생성한다
- **AND** composer 사용처 query는 새 environment에서 `currentSession.selectedProfile`을 다시 조회해 새 글 작성 컴포넌트의 작성 프로필로 반영한다
- **AND** 새 글 작성 컴포넌트가 요구하는 `Profile` fragment 데이터는 프로필 전환 mutation이 아니라 composer 사용처 query가 소유한다
