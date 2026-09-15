## ADDED Requirements

### Requirement: Profile Block lifecycle and owner-only relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`. 시스템은 Local 또는 Remote Owner Profile과 Target Profile 사이의 방향성 있는 Profile Block을 저장하고 생성·해제할 수 있어야 한다(MUST). Profile Block은 별도 상태나 만료를 갖지 않으며 관계의 존재가 적용 중인 차단을 뜻해야 한다(MUST). 도메인 capability는 ingress별 Account·Membership 상태나 Owner의 Local·Remote 유형을 일반 생성 조건으로 요구해서는 안 된다(MUST NOT). Owner와 Target이 서로 달라야 하며, 같은 조합의 관계가 없으면 새 관계를 만들고 이미 있으면 기존 관계를 성공 결과로 반환해야 한다(MUST). 해제는 `ProfileBlock.Owner`에 한정한 정확한 관계 ID만 대상으로 해야 하고(MUST), 관계 조회는 Owner에게만 허용해야 한다(MUST).

#### Scenario: Local·Remote Owner가 Local 또는 Remote Target을 차단한다

- **WHEN** ingress admission을 통과한 Local 또는 Remote Owner가 자신과 다른 Local 또는 Remote Target에 아직 없는 Profile Block을 생성한다
- **THEN** 시스템은 Owner → Target 방향의 Profile Block과 생성 시각을 저장한다
- **AND** 같은 Owner/Target 조합에 적용 중인 별도 상태·만료 행을 만들지 않는다
- **AND** Profile Block 관계는 Owner가 자신의 차단 목록에서 조회할 수 있다

#### Scenario: 동일한 Owner/Target 조합의 중복 저장을 막는다

- **WHEN** 같은 Owner/Target 조합에 이미 Profile Block이 있는 상태에서 다시 저장을 시도한다
- **THEN** 시스템은 기존 Profile Block 관계를 성공 결과로 반환하고 두 번째 Profile Block 행을 저장하지 않는다
- **AND** 기존 관계의 방향과 생성 시각을 바꾸지 않는다
- **AND** 이번 요청은 현재 Follow Request·Follow Relationship 또는 Notification을 새로 정리하지 않는다

#### Scenario: 권한 없는 Profile Block 해제를 거부한다

- **WHEN** Target Profile 또는 다른 Profile이 Owner의 Profile Block을 해제하려고 한다
- **THEN** 시스템은 `ProfileBlock.Owner` 권한을 통과시키지 않는다
- **AND** Profile Block 관계를 변경하지 않는다

### Requirement: Profile Block transaction cleanup and success relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Block policy/admission을 통과해 새 Profile Block 관계를 저장하는 경우에만 현재 양방향 Follow Request·Follow Relationship과 제거된 Follow 객체의 직접 원인 Notification을 같은 transaction에서 정리하고 commit해야 한다(MUST). commit된 Profile Block 관계가 Block action의 성공 결과이며(MUST), commit 뒤 effect의 성공·실패는 관계 성공을 바꾸지 않아야 한다(MUST NOT). 같은 Owner/Target 관계가 이미 있으면 기존 관계를 성공 결과로 관찰하고 새 cleanup을 실행하지 않아야 한다(MUST). 이미 관계가 존재한 뒤 동시성이나 후속 경로로 뒤늦게 관찰되는 Follow·Request·Notification은 Active Block 정책으로 처리해야 하며(MUST), duplicate Block이나 Unblock의 보상 cleanup으로 확장해서는 안 된다(MUST NOT). 기존 Reaction·Repost Post·Bookmark와 비직접 원인 기존 Notification 및 Read State는 이번 action에서 변경하지 않아야 한다(MUST). Unblock은 Owner가 지정한 정확한 Profile Block ID 관계만 제거해야 하며(MUST), Follow Request·Follow Relationship·Notification을 추가로 정리하거나 차단 생성 때 제거된 관계를 복구해서는 안 된다(MUST NOT).

#### Scenario: Block transaction이 현재 관계를 정리하고 성공 관계를 commit한다

- **WHEN** Owner가 새 Profile Block 관계를 만들도록 Block을 확정하고 양방향 Follow Request·Follow Relationship 또는 직접 원인 Notification 정리가 필요하다
- **THEN** 시스템은 Block policy/admission을 적용한 하나의 transaction에서 현재 두 방향 Follow 관계·요청과 직접 원인 Notification을 제거하고 Profile Block 관계를 commit한다
- **AND** commit된 Profile Block 관계를 Block action의 성공 결과로 반환한다
- **AND** 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 유지한다

#### Scenario: Block transaction 실패는 관계 성공을 만들지 않는다

- **WHEN** Profile Block 관계 또는 같은 transaction의 현재 관계 정리가 실패한다
- **THEN** 시스템은 Profile Block 관계와 해당 transaction의 관계 정리를 commit하지 않고 Block action을 성공으로 반환하지 않는다
- **AND** 기존 Reaction·Repost Post·Bookmark와 비직접 원인 Notification·Read State는 변경하지 않는다

#### Scenario: 이미 존재하는 Profile Block을 duplicate가 관찰한다

- **WHEN** 같은 Owner/Target Profile Block 관계가 이미 commit된 상태에서 다시 Block action이 실행된다
- **THEN** 시스템은 기존 Profile Block 관계를 성공 결과로 반환한다
- **AND** 시스템은 현재 Follow Request·Follow Relationship·Notification을 새로 삭제하거나 새 cleanup을 소유하지 않는다

#### Scenario: 이미 존재하는 Block 뒤의 겹침은 Active Block 정책으로 처리한다

- **WHEN** Profile Block 관계가 이미 존재한 뒤 동시성이나 후속 경로로 Follow Request·Follow Relationship·Notification이 뒤늦게 관찰된다
- **THEN** 시스템은 해당 관계와 항목에 Active Block 표면 정책을 적용한다
- **AND** duplicate Block 관찰이나 Unblock이 이를 보상 cleanup으로 삭제하지 않는다

#### Scenario: commit 뒤 effect 실패는 Block 성공을 바꾸지 않는다

- **WHEN** Profile Block transaction이 commit된 뒤 별도 effect가 실패하거나 재시도된다
- **THEN** 시스템은 이미 commit된 Profile Block 관계를 성공 상태로 유지한다
- **AND** effect의 실패·재시도 결과를 Block relation success/failure로 다시 판정하지 않는다

#### Scenario: 차단 해제는 정확한 Profile Block ID 관계만 제거한다

- **WHEN** Owner가 적용 중인 Profile Block의 정확한 ID를 입력해 해제한다
- **THEN** 시스템은 Owner가 지정한 정확한 Profile Block ID 관계만 제거한다
- **AND** 시스템은 Follow Request·Follow Relationship·Notification을 추가로 정리하거나 차단 생성 때 제거된 Follow Request와 Follow Relationship을 자동으로 재생성하지 않는다

### Requirement: Profile Block applies the policy for each surface

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`. Profile Block은 저장 방향과 요청 surface를 함께 평가해야 한다(MUST). GraphQL `node(id:)`와 `profileByHandle` 직접 조회는 기존 lifecycle·membership·공개 Profile 조회 정책으로 기본 Profile 정보를 유지하고, Profile 자체가 기존 lifecycle 정책으로 조회 불가하면 기존 null/unavailable 결과를 유지하며 Block 전용 identity payload를 만들지 않아야 한다(MUST NOT). 유효한 Account에 selected Profile이 있으면 그 Profile을 `searchProfiles`와 `Hashtag.relatedProfiles` viewer로 사용해야 하며(MUST). 두 Profile 탐색 surface가 후보를 반환할 때는 기존 공개 조회 조건을 통과한 후보 중 viewer와 양방향 Active Block 관계인 Profile을 pagination·cursor·limit 전에 제외해야 한다(MUST). selected Profile이 없으면 두 surface의 기존 Account 인증과 공개 후보 결과를 유지하고 Profile Block predicate나 selected Profile의 Instance 종류 조건을 새로 요구해서는 안 된다(MUST NOT). 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용해서는 안 된다(MUST NOT). Post·Media 직접 조회는 viewer 방향에 따른 콘텐츠 정책을 적용하고, Home·Local·Hashtag Post List·Post 검색·Follow 후보·상호작용·Notification은 양쪽 Profile에 대한 보호 정책을 적용해야 한다(MUST). 각 surface는 기존 Visibility·Eligibility와 자체 lifecycle·권한 조건을 함께 적용해야 한다(MUST).

#### Scenario: Profile Block이 surface별 정책을 적용한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 Profile identity, 직접 콘텐츠, 탐색 목록, Follow 후보, interaction 또는 Notification을 요청한다
- **THEN** 시스템은 GraphQL `node(id:)`·`profileByHandle` 직접 조회의 identity에 기존 lifecycle·membership·공개 Profile 조회 정책을 적용한다
- **AND** GraphQL `searchProfiles` exact-match·partial-match와 `Hashtag.relatedProfiles` 후보에서는 양방향 Active Block 관계인 Profile을 pagination·cursor·limit 전에 제외한다
- **AND** 직접 Post·Media 조회에는 viewer 방향의 Profile Block 콘텐츠 정책을 적용한다
- **AND** 탐색 목록·Follow 후보·interaction·Notification에는 양방향 Profile Block 보호 정책을 적용한다

#### Scenario: selected Profile이 없으면 기존 Profile 탐색 공개 결과를 유지한다

- **WHEN** 유효한 Account에 selected Profile이 없고 Account가 GraphQL `searchProfiles` 또는 `Hashtag.relatedProfiles`를 요청한다
- **THEN** 시스템은 각 surface의 기존 Account 인증과 공개 후보 결과를 유지한다
- **AND** Profile Block predicate를 적용하거나 selected Profile의 Instance 종류 조건을 새로 요구하지 않는다
- **AND** 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다

#### Scenario: 차단 해제 뒤 새 요청을 현재 정책으로 평가한다

- **WHEN** Owner가 Profile Block을 해제한 뒤 양쪽 Profile이 새 요청을 실행한다
- **THEN** 시스템은 새 요청 시점의 현재 Profile Block 관계와 각 surface의 기존 조회·상호작용 정책을 함께 평가한다
- **AND** 차단 생성 때 제거된 Follow Request와 Follow Relationship은 자동 복구하지 않는다

#### Scenario: Local·Remote 조합과 무관하게 남은 Follow보다 Block이 우선한다

- **WHEN** Local 또는 Remote Owner·Target 사이에 Active Block과 잔존 Follow Request 또는 Follow Relationship이 함께 존재한다
- **THEN** 공통 정책은 어느 요청 방향에서도 잔존 관계를 비활성·비노출로 판정한다
- **AND** 잔존 Follow를 `FOLLOWERS` Post 접근이나 Home 후보 자격을 얻는 근거로 사용하지 않는다
- **AND** GraphQL의 Account·Membership 인증 조건을 이 pair 정책의 도메인 입력 조건으로 추가하지 않는다

#### Scenario: 한쪽 Block만 해제해도 반대 방향 Block이 남으면 제한한다

- **WHEN** A → B와 B → A Block이 함께 있고 A가 자신의 A → B 관계만 해제한다
- **THEN** 공통 정책은 B → A가 남아 있으므로 양쪽 요청을 계속 blocked로 판정한다
- **AND** A의 해제로 B가 소유한 관계를 변경하지 않는다

### Requirement: Profile Block GraphQL actor and policy boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-823`, `PROD-962`. 현재 GraphQL ingress는 검증된 Session의 Membership으로 인증된 selected Profile을 actor로 사용해 Profile Block 생성·해제와 Owner 차단 목록 조회를 제공해야 한다(MUST). GraphQL resolver·loader·Node 조회·connection은 중앙 application policy를 재사용해야 하며(MUST), selected Profile의 Origin·Role·생성자를 별도 선택 자격으로 다시 검사하거나 요청별 DB actor state(GUC 등)·client 전용 차단 필터로 권한이나 가시성을 대체해서는 안 된다(MUST NOT). 차단 목록은 Membership으로 인증된 selected Profile이 Owner인 관계만 반환해야 하고(MUST), Target Profile이 기존 Profile 조회 조건을 충족할 때만 기존 `Profile` Target과 관계를 반환해야 한다(MUST). 목록은 pagination 전에 이 조건을 적용하고 관계 Node도 같은 조건을 적용해야 하며(MUST), Target을 다시 조회할 수 있게 되면 저장된 관계를 다시 반환해야 한다(MUST). 이 GraphQL ingress 계약을 remote ActivityPub ingress에 적용하는 것은 이 change의 범위가 아니다(MUST NOT).

#### Scenario: Membership으로 인증된 selected Profile 없이 GraphQL Block mutation을 실행하지 않는다

- **WHEN** 유효한 Session 또는 Membership으로 인증된 selected Profile이 없는 클라이언트가 Profile Block 생성·해제 GraphQL mutation을 호출한다
- **THEN** 시스템은 대상 Profile 조회와 mutation을 수행하기 전에 기존 GraphQL 인증·권한 오류로 거부한다
- **AND** 다른 Profile의 Block 관계나 Target 식별 정보를 응답으로 노출하지 않는다

#### Scenario: selected Profile auth scope가 없으면 nullable 읽기 결과를 반환한다

- **WHEN** 현재 요청이 selected Profile auth scope를 충족하지 못한 상태에서 `profileBlockStatus` 또는 `Profile.profileBlocks`를 조회한다
- **THEN** 해당 읽기 필드는 GraphQL 오류 대신 `null`을 반환한다
- **AND** 다른 Owner의 관리 목록 접근처럼 resolver 내부에서 실패한 권한 검사는 기존 오류를 유지한다

#### Scenario: selected Profile별 Owner 목록을 격리한다

- **WHEN** 한 Session에서 Owner A와 Owner B를 사용할 수 있고 selected Profile을 A에서 B로 전환해 각자의 차단 목록을 조회한다
- **THEN** 각 응답은 해당 시점의 Membership으로 인증된 selected Profile이 Owner인 Profile Block만 반환한다
- **AND** Owner A의 관계가 Owner B의 목록·mutation·Node 조회 결과에 섞이지 않는다

#### Scenario: GraphQL 각 surface가 해당 Profile Block policy를 사용한다

- **WHEN** GraphQL client가 Profile Node, Post connection, Media relation, Follow 후보 또는 Profile Block 목록을 같은 Block 관계에 대해 요청한다
- **THEN** Profile Node는 기존 Profile 조회 정책을, Post·Media는 viewer 방향의 콘텐츠 정책을, Follow 후보는 양방향 보호 정책을 적용한다
- **AND** Profile Block 목록은 Membership으로 인증된 selected Profile이 Owner인 관계만 반환한다

#### Scenario: 관리 조회가 일반 Profile 조회의 우회 경로가 되지 않는다

- **WHEN** 인증된 selected Owner가 자신의 Profile Block Node 또는 관리 connection을 조회한다
- **THEN** 시스템은 기존 `Profile` Target 정보와 Owner 소유 관계만 제공한다
- **AND** Post·Media·Follow 관계에는 각각의 기존 권한과 Profile Block surface policy를 적용한다
- **AND** 같은 Block ID를 Target 또는 다른 selected Profile이 조회하면 관계와 Target 식별 정보를 반환하지 않는다

#### Scenario: 조회할 수 없는 Target의 관리 관계를 pagination 전에 제외한다

- **WHEN** 인증된 selected Owner의 Profile Block Target이 비활성화되거나 연결된 Instance가 정지되어 기존 Profile 조회 조건을 충족하지 않는다
- **THEN** 시스템은 해당 관계를 관리 connection의 pagination 전에 제외하고 관계 Node에서도 반환하지 않는다
- **AND** Profile Block row 자체는 삭제하지 않으며 Target이 다시 조회 가능해지면 관리 connection과 관계 Node에 다시 포함한다

#### Scenario: Mute와 Block 관리 관계를 독립적으로 유지한다

- **WHEN** 인증된 selected Owner가 같은 Target을 Mute한 뒤 Block한다
- **THEN** 일반 Target Profile은 기존 Profile 조회 정책에 따라 조회할 수 있다
- **AND** 기존 Profile Mute는 Owner의 Mute connection·관계 Node·해제 경로에 계속 남는다
- **AND** Block·Mute 관계의 `targetProfile`은 기존 `Profile` global ID를 사용한다

#### Scenario: 같은 operation에서 selected Profile이 바뀌면 이전 actor 권한을 재사용하지 않는다

- **WHEN** 하나의 GraphQL Mutation에서 selected Profile이 A에서 B로 바뀐 뒤 후속 직렬 top-level field가 Block 관계를 조회하거나 변경한다
- **THEN** 후속 field는 B의 현재 actor context와 Owner scope를 기준으로 판정한다
- **AND** A에서 채운 loader cache나 scope grant로 A의 Block 관계 또는 보호된 Target을 반환하지 않는다

#### Scenario: 정상 direct route 진입·새로고침에서 Owner의 차단과 해제 대상을 확인한다

- **WHEN** 인증된 selected Owner가 이전 Profile·Block client cache 없이 GraphQL `node(id:)` 또는 `profileByHandle`로 이미 차단한 Target의 Profile route에 직접 진입하거나 새로고침한다
- **THEN** API는 정상적인 경우 기존 lifecycle·membership·공개 Profile 조회 정책을 충족한 Target의 기본 Profile 정보와 viewer 방향별 콘텐츠 상태, 현재 Owner의 차단 여부·정확한 해제 Profile Block ID를 제공한다
- **AND** 기존 Block 목록의 client cache가 있어야 이 결과를 제공할 수 있다는 조건을 두지 않는다
- **AND** Profile 자체가 기존 lifecycle 정책으로 조회 불가하면 기존 null/unavailable 결과를 반환하고 Block 전용 identity payload를 만들지 않는다
- **AND** Post·Media·social field는 각 surface의 Profile Block 정책을 적용한다
- **AND** 구체 field·payload 이름과 관리 조회의 배치는 구현 PR이 기존 GraphQL 계약 안에서 정한다

#### Scenario: 자신의 Block이 없는 route에 다른 Owner의 관계를 반환하지 않는다

- **WHEN** Membership으로 인증된 selected Profile이 route handle의 Target을 조회하고 자신이 Owner인 Block은 없다
- **THEN** API는 자신의 차단 관리 결과에 해제할 관계가 없음을 나타낸다
- **AND** 상대가 Owner인 Block ID를 반환하지 않는다

### Requirement: Profile Block GraphQL durable result

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/architecture/core-services.md`, `memory/coding-style.md`, `PROD-821`, `PROD-822`, `PROD-823`, `PROD-962`. GraphQL 생성·해제 mutation은 Membership으로 인증된 selected Profile을 Owner actor로 전달하고 부모 layer가 제공하는 durable action의 완료 결과를 응답해야 한다(MUST). 인증된 selected Profile의 Instance kind를 별도 선택 자격으로 중복 검사해서는 안 된다(MUST NOT). 필수 cleanup 완료 전에 성공 payload를 반환하거나 GraphQL에서 Block row를 직접 삭제해 성공 gate를 우회해서는 안 된다(MUST NOT). mutation payload는 durable action 완료 여부를 non-null `success`로 명시해야 한다(MUST). 성공한 Block은 생성한 non-null Profile Block 관계를 반환하고 client는 그 관계의 ID를 사용해야 하며(MUST), 성공한 Unblock은 삭제한 정확한 관계 ID를 반환해야 한다(MUST). Target identity는 Block 요청 입력 또는 해제할 기존 관계에서 재사용해야 한다(MUST). 구체 관계 field·payload 이름은 기존 GraphQL 규칙과 실제 generated schema에 맞춰 구현 PR에서 정한다.

#### Scenario: 필수 cleanup 완료를 기다린 뒤 mutation 결과를 반환한다

- **WHEN** 인증된 selected Owner의 Block 또는 Unblock 요청에서 required cleanup이 진행 중이다
- **THEN** GraphQL은 durable action의 완료를 기다린다
- **AND** timeout이나 실패를 성공 payload로 바꾸지 않는다
- **AND** 실패 응답만을 근거로 남아 있는 Block을 제거하거나 삭제된 Follow를 복구하지 않는다

#### Scenario: Block 성공은 생성한 관계를 반환한다

- **WHEN** 인증된 selected Owner의 Block이 required cleanup과 관계 생성을 완료한다
- **THEN** mutation은 `success: true`와 생성한 non-null Profile Block 관계를 함께 반환한다
- **AND** client는 별도 Block 관계 ID나 nullable projection 복구 경로를 만들지 않고 반환된 관계의 ID와 요청 Target identity로 이미 로드된 관계·connection·viewer state를 수렴시킨다
- **AND** `success: true`와 non-null Profile Block 관계가 확인되면 다른 GraphQL field 오류만으로 완료 결과를 실패로 뒤집지 않는다
- **AND** payload가 없거나 `success: false`이거나 필수 Profile Block 관계를 확인할 수 없으면 action 완료로 취급하지 않고 기존 client 상태를 보존한다

#### Scenario: 해제 성공은 삭제한 Owner 관계의 식별자를 반환한다

- **WHEN** 인증된 selected Owner의 Unblock이 required cleanup과 관계 제거를 완료한다
- **THEN** mutation은 `success: true`와 실제 제거한 Profile Block의 식별자를 함께 반환한다
- **AND** 다른 Owner의 관계나 이후 생성된 별도 Block을 삭제 결과로 반환하지 않는다
- **AND** 관계를 제거하지 않은 결과는 `success: false`와 `null` 관계 projection을 반환한다
- **AND** payload 누락이나 완료 결과와 일치하지 않는 관계 식별자를 성공으로 취급하지 않는다
