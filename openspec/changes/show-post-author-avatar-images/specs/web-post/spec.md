## MODIFIED Requirements

### Requirement: Post author profile display

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 웹 앱은 게시글 목록과 게시글 상세 페이지의 leaf GraphQL fragment가 소유하는 작성자 프로필 presentation을 제공하고, 작성자의 공개 Ready avatar URL이 있으면 공용 Avatar로 실제 이미지를 표시하며 URL이 없으면 이니셜 fallback을 표시해야 한다(MUST).

#### Scenario: Render author identity

- **WHEN** 게시글 작성자 표시 이름과 핸들이 제공된다
- **THEN** 시스템은 작성자 표시 이름과 핸들을 함께 렌더링한다

#### Scenario: Render ready author avatar image

- **WHEN** 게시글 presentation이 공개 URL을 가진 Ready Profile avatar를 제공한다
- **THEN** 시스템은 해당 작성자의 실제 avatar 이미지를 렌더링한다

#### Scenario: Render author fallback avatar

- **WHEN** 게시글 작성자 Profile에 avatar 관계가 없거나 공개 avatar URL을 제공할 수 없다
- **THEN** 시스템은 표시 이름 또는 핸들 기반 이니셜 fallback avatar를 렌더링한다

#### Scenario: Keep displayed author avatars distinct

- **WHEN** Repost 또는 Quote presentation이 직접 작성자와 direct Source 작성자를 함께 또는 교대로 표시한다
- **THEN** 시스템은 표시되는 각 위치에서 그 위치가 나타내는 Profile의 avatar 이미지 또는 fallback을 사용한다
- **AND** 한 작성자의 avatar URL을 다른 작성자에게 재사용하지 않는다

#### Scenario: Declare author profile fields as fragment

- **WHEN** 부모 GraphQL query가 게시글 작성자 프로필을 조회한다
- **THEN** 시스템은 실제 작성자 presentation을 소비하는 게시글 leaf fragment가 필요한 Profile 필드를 선언하고 부모 query가 해당 fragment를 spread할 수 있어야 한다

#### Scenario: Keep layout with long author text

- **WHEN** 작성자 표시 이름 또는 핸들이 긴 값이다
- **THEN** 시스템은 게시글 목록 또는 상세 레이아웃을 깨지 않고 텍스트를 줄임 처리한다

#### Scenario: Preserve author avatar presentation contract

- **WHEN** 시스템이 실제 avatar 이미지 또는 이니셜 fallback을 렌더링한다
- **THEN** 목록의 48px avatar와 상세·Source preview의 40px avatar 크기를 유지한다
- **AND** 기존 작성자 Profile 이동과 접근성 이름을 유지한다

#### Scenario: Link to author profile when available

- **WHEN** 작성자 프로필 링크가 제공된다
- **THEN** 시스템은 작성자 프로필 영역을 해당 링크로 이동 가능한 요소로 렌더링한다

#### Scenario: Render without route dependency

- **WHEN** 작성자 프로필 링크가 제공되지 않는다
- **THEN** 시스템은 특정 라우트 구현에 의존하지 않고 작성자 정보를 non-interactive 요소로 렌더링한다
