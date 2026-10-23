## ADDED Requirements

### Requirement: 실제 저장 태그에서 시작하는 첫 Profile 사람 찾기

시스템은 첫 코스모 Profile을 준비한 사용자의 실제 저장 태그로 사람 찾기를 제공해야 한다(SHALL). 신규 가입과 기존 계정 로그인을 구분하지 않으며, 완료 방식만으로 다른 태그 상태를 만들어서는 안 된다(MUST NOT).

**Source Context:** PROD-1147, 2026-10-23 사용자 대상 선택, `docs/domain/policies/first-profile-tag-discovery.md`, PROD-1146 PR #1254.

#### Scenario: 저장한 여러 태그

- **WHEN** 첫 Profile 온보딩을 마친 생성·선택 Profile에 저장된 태그가 여러 개 있다
- **THEN** 사용자는 각 canonical Hashtag의 관련 Profile 목록을 선택해 볼 수 있다
- **AND** 각 태그의 목록을 홈의 핵심 기능 안내에 앞서 탐색할 수 있다

#### Scenario: 미저장 초안과 이전 저장값

- **WHEN** 태그 초안을 생략하거나 저장에 실패한 뒤 `나중에 설정` 또는 완료로 진행한다
- **THEN** 미저장 초안을 조회 조건으로 사용하거나 완료 시 일괄 저장하지 않는다
- **AND** 이전에 저장한 태그가 남아 있다면 그 저장값으로 연결한다

#### Scenario: 저장한 태그가 없음

- **WHEN** 생성·선택 Profile에 실제 저장된 태그가 없다
- **THEN** 사람 찾기를 생략하고 후속 흐름으로 진행한다

### Requirement: 명시적 팔로우와 태그 간 관계 상태 일치

시스템은 개별 사용자 action에만 기존 팔로우 정책을 적용해야 한다(SHALL). 동일한 활동 Profile과 대상 Profile의 관계는 태그에 따라 다르게 표시해서는 안 된다(MUST NOT).

**Source Context:** PROD-1147, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`.

#### Scenario: Open 대상 팔로우

- **WHEN** 사용자가 팔로우 가능한 Open Profile의 팔로우 action을 실행하고 성공한다
- **THEN** 팔로잉 상태를 표시한다
- **AND** 다른 태그에서 같은 Profile을 보아도 같은 관계 상태가 보이고 기존 홈 조회에 성립된 팔로우가 반영된다

#### Scenario: 승인이 필요한 대상

- **WHEN** 사용자가 Approval Required Profile에 요청을 보내고 성공한다
- **THEN** 승인 대기 요청 상태를 표시한다
- **AND** 다른 태그에서도 같은 요청 상태를 표시하며 팔로우 완료나 성립된 관계의 접근 권한으로 취급하지 않는다

#### Scenario: 실패와 재시도

- **WHEN** 팔로우 또는 요청이 실패한다
- **THEN** 실패를 완료로 표시하지 않고 오류를 안내한다
- **AND** 태그를 오가도 실제 관계 상태를 유지하며 다시 시도할 수 있다

#### Scenario: 행동 없이 진행

- **WHEN** 사용자가 태그만 바꾸거나 아무도 팔로우하지 않고 다음으로 진행한다
- **THEN** 팔로우·요청을 자동 실행하지 않으며 진행을 허용한다

### Requirement: 조회 맥락과 기존 결과 보존

시스템은 로딩·실패 시 태그 맥락과 선택 상태, 이미 확인한 목록을 보존하고 실패한 요청을 재시도할 수 있게 해야 한다(SHALL).

**Source Context:** PROD-1147, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`.

#### Scenario: 태그 전환 중 초기 조회 실패

- **WHEN** 다른 태그를 선택한 뒤 해당 태그의 목록 조회가 실패한다
- **THEN** 선택한 태그를 계속 확인하고 재시도할 수 있다
- **AND** 이미 확인한 목록을 잃지 않으며 다른 태그의 결과를 현재 태그의 결과로 오인하게 하지 않는다

#### Scenario: 다음 페이지 실패

- **WHEN** 다음 페이지 조회가 실패한다
- **THEN** 기존 행과 관계 상태를 유지하고 실패한 페이지를 다시 요청할 수 있다

#### Scenario: 빈 목록 또는 태그 조회 오류

- **WHEN** 관련 Profile이 없거나 저장 태그 조회에 실패한다
- **THEN** 빈 결과와 오류를 구분한다
- **AND** 지금은 넘어가 후속 흐름으로 진행할 수 있다

### Requirement: 기존 사용자와 권한 경계 유지

시스템은 기존 인증·후보·권한 정책과 Profile 보유자의 일반 진입을 유지해야 한다(SHALL).

**Source Context:** PROD-1147, PROD-1146, `docs/domain/policies/public-content-onboarding.md`, 기존 Hashtag·Profile·Follow 계약.

#### Scenario: 기존 Profile을 가진 새 진입

- **WHEN** 첫 Profile 흐름을 떠난 사용자가 다시 진입하거나 재로그인한다
- **THEN** 기존 일반 사용 흐름을 따르며 첫 온보딩을 다시 시작하지 않는다

#### Scenario: 인증 또는 활동 Profile 변경

- **WHEN** 탐색·팔로우 중 인증 또는 활동 Profile이 바뀐다
- **THEN** 이전 활동 Profile의 상태와 늦은 결과를 새 활동 Profile에 적용하지 않는다

#### Scenario: 공개 콘텐츠에서 인증 진입

- **WHEN** 공개 콘텐츠에서 가입·로그인해 첫 Profile을 준비한다
- **THEN** 같은 실제 저장 태그 조건을 적용하고 기존 공개 읽기를 유지한다
- **AND** 출발 위치 전달·자동 복귀나 인증 전 참여 행동 자동 실행을 추가하지 않는다
