## ADDED Requirements

### Requirement: Hashtag related Profile connection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `PROD-525`, `PROD-528` — 시스템은 기존 `Hashtag` Node가 나타내는 정확한 Hashtag identity에서 해당 Hashtag를 Profile Tag로 사용하는 Profile을 조회하는 `relatedProfiles(first:, after:): ProfileConnection!` field를 제공해야 한다(MUST). 이 field는 Hashtag 이름 문자열이나 `#` 접두사를 검색 입력으로 해석하거나 Hashtag 또는 Hashtag Name 결과를 반환해서는 안 된다(MUST NOT).

#### Scenario: Resolve related Profiles from an existing Hashtag Node

- **WHEN** 로그인한 Account가 Profile의 TagChip에서 얻은 Hashtag global identity의 `relatedProfiles`를 요청한다
- **THEN** 시스템은 그 Hashtag identity와 Profile Tag 관계가 있는 Profile을 `ProfileConnection` node로 반환한다
- **AND** 각 결과 node는 기존 `Profile` global identity와 공개 field 계약을 재사용한다

#### Scenario: Return an empty connection for an unrelated Hashtag

- **WHEN** 로그인한 Account가 존재하지만 공개 조회 가능한 관련 Profile이 없는 Hashtag Node의 `relatedProfiles`를 요청한다
- **THEN** 시스템은 오류나 Hashtag Name 검색 결과 대신 빈 `ProfileConnection`을 반환한다

#### Scenario: Do not interpret Hashtag names as search queries

- **WHEN** 클라이언트가 `relatedProfiles` 관계를 조회한다
- **THEN** 시스템은 parent Hashtag global identity만 관계 조건으로 사용한다
- **AND** Hashtag 이름의 부분 일치, `#` 접두사 해석, 자동완성 또는 관련도 검색을 수행하지 않는다

### Requirement: Account authentication before Profile candidate lookup

**Authority / Provenance:** `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-524`, `PROD-525`, `PROD-528` — 시스템은 `Hashtag.relatedProfiles`를 유효한 현재 Session으로 확인되는 Account 요청에만 제공해야 한다(MUST). 인증할 수 없는 요청은 관련 Profile 후보를 조회하기 전에 기존 GraphQL permission error로 거부해야 하며(MUST), selected Profile을 요구해서는 안 된다(MUST NOT).

#### Scenario: Reject an unauthenticated request before candidate lookup

- **WHEN** 현재 Session으로 확인할 수 있는 credential이 없는 클라이언트가 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 기존 `PERMISSION_DENIED` GraphQL error로 요청을 거부한다
- **AND** Hashtag와 연결된 Profile 후보 query를 실행하지 않는다

#### Scenario: Reject an invalid Session before candidate lookup

- **WHEN** 폐기·만료되었거나 그 밖의 이유로 유효하지 않은 Session credential로 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 기존 `PERMISSION_DENIED` GraphQL error로 요청을 거부한다
- **AND** Hashtag와 연결된 Profile 후보 query를 실행하지 않는다

#### Scenario: Allow an Account without a selected Profile

- **WHEN** 유효한 현재 Session은 있지만 selected Profile이 없는 Account가 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 Account 로그인 경계를 통과시킨다
- **AND** 공개 조회 가능한 관련 Profile connection을 정상적으로 반환한다

### Requirement: Exact relation and public Local Profile visibility

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `PROD-523`, `PROD-524`, `PROD-525`, `PROD-528` — 시스템은 parent Hashtag identity와 정확한 Profile Tag 관계가 있고 공개 조회 조건을 통과한 Active·Normal Local Profile만 `relatedProfiles` 후보로 사용해야 한다(MUST). Profile visibility와 Local 조건은 page limit 전에 SQL 후보에 적용해야 하며(MUST), 같은 Profile을 한 page 또는 여러 page에 중복 반환해서는 안 된다(MUST NOT).

#### Scenario: Include an exact related public Local Profile

- **WHEN** Active·Normal Local Profile이 parent Hashtag identity를 Profile Tag로 참조한다
- **THEN** 시스템은 그 Profile을 `relatedProfiles` 후보에 포함한다

#### Scenario: Exclude a Profile related to another Hashtag

- **WHEN** 공개 Local Profile이 요청한 Hashtag가 아닌 다른 Hashtag identity만 Profile Tag로 참조한다
- **THEN** 시스템은 그 Profile을 결과에 포함하지 않는다

#### Scenario: Exclude Profiles that are not publicly visible

- **WHEN** parent Hashtag와 관계된 Profile의 lifecycle이 Active가 아니거나 suspension 상태가 Normal이 아니다
- **THEN** 시스템은 그 Profile을 page limit 계산 전에 후보에서 제외한다

#### Scenario: Exclude Remote Profiles without materialization

- **WHEN** 저장된 Remote Profile이 parent Hashtag와 관계되어 있거나 원격에서 같은 Hashtag 이름을 사용할 수 있다
- **THEN** 시스템은 Remote Profile을 결과에 포함하지 않는다
- **AND** 원격 lookup, refresh 또는 새 Profile materialization을 수행하지 않는다

#### Scenario: Fill a page after applying visibility

- **WHEN** cursor 다음의 관계 row 중 일부 Profile이 공개 조회 조건을 통과하지 않고 이후에 공개 Local Profile 후보가 더 존재한다
- **THEN** 시스템은 숨겨진 Profile을 application 단계에서 제거해 짧은 page를 만들지 않는다
- **AND** visibility를 통과한 후보를 기준으로 요청한 page 크기까지 반환한다

### Requirement: Bounded immutable Profile cursor pagination

**Authority / Provenance:** `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-524`, `PROD-525`, `PROD-528` — 시스템은 `Hashtag.relatedProfiles`를 immutable하고 유일한 `Profile.id ASC` opaque cursor의 forward pagination으로 제공해야 한다(MUST). `first`가 생략되거나 20보다 크더라도 한 요청에서 최대 20개만 반환해야 하며(MUST), Profile Tag 관계의 저장 순서·관계 ID·생성 시각·개수 또는 관련도와 알파벳순에 pagination 의미를 부여해서는 안 된다(MUST NOT).

#### Scenario: Use the default bounded first page

- **WHEN** 로그인한 Account가 `first` 없이 관련 Profile 첫 page를 요청하고 후보가 20개보다 많다
- **THEN** 시스템은 `Profile.id ASC` 순서로 최대 20개를 반환한다
- **AND** 다음 page를 위한 opaque `endCursor`와 `hasNextPage=true`를 반환한다

#### Scenario: Cap an oversized page request

- **WHEN** 로그인한 Account가 `first`를 20보다 크게 지정한다
- **THEN** 시스템은 한 요청에서 최대 20개의 Profile만 반환한다

#### Scenario: Continue with an after cursor

- **WHEN** 로그인한 Account가 이전 page의 `endCursor`를 `after`로 전달한다
- **THEN** 시스템은 cursor의 Profile ID보다 큰 다음 후보를 `Profile.id ASC` 순서로 반환한다
- **AND** 변경되지 않은 결과 집합에서 이전 page의 Profile을 중복하거나 다음 Profile을 누락하지 않는다

#### Scenario: Keep relation order out of the cursor

- **WHEN** Profile Tag 관계 row의 ID나 생성 순서가 Profile ID 순서와 다르다
- **THEN** 시스템은 관계 row 순서가 아니라 `Profile.id`만 cursor와 결과 순서에 사용한다

### Requirement: Existing Profile and Hashtag lookup contracts remain isolated

**Authority / Provenance:** `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/design/hashtag-related-profiles.md`, `PROD-524`, `PROD-525`, `PROD-528` — 시스템은 Hashtag 관련 Profile 관계 조회를 기존 `searchProfiles` 및 공개 Profile·Hashtag Node 조회와 별도 field로 유지해야 한다(MUST). 이 변경은 기존 사람 검색의 handle 입력·결과·visibility·pagination 또는 원격 Profile lookup 동작을 바꿔서는 안 된다(MUST NOT).

#### Scenario: Preserve handle search behavior

- **WHEN** 인증된 Account가 기존 `searchProfiles`로 Local 또는 Remote handle 부분 검색을 요청한다
- **THEN** 시스템은 Hashtag 관계를 해석하거나 결과에 섞지 않고 기존 handle 검색 계약을 유지한다

#### Scenario: Preserve public Profile lookup behavior

- **WHEN** 클라이언트가 기존 `profileByHandle` 또는 `node(id:)` 경로로 공개 Profile을 조회한다
- **THEN** 시스템은 `Hashtag.relatedProfiles`의 Account 인증 정책을 해당 공개 lookup 전체에 확대하지 않는다
