## MODIFIED Requirements

### Requirement: TipTap post composer component

유니버설 앱은 선택 프로필 정보를 GraphQL fragment ref로 받는 새 글 작성 컴포넌트를 제공해야 한다(MUST). 작성 UI는 React Native `TextInput`을 사용하고, 현재 doc/paragraph/text subset을 pure TypeScript adapter로 TipTap JSON에 투영해야 한다(MUST).

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
- **AND** 앱 bundle은 본문 작성 UI를 위해 DOM TipTap 또는 ProseMirror runtime을 포함하지 않는다

### Requirement: Post composer usage boundary

유니버설 앱은 새 글 작성 컴포넌트 사용처에서 인증과 active profile 부재 상태를 처리해야 한다(MUST). `/compose` 사용처는 자기 route GraphQL operation에서 `currentSession.selectedProfile`과 새 글 작성 컴포넌트가 요구하는 `Profile` fragment를 선언해야 하며(MUST), 이미 열린 상태에서 프로필 전환이 성공하면 새 actor의 Relay environment에서 route query를 다시 실행해 작성 프로필을 반영해야 한다(MUST).

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

#### Scenario: `/compose` 첫 사용처

- **WHEN** 로그인한 사용자의 active profile이 선택된 상태에서 `/compose` route가 렌더링된다
- **THEN** `/compose` route query는 `currentSession.selectedProfile`에서 새 글 작성 컴포넌트가 선언한 `Profile` fragment를 spread한다
- **AND** `/compose` route는 자기 query 결과의 selected profile fragment ref를 작성 프로필로 사용한다
- **AND** 시스템은 selected profile이 있을 때만 새 글 작성 컴포넌트에 해당 fragment ref를 전달한다
- **AND** `/compose` route는 본문 입력, 공개 범위, 글자수, mutation 제출 로직을 직접 소유하지 않는다

#### Scenario: 이미 열린 `/compose`에서 active profile 전환

- **WHEN** 사용자가 `/compose` 화면을 열어 둔 상태에서 앱 셸의 프로필 전환을 성공시킨다
- **THEN** 시스템은 새 selected profile ID를 actor key로 사용해 Relay environment를 재생성한다
- **AND** `/compose` route query는 새 environment에서 `currentSession.selectedProfile`을 다시 조회해 새 글 작성 컴포넌트의 작성 프로필로 반영한다
- **AND** 새 글 작성 컴포넌트가 요구하는 `Profile` fragment 데이터는 프로필 전환 mutation이 아니라 `/compose` route query가 소유한다

### Requirement: Post visibility dropdown selection

유니버설 앱은 새 글 작성 컴포넌트에서 게시글 공개 범위를 platform에 맞는 menu 또는 modal control로 선택할 수 있게 해야 한다(MUST).

#### Scenario: 공개 범위 옵션 표시

- **WHEN** 사용자가 작성 컴포넌트의 공개 설정 control을 연다
- **THEN** 시스템은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 공개 범위 옵션을 표시한다
- **AND** `PUBLIC` 옵션은 “공개”와 “모두가 볼 수 있어요.” 설명을 표시한다
- **AND** `UNLISTED` 옵션은 “조용한 공개”와 “모두가 볼 수 있지만 검색되지 않아요.” 설명을 표시한다
- **AND** `FOLLOWERS` 옵션은 “팔로워만”과 “팔로워만 볼 수 있어요.” 설명을 표시한다
- **AND** `DIRECT` 옵션은 “언급한 계정만”과 “이 글에서 언급한 계정만 볼 수 있어요.” 설명을 표시한다
- **AND** `PUBLIC` 옵션은 Lucide `GlobeIcon` 아이콘을 표시한다
- **AND** `UNLISTED` 옵션은 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** `FOLLOWERS` 옵션은 Lucide `LockIcon` 아이콘을 표시한다
- **AND** `DIRECT` 옵션은 Lucide `AtSignIcon` 아이콘을 표시한다

#### Scenario: 기본 공개 범위

- **WHEN** 작성 컴포넌트가 처음 표시되고 프로필 기본 공개 범위 값이 제공되지 않는다
- **THEN** 시스템은 `UNLISTED`를 기본 공개 범위로 선택한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED` 라벨을 표시한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED`의 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** 공개 설정 control은 작성자 프로필 헤더가 아니라 본문 입력 영역 아래에 표시된다
- **AND** 공개 설정 control은 제출 버튼과 같은 줄에 표시된다

#### Scenario: 공개 범위 변경

- **WHEN** 사용자가 공개 설정 surface에서 다른 공개 범위 옵션을 선택한다
- **THEN** 시스템은 작성 컴포넌트의 선택 공개 범위를 사용자가 선택한 값으로 갱신한다
- **AND** 시스템은 현재 선택된 공개 범위를 제출 전 컴포넌트에서 확인할 수 있게 표시한다
- **AND** 시스템은 공개 설정 surface를 닫는다

### Requirement: Character count indicator

유니버설 앱은 새 글 작성 컴포넌트에서 plain-text 본문의 글자수를 표시해야 한다(MUST).

#### Scenario: 글자수 표시

- **WHEN** 사용자가 본문 입력 영역에 plain text를 입력한다
- **THEN** 시스템은 trim한 plain text 기준 남은 글자수를 숫자만으로 표시한다
- **AND** 시스템은 현재 글자수와 최대 글자수를 `0 / 500` 같은 형식으로 함께 표시하지 않는다
- **AND** 시스템은 남은 글자수에 “자 남음” 같은 suffix를 붙이지 않는다
- **AND** 남은 글자수 숫자 인디케이터는 게시 버튼 바로 옆에 표시된다

#### Scenario: 글자수 제한 초과 표시

- **WHEN** trim한 plain-text 본문이 500자를 초과한다
- **THEN** 시스템은 글자수 인디케이터를 오류 상태로 표시한다
- **AND** 시스템은 남은 글자수를 음수 숫자로 표시한다
- **AND** 시스템은 제출 버튼을 비활성화한다

### Requirement: TipTap post submission

유니버설 앱은 새 글 작성 컴포넌트의 plain-text 본문을 현재 doc/paragraph/text subset의 유효한 TipTap document JSON으로 변환해 `createPost` mutation으로 제출해야 한다(MUST).

#### Scenario: TipTap 게시글 작성 성공

- **WHEN** 새 글 작성 컴포넌트가 유효한 active profile fragment ref와 유효한 plain-text 본문으로 제출된다
- **THEN** 시스템은 pure TypeScript adapter가 생성한 TipTap `doc` JSON을 `content` 값으로 설정한다
- **AND** 시스템은 `visibility` 값을 사용자가 선택한 공개 범위로 설정해 `createPost` mutation을 호출한다
- **AND** 시스템은 제출 중 상태를 표시하고 중복 제출을 방지한다
- **AND** mutation 성공 후 본문, 공개 범위 선택, 오류 상태를 기본값으로 초기화한다
- **AND** 시스템은 생성된 게시글 확인 패널을 표시하지 않고 생성된 게시글 경로로 이동하지 않는다

#### Scenario: 빈 본문 제출 방지

- **WHEN** 사용자가 공백만 있거나 비어 있는 plain-text 본문으로 작성 컴포넌트를 제출한다
- **THEN** 시스템은 제출 버튼을 비활성화한다
- **AND** 시스템은 빈 본문 오류 메시지를 표시하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 너무 긴 본문 제출

- **WHEN** 사용자가 500자를 초과하는 plain-text 본문으로 작성 컴포넌트를 제출한다
- **THEN** 시스템은 제출 버튼 비활성화 상태로 제출을 차단한다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 작성 실패 표시

- **WHEN** `createPost` mutation이 인증, active profile, validation, 네트워크 또는 GraphQL 오류 중 하나로 실패한다
- **THEN** 시스템은 작성 실패 상태와 사용자가 이해할 수 있는 오류 메시지를 표시한다
- **AND** 시스템은 사용자가 plain-text 본문과 공개 범위 선택을 수정하거나 다시 제출할 수 있게 유지한다
