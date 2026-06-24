## MODIFIED Requirements

### Requirement: Profile basic information display

프로필 페이지는 조회된 프로필의 기본 정보를 표시해야 한다(MUST). 표시 항목은 커버 영역, 아바타, 표시 이름, 핸들, bio, 팔로잉/팔로워 수이며, 팔로우 수는 `팔로잉 → 팔로워` 순서로 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display loaded profile

- **WHEN** 핸들로 조회한 활성 프로필이 있다
- **THEN** 시스템은 커버 밴드, 아바타, 표시 이름, `@handle`, bio(있을 때), 팔로잉/팔로워 수를 표시한다
- **AND** 팔로우 수는 팔로잉을 먼저, 팔로워를 나중에 표시한다

#### Scenario: Avatar initial fallback

- **WHEN** 프로필에 아바타 이미지가 없다(스키마 미보유)
- **THEN** 시스템은 표시 이름(없으면 핸들)의 첫 글자를 대문자로 한 이니셜 아바타를 표시한다

#### Scenario: Compact follow counts

- **WHEN** 팔로워 또는 팔로잉 수를 표시한다
- **THEN** 시스템은 1000 이상의 값을 compact 표기(예: `1.2k`)로 보여준다
