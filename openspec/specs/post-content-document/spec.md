# post-content-document Specification

## Purpose

PostContent 본문의 versioned ProseMirror document schema, 서버 검증·canonicalization, Plain Text 호환 경계와 제한된 앱 renderer 계약을 정의한다.

## Requirements

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
- **AND** block `media` node는 non-empty string `mediaId` attr 하나만 허용한다
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

### Requirement: 결정적인 canonicalization

시스템은 의미가 같은 V1 입력이 같은 canonical PostContent document JSON을 만들도록 summary와 body의 line ending, 빈 node, 인접 text, mark와 URL을 결정적으로 정규화해야 한다(MUST).

#### Scenario: summary 정규화

- **WHEN** nullable V1 summary를 canonicalize한다
- **THEN** null은 null로 유지한다
- **AND** CRLF와 CR을 LF로 정규화하고 trim한다
- **AND** 정규화 결과가 비어 있으면 검증을 거부한다

#### Scenario: Plain Text 입력 변환

- **WHEN** 로컬 `bodyText`를 V1 document로 변환한다
- **THEN** 시스템은 CRLF와 CR을 LF로 정규화하고 기존 Plain Text validation과 같은 trim 결과를 사용한다
- **AND** 하나의 paragraph 안에서 각 LF를 `hard_break`로 변환한다
- **AND** 연속 LF는 같은 수의 연속 `hard_break`로 보존한다
- **AND** text가 없으면 빈 paragraph 하나를 가진 document를 만든다

#### Scenario: 빈 node와 인접 text 정규화

- **WHEN** 유효한 document를 canonicalize한다
- **THEN** text node 안의 CRLF와 CR을 LF로 통일하고 각 LF를 `hard_break`로 변환하며 앞뒤 text의 기존 mark를 유지한다
- **AND** 시스템은 text와 hard break가 없는 paragraph를 제거한다
- **AND** 모든 paragraph가 제거되면 빈 paragraph 하나를 유지한다
- **AND** 같은 canonical mark 집합을 가진 인접 text node를 하나로 병합한다
- **AND** 빈 text node는 저장하지 않는다

#### Scenario: link mark 정규화

- **WHEN** text node에 link mark가 있다
- **THEN** 시스템은 absolute `http` 또는 `https` URL만 허용한다
- **AND** 시스템은 WHATWG URL 직렬화 결과를 canonical `href`로 사용한다
- **AND** 동일한 link mark 중복은 하나로 줄이고 mark 순서를 schema 순서로 정렬한다
- **AND** 서로 다른 link mark가 같은 text에 중첩되거나 URL이 malformed 또는 비지원 scheme이면 검증을 거부한다

### Requirement: Plain Text projection과 revision equality

시스템은 canonical PostContent document의 summary와 body에서 Plain Text를 결정적으로 파생하고 전체 canonical document 의미로 revision equality를 판정해야 한다(MUST).

#### Scenario: Plain Text projection

- **WHEN** 시스템이 V1 document를 Plain Text로 projection한다
- **THEN** text node의 문자열을 순서대로 연결한다
- **AND** `hard_break`는 LF 하나로 변환한다
- **AND** paragraph 사이는 LF 두 개로 구분한다
- **AND** link는 표시 text만 Plain Text에 포함한다
- **AND** body projection은 읽기, 검색과 접근성에 사용할 수 있지만 별도 canonical 저장값이 아니다

#### Scenario: 전체 authored Plain Text 길이

- **WHEN** 로컬 작성 경계가 V1 PostContent의 500자 제한을 검증한다
- **THEN** nullable summary의 Plain Text 길이와 body Plain Text projection 길이를 합산한다
- **AND** summary와 body 사이의 표시용 구분 문자는 사용자가 작성한 값이 아니므로 합산하지 않는다

#### Scenario: 같은 version revision equality

- **WHEN** 두 revision의 document version이 모두 `1`이다
- **THEN** 시스템은 두 `{ version, summary, body }` document를 canonicalize한 구조적 결과를 비교한다
- **AND** raw JSON 문자열, key ordering 또는 별도 Plain Text projection을 identity로 사용하지 않는다
- **AND** canonical summary와 body가 모두 같을 때만 같은 의미로 판정한다

#### Scenario: schema version이 다른 revision equality

- **WHEN** 두 revision의 document version이 다르다
- **THEN** 시스템은 각 version의 등록된 migration으로 같은 target version에 canonicalize한 뒤 비교해야 한다
- **AND** migration이 없는 version은 같다고 판정하지 않고 지원되지 않는 version으로 거부한다

### Requirement: server-only ProseMirror runtime boundary

시스템은 `prosemirror-model` runtime을 서버 전용 경계에만 포함하고 유니버설 앱에는 native-safe JSON 타입만 제공해야 한다(MUST).

#### Scenario: 서버와 앱 import 경계

- **WHEN** 서버가 document를 검증, 변환 또는 canonicalize한다
- **THEN** 서버 전용 core subpath가 `prosemirror-model`을 사용할 수 있다
- **AND** 앱이 사용하는 core subpath는 JSON 타입과 runtime-independent type guard만 제공한다
- **AND** React Native/Web bundle은 `prosemirror-model`, ProseMirror editor/view, TipTap 또는 WebView editor runtime을 포함하지 않는다

#### Scenario: 앱 표시용 V1 guard의 additive 속성 호환

- **WHEN** version `1` document가 필수 구조·타입과 안전한 absolute HTTP(S) link를 만족하면서 앱이 소비하지 않는 추가 object 속성을 포함한다
- **THEN** runtime-independent type guard는 추가 속성을 무시하고 document를 유효한 V1 표시 입력으로 판정한다
- **AND** 알 수 없는 node·mark, 누락되거나 잘못된 필수 값, 지원하지 않는 version과 안전하지 않은 link는 계속 거부한다
- **AND** 서버의 canonical write validation과 저장 표현 정규화 경계는 완화하지 않는다

### Requirement: limited native and web renderer

유니버설 앱은 V1 JSON의 paragraph, text, hard break와 link만 React Native primitive로 렌더링해야 한다(MUST).

#### Scenario: 지원 document 렌더링

- **WHEN** 앱이 version `1`의 유효한 document를 표시한다
- **THEN** paragraph 순서와 경계를 보존한다
- **AND** text와 hard break를 표시한다
- **AND** link label을 본문에 표시하고 검증된 absolute HTTP(S) href만 platform link action으로 연다
- **AND** link는 접근성 link role과 목적지를 식별할 수 있는 label을 가진다

#### Scenario: 미지원 document 방어

- **WHEN** 앱이 알 수 없는 document version·node·mark, 잘못된 필수 attr 또는 안전하지 않은 link를 받는다
- **THEN** 앱은 해당 값을 실행 가능한 UI로 렌더링하지 않는다
- **AND** GraphQL이 제공한 파생 `bodyText`를 안전한 fallback으로 표시한다

### Requirement: V1 Media canonicalization과 Plain Text 경계

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554, PROD-570. 시스템은 Media identity, 표시 순서와 Sensitive Media를 canonical PostContent V1 revision에서 보존하고 nullable Alt Text는 Media에 저장하며 Plain Text와 HTML projection에는 Media를 중복 표현하지 않아야 한다(MUST).

#### Scenario: Media 순서와 revision equality

- **WHEN** V1 document가 paragraph와 Media node를 함께 포함한다
- **THEN** canonicalization은 Media node의 상대 순서, `mediaId`와 root `sensitiveMedia`를 보존한다
- **AND** revision equality는 이 값 중 하나라도 다르면 서로 다른 revision 의미로 판정한다
- **AND** Media node는 `altText` attr를 저장하지 않으며 Alt Text 변경만으로 revision 의미가 바뀌지 않는다

#### Scenario: Media-only canonical document

- **WHEN** V1 document에 text가 없고 하나 이상의 Media node가 있다
- **THEN** canonical document는 빈 paragraph 하나와 Media node를 유지한다
- **AND** Plain Text projection은 빈 문자열이다

#### Scenario: Media를 제외한 파생 projection

- **WHEN** V1 document를 Plain Text 또는 Media attachment와 함께 사용하는 HTML로 projection한다
- **THEN** text, hard break, paragraph와 link의 기존 의미만 projection한다
- **AND** Media node를 text 또는 HTML `img`로 추가하지 않는다
