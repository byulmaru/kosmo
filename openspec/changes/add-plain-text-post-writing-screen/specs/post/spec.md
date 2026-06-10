## ADDED Requirements

### Requirement: TipTap post composer screen

웹 앱은 `/compose` 탭에서 TipTap 기반 게시글 작성 화면을 제공해야 한다(MUST).

#### Scenario: 작성 폼 표시

- **WHEN** 로그인했고 active profile이 선택된 사용자가 `/compose` 탭을 연다
- **THEN** 시스템은 TipTap editor 본문 입력 영역과 제출 버튼을 표시한다
- **AND** 시스템은 게시글 공개 범위 selector를 표시한다
- **AND** 본문 입력 영역은 여러 줄 본문을 입력할 수 있다
- **AND** 제출 버튼은 작성 본문이 유효하지 않거나 제출 중일 때 비활성화된다

#### Scenario: 인증되지 않은 사용자

- **WHEN** 인증 session이 없는 사용자가 `/compose` 탭을 연다
- **THEN** 시스템은 게시글을 작성하려면 로그인이 필요하다는 상태를 표시한다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 선택 프로필이 없는 사용자

- **WHEN** 로그인했지만 active profile이 선택되지 않은 사용자가 `/compose` 탭을 연다
- **THEN** 시스템은 게시글 작성에 사용할 프로필을 선택해야 한다는 상태를 표시한다
- **AND** 시스템은 제출 동작을 비활성화한다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

### Requirement: Post visibility selection

웹 앱은 TipTap 게시글 작성 폼에서 게시글 공개 범위를 선택할 수 있게 해야 한다(MUST).

#### Scenario: 공개 범위 옵션 표시

- **WHEN** 사용자가 `/compose` 작성 폼을 본다
- **THEN** 시스템은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 공개 범위 옵션을 표시한다
- **AND** `PUBLIC` 옵션은 “공개”와 “모두가 볼 수 있어요.” 설명을 표시한다
- **AND** `UNLISTED` 옵션은 “조용한 공개”와 “모두가 볼 수 있지만 검색되지 않아요.” 설명을 표시한다
- **AND** `FOLLOWERS` 옵션은 “팔로워만”과 “팔로워만 볼 수 있어요.” 설명을 표시한다
- **AND** `DIRECT` 옵션은 “언급한 계정만”과 “이 글에서 언급한 계정만 볼 수 있어요.” 설명을 표시한다

#### Scenario: 기본 공개 범위

- **WHEN** 작성 폼이 처음 표시되고 프로필 기본 공개 범위 값이 제공되지 않는다
- **THEN** 시스템은 `UNLISTED`를 기본 공개 범위로 선택한다

#### Scenario: 공개 범위 변경

- **WHEN** 사용자가 공개 범위 selector에서 다른 공개 범위 옵션을 선택한다
- **THEN** 시스템은 작성 폼의 선택 공개 범위를 사용자가 선택한 값으로 갱신한다
- **AND** 시스템은 현재 선택된 공개 범위를 제출 전 화면에서 확인할 수 있게 표시한다

### Requirement: TipTap post submission

웹 앱은 유효한 TipTap editor 문서 JSON을 `createPost` mutation으로 제출해 게시글을 작성해야 한다(MUST).

#### Scenario: TipTap 게시글 작성 성공

- **WHEN** 로그인했고 active profile이 선택된 사용자가 유효한 TipTap editor 본문으로 작성 폼을 제출한다
- **THEN** 시스템은 TipTap editor의 `doc` JSON을 `content` 값으로 설정한다
- **AND** 시스템은 `visibility` 값을 사용자가 선택한 공개 범위로 설정해 `createPost` mutation을 호출한다
- **AND** 시스템은 제출 중 상태를 표시하고 중복 제출을 방지한다
- **AND** mutation 성공 후 editor 본문과 공개 범위 선택을 기본값으로 초기화한다
- **AND** 시스템은 생성된 게시글 확인 패널을 표시하지 않고 생성된 게시글 경로로 이동하지 않는다

#### Scenario: 빈 본문 제출 방지

- **WHEN** 사용자가 공백만 있거나 비어 있는 본문으로 작성 폼을 제출한다
- **THEN** 시스템은 제출 버튼을 비활성화한다
- **AND** 시스템은 빈 본문 오류 메시지를 표시하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 너무 긴 본문 제출

- **WHEN** 사용자가 500자를 초과하는 editor 본문으로 작성 폼을 제출한다
- **THEN** 시스템은 제출 버튼을 비활성화한다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 작성 실패 표시

- **WHEN** `createPost` mutation이 인증, active profile, validation, 네트워크 오류 중 하나로 실패한다
- **THEN** 시스템은 작성 실패 상태와 사용자가 이해할 수 있는 오류 메시지를 표시한다
- **AND** 시스템은 사용자가 본문을 수정하거나 다시 제출할 수 있게 유지한다
