## MODIFIED Requirements

### Requirement: Post basic information display

**Authority / Provenance:** `docs/design/figma.md`, `docs/design/post-thread.md`, PROD-89, PROD-596 — 게시글 디테일 페이지는 게시글의 기본 정보를 표시해야 한다(MUST). 표시 항목은 Plain Text 본문, 작성자(표시 이름·핸들), 작성 시각, 공개 범위이며, 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display post body and author

- **WHEN** 표시할 활성 게시글이 있다
- **THEN** 시스템은 Plain Text 본문을 줄바꿈을 보존해 표시하고, 작성자 표시 이름과 `relativeHandle`, 작성 시각, 공개 범위를 표시한다
- **AND** 작성자 영역은 작성자의 `/${relativeHandle}` 프로필 페이지로 이동할 수 있다

#### Scenario: Author default avatar fallback

- **WHEN** 작성자의 프로필 이미지 URL이 없다
- **THEN** 시스템은 승인된 기본 아바타 이미지를 표시한다
- **AND** 아바타의 접근 가능한 이름은 기존 작성자 표시 이름을 유지한다

#### Scenario: Missing post content

- **WHEN** 게시글에 표시할 본문 콘텐츠가 없다
- **THEN** 시스템은 본문 영역을 비워도 레이아웃이 깨지지 않는다

### Requirement: Profile basic information display

**Authority / Provenance:** `docs/design/figma.md`, PROD-91, PROD-596 — 프로필 페이지는 조회된 프로필의 기본 정보를 표시해야 한다(MUST). 표시 항목은 커버 영역, 아바타, 표시 이름, 핸들, bio, 팔로잉/팔로워 수이며, 팔로우 수는 `팔로잉 → 팔로워` 순서로 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display loaded profile

- **WHEN** 핸들로 조회한 활성 프로필이 있다
- **THEN** 시스템은 커버 밴드, 아바타, 표시 이름, `relativeHandle`, bio(있을 때), 팔로잉/팔로워 수를 표시한다
- **AND** 팔로우 수는 팔로잉을 먼저, 팔로워를 나중에 표시한다

#### Scenario: Default avatar fallback

- **WHEN** 프로필 이미지 URL이 없다
- **THEN** 시스템은 승인된 기본 아바타 이미지를 표시한다
- **AND** 아바타의 접근 가능한 이름은 기존 프로필 표시 이름을 유지한다

#### Scenario: Compact follow counts

- **WHEN** 팔로워 또는 팔로잉 수를 표시한다
- **THEN** 시스템은 1000 이상의 값을 compact 표기(예: `1.2k`)로 보여준다
