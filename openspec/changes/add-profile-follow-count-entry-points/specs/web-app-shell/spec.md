## ADDED Requirements

### Requirement: Follow count entry-point links

프로필 헤더(`ProfileHero`)와 사이드바 활성 프로필 영역에 표시되는 팔로잉/팔로워 수는 각각 해당 프로필의 팔로잉·팔로워 목록 웹 라우트로 이동하는 링크여야 한다(MUST). 링크 대상은 팔로잉이 `/@{handle}/following`, 팔로워가 `/@{handle}/followers`이며, ActivityPub collection URL로 연결하지 않아야 한다(MUST NOT). 표시·이동 순서는 `팔로잉 → 팔로워`여야 한다(MUST). 각 카운트의 클릭(활성) 영역은 숫자와 라벨 텍스트를 모두 포함해야 한다(MUST). 사이드바 활성 프로필 영역의 카운트 링크가 모바일 drawer 안에서 렌더될 때는, 다른 drawer 내 navigation과 동일하게 이동 시 drawer를 닫아야 한다(MUST).

#### Scenario: Navigate to lists from profile header

- **WHEN** 사용자가 프로필 헤더에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 각각 `/@{handle}/following` 또는 `/@{handle}/followers` 웹 라우트로 이동한다
- **AND** 링크 대상은 ActivityPub collection URL이 아니라 로컬 웹 라우트다

#### Scenario: Navigate to lists from sidebar

- **WHEN** 사용자가 사이드바 활성 프로필 영역에서 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 선택된 프로필의 `/@{handle}/following` 또는 `/@{handle}/followers` 웹 라우트로 이동한다

#### Scenario: Whole count and label is the click target

- **WHEN** 카운트가 숫자와 `팔로잉`/`팔로워` 라벨로 구성된다
- **THEN** 사용자가 숫자 또는 라벨 중 어느 쪽을 눌러도 같은 목록 라우트로 이동한다

#### Scenario: Close mobile drawer on navigation

- **WHEN** 모바일 drawer에 렌더된 사이드바에서 사용자가 팔로잉 또는 팔로워 수를 누른다
- **THEN** 시스템은 목록 라우트로 이동하면서 열려 있던 drawer를 닫는다
