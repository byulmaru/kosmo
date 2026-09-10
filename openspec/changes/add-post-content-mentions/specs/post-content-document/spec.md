## MODIFIED Requirements

### Requirement: V1 canonical PostContent document envelope와 body schema

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-461`, `PROD-554`, `PROD-340`. 시스템은 `PostContent` revision을 version, summary와 body를 포함한 canonical document JSON으로 저장하고 V1 body를 실제 `prosemirror-model` schema로 검증해야 하며, 기존 V1 body와 의미를 유지한 채 검증된 inbound typed Mention의 additive inline node를 허용해야 한다(MUST). Mention node의 exact attr/field shape는 `post-content-mentions` contract 안에서 구현으로 정한다.

#### Scenario: V1 envelope 구성

- **WHEN** 시스템이 version `1`인 PostContent document를 검증한다
- **THEN** document는 exact `{ version, summary, body }` shape다
- **AND** `version`은 숫자 `1`이다
- **AND** `summary`는 nullable Plain Text Content Warning이며 null이 아니면 빈 문자열일 수 없다
- **AND** `body`는 ProseMirror root `doc`다
- **AND** `summary`는 ProseMirror attr나 body node가 아니다
- **AND** V1 이후 rich summary가 필요하면 새 PostContent document version에서 summary의 구조를 승격한다

#### Scenario: V1 schema 구성

- **WHEN** 시스템이 version `1`인 PostContent document의 body를 검증한다
- **THEN** root node는 `doc`이고 content expression은 `(paragraph | media)+`다
- **AND** root attr는 생략하면 `false`인 boolean `sensitiveMedia`만 허용한다
- **AND** `paragraph` content expression은 `inline*`다
- **AND** inline node는 non-empty `text`, `post-content-mentions` contract를 통과한 additive Mention node 또는 mark를 가질 수 없는 `hard_break`만 허용한다
- **AND** mark는 `link`만 허용하고 attr는 `href` 하나만 허용한다
- **AND** block `media` node는 non-empty string `mediaId` attr 하나만 허용한다
- **AND** 하나의 document는 Media node를 최대 4개까지 포함할 수 있다
- **AND** Mention node는 검증된 target·anchor identity와 안전한 표시 계약을 만족하는 canonical shape만 허용한다
- **AND** node와 mark에 열거되지 않은 attr, node 또는 mark가 있으면 검증을 거부한다
- **AND** `pre` node를 지원하지 않는다

#### Scenario: V1 additive Mention document 호환

- **WHEN** version `1` document가 기존 paragraph, text, hard break, link 또는 Media와 함께 검증된 additive Mention node를 포함한다
- **THEN** 시스템은 document version을 `1`로 유지한 채 canonical document를 검증한다
- **AND** 기존 V1 node와 그 의미를 변경하거나 제거하지 않는다
- **AND** Mention 저장을 위해 document schema version bump, V1/V2 dual-read 또는 document version 변환을 요구하지 않는다

#### Scenario: 기존 V1 document 호환

- **WHEN** Media node, `sensitiveMedia` attr와 Mention node가 없는 기존 V1 document를 검증한다
- **THEN** 기존 paragraph, text, hard break와 link document는 계속 유효하다
- **AND** 생략한 `sensitiveMedia`는 `false`로 canonicalize한다
- **AND** canonical JSON에서는 `false`인 default attr를 생략한다
- **AND** Media 또는 additive Mention 지원만으로 document schema version을 올리지 않는다

#### Scenario: 실제 ProseMirror schema 검증

- **WHEN** 서버가 외부 또는 저장 경계에서 V1 PostContent document JSON을 받는다
- **THEN** 시스템은 envelope와 열거된 attr scalar type을 검증하고 body를 V1 `Schema.nodeFromJSON()`으로 생성한 뒤 `Node.check()`로 구조를 검증한다
- **AND** 검증된 node의 `Node.toJSON()` 결과만 canonical document 후보로 사용한다
- **AND** 수동 shape 검사만으로 document를 승인하지 않는다

### Requirement: limited native and web renderer

유니버설 앱은 현재 지원하는 versioned Post Content의 paragraph, text, hard break와 link를 React Native primitive로 렌더링해야 하며(MUST), 아직 지원하지 않는 Mention node 또는 document version을 실행 가능한 UI로 해석해서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`, `PROD-910`

#### Scenario: 지원 document 렌더링

- **WHEN** reader가 지원하는 기존 V1 node만 포함한 version `1`의 유효한 document를 표시한다
- **THEN** paragraph 순서와 경계를 보존한다
- **AND** text와 hard break를 표시한다
- **AND** link label을 본문에 표시하고 검증된 absolute HTTP(S) href만 platform link action으로 연다
- **AND** link는 접근성 link role과 목적지를 식별할 수 있는 label을 가진다

#### Scenario: Mention-bearing document의 구 reader fallback

- **WHEN** 앱이 아직 지원하지 않는 Mention node 또는 document version을 받는다
- **THEN** 앱은 해당 값을 실행 가능한 UI나 Profile 이동 대상으로 렌더링하지 않는다
- **AND** GraphQL이 제공한 파생 `bodyText`를 plain text fallback으로 표시한다
- **AND** 별도 Media와 Content Warning projection은 유지한다
- **AND** plain text fallback에서 link 클릭 동작과 문단 구조의 일시적 저하는 허용한다

#### Scenario: 미지원 document 방어

- **WHEN** 앱이 알 수 없는 document version·node·mark, 잘못된 필수 attr 또는 안전하지 않은 link를 받는다
- **THEN** 앱은 해당 값을 실행 가능한 UI로 렌더링하지 않는다
- **AND** GraphQL이 제공한 파생 `bodyText`를 안전한 fallback으로 표시한다
