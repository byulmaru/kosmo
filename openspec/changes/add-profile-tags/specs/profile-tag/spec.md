## ADDED Requirements

### Requirement: Profile Tag identity and normalization

**Authority / Provenance:** `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — 시스템은 Profile Tag를 별도 durable identity로 만들지 않고 Post와 Profile이 공유하는 canonical Hashtag identity에 연결해야 한다(MUST). Hashtag가 Profile Tag 입력의 바깥 공백·선택적인 앞 `#`·Unicode NFKC·locale 비종속 case folding·Name syntax·길이·normalized-name uniqueness를 소유해야 하며(MUST), 정규화 결과는 1~20개의 Unicode Letter·Number 또는 밑줄 code point로만 구성되어야 한다(MUST). Profile 관계는 Hashtag를 resolve/create한 canonical identity를 사용해야 한다(MUST).

#### Scenario: Normalize a valid Profile Tag

- **WHEN** Local Profile Owner가 바깥 공백, 선택적인 앞 `#` 또는 대소문자 차이가 있는 유효한 Profile Tag를 입력한다
- **THEN** Hashtag normalizer는 공백과 앞 `#`를 제거하고 Unicode NFKC와 locale 비종속 case folding을 적용한다
- **AND** Hashtag는 정규화 결과의 Name syntax와 1~20 code point 길이를 검증한다
- **AND** Profile Tag 관계는 결과를 canonical Hashtag identity로 resolve/create한다

#### Scenario: Use the canonical shared Hashtag identity

- **WHEN** Post 또는 다른 Profile이 동일하게 정규화된 Hashtag Name을 나타내는 canonical identity를 사용한다
- **THEN** 시스템은 새 Profile Tag identity를 만들지 않고 동일한 canonical Hashtag identity와 현재 Profile 사이의 관계를 만든다
- **AND** Post에서 파생된 Hashtag 관계와 Profile Owner가 선택한 관계는 서로의 생성 방식을 바꾸지 않는다

#### Scenario: Reject an invalid normalized name

- **WHEN** Profile Tag 입력을 정규화한 결과가 비어 있거나 20 code point를 초과하거나 Unicode Letter·Number·밑줄 이외의 문자를 포함한다
- **THEN** 시스템은 해당 Profile Tag 목록 전체를 validation 오류로 거부한다
- **AND** Profile 또는 기존 Profile Tag 관계를 변경하지 않는다

### Requirement: Profile Tag list replacement and identity uniqueness

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — 한 Profile의 Profile Tag 관계는 canonical Hashtag identity 집합을 나타내며 제품상 최대 개수나 저장·노출 순서를 계약하지 않는다. 시스템은 한 입력 목록 안에서 같은 canonical Hashtag identity가 중복되면 전체 목록을 거부해야 한다(MUST).

#### Scenario: Replace the Profile Tag identity set

- **WHEN** 권한이 있는 Owner가 서로 다른 유효한 Profile Tag를 저장한다
- **THEN** 시스템은 각 입력을 canonical Hashtag identity로 resolve/create하고 현재 Profile과 관계를 만든다
- **AND** 후속 Profile 조회는 연결된 normalized Hashtag Names를 반환할 수 있다
- **AND** 관계 저장·조회와 반환 배열의 순서는 계약되지 않는다

#### Scenario: Clear all Profile Tags

- **WHEN** 권한이 있는 Owner가 빈 Profile Tag 목록을 명시적으로 저장한다
- **THEN** 시스템은 해당 Profile의 기존 Profile Tag 관계를 모두 제거한다
- **AND** 연결이 끊긴 Hashtag를 참조하는 다른 Post 또는 Profile 관계는 유지한다

#### Scenario: Reject duplicate canonical identities

- **WHEN** 서로 다른 원문 입력 둘 이상이 Hashtag를 resolve/create한 뒤 같은 canonical Hashtag identity가 된다
- **THEN** 시스템은 목록 전체를 duplicate identity validation 오류로 거부한다
- **AND** 기존 Profile Tag 관계를 유지한다

### Requirement: Owner-controlled atomic Profile Tag replacement

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — Active Account가 현재 선택한 Profile의 `OWNER`이고 대상 Origin이 Local, Lifecycle State가 `Active`, Suspension State가 `Normal`일 때만 기존 Profile 편집 action에서 Profile Tag 전체 목록을 교체할 수 있어야 한다(MUST). Profile update input은 대상 Profile ID를 받지 않고 검증된 세션의 selected Profile identity를 사용해야 한다(MUST). Profile Tag 목록과 같은 요청에 포함된 다른 Profile 편집 값은 하나의 transaction으로 적용되어야 하며(MUST), 권한·정규화·검증·저장 중 하나라도 실패하면 어느 값도 변경되어서는 안 된다(MUST NOT). Profile Tag 입력을 생략하거나 `null`로 보낸 기존 update 요청은 현재 목록을 유지해야 한다(MUST).

#### Scenario: Replace Profile Tags as Local Profile Owner

- **WHEN** Active Account가 현재 선택한 Active Local Profile의 `OWNER`로 유효한 Profile Tag 목록을 포함해 수정을 요청한다
- **THEN** 시스템은 기존 Profile Tag 전체 목록을 새 목록으로 교체한다
- **AND** 같은 요청의 다른 Profile 편집 값과 Profile Tag 관계를 하나의 transaction으로 commit한다

#### Scenario: Preserve tags when the input is omitted or null

- **WHEN** 권한이 있는 Owner가 Profile Tag 입력을 생략하거나 `null`로 보내 기존 Profile 수정을 요청한다
- **THEN** 시스템은 다른 제공 값을 수정하되 현재 Profile Tag 관계를 유지한다

#### Scenario: Roll back all profile edits after tag failure

- **WHEN** 같은 Profile 편집 요청에 유효한 표현 값과 유효하지 않은 Profile Tag 목록이 함께 들어온다
- **THEN** 시스템은 요청을 validation 오류로 거부한다
- **AND** 표현 값과 기존 Profile Tag 관계를 모두 요청 전 상태로 유지한다

#### Scenario: Reject a non-owner or inaccessible profile

- **WHEN** Member 또는 관계없는 Account가 Profile Tag 변경을 요청하거나 selected Profile이 없거나 Account가 inactive이거나 대상 Profile이 Deactivated·Deleted·Suspended 상태이거나 Remote다
- **THEN** 시스템은 기존 Profile 수정의 permission 또는 not-found 경계로 요청을 거부한다
- **AND** Profile과 Profile Tag 관계를 변경하지 않는다

### Requirement: Profile Tag visibility and lifecycle

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — 시스템은 공개 조회 조건인 Lifecycle State `Active`와 Suspension State `Normal`을 통과한 Local Profile의 Profile Tag만 해당 Profile과 함께 공개해야 한다(MUST). Profile이 비활성화되거나 정지되면 관계는 보존하되 공개 결과에서 숨겨야 하며(MUST), Lifecycle State가 Deleted로 전이됐다는 사실만으로 관계를 제거해서는 안 된다(MUST NOT). 물리 Profile row 삭제 시 FK cascade는 별도의 DB safety invariant다. Remote Profile Tag 수집·표시와 ActivityPub 표현을 제공해서는 안 된다(MUST NOT).

#### Scenario: Read visible Local Profile Tags

- **WHEN** Lifecycle State가 `Active`이고 Suspension State가 `Normal`인 Local Profile을 조회한다
- **THEN** 시스템은 해당 Profile에 연결된 정규화된 Hashtag Name을 반환한다
- **AND** 반환 배열의 순서는 계약하지 않는다
- **AND** Profile Tag는 Profile과 별도의 visibility 경로를 만들지 않는다

#### Scenario: Hide retained tags for an unavailable Profile

- **WHEN** Profile이 비활성화되거나 정지되어 공개 조회 조건을 통과하지 않는다
- **THEN** 시스템은 Profile Tag를 별도로 공개하지 않는다
- **AND** Profile Tag 관계는 재활성화 또는 정지 해제를 위해 보존한다

#### Scenario: Retain hidden relations on Deleted lifecycle transition

- **WHEN** Profile Lifecycle State가 `Deleted`로 전이하고 Profile row가 유지된다
- **THEN** 시스템은 해당 Profile의 Profile Tag 관계를 상태 전이만으로 제거하지 않는다
- **AND** Deleted Profile과 그 Profile Tag는 공개 결과에 노출하지 않는다

#### Scenario: Do not expose Remote Profile Tags

- **WHEN** 공개 조회 가능한 ActivityPub Remote Profile을 조회한다
- **THEN** 시스템은 Remote Profile Tag를 수집하거나 표시하지 않는다
- **AND** 원격 actor 문서를 Profile Tag 목적으로 fetch·refresh하지 않는다
