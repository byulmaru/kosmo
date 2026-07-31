## ADDED Requirements

### Requirement: 현재 Post Content Media 표시

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, PROD-571 — 공용 Post renderer는 현재 Post Content document의 Media node와 viewer-authorized `PostContent.media`를 사용해 일반 Post 목록과 상세에 최대 4개 이미지를 MUST 표시한다. Media node의 document 순서를 바꾸거나 본문·안전한 링크 의미를 MUST NOT 제거한다.

#### Scenario: 본문과 Media가 함께 있는 Post

- **WHEN** 조회 가능한 현재 Post Content document가 paragraph와 Media node를 함께 가진다
- **THEN** 목록과 상세는 기존 본문·안전한 링크와 각 이미지를 모두 표시한다
- **AND** 이미지는 Media node의 document 순서를 유지한다

#### Scenario: Media-only Post

- **WHEN** 조회 가능한 현재 Post Content document가 Plain Text 없이 하나 이상의 Media node를 가진다
- **THEN** 목록과 상세는 빈 Post 대신 실제 이미지를 표시한다

#### Scenario: Media가 없는 기존 Post

- **WHEN** 현재 Post Content document가 Media node를 가지지 않는다
- **THEN** 기존 본문·안전한 링크 renderer와 목록·상세 navigation 동작을 그대로 유지한다

### Requirement: Media 접근성 설명

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-571 — 공용 Post Media UI는 Media의 nullable Alt Text를 이미지의 접근 가능한 설명으로 MUST 제공한다. Alt Text가 없을 때도 의미 있는 Post 첨부 이미지가 보조 기술에서 장식 이미지로 숨겨지지 않도록 안전한 기본 이름을 MUST 제공한다.

#### Scenario: Alt Text가 있는 이미지

- **WHEN** Media의 `altText`가 non-empty 문자열이다
- **THEN** Web·iOS·Android 이미지의 accessible name은 해당 Alt Text를 사용한다

#### Scenario: Alt Text가 없는 이미지

- **WHEN** Media의 `altText`가 null이거나 빈 문자열이다
- **THEN** 이미지는 document 순서에 대응하는 한국어 기본 이름으로 보조 기술에 노출된다

### Requirement: Sensitive Media 명시적 공개

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-571 — 현재 Post Content document root의 `sensitiveMedia`가 true이면 공용 Post Media UI는 해당 revision의 모든 Media를 기본적으로 MUST 가린다. 사용자가 같은 Post 안에서 이미지를 명시적으로 표시하고 다시 가릴 수 있는 접근 가능한 control을 MUST 제공한다.

#### Scenario: Sensitive Media 기본 상태

- **WHEN** `sensitiveMedia`가 true인 Post를 처음 표시한다
- **THEN** 이미지 byte는 보이지 않고 민감한 이미지임을 설명하는 placeholder와 표시 action이 제공된다
- **AND** 표시 action은 Web keyboard와 iOS·Android touch·screen reader에서 같은 결과를 제공한다

#### Scenario: Sensitive Media 표시와 다시 가리기

- **WHEN** 사용자가 민감한 이미지 표시 action을 실행한다
- **THEN** 같은 Post의 Media가 표시되고 control은 expanded 상태와 다시 가리기 action을 전달한다
- **AND** 다시 가리기 action을 실행하면 같은 Post의 모든 Media가 가려진 기본 상태로 돌아간다

#### Scenario: 일반 Media

- **WHEN** `sensitiveMedia`가 false이거나 생략된다
- **THEN** 별도 공개 action 없이 이미지를 표시한다

### Requirement: Media 로딩 실패 격리와 재시도

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/design/accessibility.md`, PROD-571 — 공용 Post Media UI는 URL을 사용할 수 없거나 이미지 로딩이 실패해도 Post 전체 rendering을 MUST NOT 실패시킨다. 실패한 Media 자리에 상태 설명과 현재 viewer-authorized 표시 URL을 다시 로드하는 접근 가능한 재시도 action을 MUST 제공한다.

#### Scenario: 한 이미지 로딩 실패

- **WHEN** 여러 Media 중 하나의 URL 로딩이 실패한다
- **THEN** 실패한 자리만 오류 fallback과 재시도 action으로 바뀐다
- **AND** 기존 본문, 다른 이미지, Post action과 navigation은 계속 사용할 수 있다

#### Scenario: Media 표시 정보 unavailable

- **WHEN** 현재 Post Content의 필요한 Media 표시 정보가 partial list 대신 unavailable이다
- **THEN** Post는 Media unavailable fallback을 표시하고 본문·Post action·navigation을 유지한다

#### Scenario: 실패한 이미지 재시도

- **WHEN** 사용자가 실패한 Media의 재시도 action을 실행한다
- **THEN** UI는 해당 Media의 현재 표시 URL로 새 이미지 load를 시작하고 loading 상태를 전달한다
- **AND** 다시 실패하면 같은 fallback과 재시도 action으로 돌아간다
