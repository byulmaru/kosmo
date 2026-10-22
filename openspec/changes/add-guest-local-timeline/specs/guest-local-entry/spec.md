이 문서는 PROD-1199의 변경 결과를 검증하기 위한 세션 메모다. 기존 권한·후보 정책을 확장하거나 장기 스펙으로 자동 승격하지 않는다.

## ADDED Requirements

### Requirement: 비로그인 Web 첫 화면에서 로컬 공개 게시글을 읽는다

시스템은 계정·선택 Profile이 없는 Web 방문자가 `/`의 공통 공개 화면 중앙에서 로컬 공개 게시글을 읽고 다음 페이지를 이어서 조회할 수 있게 해야 한다(SHALL). 기존 Local 후보·최신순 정렬·공개 범위를 유지하고, 공개 조회를 이유로 참여 권한을 확대해서는 안 된다(MUST NOT).

**Source Context:** PROD-1199의 전달 결과·완료 조건, `docs/domain/policies/post-list.md`, `docs/domain/objects/post.md`, `docs/domain/policies/public-content-onboarding.md`.

#### Scenario: 직접 진입과 새로고침

- **WHEN** 계정·선택 Profile이 없는 방문자가 `/`를 직접 열거나 새로고침한다
- **THEN** 공개 Profile·Post와 공통 방문자 UI를 사용하고 중앙에 로컬 타임라인을 표시한다
- **AND** 첫 조회와 다음 페이지 조회에 로그인이나 Profile 생성을 요구하지 않는다
- **AND** 작성자 Profile·Post 상세로 이동해 공개 읽기를 계속할 수 있다

#### Scenario: 공개 후보와 원문 가시성 유지

- **WHEN** PUBLIC·UNLISTED·FOLLOWERS·DIRECT, Local·Remote 작성자, 일반 Post·Quote·Reply·Content 없는 Repost가 섞인 목록을 방문자가 조회한다
- **THEN** 기존 Local 정책의 조회 가능한 PUBLIC 일반 Post·Quote만 기존 순서로 반환한다
- **AND** 기존에 제외하던 작성자·게시글 상태는 페이지 크기 적용 전에 제외한다
- **AND** 자체 Content가 있는 조회 가능한 Quote는 원문이 보이지 않아도 유지하고, 원문 관계는 기존 접근 정책에 따라 숨긴다

#### Scenario: 목록 실패와 재시도

- **WHEN** 최초 조회·새로고침·다음 페이지 조회가 로딩 중이거나 비어 있거나 실패한다
- **THEN** 기존 Local 목록의 loading·empty·error·retry 상태를 제공한다
- **AND** 목록을 성공적으로 조회한 뒤 새로고침·추가 조회가 실패하면 기존 목록을 유지하며 재시도할 수 있다

#### Scenario: 인증 상태와 참여 경계 유지

- **WHEN** 방문자가 인증이 필요한 참여 행동을 시도한다
- **THEN** 기존 권한 정책을 적용하고 인증 전에 참여 행동을 수행하지 않는다
- **AND** 가입·로그인과 하단 CTA는 기존 직접 인증 진입을 사용한다

#### Scenario: 유효한 Session의 기존 첫 화면 흐름

- **WHEN** 유효한 Session이 있는 사용자가 `/`에 진입한다
- **THEN** 기존 첫 화면 이동과 Profile 생성·선택 준비 흐름을 유지한다
- **AND** Session 조회 실패나 Profile 미선택을 비로그인으로 취급하지 않는다

### Requirement: 세 공개 화면에서 공통 긴 로고를 사용한다

시스템은 `/`, `/@{handle}`, `/@{handle}/{postId}`의 기존 방문자 설명 영역에서 두 안내 문구를 코스모 긴 로고로 교체하고 같은 방문자 UI를 재사용해야 한다(SHALL). 기존 가입·로그인, 하단 CTA와 접근성을 유지해야 한다(SHALL).

**Source Context:** PROD-1199의 긴 로고 교체 범위·반응형 완료 조건, `docs/design/public-content-onboarding.md`, `docs/design/accessibility.md`.

#### Scenario: 사이드바와 모바일 메뉴의 로고

- **WHEN** 세 공개 화면의 방문자 사이드바나 모바일 메뉴에 기존 설명 영역이 표시된다
- **THEN** `공개 콘텐츠를 보고 있어요`와 `로그인하면 프로필을 선택하거나 만들고 대화에 참여할 수 있어요.` 대신 같은 긴 코스모 로고가 표시된다
- **AND** 로고를 보조 기술로 식별할 수 있고 가입·로그인은 독립적으로 조작할 수 있다

#### Scenario: 반응형 탐색과 CTA 닫힘

- **WHEN** full·compact·모바일 Web에서 첫 화면과 두 공개 화면을 탐색한다
- **THEN** 기존 반응형 구성에 맞춰 중앙 콘텐츠와 공통 방문자 UI가 표시된다
- **AND** 하단 CTA를 닫아도 가입·로그인과 모바일 메뉴에 접근할 수 있다
- **AND** 같은 탭에서 공개 화면 사이를 이동해도 CTA 닫힘이 유지된다
