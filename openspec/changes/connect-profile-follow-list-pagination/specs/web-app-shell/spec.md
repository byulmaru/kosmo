## ADDED Requirements

### Requirement: Profile connection list pagination

팔로워·팔로잉 목록 라우트는 connection 첫 페이지 이후에도 `pageInfo` 기반 다음 페이지 로드를 제공해야 한다(MUST). `/@{handle}/followers`는 `Profile.followers(first: 20, after: <endCursor>)`로 다음 팔로워 페이지를 조회해야 하며(MUST), `/@{handle}/following`은 `Profile.following(first: 20, after: <endCursor>)`로 다음 팔로잉 페이지를 조회해야 한다(MUST). 추가 페이지 항목은 기존 목록 뒤에 connection edge 순서대로 붙어야 하며(MUST), 클라이언트는 항목을 별도 기준으로 재정렬하지 않아야 한다(MUST NOT). 두 목록은 같은 pagination UI와 상태 표현을 공유해야 한다(MUST).

#### Scenario: Load next followers page

- **WHEN** 사용자가 `/@{handle}/followers`에서 첫 페이지를 보고 있고 `pageInfo.hasNextPage`가 `true`이다
- **THEN** 시스템은 다음 페이지를 불러오는 동작을 제공한다
- **AND** 사용자가 그 동작을 실행하면 `pageInfo.endCursor`를 `after`로 사용해 다음 팔로워 페이지를 조회한다
- **AND** 새 팔로워 항목은 기존 팔로워 목록 뒤에 connection edge 순서대로 추가된다

#### Scenario: Load next following page

- **WHEN** 사용자가 `/@{handle}/following`에서 첫 페이지를 보고 있고 `pageInfo.hasNextPage`가 `true`이다
- **THEN** 시스템은 다음 페이지를 불러오는 동작을 제공한다
- **AND** 사용자가 그 동작을 실행하면 `pageInfo.endCursor`를 `after`로 사용해 다음 팔로잉 페이지를 조회한다
- **AND** 새 팔로잉 항목은 기존 팔로잉 목록 뒤에 connection edge 순서대로 추가된다

#### Scenario: Prevent duplicate next-page requests

- **WHEN** 다음 페이지 요청이 진행 중이다
- **THEN** 시스템은 같은 목록에서 중복 추가 로드 요청을 실행하지 않는다
- **AND** 사용자에게 추가 로드가 진행 중임을 버튼 상태 또는 보조 기술 상태로 알려야 한다

#### Scenario: Hide load action on last page

- **WHEN** 현재 connection의 `pageInfo.hasNextPage`가 `false`이다
- **THEN** 시스템은 다음 페이지를 불러오는 동작을 제공하지 않는다

#### Scenario: Retry failed next-page request

- **WHEN** 첫 페이지 항목이 표시된 상태에서 다음 페이지 요청이 실패한다
- **THEN** 시스템은 기존 목록 항목을 유지한다
- **AND** 목록 아래에 다음 페이지를 불러오지 못했다는 오류와 재시도 동작을 표시한다
- **AND** 사용자가 재시도하면 실패했던 cursor 기준으로 다음 페이지 요청을 다시 실행한다

#### Scenario: Preserve first-page error behavior

- **WHEN** 첫 페이지 조회가 실패했고 표시할 기존 목록 데이터가 없다
- **THEN** 시스템은 기존 팔로워·팔로잉 목록 오류 상태와 다시 시도 동작을 표시한다
- **AND** 다음 페이지 오류 UI를 별도로 표시하지 않는다
