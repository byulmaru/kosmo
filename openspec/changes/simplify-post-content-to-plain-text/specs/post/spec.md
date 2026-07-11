## MODIFIED Requirements

### Requirement: PostContent GraphQL object

API는 게시글의 현재 콘텐츠를 GraphQL `PostContent` Node로 노출하고 canonical Plain Text 본문과 선택적 Content Warning을 제공해야 한다(MUST).

#### Scenario: 게시글 콘텐츠 조회

- **WHEN** 클라이언트가 게시글의 현재 콘텐츠를 조회한다
- **THEN** 시스템은 `PostContent` object를 반환한다
- **AND** `PostContent`는 `id`, `bodyText`, `contentWarning`, `createdAt` 필드를 포함한다
- **AND** `bodyText`는 저장된 canonical Plain Text 본문이다
- **AND** `bodyText`는 저장된 개행을 보존한다
- **AND** `contentWarning`은 값이 없을 수 있다
- **AND** `PostContent`는 TipTap JSON 또는 HTML 본문 필드를 노출하지 않는다

### Requirement: Plain Text post creation

로그인했고 active profile이 있는 사용자는 canonical Plain Text 본문으로 새 게시글을 작성할 수 있어야 한다(MUST).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 문자열과 `visibility`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 `Post`를 반환한다

#### Scenario: 본문 저장 형식

- **WHEN** 시스템이 Plain Text 게시글 콘텐츠를 저장한다
- **THEN** 시스템은 입력 문자열의 앞뒤 공백을 제거한 값을 `bodyText`로 저장한다
- **AND** 시스템은 trim된 본문 안의 개행을 보존한다
- **AND** 시스템은 TipTap JSON 또는 HTML projection을 만들거나 저장하지 않는다

#### Scenario: 유효하지 않은 본문

- **WHEN** 클라이언트가 trim 결과가 비어 있거나 500자를 초과하는 `bodyText`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 validation code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: 인증되지 않은 작성 요청

- **WHEN** 인증 session이 없는 클라이언트가 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL 인증 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: active profile 없는 작성 요청

- **WHEN** 로그인한 클라이언트가 active profile 없이 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

### Requirement: Plain Text post composer component

유니버설 앱은 선택 프로필 정보를 GraphQL fragment ref로 받는 새 글 작성 컴포넌트를 제공해야 한다(MUST). 작성 UI는 React Native `TextInput`을 사용하고 Plain Text 본문을 별도 document adapter 없이 유지해야 한다(MUST).

#### Scenario: 작성 컴포넌트 fragment 계약

- **WHEN** 부모 query가 게시글 작성에 사용할 active profile을 조회한다
- **THEN** 시스템은 새 글 작성 컴포넌트가 선언한 `Profile` fragment를 spread할 수 있어야 한다
- **AND** 새 글 작성 컴포넌트는 선택 프로필 정보를 개별 scalar props가 아니라 fragment ref prop으로 받는다
- **AND** 새 글 작성 컴포넌트는 내부에서 해당 fragment를 읽어 작성 가능 상태를 구성한다
- **AND** 새 글 작성 컴포넌트는 작성 프로필 표시를 위해 `ProfileNameBlock_profile` fragment를 spread하고 `ProfileNameBlock` 컴포넌트를 사용한다

#### Scenario: 작성 폼 표시

- **WHEN** 새 글 작성 컴포넌트가 유효한 active profile fragment ref와 함께 렌더링된다
- **THEN** 시스템은 여러 줄 plain-text 본문 입력 영역과 제출 버튼을 표시한다
- **AND** 시스템은 게시글 공개 설정 control을 표시한다
- **AND** 게시글 공개 설정 control은 현재 선택된 공개 범위의 Lucide 아이콘을 표시한다
- **AND** 게시글 공개 설정 control은 본문 입력 영역 아래에 표시된다
- **AND** 게시글 공개 설정 control과 제출 버튼은 같은 하단 줄에 표시된다
- **AND** 시스템은 남은 글자수 숫자 인디케이터를 게시 버튼 바로 옆에 표시한다
- **AND** 본문 입력 영역은 여러 줄 본문을 입력할 수 있다
- **AND** 제출 버튼은 작성 본문이 유효하지 않거나 제출 중일 때 비활성화된다
- **AND** 앱 bundle은 본문 작성 UI를 위해 TipTap 또는 ProseMirror runtime을 포함하지 않는다

### Requirement: Plain Text post submission

유니버설 앱은 새 글 작성 컴포넌트의 Plain Text 본문을 `createPost` mutation의 `bodyText` 값으로 직접 제출해야 한다(MUST).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 새 글 작성 컴포넌트가 유효한 active profile fragment ref와 유효한 plain-text 본문으로 제출된다
- **THEN** 시스템은 입력 본문을 `bodyText` 값으로 설정한다
- **AND** 시스템은 `visibility` 값을 사용자가 선택한 공개 범위로 설정해 `createPost` mutation을 호출한다
- **AND** 시스템은 제출 중 상태를 표시하고 중복 제출을 방지한다
- **AND** mutation 성공 후 본문, 공개 범위 선택, 오류 상태를 기본값으로 초기화한다
- **AND** 시스템은 생성된 게시글 확인 패널을 표시하지 않고 생성된 게시글 경로로 이동하지 않는다
- **AND** 시스템은 게시 직후 이미 열린 목록을 임시 updater로 갱신하지 않는다

#### Scenario: 빈 본문 제출 방지

- **WHEN** 사용자가 공백만 있거나 비어 있는 plain-text 본문으로 작성 컴포넌트를 제출한다
- **THEN** 시스템은 제출 버튼을 비활성화한다
- **AND** 시스템은 빈 본문 오류 메시지를 표시하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 너무 긴 본문 제출

- **WHEN** 사용자가 trim 기준 500자를 초과하는 plain-text 본문으로 작성 컴포넌트를 제출한다
- **THEN** 시스템은 제출 버튼 비활성화 상태로 제출을 차단한다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 작성 실패 표시

- **WHEN** `createPost` mutation이 인증, active profile, validation, 네트워크 또는 GraphQL 오류 중 하나로 실패한다
- **THEN** 시스템은 작성 실패 상태와 사용자가 이해할 수 있는 오류 메시지를 표시한다
- **AND** 시스템은 사용자가 plain-text 본문과 공개 범위 선택을 수정하거나 다시 제출할 수 있게 유지한다

## RENAMED Requirements

- FROM: `TipTap document post creation`
- TO: `Plain Text post creation`
- FROM: `TipTap post composer component`
- TO: `Plain Text post composer component`
- FROM: `TipTap post submission`
- TO: `Plain Text post submission`
