<!-- Session behavior notes; canonical, Linear and current user agreement own authority. -->

## ADDED Requirements

### Requirement: Local Profile 고정 순서 저장

**Authority / Provenance:** PROD-1234, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, 2026-10-27 현재 사용자 합의. 시스템은 Local Profile의 Owner와 Member가 이미 고정한 게시글의 순서를 변경하고 이후 조회에서도 저장된 순서를 제공해야 한다(MUST). 순서 변경은 고정 관계를 추가하거나 해제해서는 안 된다(MUST NOT).

#### Scenario: Owner 또는 Member가 순서 변경

- **WHEN** 기존 권한·자격을 통과한 Local Profile의 Owner 또는 Member가 이미 고정한 게시글의 순서를 변경한다
- **THEN** 시스템은 순서만 원자적으로 저장한다
- **AND** 현재 고정 목록과 이후 조회는 저장된 순서를 따른다
- **AND** 고정 관계와 일반 chronology의 후보·순서·pagination은 유지한다

#### Scenario: 권한 또는 대상이 유효하지 않은 변경

- **WHEN** 권한이 없거나 대상 Profile·Post가 기존 관리 조건을 통과하지 못하는 요청이 들어온다
- **THEN** 시스템은 순서 변경을 거부한다
- **AND** 기존 고정 관계와 순서는 유지한다

#### Scenario: visibility filtering 이후 순서

- **WHEN** 변경된 고정 목록을 조회하는 viewer가 일부 고정 Post를 볼 수 없다
- **THEN** 기존 조회 정책으로 해당 Post를 숨긴다
- **AND** 나머지 visible Post의 저장된 상대 순서를 유지한다

#### Scenario: Local Featured와 Remote 표시

- **WHEN** 저장된 Local 고정 순서를 Featured collection으로 조회한다
- **THEN** 기존 authorization을 통과한 항목은 저장된 상대 순서로 제공한다
- **AND** Remote Featured 수신·표시는 원격 순서를 유지한다

#### Scenario: Local과 Remote의 기존 정렬 데이터 전환

- **WHEN** 기존 Local·Remote 고정 데이터를 binary 정렬 키로 전환한다
- **THEN** 전환 전의 고정 관계와 상대 순서를 보존한다
- **AND** Remote는 원격에서 받은 순서를 유지하며 Local 관리자가 재정렬할 수 없다

### Requirement: 고정글 메뉴에서 즉시 이동

**Authority / Provenance:** 2026-10-27 현재 사용자 합의, PROD-1234, `docs/design/post-action-bar.md`. 앱은 해당 Local Profile의 관리 권한이 있는 사용자에게 각 고정글 메뉴의 `위로 이동`과 `아래로 이동`을 제공하고 선택 즉시 저장해야 한다(MUST).

#### Scenario: 위 또는 아래로 한 항목 이동

- **WHEN** 사용자가 고정글 메뉴에서 이동 가능한 방향을 선택한다
- **THEN** 앱은 별도 편집 화면이나 확인 단계 없이 순서 저장을 요청한다
- **AND** 저장 성공 후 현재 고정 목록에 서버가 확정한 순서를 표시한다

#### Scenario: 저장 실패와 재시도

- **WHEN** 순서 저장이 실패한다
- **THEN** 앱은 이전에 확인한 고정 목록을 유지하고 기존 오류 안내 경계로 실패를 알린다
- **AND** 사용자는 메뉴를 다시 열어 재시도할 수 있다
