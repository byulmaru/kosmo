## ADDED Requirements

### Requirement: 공개 Profile Home PageHeader

**Authority / Provenance:** `docs/design/page-header.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, `PROD-949` — 공개 Profile Home은 Web·Android·iOS에서 route가 공용 PageHeader를 소유해야 한다(MUST). 활성 프로필을 조회하면 PageHeader는 뒤로가기와 전체 `displayName` heading을 ProfileHero 위에 표시해야 하며(MUST), 표시 이름은 가용 폭에서 한 줄 tail ellipsis로 줄어들되 접근성 이름을 생략해서는 안 된다(MUST NOT). 활성 프로필이 없으면 같은 위치에 뒤로가기와 빈 제목 PageHeader를 유지하고 그 아래에 기존 missing 상태 본문만 표시해야 한다(MUST). 최상위 Profile Home이 loading 또는 query error이면 같은 위치에 빈 제목 PageHeader와 뒤로가기를 유지하고, 기존 ProfileHero skeleton 또는 StateView retry 본문·query lifecycle을 보존해야 한다(MUST). `compact` 미만 모바일 Web에서는 셸의 메뉴 전용 헤더와 route PageHeader를 중복 렌더링해서는 안 된다(MUST NOT). 이 변경은 기존 ProfileHero와 게시물 본문, 관계 목록과 일반 PageHeader text 제목의 여러 줄 reflow를 변경해서는 안 된다(MUST NOT).

#### Scenario: 활성 프로필 Home의 상단 위계

- **WHEN** 사용자가 활성 프로필의 공개 Home을 연다
- **THEN** route는 ProfileHero 위에 뒤로가기와 전체 `displayName` heading을 가진 PageHeader를 표시한다
- **AND** 기존 ProfileHero와 게시물 본문을 같은 프로필 identity로 유지한다

#### Scenario: 긴 표시 이름의 한 줄 생략

- **WHEN** 활성 프로필의 `displayName`이 leading action 다음의 가용 제목 폭보다 길다
- **THEN** 시각 제목은 한 줄을 유지하고 끝을 말줄임표로 생략한다
- **AND** 접근성 제목은 생략하지 않은 전체 `displayName`을 제공한다
- **AND** 일반 PageHeader text 제목은 별도로 선택하지 않는 한 기존 여러 줄 reflow를 유지한다

#### Scenario: 없는 프로필의 route chrome

- **WHEN** 요청한 handle과 일치하는 활성 프로필이 없다
- **THEN** route는 같은 상단 위치에 뒤로가기와 빈 제목 PageHeader를 표시한다
- **AND** PageHeader 아래에는 기존 `프로필을 찾을 수 없어요` 상태 본문만 표시한다
- **AND** ProfileHero와 게시물·관계 목록 본문을 표시하지 않는다

#### Scenario: 모바일 Web에서 단일 Profile 상단바

- **WHEN** 사용자가 `compact` 미만 모바일 Web에서 공개 Profile Home을 연다
- **THEN** 시스템은 route가 소유한 Profile PageHeader 하나만 표시한다
- **AND** 셸은 메뉴 전용 헤더를 별도로 표시하지 않는다

#### Scenario: Profile Home loading·query error의 route chrome

- **WHEN** 최상위 공개 Profile Home이 loading 또는 query error 상태다
- **THEN** route는 같은 상단 위치에 뒤로가기와 빈 제목 PageHeader를 표시한다
- **AND** loading에서는 기존 ProfileHero skeleton을, query error에서는 기존 StateView retry 본문을 PageHeader 아래에 표시한다
- **AND** 뒤로가기는 기존 `router.back()` callback을 사용하고 query error의 retry는 같은 layout query를 다시 실행한다
- **AND** followers·following 관계 route에는 이 상태별 route PageHeader를 추가하지 않는다

#### Scenario: 기존 경계 상태와 관계 route 보존

- **WHEN** 공개 Profile layout이 loading·query error 상태이거나 팔로워·팔로잉 route를 표시한다
- **THEN** 최상위 Profile Home은 빈 제목 PageHeader와 기존 fallback 본문을 유지하고 관계 route는 기존 상단 구조와 본문 계약을 유지한다
