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

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`, `PROD-248`. 시스템은 federation 내부 actor materialization 흐름에서 검색·발견 경계가 제공한 canonical `actorUri`로 remote ActivityPub actor를 kosmo `Profile`로 materialize해야 하며(MUST), 명시적인 qualified handle을 actor URI로 해석하는 단계는 materialization 경계 전에 검색·발견 경계에서 수행해야 한다(MUST). 신규 materialization과 stale refresh는 동일한 public Temporal Workflow dispatch와 durable orchestration 경로를 사용해야 하며(MUST), Workflow가 stored-state Activity의 결과에 따라 missing·갱신 불필요·stale를 분기해야 한다(MUST).

#### Scenario: Materialize remote actor from canonical actor URI

- **WHEN** federation 내부 service가 검색·발견 경계에서 확보한 canonical `actorUri`로 materialization을 요청하고 caller가 동기 또는 비동기 결과 모드를 선택한다
- **THEN** Temporal Workflow와 Activity wire input은 canonical `actorUri`와 선택적인 `profileId`만 가진다
- **AND** materialization을 결정하는 `findOrMaterialize` 경계는 stored Profile, actor metadata와 TTL을 직접 조회·판단하지 않고 하나의 public materialization Workflow를 dispatch한다
- **AND** Workflow는 Activity에서 `{ profileId, needsRefresh } | null` 최소 JSON-safe stored-state DTO만 받는다. `null`은 missing, `needsRefresh: false`는 갱신이 불필요하거나 허용되지 않는 상태(fresh 또는 `UNRESPONSIVE`), `needsRefresh: true`는 갱신 가능한 stale을 나타낸다. DTO의 `profileId`는 조회 대상인 cached Remote Profile ID이고, input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다
- **AND** 전달된 `actorUri`에 저장된 remote Profile 또는 actor metadata가 없어도 새 remote `Profile`을 materialize할 수 있다
- **AND** `profileId`가 없으면 configured Local Instance의 canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용한다
- **AND** 전달된 `profileId`가 필요한 Remote actor 정보를 제공하지 않으면 origin을 추측하지 않고 materialization을 실패 처리한다
- **AND** `profileId`는 기존 unsigned lookup의 권한을 대신하지 않는다
- **AND** 시스템은 Fedify lookup 전에 `actorUri` host의 normalized domain에 해당하는 기존 ActivityPub instance를 조회한다
- **AND** 저장 actor 또는 actor metadata가 없어 외부 조회가 필요한 missing 경로에서 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 Fedify lookup 없이 materialization을 실패 처리한다
- **AND** 기존 instance가 없으면 `actorUri` host의 normalized domain에 ActivityPub instance를 생성한다
- **AND** missing 분기에서는 기존 materialization Activity가 하나의 실행 경로에서 Fedify lookup API로 `actorUri`를 직접 해석한다
- **AND** Fedify가 ActivityPub actor 객체를 반환하면 해당 actor의 canonical actor URI를 remote identity로 처리한다
- **AND** 시스템은 actor URI가 기존 ActivityPub remote profile actor metadata에 연결되어 있으면 해당 remote profile을 갱신하고, 없으면 새 `Profile`을 생성한다
- **AND** `needsRefresh: false` 분기의 Workflow는 외부 lookup이나 refresh child 없이 cached Profile identity를 반환한다
- **AND** stale 분기의 Workflow는 state DTO의 `profileId`를 cached target identity로 반환하는 데만 사용하고, refresh child에는 Workflow가 원래 받은 input(`actorUri`와 선택적인 `profileId`)을 그대로 전달한다. child는 별도 refresh ID prefix에서 기존 materialization Activity를 실행하도록 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`으로 시작한 뒤 child start acknowledgement를 받고 cached Profile identity를 반환한다
- **AND** 이미 실행 중인 같은 refresh child는 정상 coalescing으로 처리하고, 그 밖의 child start failure는 관측한 뒤 cached Profile identity를 반환한다
- **AND** 동기 caller는 missing 분기의 materialization 완료 또는 갱신 불필요/stale 분기의 Profile identity를 받을 때까지 기다리고, 비동기 caller는 모든 분기에서 public Workflow start acknowledgement만 받은 뒤 반환한다
- **AND** 동기·비동기 caller는 같은 Workflow 종류와 실행 경로를 사용한다

#### Scenario: Keep a stale refresh child after coordinator closure

- **WHEN** public materialization Workflow가 stale 상태를 확인하고 refresh child의 실행 시작 확인을 기록한다
- **THEN** public Workflow는 child 완료를 기다리지 않고 cached Profile identity를 반환할 수 있다
- **AND** refresh child는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`에 따라 public Workflow의 완료·실패·취소 뒤에도 필요한 Activity와 Profile 저장을 계속할 수 있다
- **AND** 이미 실행 중인 같은 child는 정상 coalescing으로 처리하며, 그 밖의 child start failure는 관측하고 cached Profile identity를 유지한다

#### Scenario: Keep a public materialization child after parent closure

- **WHEN** 다른 Workflow가 public materialization Workflow를 비동기 child로 시작하고 child 실행 시작 확인이 parent 종료 전에 기록된다
- **THEN** parent는 child 완료를 기다리지 않고 child start acknowledgement 뒤 종료할 수 있다
- **AND** child caller가 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시하면 parent의 완료·실패·취소 뒤에도 child Workflow가 필요한 Activity와 Profile 저장을 계속할 수 있다
- **AND** parent 취소는 시작 확인 이후 child Workflow에 전파되지 않는다

#### Scenario: Refresh a stored remote actor by canonical URI

- **WHEN** stale remote actor materialization이 저장된 canonical actor URI와 선택적인 `profileId`를 가진 `actorUri` refresh input으로 실행된다
- **THEN** 시스템은 저장된 `actorUri`를 Fedify lookup target으로 사용하고 `acct:{handle}@{domain}` lookup을 다시 수행하지 않는다
- **AND** Fedify가 반환한 actor의 canonical URI가 예상한 `actorUri`와 일치하는지 확인하기 전에는 Profile 또는 actor metadata를 저장하지 않는다
- **AND** URI가 일치하면 기존 actor identity에 연결된 같은 `Profile`을 갱신한다
- **AND** 같은 canonical URI에서 actor `preferredUsername`이 바뀌어도 새 Profile을 만들지 않고 같은 Profile의 handle, normalized handle과 qualified handle을 갱신한다
- **AND** 반환 URI가 예상한 `actorUri`와 다르면 materialization을 실패 처리하고 Profile 또는 actor metadata를 변경하지 않는다

#### Scenario: Reject unresolved or non-actor lookup

- **WHEN** Fedify lookup이 actor를 해석하지 못하거나 actor가 아닌 객체를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 객체를 `Profile`로 저장하지 않는다

#### Scenario: Reject materialization for unavailable instance

- **WHEN** 저장 actor 또는 actor metadata가 없어 외부 조회가 필요한 materialization에서 `actorUri` host의 normalized domain에 해당하는 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이다
- **THEN** 시스템은 Fedify lookup을 수행하지 않고 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 새 `Profile`을 만들거나 기존 profile을 refresh하지 않는다

#### Scenario: Reuse existing actor URI

- **WHEN** remote actor materialization 결과의 actor URI가 이미 ActivityPub remote profile actor metadata에 저장되어 있다
- **THEN** 시스템은 같은 actor URI에 연결된 기존 remote `Profile`을 같은 remote profile로 간주한다
- **AND** 시스템은 새 `Profile`을 만들지 않고 기존 row를 갱신한다

#### Scenario: Store actor under its canonical domain

- **WHEN** Fedify lookup이 제공된 canonical `actorUri`와 일치하는 actor를 반환한다
- **THEN** 시스템은 canonical actor URI host의 ActivityPub instance에 remote `Profile`을 저장한다
- **AND** 기존 actor가 비canonical alias instance에 저장돼 있으면 canonical actor URI instance로 이동한다
- **AND** actorUri domain만을 위한 별도 `Profile` alias를 만들지 않는다
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

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`. 시스템은 저장된 remote actor가 stale 상태이면 기존 active profile 참조를 막지 않고, 신규 materialization과 같은 Temporal Workflow 경로에서 비동기 refresh를 예약·수행해야 한다(MUST).

#### Scenario: Return stale actor and schedule refresh

- **WHEN** 저장된 remote actor의 `lastFetchedAt`이 없거나 7일을 초과했고 federation 내부 service가 해당 remote actor를 사용해야 한다
- **THEN** 시스템은 저장된 active profile을 refresh 완료 전에도 반환한다
- **AND** 시스템은 신규 materialization과 같은 Temporal Workflow 경로의 refresh를 시작한다
- **AND** refresh가 성공하면 기존 `createdAt` 보존 정책을 지키면서 `Profile` projection과 actor metadata를 갱신한다

#### Scenario: Keep stale actor when the follow-up refresh child fails

- **WHEN** 저장된 active remote profile이 있고 follow-up refresh child가 이미 실행 중이거나 child start 또는 materialization 실행이 실패한다
- **THEN** public Workflow는 cached Profile identity를 계속 반환할 수 있다
- **AND** 시스템은 실패한 resolve에 대한 negative cache row를 만들지 않는다

#### Scenario: Do not synthesize a database fallback when the public Workflow is unavailable

- **WHEN** caller가 public materialization Workflow를 start 또는 execute할 수 없다
- **THEN** caller는 cached Profile을 만들기 위해 stored row, actor metadata 또는 TTL을 직접 조회하지 않는다
- **AND** caller는 public Workflow start failure를 기존 materialization 또는 explicit-search 오류 경계로 전달한다

#### Scenario: Recheck freshness and instance state before refresh execution

- **WHEN** stored-state Activity가 stale actor를 확인해 refresh child를 시작했지만 materialization Activity가 그 이후 시점에 실행된다
- **THEN** materialization Activity는 외부 lookup 전에 현재 저장된 Profile, actor metadata, TTL과 Instance 상태를 다시 확인한다
- **AND** 현재 actor가 fresh하거나 Profile이 inactive이거나 Instance가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 remote lookup과 refresh를 수행하지 않는다
- **AND** 현재 저장된 Profile은 기존 lifecycle·visibility 규칙을 따른다

#### Scenario: Continue started workflow after caller timeout

- **WHEN** 동기 caller가 신규 materialization을 기다리던 중 응답 시간 제한에 도달한다
- **THEN** 이미 시작된 Temporal Workflow는 caller가 더 기다리지 않아도 계속 실행할 수 있다
- **AND** 시스템은 caller timeout 때문에 Workflow를 취소하거나 완료된 저장을 rollback하지 않는다

#### Scenario: Skip refresh for unresponsive instance

- **WHEN** 저장된 remote actor의 instance 상태가 `UNRESPONSIVE`이다
- **THEN** 시스템은 저장된 active profile을 stale 상태로 계속 반환할 수 있다
- **AND** 시스템은 refresh child 또는 remote actor lookup을 예약하거나 수행하지 않는다

#### Scenario: Do not materialize suspended instance

- **WHEN** remote actor가 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 actor refresh와 remote actor materialization을 시도하지 않는다
- **AND** 시스템은 해당 instance의 remote profile을 GraphQL object로 노출하지 않는다

### Requirement: Refresh stored remote actor from inbound Update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `PROD-607` 시스템은 검증된 remote ActivityPub actor `Update`를 수신하면 refresh TTL과 무관하게 동일한 저장 remote `Profile`의 원격 표현 속성, Follow Approval Policy와 actor endpoint metadata를 즉시 갱신해야 한다(MUST).

#### Scenario: Refresh the matching stored remote actor

- **WHEN** remote `Person`, `Application`, `Group`, `Organization` 또는 `Service` actor가 자기 identity와 같은
  embedded actor object를 포함한 `Update`를 보내고 그 identity에 연결된 remote profile이 저장되어 있다
- **THEN** 시스템은 기존 actor materialization과 같은 projection으로 그 profile과 actor endpoint metadata를
  갱신한다
- **AND** `manuallyApprovesFollowers=true`이면 `followPolicy=APPROVAL_REQUIRED`, 아니면
  `followPolicy=OPEN`으로 양방향 반영한다
- **AND** actor metadata의 `lastFetchedAt`을 Update 처리 시각으로 갱신한다

#### Scenario: Reject mismatched or unsupported Update

- **WHEN** Update actor와 embedded object identity가 다르거나 embedded object가 지원 actor type이 아니다
- **THEN** 시스템은 어떤 저장 profile이나 ActivityPub actor metadata도 변경하지 않는다

#### Scenario: Reject local actor collision

- **WHEN** Update identity가 configured local actor 또는 local profile actor metadata와 충돌한다
- **THEN** 시스템은 local profile을 remote profile로 갱신하지 않고 저장 상태를 변경하지 않는다

#### Scenario: Ignore unknown remote actor

- **WHEN** 검증된 Update identity에 연결된 저장 remote profile이 없다
- **THEN** 시스템은 Update만으로 새 remote profile을 materialize하지 않는다

#### Scenario: Process duplicate Update idempotently

- **WHEN** 같은 actor Update를 둘 이상 수신한다
- **THEN** 시스템은 같은 remote profile과 actor metadata를 동일한 최신 projection으로 유지한다
- **AND** 중복 profile, follow request 또는 follow relationship을 만들지 않는다

#### Scenario: Preserve established relationship across policy refresh

- **WHEN** remote profile에 이미 established follow relationship이 있고 actor Update로 follow policy가 바뀐다
- **THEN** 시스템은 기존 relationship과 저장 count를 유지한다

#### Scenario: Apply refreshed approval-required policy to a new Follow

- **WHEN** actor Update가 remote profile policy를 `APPROVAL_REQUIRED`로 갱신한 뒤 active local profile이 신규
  Follow를 요청한다
- **THEN** 시스템은 established relationship과 count 증가 없이 pending follow request를 만든다
- **AND** GraphQL과 FollowButton은 pending 상태를 표시한다
- **AND** 후속 `Accept(Follow)`를 받으면 request를 제거하고 relationship과 count를 한 번 생성해 established
  상태를 표시한다

#### Scenario: Apply refreshed open policy to a new Follow

- **WHEN** actor Update가 remote profile policy를 `OPEN`으로 갱신한 뒤 active local profile이 신규 Follow를
  요청한다
- **THEN** 시스템은 pending request 없이 relationship과 count를 한 번 생성한다
- **AND** GraphQL과 FollowButton은 established 상태를 표시한다
