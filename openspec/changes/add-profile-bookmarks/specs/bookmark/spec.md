## ADDED Requirements

### Requirement: Profile별 개인 Bookmark

시스템은 Bookmark를 Owner Profile이 Target Post를 개인적으로 저장한 결과로 취급해야 한다(MUST). Bookmark는 하나의 Owner Profile, 하나의 Target Post와 변경할 수 없는 생성 시각을 가져야 하며(MUST), 같은 Profile/Post 조합에는 하나만 존재해야 한다(MUST). 서로 다른 Profile은 같은 Post를 독립적으로 저장할 수 있어야 한다(MUST).

#### Scenario: 처음 Post를 저장함

- **WHEN** Profile이 아직 저장하지 않은 Post를 Bookmark로 추가한다
- **THEN** 시스템은 해당 Profile과 Post를 연결한 Bookmark 하나를 생성한다
- **AND** 생성 시각을 기록하고 이후 변경하지 않는다

#### Scenario: 같은 Profile과 Post의 중복 저장을 시도함

- **WHEN** 같은 Profile/Post 조합에 대한 생성 요청이 순차 또는 동시에 둘 이상 실행된다
- **THEN** 시스템은 해당 조합의 Bookmark를 최대 하나만 유지한다
- **AND** 중복 요청 때문에 기존 Bookmark의 생성 시각을 갱신하지 않는다

#### Scenario: 서로 다른 Profile이 같은 Post를 저장함

- **WHEN** 두 Profile이 같은 Post를 각각 Bookmark로 추가한다
- **THEN** 시스템은 Profile별로 독립된 Bookmark를 하나씩 유지한다

### Requirement: Bookmark 생성 권한과 대상 조건

시스템은 유효한 세션의 Account가 멤버인 Active/Normal Local Profile을 행동 주체로 선택했고 그 Profile이 Target Post 조회 정책을 통과할 때만 Bookmark 생성을 허용해야 한다(MUST). 생성은 Post Author에게 Notification을 만들지 않아야 한다(MUST NOT).

#### Scenario: 조회 가능한 Post를 저장함

- **WHEN** 활성 Account의 멤버인 Active/Normal Local Profile이 조회 가능한 Post를 저장하고 같은 조합의 Bookmark가 없다
- **THEN** 시스템은 그 Profile을 Owner로 하는 Bookmark를 생성한다
- **AND** Post Author에게 Notification을 생성하지 않는다

#### Scenario: 조회할 수 없는 Post 저장을 시도함

- **WHEN** 행동 주체 Profile이 Target Post 조회 정책을 통과하지 못한다
- **THEN** 시스템은 Bookmark를 생성하지 않는다
- **AND** Target Post의 비공개 정보를 응답으로 노출하지 않는다

#### Scenario: 사용할 수 없는 Profile로 저장을 시도함

- **WHEN** 행동 주체가 Local Profile이 아니거나 Active/Normal 상태가 아니거나 현재 Account의 멤버가 아니다
- **THEN** 시스템은 Bookmark를 생성하지 않는다

### Requirement: Bookmark 생성 GraphQL 계약

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `PROD-408` 본문과 2026-07-21 생성 API·책임 경계 확정 댓글 — 시스템은 현재 `usingProfile`을 Owner로 사용하는 `createBookmark(input: { postId })` GraphQL mutation을 제공해야 한다(MUST). 성공 payload는 `bookmark` 필드로 Owner Profile, Target Post와 생성 시각을 식별할 수 있는 Bookmark Node를 반환해야 한다(MUST). 같은 Profile/Post의 순차·동시 중복 요청은 기존 Bookmark를 반환하는 성공으로 정규화하고 기존 생성 시각을 변경하지 않아야 한다(MUST).

#### Scenario: GraphQL로 Bookmark를 생성함

- **WHEN** 유효한 Account의 Active/Normal Local `usingProfile`이 조회 가능한 Post ID로 `createBookmark`를 요청한다
- **THEN** 시스템은 현재 `usingProfile`을 Owner로 하는 Bookmark를 생성한다
- **AND** `CreateBookmarkPayload.bookmark`로 Bookmark ID, Owner Profile, Target Post와 생성 시각을 반환한다

#### Scenario: GraphQL 중복 생성을 요청함

- **WHEN** 같은 Profile/Post에 대한 `createBookmark` 요청이 순차 또는 동시에 반복된다
- **THEN** 모든 성공 응답은 같은 기존 Bookmark를 반환한다
- **AND** 기존 Bookmark의 생성 시각을 변경하지 않는다

#### Scenario: 사용할 수 없는 actor로 GraphQL 생성을 요청함

- **WHEN** 현재 Account가 활성 상태가 아니거나 `usingProfile`이 현재 Account의 Active/Normal Local Member가 아니다
- **THEN** 시스템은 `PERMISSION_DENIED` 오류로 요청을 거부한다
- **AND** Bookmark를 생성하지 않는다

#### Scenario: 없거나 조회할 수 없는 Post로 GraphQL 생성을 요청함

- **WHEN** Target Post가 없거나 현재 `usingProfile`의 조회 정책을 통과하지 못한다
- **THEN** 시스템은 두 경우를 구분하지 않는 `NOT_FOUND` 오류로 요청을 거부한다
- **AND** Bookmark를 생성하지 않는다

### Requirement: Owner 전용 Bookmark 삭제

시스템은 Bookmark의 Owner Profile만 해당 Bookmark를 삭제할 수 있게 해야 한다(MUST). Target Post가 현재 조회 불가능하더라도 Owner는 저장 관계를 삭제할 수 있어야 한다(MUST).

#### Scenario: Owner가 Bookmark를 삭제함

- **WHEN** 행동 주체 Profile이 Bookmark의 Owner이고 삭제를 요청한다
- **THEN** 시스템은 해당 Bookmark 관계를 제거한다

#### Scenario: 다른 Profile이 Bookmark 삭제를 시도함

- **WHEN** 행동 주체 Profile이 Bookmark의 Owner가 아니다
- **THEN** 시스템은 Bookmark를 제거하지 않는다
- **AND** 비공개 Bookmark의 존재 여부를 노출하지 않는다

#### Scenario: 숨겨진 Target의 Bookmark를 삭제함

- **WHEN** Target Post가 Tombstone이거나 Owner Profile이 현재 조회할 수 없는 상태에서 Owner가 Bookmark 삭제를 요청한다
- **THEN** 시스템은 Target Post의 현재 가시성과 관계없이 Bookmark를 제거한다

### Requirement: Owner 전용 최신순 Bookmark 목록

시스템은 현재 행동 주체인 Owner Profile에게만 자신의 Bookmark 목록을 제공해야 한다(MUST). 목록은 UUIDv7 ID 내림차순으로 정렬하고 ID만 cursor로 사용해야 하며(MUST), cursor pagination에서도 중복이나 누락 없이 같은 순서를 유지해야 한다(MUST). 같은 millisecond에 생성된 Bookmark의 실제 생성 순서와 UUID 순서는 다를 수 있다.

#### Scenario: Owner가 최신 Bookmark부터 조회함

- **WHEN** Owner Profile이 자신의 Bookmark 첫 페이지를 조회한다
- **THEN** 시스템은 UUIDv7 ID가 큰 Bookmark부터 반환한다
- **AND** 같은 millisecond 안의 실제 생성 순서를 별도로 보장하지 않는다

#### Scenario: 다른 Profile의 Bookmark를 조회함

- **WHEN** 요청 Profile이 다른 Profile 소유의 Bookmark 목록 또는 Bookmark Node에 접근한다
- **THEN** 시스템은 해당 Bookmark와 그 존재 여부를 공개하지 않는다

#### Scenario: 다음 페이지를 조회함

- **WHEN** Owner가 이전 페이지의 cursor로 다음 Bookmark 페이지를 요청한다
- **THEN** 시스템은 앞선 페이지와 중복되지 않는 다음 결과를 같은 안정적 순서로 반환한다

### Requirement: 조회 불가능한 Target 숨김과 관계 유지

시스템은 Target Post가 Tombstone이거나 Owner Profile이 Post 조회 정책을 통과하지 못하면 해당 Bookmark를 목록 결과에서 숨겨야 한다(MUST). 가시성 필터는 page limit을 적용하기 전에 실행해야 하며(MUST), 숨겨진 동안에도 Bookmark 관계와 생성 시각을 유지해야 한다(MUST).

#### Scenario: Target Post가 조회 불가능해짐

- **WHEN** 저장한 Target Post가 Tombstone이 되거나 Block·공개 범위 등으로 Owner Profile에게 조회 불가능해진다
- **THEN** 시스템은 해당 Bookmark를 Owner의 목록 결과에서 제외한다
- **AND** Bookmark 저장 관계는 삭제하거나 변경하지 않는다

#### Scenario: 숨겨진 Target 때문에 페이지가 비지 않음

- **WHEN** 최신 Bookmark 일부의 Target을 조회할 수 없고 그 뒤에 조회 가능한 Bookmark가 있다
- **THEN** 시스템은 조회 불가능한 Target을 먼저 제외한 뒤 요청한 page limit까지 조회 가능한 결과를 채운다

#### Scenario: Target Post 가시성이 회복됨

- **WHEN** 관계를 유지한 Target Post를 Owner Profile이 다시 조회할 수 있게 된다
- **THEN** 시스템은 원래 UUIDv7 ID 순서의 위치에서 해당 Bookmark를 목록에 다시 포함한다

#### Scenario: Target Post가 물리적으로 삭제됨

- **WHEN** Target Post row가 물리적으로 삭제된다
- **THEN** 시스템은 해당 Post를 참조하는 Bookmark를 함께 삭제한다

### Requirement: Profile별 Bookmark action

클라이언트는 조회 가능한 Post에 대해 현재 선택된 Profile의 Bookmark 상태를 표시하고 저장 또는 해제 동작을 제공해야 한다(MUST). 동작 중에는 같은 의도의 중복 요청을 막아야 하며(MUST), 실패하면 직전의 확정 상태를 복구하고 재시도 가능한 오류를 알려야 한다(MUST). 선택 Profile이 바뀌면 이전 Profile의 상태를 새 Profile의 상태로 재사용하지 않아야 한다(MUST NOT).

#### Scenario: 저장되지 않은 Post를 저장함

- **WHEN** 유효한 선택 Profile이 저장되지 않은 Post의 Bookmark action을 활성화한다
- **THEN** 클라이언트는 생성 요청을 보내고 성공한 Bookmark 상태를 해당 Profile의 Post 표면에 반영한다

#### Scenario: 저장된 Post를 해제함

- **WHEN** Owner Profile이 저장된 Post의 Bookmark action을 활성화한다
- **THEN** 클라이언트는 삭제 요청을 보내고 성공 후 저장되지 않은 상태를 반영한다

#### Scenario: Bookmark action이 실패함

- **WHEN** 생성 또는 삭제 요청이 실패한다
- **THEN** 클라이언트는 마지막으로 확정된 Bookmark 상태를 표시한다
- **AND** 사용자가 재시도할 수 있는 오류 상태를 제공한다

#### Scenario: 선택 Profile을 전환함

- **WHEN** 사용자가 같은 Post를 보는 동안 선택 Profile을 변경한다
- **THEN** 클라이언트는 새 Profile의 Bookmark 상태를 조회해 표시한다
- **AND** 이전 Profile의 pending 또는 확정 상태를 새 Profile에 적용하지 않는다

### Requirement: 비공개 Bookmark 목록 화면

클라이언트는 유효한 세션과 선택 Profile이 있는 사용자에게 개인 Bookmark 목록 화면을 제공해야 한다(MUST). 화면은 최신순 pagination과 Target Post 이동을 지원하고(MUST), loading·error·empty 상태를 구분해야 하며(MUST), 서버가 숨긴 Target Post를 별도 경로로 복원하거나 노출하지 않아야 한다(MUST NOT).

#### Scenario: Bookmark 목록을 탐색함

- **WHEN** 선택 Profile에 조회 가능한 Bookmark가 있다
- **THEN** 클라이언트는 최신 Bookmark부터 목록을 표시한다
- **AND** 각 항목에서 조회 가능한 Target Post로 이동할 수 있다

#### Scenario: 목록이 비어 있음

- **WHEN** 선택 Profile에 표시할 Bookmark가 없다
- **THEN** 클라이언트는 loading 또는 error와 구분되는 비공개 목록의 empty 상태를 표시한다

#### Scenario: 선택 Profile별 목록을 격리함

- **WHEN** 사용자가 Bookmark 목록에서 선택 Profile을 바꾼다
- **THEN** 클라이언트는 새 Profile 소유의 목록으로 전환한다
- **AND** 이전 Profile의 edge 또는 pagination cursor를 새 Profile 결과로 재사용하지 않는다
