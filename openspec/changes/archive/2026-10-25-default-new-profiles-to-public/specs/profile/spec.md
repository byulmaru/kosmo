## ADDED Requirements

### Requirement: 새 Local Profile은 Public을 기본 게시 공개 범위로 사용한다

시스템은 새 Local Profile의 기본 Post Visibility를 Public으로 정해야 한다(MUST). 기존 Profile의 저장된 기본값과 기존 Post를 일괄 변경해서는 안 된다(MUST NOT).

**Source Context:** PROD-1226, 2026-10-24 사용자 요청, `docs/domain/objects/profile.md`.

#### Scenario: 첫 프로필 생성

- **WHEN** Profile이 없는 인증 Account가 첫 Local Profile을 생성한다
- **THEN** 생성된 Profile의 기본 Post Visibility는 `PUBLIC`이다
- **AND** 해당 Profile로 새 일반 Composer를 열면 저장된 `PUBLIC`으로 시작한다
- **AND** Follow Approval Policy의 기존 초기값 `OPEN`은 유지한다

#### Scenario: 기존 Account가 프로필 추가 생성

- **WHEN** 이미 Profile이 있는 인증 Account가 Local Profile을 추가 생성한다
- **THEN** 새 Profile의 기본 Post Visibility는 `PUBLIC`이다
- **AND** 기존 Profile의 저장된 기본값과 기존 Post의 공개 범위는 바뀌지 않는다

#### Scenario: 과거 값과 조회 대체 동작 보존

- **WHEN** 기존 Profile의 저장된 기본값이 `UNLISTED` 또는 `FOLLOWERS`이거나 값이 없다
- **THEN** 저장된 값은 그대로 사용하고 값이 없으면 기존 `UNLISTED` 해석을 유지한다
- **AND** 클라이언트가 기본값을 조회하지 못하면 기존 `UNLISTED` 대체 동작을 유지한다
- **AND** Remote Profile에 Local 기본값을 새로 저장하지 않는다

### Requirement: 온보딩의 초기 선택과 생략 결과는 새 생성 기본값과 일치한다

첫 Profile 온보딩은 Public에 해당하는 기존 ‘전체 공개’를 초기 선택해야 한다(MUST). 게시 설정의 저장·생략·바로 시작 뒤에는 실제 저장된 기본값을 사용해야 한다(MUST).

**Source Context:** PROD-1226, `docs/domain/policies/first-profile-onboarding.md`, `docs/design/first-profile-onboarding.md`.

#### Scenario: 초기 선택으로 게시 설정 저장

- **WHEN** 새 Profile의 게시 설정을 다른 범위로 바꾸지 않고 `다음`으로 저장한다
- **THEN** ‘전체 공개’가 선택된 상태로 시작하고 저장 후 기본값도 `PUBLIC`이다
- **AND** 저장 결과 요약과 새 일반 Composer가 같은 값을 사용한다

#### Scenario: 게시 설정 생략과 바로 시작

- **WHEN** 첫 핸들 단계에서 `바로 시작`하거나 선택 단계의 `바로 시작` 또는 게시 설정의 `지금은 건너뛰기`로 게시 설정을 저장하지 않는다
- **THEN** 생성 시 정해진 `PUBLIC`을 유지한다
- **AND** 게시 설정 초안에서 바꿨지만 저장하지 않은 값은 적용하지 않는다
- **AND** 새 일반 Composer는 저장된 `PUBLIC`으로 시작한다

#### Scenario: 다른 공개 범위를 선택해 저장

- **WHEN** 사용자가 온보딩이나 기존 프로필 설정에서 ‘조용한 공개’ 또는 ‘팔로워만’을 저장한다
- **THEN** 해당 Profile은 선택한 `UNLISTED` 또는 `FOLLOWERS`를 기본값으로 사용한다
- **AND** 새 일반 Composer는 그 저장값으로 시작한다

#### Scenario: 열린 초안과 답글 경계 보존

- **WHEN** 기본값이 `PUBLIC`인 Profile로 글을 작성한다
- **THEN** 이미 열린 초안이나 글별 수동 공개 범위 선택을 덮어쓰지 않는다
- **AND** 새 Reply는 저장된 Profile 기본값과 직접 Parent 공개 범위 중 더 좁은 값으로 시작한다
