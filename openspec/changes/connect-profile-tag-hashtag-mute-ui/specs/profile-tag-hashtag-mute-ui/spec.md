## ADDED Requirements

### Requirement: Profile Tag의 canonical Hashtag identity 유지

클라이언트는 Profile Tag에서 확인한 canonical Hashtag identity를 뮤트 생성·해제 대상으로 유지해야 한다(SHALL).

**Source Context:** `docs/domain/objects/hashtag.md`, accepted ADR 0020, PROD-735 포함 범위.

#### Scenario: 표시 이름과 무관하게 정확한 Hashtag를 생성 대상으로 전달

- **WHEN** 사용자가 표시된 Profile Tag의 뮤트를 확정한다
- **THEN** 클라이언트는 그 태그의 서버 identity를 대상으로 요청한다
- **AND** 표시 문자열로 다른 Hashtag를 만들거나 해당 Profile 자체를 뮤트하지 않는다

#### Scenario: 기존 관련 Profile 탐색 보존

- **WHEN** 사용자가 기존 TagChip 탐색 링크를 실행한다
- **THEN** 같은 Hashtag의 관련 Profile 목록으로 이동한다
- **AND** 이 탐색만으로 뮤트 규칙을 만들거나 해제하지 않는다

### Requirement: 현재 UI의 영구 뮤트 제공

현재 Profile Tag 뮤트 UI는 해당 태그를 프로필에 단 사람의 새 알림만 제어하는 영구 뮤트를 제공하며, 범위·숨기기/접기·기간 선택을 제공하지 않아야 한다(MUST NOT).

**Source Context:** 2026-10-02 현재 사용자의 영구 뮤트 및 프로필 태그 기준 새 알림 전용 지시, `docs/domain/objects/hashtag-mute-rule.md`의 현재 UI 제공 범위.

#### Scenario: 영구 규칙 생성

- **WHEN** 사용자가 Profile Tag 뮤트를 확정한다
- **THEN** 서버 계약의 Notification 전용 영구 설정으로 규칙을 생성한다
- **AND** 사용자에게 범위·숨기기/접기·기간·날짜·시각 선택을 요구하지 않는다

#### Scenario: 기존 확인 UI에서 결과 안내

- **WHEN** 사용자가 태그 뮤트 또는 해제 확인 UI를 연다
- **THEN** 기존 확인 presentation에서 해당 태그를 프로필에 단 사람의 새 알림을 끄거나 다시 받는 결과를 안내한다
- **AND** 게시물 숨김·검색 제외·기존 알림 삭제·과거 억제 알림 복구를 약속하지 않는다

### Requirement: selected Profile의 서버 확정 상태

클라이언트는 현재 selected Profile의 권한 범위에서 서버가 확정한 뮤트 상태와 그 상태에 맞는 설정·해제 action을 제공해야 한다(SHALL).

**Source Context:** `docs/domain/objects/hashtag-mute-rule.md`의 Owner·권한·적용 상태, PROD-735 완료 조건.

#### Scenario: 현재 적용 중인 규칙 조회

- **WHEN** 현재 selected Profile이 소유한 Notification Scope의 적용 중인 규칙을 서버가 반환한다
- **THEN** 해당 Hashtag의 뮤트 상태와 되돌릴 수 있는 해제 action을 표시한다
- **AND** 다른 Profile의 규칙을 자신의 상태로 표시하지 않는다

#### Scenario: 조회 중 또는 조회 실패

- **WHEN** 현재 selected Profile의 규칙 조회가 아직 끝나지 않았거나 실패했다
- **THEN** 이를 뮤트가 없는 확정 상태로 표시하지 않는다
- **AND** 실패한 조회를 재시도할 수 있다

#### Scenario: 권한이 없는 요청

- **WHEN** selected Profile이 없거나 서버가 규칙 접근 권한을 인정하지 않는다
- **THEN** 이전 Profile의 규칙·해제 action을 노출하지 않는다
- **AND** 기존 태그 탐색의 인증·공개 조회 계약은 유지한다

### Requirement: 생성·해제의 요청 상태와 실패 복구

클라이언트는 뮤트 생성·해제의 요청 중 상태, 오류·재시도와 서버 성공 후 상태 수렴을 제공해야 한다(SHALL).

**Source Context:** PROD-735 포함 범위·완료 조건. 구체 확인 presentation은 기존 UI를 활용하는 작업 메모이며 새 제품 정책을 정하지 않는다.

#### Scenario: 요청 중 중복 입력

- **WHEN** 같은 대상의 생성 또는 해제 요청이 진행 중이다
- **THEN** 요청 중 상태를 표시하고 동일 action을 중복 제출하지 않는다

#### Scenario: 요청 실패와 재시도

- **WHEN** 생성 또는 해제가 실패한다
- **THEN** 기존 서버 확정 상태를 유지하고 오류를 알린다
- **AND** 사용자가 다시 시도할 수 있으며 실패를 성공으로 표시하지 않는다

#### Scenario: 성공 후 새 조회와 상태 일치

- **WHEN** 서버가 생성 또는 해제 성공을 확정하고 사용자가 상태를 다시 조회한다
- **THEN** UI는 현재 selected Profile의 서버 결과와 일치하는 상태·action을 표시한다

#### Scenario: 서버 처리 후 응답 유실

- **WHEN** 서버의 처리 여부를 확인하기 전에 요청 연결이 끊겼다
- **THEN** 성공·실패한 관계 상태를 임의로 확정하지 않는다
- **AND** 다시 조회한 서버 상태를 기준으로 다음 생성·해제 action을 제공한다

### Requirement: actor와 target 전환 격리

클라이언트는 Profile·Account 또는 Hashtag target 전환 후 이전 요청의 상태와 완료 피드백을 새 대상에 적용하지 않아야 한다(MUST NOT).

**Source Context:** PROD-735 selected Profile 격리 요구, `memory/frontend/relay-operation-env-cache.md`의 기존 actor boundary.

#### Scenario: Profile A 요청 중 Profile B로 전환

- **WHEN** A의 요청 중 selected Profile이 B로 바뀌고 A의 성공 또는 실패가 늦게 도착한다
- **THEN** B는 B의 서버 상태를 표시한다
- **AND** A의 완료가 B의 상태·Toast·focus를 바꾸지 않는다

#### Scenario: 같은 화면에서 대상 태그 전환

- **WHEN** 이전 Hashtag의 요청 중 다른 Hashtag를 표시하는 맥락으로 전환한다
- **THEN** 이전 태그의 상태나 완료 피드백을 새 태그에 적용하지 않는다

### Requirement: 접근 가능한 태그 action

클라이언트는 태그 대상과 현재 상태·action을 보조 기술로 이해하고 키보드로 실행할 수 있게 제공해야 한다(SHALL).

**Source Context:** PROD-735 접근 가능한 동작·종단 간 검증, `docs/design/profile-tags.md`, `docs/design/hashtag-related-profiles.md`.

#### Scenario: 긴 표시 이름과 키보드 동작

- **WHEN** 긴 Display Hashtag Name이 시각적으로 생략되거나 사용자가 키보드로 action을 실행한다
- **THEN** 접근성 이름에는 전체 태그 이름과 행동 목적이 드러난다
- **AND** 현재 상태·요청 중·오류를 색만으로 전달하지 않는다

#### Scenario: action 종료 후 focus 유지

- **WHEN** 사용자가 action을 취소하거나 요청의 성공·실패 처리가 끝난다
- **THEN** 현재 태그 맥락의 유효한 control로 focus가 돌아오거나 이어져 탐색을 계속할 수 있다
