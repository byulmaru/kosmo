## MODIFIED Requirements

### Requirement: Remote actor profile projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-536`; 기존 materialization 경계: `PROD-248` 시스템은 remote ActivityPub actor를 기존 kosmo `Profile` 필드로 투영해야 하며(MUST), 최초 materialization과 refresh 모두 actor `summary`의 표시 가능한 평문 projection을 `Profile.bio` 검증보다 먼저 적용해야 한다(MUST).

#### Scenario: Project actor fields to profile

- **WHEN** remote actor가 검증된다
- **THEN** 시스템은 actor `preferredUsername`을 `Profile.handle`로 저장한다
- **AND** 시스템은 actor `preferredUsername`의 normalized value를 `Profile.normalizedHandle`로 저장한다
- **AND** actor `name`이 기존 `Profile.displayName` 스키마를 만족하면 시스템은 이를 `Profile.displayName`으로 저장한다
- **AND** actor `name`이 없거나 기존 `Profile.displayName` 스키마를 만족하지 않으면 시스템은 handle을 표시 이름으로 사용한다
- **AND** 시스템은 actor `summary`의 표시 가능한 평문 projection을 `Profile.bio`로 저장한다
- **AND** actor `published`가 있으면 시스템은 이를 `Profile.createdAt`으로 저장한다

#### Scenario: Project HTML string summary to plain-text bio

- **WHEN** remote actor의 string `summary`가 문단, 줄바꿈, 링크, HTML entity와 script/style/template 같은 비표시 markup을 포함한다
- **THEN** 시스템은 문단과 줄바꿈을 결정적으로 평문화하고 entity와 링크의 표시 텍스트를 보존한 bio를 만든다
- **AND** 시스템은 markup 문자, 실행 가능한 속성, 이미지와 비표시 내용을 bio에 포함하지 않는다
- **AND** 시스템은 평문 projection을 trim한 뒤 `Profile.bio`의 500자 제한을 검증한다

#### Scenario: Project language-tagged summary through the same boundary

- **WHEN** remote actor의 language-tagged `summary`가 HTML markup을 포함한다
- **THEN** 시스템은 Fedify가 제공한 선택 문자열에 string `summary`와 같은 평문 projection 및 bio 검증을 적용한다
- **AND** language tag 유무 때문에 HTML markup이 저장값에 남지 않는다

#### Scenario: Validate bio length after markup projection

- **WHEN** remote actor `summary`의 원본 markup 문자열은 500자를 초과하지만 표시 가능한 평문 projection은 trim 후 500자 이하이다
- **THEN** 시스템은 원본 markup 길이 때문에 bio를 유실하지 않고 유효한 평문 projection을 저장한다

#### Scenario: Store null when summary has no visible text

- **WHEN** remote actor `summary`를 projection한 결과가 공백 또는 비표시 내용뿐이다
- **THEN** 시스템은 `Profile.bio`를 `null`로 저장한다

#### Scenario: Apply the same projection on refresh

- **WHEN** raw HTML bio가 저장된 기존 remote actor를 새 HTML `summary`로 refresh한다
- **THEN** 시스템은 최초 materialization과 같은 평문 projection 및 길이 검증으로 기존 `Profile.bio`를 갱신한다
- **AND** refresh는 `Profile`의 lifecycle과 suspension state를 변경하지 않는다

#### Scenario: Preserve local bio and outbound behavior

- **WHEN** Local Profile Owner가 bio를 편집하거나 시스템이 local ActivityPub actor를 표현한다
- **THEN** 시스템은 remote actor ingress 전용 HTML projection을 Local Profile bio에 적용하지 않는다
- **AND** local actor outbound `summary`는 기존 평문 bio 표현 계약을 유지한다

#### Scenario: Reject actor without preferred username

- **WHEN** remote actor에 `preferredUsername`이 없다
- **THEN** 시스템은 remote profile materialization을 실패 처리한다
- **AND** 시스템은 해당 actor를 `Profile`로 저장하지 않는다

#### Scenario: Reject actor with unsupported preferred username

- **WHEN** remote actor `preferredUsername`이 기존 `Profile.handle` 스키마를 만족하지 않는다
- **THEN** 시스템은 remote profile materialization을 실패 처리한다
- **AND** 시스템은 URL이나 `profileByHandle`로 다시 조회할 수 없는 remote profile을 저장하지 않는다

#### Scenario: Fall back when new actor published is absent

- **WHEN** 새 remote actor를 `Profile`로 최초 저장해야 하고 remote actor에 `published`가 없다
- **THEN** 시스템은 materialization 시각을 `Profile.createdAt`으로 저장한다

#### Scenario: Preserve createdAt when refreshing actor without published

- **WHEN** 저장된 remote profile을 refresh하고 있고 remote actor에 `published`가 없다
- **THEN** 시스템은 기존 `Profile.createdAt`을 보존한다

#### Scenario: Project remote follow policy

- **WHEN** remote actor가 follower 승인 필요 속성을 제공한다
- **THEN** 시스템은 승인 필요 여부를 `Profile.followPolicy`로 저장한다
- **AND** 승인 필요 actor는 `APPROVAL_REQUIRED`, 그 외 actor는 `OPEN`으로 저장한다

#### Scenario: Store actor fetch timestamp

- **WHEN** remote actor가 성공적으로 materialize된다
- **THEN** 시스템은 actor metadata에 `lastFetchedAt`을 현재 시각으로 저장한다

## ADDED Requirements

### Requirement: Existing remote profile bio cleanup

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-536` 시스템은 raw HTML bio가 이미 저장된 ActivityPub Remote Profile을 화면 조회나 7일 refresh TTL에 의존하지 않고 현재 remote summary 평문 계약으로 정리할 수 있는 명시적 데이터 정리 경로를 제공해야 한다(MUST).

#### Scenario: Normalize a stored raw HTML remote bio

- **WHEN** 데이터 정리 경로가 raw HTML bio를 가진 ActivityPub Remote Profile을 처리한다
- **THEN** 시스템은 materialization과 같은 평문 projection 및 `Profile.bio` 검증 결과로 저장값을 갱신한다
- **AND** GraphQL `Profile.bio`, `ProfileHero`와 `ProfileListItem`은 별도 HTML renderer 없이 갱신된 평문을 표시한다

#### Scenario: Keep local profiles outside cleanup scope

- **WHEN** 데이터 정리 경로가 대상 Profile을 선택한다
- **THEN** 시스템은 ActivityPub Remote Profile만 처리한다
- **AND** Local Profile bio와 local actor outbound 표현을 변경하지 않는다

#### Scenario: Complete cleanup independently of profile reads and refresh TTL

- **WHEN** 저장된 remote Profile이 최근 refresh됐거나 사용자가 해당 Profile 화면을 조회하지 않는다
- **THEN** 명시적 데이터 정리 경로는 eligible raw HTML bio를 계속 식별하고 정규화할 수 있다
- **AND** 완료 여부를 UI 조회 또는 향후 비동기 refresh 발생 여부로 대신하지 않는다
