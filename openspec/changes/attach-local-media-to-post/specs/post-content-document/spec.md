## MODIFIED Requirements

### Requirement: V1 canonical PostContent document envelope와 body schema

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554. 시스템은 `PostContent` revision을 version, summary와 body를 포함한 canonical document JSON으로 저장하고 V1 body를 실제 `prosemirror-model` schema로 검증해야 한다(MUST).

#### Scenario: V1 envelope 구성

- **WHEN** 시스템이 version `1`인 PostContent document를 검증한다
- **THEN** document는 exact `{ version, summary, body }` shape다
- **AND** `version`은 숫자 `1`이다
- **AND** `summary`는 nullable Plain Text Content Warning이며 null이 아니면 빈 문자열일 수 없다
- **AND** `body`는 ProseMirror root `doc`이다
- **AND** `summary`는 ProseMirror attr나 body node가 아니다
- **AND** V1 이후 rich summary가 필요하면 새 PostContent document version에서 summary의 구조를 승격한다

#### Scenario: V1 schema 구성

- **WHEN** 시스템이 version `1`인 PostContent document의 body를 검증한다
- **THEN** root node는 `doc`이고 content expression은 `(paragraph | media)+`이다
- **AND** root attr는 생략하면 `false`인 boolean `sensitiveMedia`만 허용한다
- **AND** `paragraph` content expression은 `inline*`이다
- **AND** inline node는 non-empty `text`와 mark를 가질 수 없는 `hard_break`만 허용한다
- **AND** mark는 `link`만 허용하고 attr는 `href` 하나만 허용한다
- **AND** block `media` node는 non-empty string `mediaId`와 nullable string `altText` attr만 허용한다
- **AND** 하나의 document는 Media node를 최대 4개까지 포함할 수 있다
- **AND** node와 mark에 열거되지 않은 attr, node 또는 mark가 있으면 검증을 거부한다
- **AND** `pre` node를 지원하지 않는다

#### Scenario: 기존 V1 document 호환

- **WHEN** Media node와 `sensitiveMedia` attr가 없는 기존 V1 document를 검증한다
- **THEN** 기존 paragraph, text, hard break와 link document는 계속 유효하다
- **AND** 생략한 `sensitiveMedia`는 `false`로 canonicalize한다
- **AND** canonical JSON에서는 `false`인 default attr를 생략한다
- **AND** Media 지원만으로 document schema version을 올리지 않는다

#### Scenario: 실제 ProseMirror schema 검증

- **WHEN** 서버가 외부 또는 저장 경계에서 V1 PostContent document JSON을 받는다
- **THEN** 시스템은 envelope와 열거된 attr scalar type을 검증하고 body를 V1 `Schema.nodeFromJSON()`으로 생성한 뒤 `Node.check()`로 구조를 검증한다
- **AND** 검증된 node의 `Node.toJSON()` 결과만 canonical document 후보로 사용한다
- **AND** 수동 shape 검사만으로 document를 승인하지 않는다

## ADDED Requirements

### Requirement: V1 Media canonicalization과 Plain Text 경계

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554. 시스템은 Media identity, revision별 Alt Text, 표시 순서와 Sensitive Media를 같은 canonical PostContent V1 revision에서 보존하고 Plain Text와 HTML projection에는 Media를 중복 표현하지 않아야 한다(MUST).

#### Scenario: Media 순서와 revision equality

- **WHEN** V1 document가 paragraph와 Media node를 함께 포함한다
- **THEN** canonicalization은 Media node의 상대 순서, `mediaId`, nullable `altText`와 root `sensitiveMedia`를 보존한다
- **AND** revision equality는 이 값 중 하나라도 다르면 서로 다른 revision 의미로 판정한다

#### Scenario: Media-only canonical document

- **WHEN** V1 document에 text가 없고 하나 이상의 Media node가 있다
- **THEN** canonical document는 빈 paragraph 하나와 Media node를 유지한다
- **AND** Plain Text projection은 빈 문자열이다

#### Scenario: Media를 제외한 파생 projection

- **WHEN** V1 document를 Plain Text 또는 Media attachment와 함께 사용하는 HTML로 projection한다
- **THEN** text, hard break, paragraph와 link의 기존 의미만 projection한다
- **AND** Media node를 text 또는 HTML `img`로 추가하지 않는다
