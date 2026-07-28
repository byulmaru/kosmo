## ADDED Requirements

### Requirement: Profile Tag identity and normalization

**Authority / Provenance:** `docs/domain/objects/hashtag.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — 시스템은 Profile Tag를 별도 durable identity로 만들지 않고 Post와 Profile이 공유하는 Hashtag identity에 연결해야 한다(MUST). Profile Tag 입력은 바깥 공백과 선택적인 앞 `#`를 제거하고 Unicode NFKC와 locale 비종속 case folding을 적용한 뒤 검증해야 하며(MUST), 정규화 결과는 1~20개의 Unicode Letter·Number 또는 밑줄 code point로만 구성되어야 한다(MUST). 같은 정규화된 Hashtag Name은 하나의 Hashtag identity를 공유해야 한다(MUST).

#### Scenario: Normalize a valid Profile Tag

- **WHEN** Local Profile Owner가 바깥 공백, 선택적인 앞 `#` 또는 대소문자 차이가 있는 유효한 Profile Tag를 입력한다
- **THEN** 시스템은 공백과 앞 `#`를 제거하고 Unicode NFKC와 locale 비종속 case folding을 적용한다
- **AND** 정규화된 Hashtag Name을 Profile Tag 관계의 identity로 사용한다

#### Scenario: Reuse a shared Hashtag identity

- **WHEN** Post 또는 다른 Profile이 이미 같은 정규화된 Hashtag Name의 Hashtag를 참조하고 있다
- **THEN** 시스템은 새 Profile Tag identity를 만들지 않고 기존 Hashtag를 현재 Profile과 연결한다
- **AND** Post에서 파생된 Hashtag 관계와 Profile Owner가 선택한 관계는 서로의 생성 방식을 바꾸지 않는다

#### Scenario: Reject an invalid normalized name

- **WHEN** Profile Tag 입력을 정규화한 결과가 비어 있거나 20 code point를 초과하거나 Unicode Letter·Number·밑줄 이외의 문자를 포함한다
- **THEN** 시스템은 해당 Profile Tag 목록 전체를 validation 오류로 거부한다
- **AND** Profile 또는 기존 Profile Tag 관계를 변경하지 않는다

### Requirement: Ordered Profile Tag list

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — 한 Profile은 0~5개의 Profile Tag를 가져야 하며(MUST), 시스템은 입력 순서를 저장하고 공개 순서로 반환해야 한다(MUST). 시스템은 한 입력 목록 안에서 정규화된 Hashtag Name이 중복되면 전체 목록을 거부해야 한다(MUST).

#### Scenario: Store an ordered list

- **WHEN** 권한이 있는 Owner가 서로 다른 유효한 Profile Tag를 1~5개 순서대로 저장한다
- **THEN** 시스템은 각 Profile Tag를 같은 입력 순서로 Profile과 연결한다
- **AND** 후속 Profile 조회는 그 저장 순서로 정규화된 이름을 반환한다

#### Scenario: Clear all Profile Tags

- **WHEN** 권한이 있는 Owner가 빈 Profile Tag 목록을 명시적으로 저장한다
- **THEN** 시스템은 해당 Profile의 기존 Profile Tag 관계를 모두 제거한다
- **AND** 연결이 끊긴 Hashtag를 참조하는 다른 Post 또는 Profile 관계는 유지한다

#### Scenario: Reject too many Profile Tags

- **WHEN** Profile Tag 목록에 6개 이상이 포함된다
- **THEN** 시스템은 목록 전체를 validation 오류로 거부한다
- **AND** 기존 순서와 관계를 유지한다

#### Scenario: Reject normalized duplicates

- **WHEN** 서로 다른 원문 입력 둘 이상이 정규화 뒤 같은 Hashtag Name이 된다
- **THEN** 시스템은 목록 전체를 duplicate validation 오류로 거부한다
- **AND** 기존 순서와 관계를 유지한다

### Requirement: Owner-controlled atomic Profile Tag replacement

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — Active Account의 Local Profile Owner만 기존 Profile 편집 action에서 Profile Tag 전체 목록을 교체할 수 있어야 한다(MUST). Profile Tag 목록과 같은 요청에 포함된 다른 Profile 편집 값은 하나의 transaction으로 적용되어야 하며(MUST), 권한·정규화·검증·저장 중 하나라도 실패하면 어느 값도 변경되어서는 안 된다(MUST NOT). Profile Tag 입력을 생략하거나 `null`로 보낸 기존 update 요청은 현재 목록을 유지해야 한다(MUST).

#### Scenario: Replace Profile Tags as Local Profile Owner

- **WHEN** Active Account의 `OWNER`가 Active·Normal 상태의 Local Profile에 유효한 Profile Tag 목록을 포함해 수정을 요청한다
- **THEN** 시스템은 기존 Profile Tag 전체 목록을 새 목록으로 교체한다
- **AND** 같은 요청의 다른 Profile 편집 값과 Profile Tag 관계를 하나의 transaction으로 commit한다

#### Scenario: Preserve tags when the input is omitted or null

- **WHEN** 권한이 있는 Owner가 Profile Tag 입력을 생략하거나 `null`로 보내 기존 Profile 수정을 요청한다
- **THEN** 시스템은 다른 제공 값을 수정하되 현재 Profile Tag 관계와 순서를 유지한다

#### Scenario: Roll back all profile edits after tag failure

- **WHEN** 같은 Profile 편집 요청에 유효한 표현 값과 유효하지 않은 Profile Tag 목록이 함께 들어온다
- **THEN** 시스템은 요청을 validation 오류로 거부한다
- **AND** 표현 값과 기존 Profile Tag 관계를 모두 요청 전 상태로 유지한다

#### Scenario: Reject a non-owner or inaccessible profile

- **WHEN** Member 또는 관계없는 Account가 Profile Tag 변경을 요청하거나 대상 Profile이 Local·Active·Normal 조건을 통과하지 않는다
- **THEN** 시스템은 기존 Profile 수정의 permission 또는 not-found 경계로 요청을 거부한다
- **AND** Profile과 Profile Tag 관계를 변경하지 않는다

### Requirement: Profile Tag visibility and lifecycle

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — 시스템은 공개 조회 조건을 통과한 Local Profile의 Profile Tag만 해당 Profile과 함께 공개해야 한다(MUST). Profile이 비활성화되거나 정지되면 관계는 보존하되 공개 결과에서 숨겨야 하며(MUST), Profile이 삭제되면 그 Profile의 관계를 제거하되 공유 Hashtag와 다른 참조를 제거해서는 안 된다(MUST NOT). Remote Profile Tag 수집·표시와 ActivityPub 표현을 제공해서는 안 된다(MUST NOT).

#### Scenario: Read visible Local Profile Tags

- **WHEN** 공개 조회 조건을 통과한 Local Profile을 조회한다
- **THEN** 시스템은 해당 Profile에 저장된 정규화된 Hashtag Name을 저장 순서로 반환한다
- **AND** Profile Tag는 Profile과 별도의 visibility 경로를 만들지 않는다

#### Scenario: Hide retained tags for an unavailable Profile

- **WHEN** Profile이 비활성화되거나 정지되어 공개 조회 조건을 통과하지 않는다
- **THEN** 시스템은 Profile Tag를 별도로 공개하지 않는다
- **AND** Profile Tag 관계와 순서는 재활성화 또는 정지 해제를 위해 보존한다

#### Scenario: Remove only deleted Profile relations

- **WHEN** Profile이 삭제된다
- **THEN** 시스템은 삭제된 Profile의 Profile Tag 관계를 제거한다
- **AND** 공유 Hashtag identity와 다른 Post 또는 Profile의 관계는 유지한다

#### Scenario: Do not expose Remote Profile Tags

- **WHEN** 공개 조회 가능한 ActivityPub Remote Profile을 조회한다
- **THEN** 시스템은 Remote Profile Tag를 수집하거나 표시하지 않는다
- **AND** 원격 actor 문서를 Profile Tag 목적으로 fetch·refresh하지 않는다
