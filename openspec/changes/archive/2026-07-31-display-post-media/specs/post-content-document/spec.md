## MODIFIED Requirements

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
