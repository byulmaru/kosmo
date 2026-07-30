# activitypub-remote-profile-federation Specification

## Purpose

kosmo가 Fedify로 조회한 저장된 remote ActivityPub actor를 기존 `Profile` 모델로 materialize하고, local profile과 같은 GraphQL `Profile` 타입으로 안전하게 조회·표시하는 경계를 정의한다. 이 명세는 remote follow, inbox activity 처리, outbox/Note ingestion, remote `Profile.posts` 확장은 포함하지 않는다.

## Requirements

### Requirement: Fedify protocol boundary

시스템은 remote actor lookup과 ActivityPub object parsing에서 Fedify가 제공하는 lookup, dereference, vocabulary 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for actor lookup

- **WHEN** 시스템이 remote actor를 조회하거나 materialize한다
- **THEN** 시스템은 Fedify의 WebFinger/object lookup과 ActivityPub vocabulary 기능을 사용한다
- **AND** 시스템은 별도 HTTP client, JSON-LD parser, remote actor document parser를 직접 구현하지 않는다

#### Scenario: Keep kosmo responsibilities domain-specific

- **WHEN** Fedify가 typed actor를 반환한다
- **THEN** 시스템은 해당 actor를 `Profile`로 투영하는 도메인 정책을 적용한다
- **AND** 시스템은 actor URI uniqueness, instance state, cache timestamp 같은 kosmo 저장 정책만 소유한다

### Requirement: Remote actor materialization through Fedify lookup

시스템은 federation 내부 actor materialization 흐름에서 federated handle을 Fedify lookup으로 해석한 뒤 remote ActivityPub actor를 kosmo `Profile`로 materialize해야 한다(MUST).

#### Scenario: Materialize remote actor from federated handle

- **WHEN** federation 내부 service가 `@{handle}@{domain}` 형식의 federated handle materialization을 요청한다
- **THEN** 시스템은 Fedify lookup 전에 normalized domain의 기존 ActivityPub instance를 조회한다
- **AND** 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 Fedify lookup 없이 materialization을 실패 처리한다
- **AND** 기존 instance가 없으면 normalized domain의 ActivityPub instance를 생성한다
- **AND** 시스템은 Fedify lookup API로 `acct:{handle}@{domain}`을 해석한다
- **AND** Fedify가 ActivityPub actor 객체를 반환하면 해당 actor의 canonical actor URI를 remote identity로 처리한다
- **AND** 시스템은 요청 handle의 normalized value와 actor `preferredUsername`의 normalized value가 일치하는지 검증한다
- **AND** 시스템은 actor URI가 기존 ActivityPub remote profile actor metadata에 연결되어 있으면 해당 remote profile을 갱신하고, 없으면 새 `Profile`을 생성한다

#### Scenario: Reject actor URI without federated handle lookup

- **WHEN** remote actor URI만 주어지고 federated handle lookup을 통과하지 않았다
- **THEN** 시스템은 remote profile을 저장하지 않는다
- **AND** 시스템은 actor URI만으로 `Profile`을 생성하지 않는다

#### Scenario: Reject unresolved or non-actor lookup

- **WHEN** Fedify lookup이 actor를 해석하지 못하거나 actor가 아닌 객체를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 객체를 `Profile`로 저장하지 않는다

#### Scenario: Reject lookup username mismatch

- **WHEN** Fedify lookup이 `acct:{handle}@{domain}` 요청과 다른 normalized `preferredUsername`을 가진 actor를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 actor를 `Profile`로 저장하거나 기존 profile에 재연결하지 않는다

#### Scenario: Reject materialization for unavailable instance

- **WHEN** federated handle의 normalized domain에 해당하는 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이다
- **THEN** 시스템은 Fedify lookup을 수행하지 않고 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 새 `Profile`을 만들거나 기존 profile을 refresh하지 않는다

#### Scenario: Reuse existing actor URI

- **WHEN** remote actor materialization 결과의 actor URI가 이미 ActivityPub remote profile actor metadata에 저장되어 있다
- **THEN** 시스템은 같은 actor URI에 연결된 기존 remote `Profile`을 같은 remote profile로 간주한다
- **AND** 시스템은 새 `Profile`을 만들지 않고 기존 row를 갱신한다

#### Scenario: Store actor under its canonical domain

- **WHEN** Fedify lookup이 요청한 federated handle domain과 다른 normalized host를 가진 canonical actor URI를 반환한다
- **THEN** 시스템은 canonical actor URI host의 ActivityPub instance에 remote `Profile`을 저장한다
- **AND** 기존 actor가 요청 alias instance에 저장돼 있으면 canonical actor URI instance로 이동한다
- **AND** 요청 domain만을 위한 별도 `Profile` alias를 만들지 않는다
- **AND** DB-only remote handle 조회는 canonical actor domain에서 해당 profile을 찾는다

#### Scenario: Reject local actor URI collision

- **WHEN** remote actor materialization 결과의 actor URI가 configured local actor 또는 local profile actor metadata에 이미 저장되어 있다
- **THEN** 시스템은 identity 충돌로 materialization을 실패 처리한다
- **AND** 시스템은 local profile을 remote profile로 갱신하거나 반환하지 않는다

#### Scenario: Reject handle collision with different actor URI

- **WHEN** 같은 remote instance와 normalized handle 조합의 `Profile`이 이미 있지만 저장된 actor URI가 새 materialization 결과와 다르다
- **THEN** 시스템은 identity 충돌로 materialization을 실패 처리한다
- **AND** 시스템은 기존 `Profile`을 다른 actor URI로 재연결하지 않는다

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

- **WHEN** remote actor의 string `summary`가 문단, 줄바꿈, 링크, HTML entity와 `hidden` 요소 또는 script/style/template 같은 비표시 markup을 포함한다
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

- **WHEN** 저장된 remote actor를 새 HTML `summary`로 refresh한다
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

### Requirement: Remote actor refresh

시스템은 저장된 remote actor가 stale 상태이면 기존 active profile 참조를 막지 않고 federation 내부 materialization 경로에서 비동기 refresh를 예약/수행해야 한다(MUST).

#### Scenario: Return stale actor and schedule refresh

- **WHEN** 저장된 remote actor의 `lastFetchedAt`이 없거나 7일을 초과했다
- **AND** federation 내부 service가 해당 remote actor를 사용해야 한다
- **THEN** 시스템은 저장된 active profile을 refresh 완료 전에도 반환한다
- **AND** 시스템은 Fedify lookup 기반 remote actor refresh를 비동기적으로 예약/수행한다
- **AND** refresh가 성공하면 기존 `createdAt` 보존 정책을 지키면서 `Profile` projection과 actor metadata를 갱신한다

#### Scenario: Keep stale actor on refresh failure

- **WHEN** 저장된 active remote profile이 있고 비동기 actor refresh가 실패한다
- **THEN** 시스템은 기존 stale profile을 계속 반환할 수 있다
- **AND** 시스템은 실패한 resolve에 대한 negative cache row를 만들지 않는다

#### Scenario: Skip refresh for unresponsive instance

- **WHEN** 저장된 remote actor의 instance 상태가 `UNRESPONSIVE`이다
- **THEN** 시스템은 저장된 active profile을 stale 상태로 계속 반환할 수 있다
- **AND** 시스템은 remote actor refresh를 예약하거나 수행하지 않는다

#### Scenario: Do not materialize suspended instance

- **WHEN** remote actor가 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 actor refresh와 remote actor materialization을 시도하지 않는다
- **AND** 시스템은 해당 instance의 remote profile을 GraphQL object로 노출하지 않는다
