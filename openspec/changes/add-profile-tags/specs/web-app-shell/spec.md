## MODIFIED Requirements

### Requirement: Profile basic information display

**Authority / Provenance:** `docs/design/profile-tags.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-527` — 프로필 페이지는 조회된 프로필의 기본 정보를 표시해야 한다(MUST). 표시 항목은 커버 영역, 아바타, 표시 이름, 핸들, bio, 존재할 때의 Local Profile Tag, 팔로잉/팔로워 수이며, Profile Tag는 bio 다음이자 주요 통계·콘텐츠보다 앞에 표시해야 한다(MUST). Profile Tag의 저장·노출 배열 순서는 계약하지 않는다. 팔로우 수는 `팔로잉 → 팔로워` 순서로 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display loaded profile

- **WHEN** 핸들로 조회한 활성 프로필이 있다
- **THEN** 시스템은 커버 밴드, 아바타, 표시 이름, `relativeHandle`, bio(있을 때), Local Profile Tag(있을 때), 팔로잉/팔로워 수를 표시한다
- **AND** Profile Tag는 bio 다음이자 팔로우 수와 콘텐츠 목록보다 앞에 표시한다
- **AND** 팔로우 수는 팔로잉을 먼저, 팔로워를 나중에 표시한다

#### Scenario: Hide an empty Profile Tag section

- **WHEN** 조회한 Profile의 tags가 빈 목록이다
- **THEN** 시스템은 Profile Tag용 빈 섹션이나 안내 문구를 표시하지 않는다

#### Scenario: Display non-interactive Profile Tag chips

- **WHEN** 공개 Local Profile에 하나 이상의 Profile Tag가 있다
- **THEN** 시스템은 각 Hashtag가 보존한 Display Hashtag Name 앞에 `#`를 한 번 붙인 비대화형 chip으로 표시한다
- **AND** chip과 tags 배열의 순서는 계약하지 않는다
- **AND** `PROD-525`의 Hashtag 관련 Profile 목록 탐색이 전달되기 전에는 chip을 링크나 버튼으로 표현하지 않는다

#### Scenario: Wrap Profile Tags without overflow

- **WHEN** 좁은 화면에서 긴 허용값 또는 임의 개수의 Profile Tag를 모두 표시한다
- **THEN** chip 목록은 여러 줄로 감싸지고 Profile 본문을 가로로 넘치지 않는다

#### Scenario: Default avatar fallback

- **WHEN** 프로필 이미지 URL이 없다
- **THEN** 시스템은 승인된 기본 아바타 이미지를 표시한다
- **AND** 아바타의 접근 가능한 이름은 기존 프로필 표시 이름을 유지한다

#### Scenario: Compact follow counts

- **WHEN** 팔로워 또는 팔로잉 수를 표시한다
- **THEN** 시스템은 1000 이상의 값을 compact 표기(예: `1.2k`)로 보여준다
