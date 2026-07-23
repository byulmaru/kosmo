## ADDED Requirements

### Requirement: Repost Source와 Post 구조 조합

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-394` 시스템은 Repost와 Quote가 같은 nullable Repost Source 관계를 사용하고, Content·Reply Parent·Repost Source의 조합으로 Post 구조를 판별해야 한다(MUST).

#### Scenario: Repost 저장

- **WHEN** Post가 Content와 Reply Parent 없이 Repost Source를 가진다
- **THEN** 시스템은 Post를 Repost로 판별한다
- **AND** 입력 Source를 다른 Post로 평탄화하지 않고 직접 참조한다

#### Scenario: Quote와 Reply이면서 Quote 저장

- **WHEN** Post가 Content와 Repost Source를 함께 가지며 선택적으로 Reply Parent도 가진다
- **THEN** 시스템은 Reply Parent가 없으면 Quote, 있으면 Reply이면서 Quote로 판별한다
- **AND** Repost와 Quote는 별도 Source 관계나 Post Kind 값을 사용하지 않는다

#### Scenario: 허용되는 Source

- **WHEN** Repost 또는 Quote가 Content를 가진 일반 Post, Reply 또는 Quote를 Source로 참조한다
- **THEN** 시스템은 그 Post ID를 직접 Repost Source로 저장할 수 있다

#### Scenario: 허용되지 않는 구조와 Source

- **WHEN** Content와 Repost Source가 모두 없거나 Content 없이 Reply Parent가 있거나, Post가 자신 또는 Content 없는 Repost를 Source로 참조한다
- **THEN** 시스템은 Post 저장을 거부한다
- **AND** 부분 Post 또는 관계를 남기지 않는다

### Requirement: Repost 생성

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-401` 시스템은 `Account.Active`와 `Profile.Member` 권한을 가진 Active/Normal Local Profile이 조회 가능한 Content Post를 Repost하는 멱등 action과 GraphQL mutation을 제공해야 한다(MUST).

#### Scenario: Public 또는 Unlisted Source Repost

- **WHEN** Active/Normal Local Profile이 조회 가능한 Active Public 또는 Unlisted Content Post를 Repost한다
- **THEN** 시스템은 행동 Profile을 Author로 하고 Content와 Reply Parent 없이 입력 Source를 직접 참조하는 Active Post를 생성한다
- **AND** 생성된 Repost Visibility는 Unlisted다

#### Scenario: Followers Only Source Repost

- **WHEN** Source Author Profile이 자신의 Active Followers Only Content Post를 Repost한다
- **THEN** 시스템은 Followers Only Visibility인 Active Repost를 생성한다

#### Scenario: 허용되지 않는 Source Repost

- **WHEN** 행동 Profile이 다른 Profile의 Followers Only Post, Mentioned Profiles Post, Tombstone Post, 조회할 수 없는 Post 또는 Content 없는 Repost를 Source로 입력한다
- **THEN** 시스템은 Repost를 생성하지 않는다
- **AND** Source의 존재나 비공개 상태를 권한 없는 요청에 노출하지 않는다

#### Scenario: Repost 행동 권한 거부

- **WHEN** Account가 Active가 아니거나 행동 Profile의 Member가 아니거나 행동 Profile이 Active/Normal Local Profile이 아니다
- **THEN** 시스템은 Repost를 생성하지 않고 권한 오류로 요청을 거부한다

#### Scenario: Repost 생성 transaction rollback

- **WHEN** Source 검증 또는 Repost 저장이 transaction commit 전에 실패한다
- **THEN** 시스템은 Content 없는 부분 Post나 Source 관계를 남기지 않는다

#### Scenario: 순차 중복 Repost

- **WHEN** 같은 Author Profile이 같은 Source에 대한 Active Repost를 반복해서 생성한다
- **THEN** 시스템은 기존 Active Repost를 나타내는 성공 결과를 반환한다
- **AND** 같은 Author Profile과 Source의 Active Repost는 하나만 존재한다

#### Scenario: 동시 중복 Repost

- **WHEN** 같은 Author Profile과 Source에 대한 Repost 생성 요청이 동시에 실행된다
- **THEN** 시스템은 데이터베이스 유일성 경계로 Active Repost를 최대 하나만 유지한다
- **AND** 성공한 요청들은 같은 Active Repost identity를 관찰한다

### Requirement: Post 삭제를 통한 Repost 취소

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-411` 시스템은 Repost 취소를 별도 상태나 관계 삭제가 아니라 Author가 소유한 Active Repost Post의 Tombstone 전이로 처리해야 한다(MUST).

#### Scenario: Active Repost 취소

- **WHEN** Repost Author가 자신이 소유한 Active Repost를 삭제한다
- **THEN** 시스템은 Repost Lifecycle State를 Tombstone으로 바꾸고 삭제 시각을 최초 한 번 기록한다
- **AND** Repost Source 직접 참조는 보존한다

#### Scenario: 반복 또는 동시 취소

- **WHEN** 같은 Repost에 대한 삭제가 반복되거나 동시에 실행된다
- **THEN** 시스템은 Tombstone 전이를 최대 한 번 적용하고 멱등 성공 결과를 반환한다
- **AND** 최초 삭제 시각을 변경하지 않는다

#### Scenario: 다른 Profile의 Repost 취소

- **WHEN** 행동 Profile이 다른 Profile의 Repost를 삭제하려 한다
- **THEN** 시스템은 권한 오류로 요청을 거부한다
- **AND** 대상 Post를 변경하지 않는다

#### Scenario: Tombstone 뒤 재Repost

- **WHEN** 이전 Repost가 Tombstone이 된 뒤 같은 Author Profile이 아직 조회 가능한 같은 Source를 다시 Repost한다
- **THEN** 시스템은 새 identity의 Active Repost를 생성할 수 있다
- **AND** 이전 Tombstone Repost와 그 직접 Source 참조는 보존된다

### Requirement: Repost Source와 집계 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-402`, `PROD-403` API는 기존 단일 `Post` Node에서 직접 Repost Source, viewer-independent Repost count와 현재 selected Profile의 Active Repost identity를 제공해야 한다(MUST).

#### Scenario: 직접 Repost Source 조회

- **WHEN** 조회 가능한 Repost 또는 Quote의 `repostSource`를 조회한다
- **THEN** API는 저장된 직접 Source를 기존 `Post` Node로 반환한다
- **AND** 중첩 Source를 다른 Post로 평탄화하지 않는다

#### Scenario: Source를 조회할 수 없는 Repost

- **WHEN** Content 없는 Repost의 direct Source가 Tombstone이거나 요청 viewer 기준 Post Visibility와 Post Eligibility를 통과하지 못한다
- **THEN** API는 해당 Repost를 Post Node와 Post List 후보로 노출하지 않는다

#### Scenario: Source를 조회할 수 없는 Quote

- **WHEN** Content 있는 Quote 또는 Reply이면서 Quote인 Post 자체는 조회 가능하지만 direct Source는 조회할 수 없다
- **THEN** API는 Quote Post와 자체 Content를 Post Node와 Post List 후보로 유지한다
- **AND** nullable `repostSource`만 `null`로 반환한다
- **AND** Source의 Source가 unavailable하다는 이유로 바깥 Quote를 숨기지 않는다

#### Scenario: viewer-independent Repost count

- **WHEN** 서로 다른 viewer가 같은 조회 가능한 Source Post의 `repostCount`를 조회한다
- **THEN** API는 Source를 직접 참조하며 Content와 Reply Parent가 없는 eligible Active Repost 수를 같은 값으로 반환한다
- **AND** Quote, Tombstone Repost와 viewer별 Profile Block 또는 Mute만으로 숨겨지는 Repost를 count 정의에 포함하거나 제외해 viewer별 값을 만들지 않는다

#### Scenario: 현재 selected Profile의 Active Repost

- **WHEN** active selected Profile이 있는 인증자가 Source Post의 `viewerRepost`를 조회한다
- **THEN** API는 그 Profile이 Source를 직접 참조하는 Content와 Reply Parent 없는 Active Repost를 nullable `Post` Node로 반환한다
- **AND** selected Profile이 바뀌면 새 actor 범위에서 결과를 다시 계산한다

#### Scenario: selected Profile이 없는 viewer 상태 조회

- **WHEN** 인증되지 않았거나 selected Profile이 없는 요청이 `viewerRepost`를 조회한다
- **THEN** API는 `null`을 반환한다
