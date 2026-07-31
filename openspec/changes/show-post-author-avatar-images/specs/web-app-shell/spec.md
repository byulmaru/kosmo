## MODIFIED Requirements

### Requirement: Post basic information display

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 게시글 디테일 페이지는 게시글의 기본 정보를 표시해야 한다(MUST). 표시 항목은 Plain Text 본문, 작성자(avatar·표시 이름·핸들), 작성 시각, 공개 범위이며, 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display post body and author

- **WHEN** 표시할 활성 게시글이 있다
- **THEN** 시스템은 Plain Text 본문을 줄바꿈을 보존해 표시하고, 작성자 표시 이름과 `relativeHandle`, 작성 시각, 공개 범위를 표시한다
- **AND** 작성자 영역은 작성자의 `/${relativeHandle}` 프로필 페이지로 이동할 수 있다

#### Scenario: Display post author avatar image

- **WHEN** 현재 상세 Post 또는 표시되는 direct Source 작성자에게 공개 URL을 가진 Ready Profile avatar가 있다
- **THEN** 시스템은 해당 작성자의 실제 avatar 이미지를 표시한다
- **AND** 현재 상세 작성자는 40px avatar 크기를 유지한다

#### Scenario: Author avatar initial fallback

- **WHEN** 작성자에게 avatar 관계가 없거나 공개 avatar URL을 제공할 수 없다
- **THEN** 시스템은 표시 이름(없으면 핸들)의 첫 글자를 대문자로 한 이니셜 avatar를 표시한다

#### Scenario: Keep detail and source authors distinct

- **WHEN** 게시글 상세가 현재 Post 작성자와 direct Source 작성자를 서로 다른 Profile로 표시한다
- **THEN** 시스템은 각 위치에서 해당 Profile의 avatar 이미지 또는 fallback을 표시한다

#### Scenario: Missing post content

- **WHEN** 게시글에 표시할 본문 콘텐츠가 없다
- **THEN** 시스템은 본문 영역을 비워도 레이아웃이 깨지지 않는다

### Requirement: Post list item display

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 게시글 목록 항목 컴포넌트(`PostListItem`)는 게시글 한 건의 작성자 프로필(avatar·표시 이름·핸들), Plain Text 본문, 작성 시간을 표시해야 한다(MUST). 작성자 avatar는 공용 Avatar를 사용해 48px로 표시해야 한다(MUST). 필요한 데이터는 컴포넌트 자신의 fragment(`PostListItem_post`)로 선언하고, 공개 Ready avatar URL이 있으면 실제 이미지를 표시하며 URL이 없으면 이니셜 fallback을 표시해야 한다(MUST).

#### Scenario: Item content display

- **WHEN** 게시글 데이터(fragment ref)가 항목 컴포넌트에 전달된다
- **THEN** 시스템은 좌측 avatar 거터와 우측 콘텐츠 컬럼 구조로 작성자 표시 이름·핸들, 본문, 작성 시간을 표시한다

#### Scenario: Display list author avatar image

- **WHEN** 목록에서 표시되는 일반 Post, 순수 Repost direct Source 또는 Quote 작성자에게 공개 URL을 가진 Ready Profile avatar가 있다
- **THEN** 시스템은 해당 표시 위치에 그 작성자의 실제 avatar 이미지를 48px로 표시한다

#### Scenario: Display list author avatar fallback

- **WHEN** 목록에서 표시되는 작성자에게 avatar 관계가 없거나 공개 avatar URL을 제공할 수 없다
- **THEN** 시스템은 해당 작성자의 표시 이름 또는 핸들 기반 이니셜 avatar를 48px로 표시한다

#### Scenario: Keep list and source authors distinct

- **WHEN** Repost 또는 Quote가 직접 작성자와 direct Source 작성자를 서로 다른 Profile로 표시한다
- **THEN** 시스템은 각 표시 위치에서 해당 Profile의 avatar 이미지 또는 fallback을 표시한다

#### Scenario: Empty body

- **WHEN** 게시글의 `content`가 비어 있다
- **THEN** 시스템은 본문 영역 없이 작성자와 작성 시간만 표시하고 레이아웃이 깨지지 않는다

## ADDED Requirements

### Requirement: Production Profile avatar image presentation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 앱 셸과 공용 Profile presentation의 production avatar 소비자는 자신이 표시하는 Profile의 공개 Ready avatar URL이 있으면 기존 공용 Avatar로 실제 이미지를 표시하고, URL이 없으면 기존 이니셜 fallback을 유지해야 한다(MUST).

#### Scenario: Display ProfileSwitcher active avatar and header images

- **WHEN** `ProfileSwitcher`가 공개 Ready avatar와 header URL을 가진 활성 Profile을 full·drawer 또는 compact surface에 표시한다
- **THEN** 시스템은 해당 Profile의 실제 avatar를 기존 trigger 크기로 표시한다
- **AND** full·drawer cover 영역은 해당 Profile의 실제 header 이미지를 기존 geometry 안에 표시한다

#### Scenario: Display ProfileSwitcher profile option avatars

- **WHEN** `ProfileSwitcher`가 접근 가능한 Profile 목록을 표시하고 각 Profile에 공개 Ready avatar URL이 있다
- **THEN** 각 option은 자신이 나타내는 Profile의 실제 avatar 이미지를 기존 크기로 표시한다
- **AND** 활성 Profile 표시와 Profile 생성·전환 mutation, Relay store 갱신과 actor별 Environment 재생성 계약을 유지한다

#### Scenario: Keep ProfileSwitcher image fallbacks

- **WHEN** 활성 Profile 또는 option Profile에 avatar 관계·공개 URL이 없거나 활성 Profile에 header 관계·공개 URL이 없다
- **THEN** avatar 위치는 같은 Profile의 표시 이름·핸들 기반 기존 이니셜 fallback을 표시한다
- **AND** full·drawer cover는 기존 gradient를 유지한다

#### Scenario: Display shared ProfileListItem avatar image

- **WHEN** 검색·팔로워·팔로잉 또는 Reaction Profile 목록이 공개 Ready avatar URL을 가진 Profile을 공용 `ProfileListItem`으로 표시한다
- **THEN** 해당 행은 그 Profile의 실제 avatar 이미지를 기존 크기로 표시한다
- **AND** 이미지가 없으면 같은 Profile의 기존 이니셜 fallback을 표시한다
- **AND** 기존 Profile 이동, Follow action과 접근성 이름을 유지한다

#### Scenario: Display active Profile avatar in BottomTabBar and PostComposer

- **WHEN** `BottomTabBar` 또는 `PostComposer`가 공개 Ready avatar URL을 가진 활성 Profile을 표시한다
- **THEN** 각 소비자는 활성 Profile의 실제 avatar 이미지를 기존 크기로 표시한다
- **AND** 이미지가 없으면 기존 이니셜 fallback을 표시한다
- **AND** 기존 탭·Profile 이동, composer 동작과 접근성 이름을 유지한다
