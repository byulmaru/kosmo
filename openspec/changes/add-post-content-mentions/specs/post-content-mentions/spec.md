# Post Content Mention Specification

## ADDED Requirements

### Requirement: typed Mention identity boundary

시스템은 검증된 inbound typed `Mention`만 canonical Mention projection의 입력으로 인정해야 한다 (MUST).
inbound adapter는 typed tag의 actor URI를 저장된 Local/Remote Profile의 stable identity로 확인하고, Local Profile이면 trusted
human Profile URL을, Remote Profile이면 actor materialization·refresh에서 같은 Actor document의 `url`로 광고하고 hostname이 있는 HTTP(S)로 검증해
저장한 nullable profile URL alias가 있을 때 그 alias와 actor URI를 허용 href로 core parser 경계에 전달해야 한다. alias는 Actor URI와 다른
hostname이어도 같은 Actor document가 직접 광고한 URL이면 허용한다. alias가 없거나
검증되지 않으면 Remote Profile은 저장된 actor URI만 허용한다. Core parser는 원문 anchor href가 전달된 허용 href에 대응하고 label이
안전하게 정규화될 때만 `profileId`와 본문 visible `label`을 가진 canonical Mention node를 만든다. Local actor URI와 human Profile URL은
서로 다른 URI 형식일 수 있으며, Remote human URL은 Actor가 광고한 검증 URL 외에 저장·추측하지 않는다. tag `name`·handle과 본문
visible label의 문자열 일치는 identity 조건이 아니다. 일반 anchor와 `to`/`cc` audience actor URI를 Mention identity와 같은 의미로
취급하지 않아야 한다 (MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`

#### Scenario: Accept a verified typed Mention

- **WHEN** inbound Note의 typed `Mention` actor URI가 기존 Profile stable identity로 확인되고 원문 anchor href가 그 Profile에 전달된 허용 href에 대응하며 본문 label이 안전하게 정규화된다
- **THEN** 시스템은 해당 Mention을 canonical Post Content Mention projection의 입력으로 전달한다
- **AND** 동일 Note의 일반 link와 `to`/`cc` audience 값은 별도 의미로 유지한다

#### Scenario: Accept a verified Remote actor profile URL

- **WHEN** inbound Note의 typed `Mention` actor URI가 기존 Remote Profile stable identity로 확인되고, 같은 Actor document의 `url`로 광고된 HTTP(S) profile URL alias가 materialization·refresh에서 해당 Actor identity에 저장되어 있으며, 원문 anchor href가 actor URI 또는 저장된 alias에 대응하고 본문 label이 안전하게 정규화된다
- **THEN** 시스템은 해당 anchor를 같은 `profileId`를 가진 canonical Mention projection의 입력으로 전달한다
- **AND** actor URI와 alias는 canonical document의 node attrs에 저장하지 않는다
- **AND** Mention 수신 중 actor/profile fetch나 새 materialization을 수행하지 않는다

#### Scenario: Use actor URI when a Remote profile URL alias is unavailable

- **WHEN** inbound Note의 typed `Mention` actor URI가 기존 Remote Profile stable identity로 확인되지만 저장된 Actor URL alias가 null이거나 HTTP(S)로 검증되지 않았고, 원문 anchor href가 저장된 actor URI에 대응한다
- **THEN** 시스템은 actor URI를 검증된 허용 href로 사용해 Mention projection을 수행한다
- **AND** 저장되지 않은 human URL을 handle·domain에서 추측하지 않는다

#### Scenario: Clear a stale Remote profile URL alias on refresh

- **WHEN** 저장된 Remote Actor URL alias가 있지만 이후 Actor materialization·refresh document가 `url`을 제공하지 않거나 hostname이 있는 HTTP(S)로 검증되지 않는다
- **THEN** 시스템은 해당 Actor identity의 nullable URL alias를 제거하고 actor URI만 허용 href로 남긴다
- **AND** 이미 저장된 Post Content를 자동으로 다시 해석하거나 수정하지 않는다

#### Scenario: Reject an ambiguous allowed href safely

- **WHEN** 하나의 본문 anchor href가 서로 다른 `profileId`에 대한 허용 href 후보로 동시에 전달된다
- **THEN** 시스템은 후보 순서나 first match로 하나의 Profile을 선택하지 않는다
- **AND** 해당 anchor를 안전한 일반 link 또는 표시 text로 보존하고 Mention relation을 만들지 않는다

#### Scenario: Accept independently verified targets

- **WHEN** 하나의 Note에 서로 다른 Profile identity를 가진 typed Mention들이 있고 각 actor URI와 본문 anchor URI가 해당 Profile에 전달된 허용 href에 독립적으로 대응한다
- **THEN** 시스템은 Profile identity가 서로 다르다는 사실만으로 Mention을 mismatch로 처리하지 않는다
- **AND** 각 Mention occurrence를 검증된 canonical projection 입력으로 전달한다

#### Scenario: Do not infer Mention from a general link or audience

- **WHEN** Note에 일반 HTML anchor 또는 `to`/`cc` actor URI만 있고 검증된 typed `Mention`이 없다
- **THEN** 시스템은 해당 값으로 Mention node나 Mentioned Profile 관계를 만들지 않는다
- **AND** Post Visibility, DIRECT/limited recipient authorization과 Notification 입력을 그 값으로 바꾸지 않는다

### Requirement: revision-owned Mention projection is atomic

시스템은 검증된 typed `Mention`을 canonical node와 `post_mentions` table의 immutable revision-to-Profile foreign-key 관계로 원자적으로 저장해야 한다 (MUST).
이는 versioned Post Content inline node와 해당 revision의 `post_mentions` 관계를 같은 저장 경계에서 함께 저장하는 것을 뜻한다. 관계는
canonical node에서 재구축 가능해야 하며 (MUST), 독립적인
Post-level source of truth가 되어서는 안 된다 (MUST NOT). Current Post는 현재 Post Content의 관계를 투영하고,
새 revision이 생겨도 과거 revision과 그 관계를 삭제하거나 재작성해서는 안 된다 (MUST NOT).

검증된 Mention occurrence는 canonical document에서 입력 순서를 유지해야 하며 (MUST), 하나의 revision에 같은 Profile을
여러 번 언급해도 `post_mentions` 관계 집합에는 그 Profile을 한 번만 투영해야 한다 (MUST). 서로 다른 Profile의
occurrence는 각각의 `post_mentions` 관계로 투영해야 한다 (MUST). `post_mentions`의 column, index와 primary key
shape는 이 requirement가 고정하지 않는다.

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`,
`docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-340`

#### Scenario: Store a Mention with its first remote Post revision

- **WHEN** 검증된 typed `Mention`을 포함한 최초 inbound Note가 기존 object URI에 매핑되지 않았다
- **THEN** 시스템은 Note의 Post Content document, `post_mentions` revision-to-Profile 관계와 Current Content pointer를 같은 저장 경계에서 생성한다
- **AND** `post_mentions` row는 새 Post Content revision과 Profile을 foreign key로 가리킨다
- **AND** 현재 Post의 Mentioned Profile projection은 새 revision의 관계 집합을 사용한다

#### Scenario: Preserve an earlier revision relation

- **WHEN** 같은 Post에 본문 의미가 달라지는 새 Post Content revision이 생성된다
- **THEN** 시스템은 `post_mentions`에 새 revision의 Mentioned Profile 관계 집합을 저장한다
- **AND** 이전 revision의 document와 `post_mentions` 관계는 변경하거나 삭제하지 않는다

#### Scenario: Preserve repeated and multiple Mention occurrences

- **WHEN** 하나의 Note에 같은 Profile을 가리키는 검증된 Mention이 여러 번 있고 다른 Profile을 가리키는 Mention도 함께 있다
- **THEN** canonical document는 각 Mention occurrence와 입력 순서를 보존한다
- **AND** 해당 revision의 `post_mentions` 관계는 같은 Profile마다 한 번씩, 서로 다른 Profile마다 각각 생성된다
- **AND** occurrence 중복이 `post_mentions` 중복 row나 다른 Profile로의 연결을 만들지 않는다

#### Scenario: Roll back a partial Mention projection

- **WHEN** Mention node, `post_mentions` revision-owned 관계 또는 Current Content pointer 중 하나의 저장이 실패한다
- **THEN** 시스템은 해당 시도의 새 Post, Post Content와 `post_mentions` side effect를 모두 rollback한다
- **AND** partial relation이나 새 revision만 남기지 않는다

### Requirement: unresolved Mention has a safe fallback

시스템은 unresolved, malformed 또는 identity mismatch인 typed `Mention`에 대해 Mention node와 Profile 관계를 생성해서는 안 된다 (MUST NOT).
해당 Note가 기존 수신 검증을 통과하면 시스템은 실패한 부분을 안전한 일반 link 또는
표시 text로 보존하고 나머지 본문과 Note를 저장해야 한다 (MUST). 이 fallback은 해당 Mention을 해결하기 위한 Mention 수신 중
신규 원격 Profile lookup 또는 materialization을 수행해서는 안 된다 (MUST NOT). Actor URL alias의 materialization·refresh는
별도 경계에서만 수행한다.

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`

#### Scenario: Preserve a mismatched Mention as safe content

- **WHEN** typed `Mention` actor URI가 기존 Profile stable identity로 확인되지 않거나 본문 anchor URI가 그 Profile에 전달된 허용 href에 대응하지 않거나 표시 label이 안전한 표시·구조 검증을 통과하지 못한다
- **THEN** 시스템은 해당 부분을 안전한 일반 link 또는 표시 text로 보존한다
- **AND** Mention node, Mentioned Profile 관계와 신규 원격 Profile은 생성하지 않는다
- **AND** 나머지 Note가 기존 수신 검증을 통과하면 Post Content를 저장한다

#### Scenario: Do not repair an earlier fallback when an alias is learned later

- **WHEN** 기존 Note가 Actor URL alias가 없거나 검증되지 않아 일반 link 또는 표시 text로 저장된 뒤, 같은 Actor의 materialization·refresh에서 유효한 HTTP(S) `url` alias가 저장된다
- **THEN** 시스템은 이미 저장된 Post Content, canonical document, `post_mentions` 관계와 timestamp를 변경하지 않는다
- **AND** 기존 글을 자동으로 다시 해석하거나 새 Mention relation을 생성하지 않는다

#### Scenario: Skip an unresolved or malformed Mention without a remote lookup

- **WHEN** typed `Mention` target을 해석할 수 없거나 tag 형식이 malformed다
- **THEN** 시스템은 해당 Mention을 Profile 관계로 materialize하지 않는다
- **AND** 해당 실패를 해결하기 위한 WebFinger, actor/profile fetch 또는 신규 원격 Profile 생성은 수행하지 않는다
- **AND** 기존 안전 parser가 안전하게 보존할 수 없는 markup만 그 parser 정책에 따라 낮추거나 제거하고, 표시 text와 나머지 검증된 Note의 저장 가능성을 불필요하게 누락시키거나 실패시키지 않는다

### Requirement: canonical Mention equality preserves semantic identity

시스템은 기존 canonical Post Content document equality를 유지해야 한다 (MUST). HTML formatting-only 차이는 canonicalization으로 흡수해 같은 의미로 비교하고 (MUST), 표시 label·summary·body의 실제 내용 변경은 기존 equality 규칙에 따라 반영해야 하며 (MUST), 표시 label이 같아도 서로 다른 `profileId`를 가진 Profile stable identity를 가리키면 다른 document 의미로 비교해야 한다 (MUST). inbound actor URI와 Actor URL alias 표현은 canonical document에 저장되지 않으므로 equality 기준이 아니다. 이 requirement는 document equality invariant만 정의하며 remote `Update(Note)` mutation API를 추가하거나 정의하지 않는다 (MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/post.md`, `PROD-340`

#### Scenario: Formatting-only canonical-equivalent Mention remains equal

- **WHEN** 두 typed `Mention` 입력이 동일한 `profileId`와 동일한 표시 label을 가지며, 표시 label·summary·body의 실제 내용은 같고 차이는 HTML 서식뿐이다
- **THEN** 시스템은 두 Mention을 같은 canonical 의미로 비교한다
- **AND** equality 판단은 서식 차이만으로 다른 Mention identity나 다른 의미를 만들지 않는다

#### Scenario: Independently verified Profile identity change is distinct meaning

- **WHEN** 두 typed `Mention` 입력의 표시 label이 같더라도 `profileId`가 서로 다른 Profile stable identity를 가리킨다
- **THEN** 시스템은 두 Mention을 서로 다른 canonical 의미로 비교한다
- **AND** label equality만으로 두 Profile identity를 합치거나 같은 Mention 의미로 판정하지 않는다

### Requirement: duplicate Create keeps first-write-wins

시스템은 동일한 remote Note object URI의 duplicate `Create`를 first-write-wins no-op으로 처리해야 한다 (MUST).
duplicate `Create`는 새 Post Content revision, Mentioned Profile 관계 또는
timestamp를 만들거나 기존 저장값을 갱신해서는 안 된다 (MUST NOT). remote `Update(Note)` lifecycle은 이 capability의
범위에 포함하지 않는다 (MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`

#### Scenario: Ignore an identical duplicate Create

- **WHEN** 이미 materialize된 object URI에 대해 같은 의미의 `Create`가 다시 수신된다
- **THEN** 시스템은 기존 mapping, Post, Current Content, Mentioned Profile 관계와 timestamp를 유지한다
- **AND** 새 revision이나 duplicate relation을 생성하지 않는다

#### Scenario: Canonical-equivalent duplicate Create remains a no-op

- **WHEN** 이미 materialize된 object URI에 대해 HTML formatting만 다르고 canonical body와 검증된 Mention identity가 같은 `Create`가 다시 수신된다
- **THEN** 시스템은 first-write-wins no-op 경계를 유지한다
- **AND** 새 revision이나 duplicate relation을 생성하지 않는다

#### Scenario: Do not turn a changed duplicate Create into an Update

- **WHEN** 이미 materialize된 object URI에 대해 body 또는 Mention 의미가 다른 `Create`가 다시 수신된다
- **THEN** 시스템은 기존 first-write-wins no-op 경계를 유지한다
- **AND** 본문·Mention 관계를 수정하지 않는다
- **AND** remote `Update(Note)` 처리는 별도 후속 계약으로 남긴다

### Requirement: verify reader compatibility before storage activation

시스템은 기존 Post Content V1에 additive한 Mention node와 관계를 저장하기 전에 기존 reader의 body text·Media·Content Warning 보존 호환 처리를 확보하고 검증해야 한다 (MUST).
기존 reader에서는 기존
`bodyText` fallback을 재사용한 plain text 표시를 허용하며, link 클릭 동작과 문단 구조의 일시적 저하는 허용한다.
서버 canonicalizer에서 GraphQL `bodyText`와 legacy renderer까지의 end-to-end 호환 검증 증거 없이 Mention node
저장을 활성화해서는 안 된다 (MUST NOT). 이 change에서는 document schema version을 올리거나 V1/V2 dual-read 또는
document version 변환을 도입하지 않으며 (MUST NOT), 이 reader compatibility requirement는 별도로 정한 `{ profileId, label }` canonical Mention attrs를 변경하지 않는다.

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`

#### Scenario: Gate activation on body preservation

- **WHEN** 기존 reader와 새 Mention 저장 경계를 함께 검증한다
- **THEN** 시스템은 Mention의 전용 표시를 지원하지 않는 reader에서도 body text, Media와 Content Warning이 보존됨을 증명한다
- **AND** 구 reader에서는 기존 `bodyText` fallback에 따른 plain text 표시로 link 클릭 동작과 문단 구조가 일시적으로 저하될 수 있다
- **AND** 서버 canonicalizer, GraphQL `bodyText`와 legacy renderer 경로를 end-to-end로 함께 검증한다
- **AND** 그 검증이 통과된 뒤에만 Mention node와 관계 저장을 활성화한다

### Requirement: renderer consumes the canonical Mention safely

`PROD-910` renderer와 Profile 이동은 현재 Post Content의 canonical Mention node와 revision-owned Profile 관계를 소비해야 한다 (MUST).
raw ActivityPub tag를 다시 해석하거나 새 원격 Profile lookup/materialization을 수행해서는
안 된다 (MUST NOT). renderer는 기존 Post 조회 정책, visibility·eligibility와 접근성 계약을 유지해야 하며 (MUST),
Mention 관계만으로 viewer의 접근 범위를 넓혀서는 안 된다 (MUST NOT). 해결되지 않은 Mention은 저장된 안전한 link 또는
표시 text로 표시하고 Profile 이동 대상으로 만들지 않아야 한다 (MUST).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-340`, `PROD-910`

#### Scenario: Navigate only from a verified current Mention

- **WHEN** 현재 Post Content에 검증된 Mention node와 같은 revision의 `post_mentions` Profile 관계가 있다
- **THEN** renderer는 해당 Profile을 표시하고 기존 Profile 이동·접근성 계약을 적용한다
- **AND** Post visibility와 eligibility 판정은 Mention display나 `to`/`cc` audience를 새 권한으로 취급하지 않는다

#### Scenario: Render fallback without re-resolution

- **WHEN** Mention이 unresolved, malformed 또는 identity mismatch로 안전한 link/text fallback이 되었다
- **THEN** renderer는 저장된 fallback을 표시하고 Profile 이동 affordance를 만들지 않는다
- **AND** raw tag 재해석이나 원격 Profile lookup/materialization을 수행하지 않는다
