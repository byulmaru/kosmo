## ADDED Requirements

### Requirement: Profile Block lifecycle and owner-only relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`. 시스템은 Local 또는 Remote Owner Profile과 Target Profile 사이의 방향성 있는 Profile Block을 저장하고 생성·해제할 수 있어야 한다(MUST). Profile Block은 별도 상태나 만료를 갖지 않으며 관계의 존재가 적용 중인 차단을 뜻해야 한다(MUST). 도메인 capability는 ingress별 Account·Membership 상태나 Owner의 Local·Remote 유형을 일반 생성 조건으로 요구해서는 안 된다(MUST NOT). 생성은 Owner와 Target이 서로 다르고 같은 조합의 관계가 없는 경우에만 허용해야 하며(MUST), 해제는 `ProfileBlock.Owner`에 한정해야 하고(MUST), 관계 조회는 Owner에게만 허용해야 한다(MUST).

#### Scenario: Local·Remote Owner가 Local 또는 Remote Target을 차단한다

- **WHEN** ingress admission을 통과한 Local 또는 Remote Owner가 자신과 다른 Local 또는 Remote Target에 아직 없는 Profile Block을 생성한다
- **THEN** 시스템은 Owner → Target 방향의 Profile Block과 생성 시각을 저장한다
- **AND** 같은 Owner/Target 조합에 적용 중인 별도 상태·만료 행을 만들지 않는다
- **AND** Profile Block 관계는 Owner가 자신의 차단 목록에서 조회할 수 있다

#### Scenario: 동일한 Owner/Target 조합의 중복 저장을 막는다

- **WHEN** 같은 Owner/Target 조합에 이미 Profile Block이 있는 상태에서 다시 저장을 시도한다
- **THEN** 시스템은 두 번째 Profile Block 행을 저장하지 않는다
- **AND** 기존 관계의 방향과 생성 시각을 바꾸지 않는다

#### Scenario: 권한 없는 Profile Block 해제를 거부한다

- **WHEN** Target Profile 또는 다른 Profile이 Owner의 Profile Block을 해제하려고 한다
- **THEN** 시스템은 `ProfileBlock.Owner` 권한을 통과시키지 않는다
- **AND** Profile Block 관계를 변경하지 않는다

### Requirement: Profile Block durable cleanup orchestration

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Block policy/admission을 통과한 Profile Block 생성은 내구성 있는 cleanup orchestration을 시작해야 하며(MUST), 이 orchestration은 이번 실행이 포착한 양방향 Follow Request·Follow Relationship을 제거하고 pending Follow Request와 제거된 Follow 객체의 직접 원인 Notification을 내구성 있게 정리해야 한다(MUST). 필수 cleanup이 완료되기 전에는 Block action을 성공으로 확정해서는 안 되며(MUST NOT), 이미 진입한 Follow transition이 cleanup 뒤 Follow/Request 또는 그 직접 원인 Notification을 남겨도 Active Block 동안 공통 정책에서 inactive/invisible로 취급해야 한다(MUST). 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 변경하지 않아야 한다(MUST). Block 해제는 현재 남아 있는 양방향 Follow Request·Follow Relationship과 그 직접 원인 Notification을 정리한 뒤 Profile Block을 제거해야 하며(MUST), 차단 생성 때 제거된 Follow Request·Follow Relationship을 복구해서는 안 된다(MUST NOT).

#### Scenario: durable orchestration 완료 뒤에만 Block 성공을 확정한다

- **WHEN** Owner가 Block을 확정하고 양방향 Follow Request·Follow Relationship 또는 직접 원인 Notification 정리가 필요하다
- **THEN** 시스템은 Block policy/admission을 적용한 뒤 durable orchestration으로 필요한 정리를 실행한다
- **AND** 이번 실행이 포착한 두 방향 Follow 관계·요청과 직접 원인 Notification이 required cleanup 완료 상태가 된다
- **AND** required cleanup 완료 전에는 Block action 성공 응답이나 성공 상태를 확정하지 않는다
- **AND** 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 유지한다

#### Scenario: orchestration 재시작과 일시 오류가 부분 성공을 만들지 않는다

- **WHEN** durable cleanup orchestration이 일시 오류나 worker 재시작으로 중단된다
- **THEN** 시스템은 정리되지 않은 required 항목을 잃지 않고 재개한다
- **AND** 이미 처리한 항목을 중복 적용해 보존 대상 Repost·Bookmark·Notification을 변경하지 않는다
- **AND** required cleanup이 끝나기 전에는 Block action을 성공으로 확정하지 않는다

#### Scenario: 이미 진입한 Follow transition이 cleanup 뒤 완료된다

- **WHEN** Block cleanup과 겹쳐 이미 진입한 Follow transition이 cleanup 뒤 Follow/Request 또는 그 직접 원인 Notification을 남긴다
- **THEN** Block action은 이번 실행이 포착한 required cleanup을 완료한 상태로 유지된다
- **AND** Active Block 동안 공통 정책은 남은 관계와 Notification을 inactive/invisible로 취급한다

#### Scenario: 차단 해제는 정리된 관계를 복구하지 않는다

- **WHEN** Owner가 적용 중인 Profile Block을 해제한다
- **THEN** 시스템은 현재 남아 있는 양방향 Follow Request·Follow Relationship과 그 직접 원인 Notification을 정리한 뒤 Profile Block 관계를 제거한다
- **AND** 차단 생성 때 제거된 Follow Request와 Follow Relationship을 자동으로 재생성하지 않는다

### Requirement: Profile Block applies the policy for each surface

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`. Profile Block은 저장 방향과 요청 surface를 함께 평가해야 한다(MUST). Profile Node·handle route·일반 Profile 검색은 기존 Profile 조회 정책을 적용하고, Post·Media 직접 조회는 viewer 방향에 따른 콘텐츠 정책을 적용하며, Home·Local·Hashtag Post List·Post 검색·Follow 후보·상호작용·Notification은 양쪽 Profile에 대한 보호 정책을 적용해야 한다(MUST). 각 surface는 기존 Visibility·Eligibility와 자체 lifecycle·권한 조건을 함께 적용해야 한다(MUST).

#### Scenario: Profile Block이 surface별 정책을 적용한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 Profile identity, 직접 콘텐츠, 탐색 목록, Follow 후보, interaction 또는 Notification을 요청한다
- **THEN** 시스템은 Profile identity에 기존 Profile 조회 정책을 적용한다
- **AND** 직접 Post·Media 조회에는 viewer 방향의 Profile Block 콘텐츠 정책을 적용한다
- **AND** 탐색 목록·Follow 후보·interaction·Notification에는 양방향 Profile Block 보호 정책을 적용한다

#### Scenario: 차단 해제 뒤 새 요청을 현재 정책으로 평가한다

- **WHEN** Owner가 Profile Block을 해제한 뒤 양쪽 Profile이 새 요청을 실행한다
- **THEN** 시스템은 새 요청 시점의 현재 Profile Block 관계와 각 surface의 기존 조회·상호작용 정책을 함께 평가한다
- **AND** 차단 생성 때 제거된 Follow Request와 Follow Relationship은 cleanup·no-restore 계약에 따라 자동 복구하지 않는다

#### Scenario: Local·Remote 조합과 무관하게 남은 Follow보다 Block이 우선한다

- **WHEN** Local 또는 Remote Owner·Target 사이에 Active Block과 잔존 Follow Request 또는 Follow Relationship이 함께 존재한다
- **THEN** 공통 정책은 어느 요청 방향에서도 잔존 관계를 비활성·비노출로 판정한다
- **AND** 잔존 Follow를 `FOLLOWERS` Post 접근이나 Home 후보 자격을 얻는 근거로 사용하지 않는다
- **AND** GraphQL의 selected Local actor 조건을 이 pair 정책의 도메인 입력 조건으로 추가하지 않는다

#### Scenario: 한쪽 Block만 해제해도 반대 방향 Block이 남으면 제한한다

- **WHEN** A → B와 B → A Block이 함께 있고 A가 자신의 A → B 관계만 해제한다
- **THEN** 공통 정책은 B → A가 남아 있으므로 양쪽 요청을 계속 blocked로 판정한다
- **AND** A의 해제로 B가 소유한 관계를 변경하지 않는다

### Requirement: Profile Block GraphQL actor and policy boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-823`. 현재 GraphQL ingress는 검증된 Session의 selected Local Profile을 actor로 사용해 Profile Block 생성·해제와 Owner 차단 목록 조회를 제공해야 한다(MUST). GraphQL resolver·loader·Node 조회·connection은 중앙 application policy를 재사용해야 하며(MUST), 차단 목록은 selected Local Profile이 Owner인 관계만 반환해야 한다(MUST). Target Profile의 기본 정보는 기존 Profile 조회 정책으로 제공하고, Post·Media와 각 목록·상호작용·Notification은 해당 surface의 Profile Block 정책을 적용해야 한다(MUST). 이 GraphQL ingress 계약을 remote ActivityPub ingress에 적용하는 것은 이 change의 범위가 아니다(MUST NOT).

#### Scenario: selected Local Profile 없이 GraphQL Block operation을 실행하지 않는다

- **WHEN** 유효한 Session 또는 selected Local Profile이 없는 클라이언트가 Profile Block 생성·해제 또는 목록 GraphQL operation을 호출한다
- **THEN** 시스템은 대상 Profile 조회와 mutation을 수행하기 전에 기존 GraphQL 인증·권한 오류로 거부한다
- **AND** 다른 Profile의 Block 관계나 Target 식별 정보를 응답으로 노출하지 않는다

#### Scenario: selected Profile별 Owner 목록을 격리한다

- **WHEN** 한 Session에서 Owner A와 Owner B를 사용할 수 있고 selected Profile을 A에서 B로 전환해 각자의 차단 목록을 조회한다
- **THEN** 각 응답은 해당 시점의 selected Local Profile이 Owner인 Profile Block만 반환한다
- **AND** Owner A의 관계가 Owner B의 목록·mutation·Node 조회 결과에 섞이지 않는다

#### Scenario: GraphQL 각 surface가 해당 Profile Block policy를 사용한다

- **WHEN** GraphQL client가 Profile Node, Post connection, Media relation, Follow 후보 또는 Profile Block 목록을 같은 Block 관계에 대해 요청한다
- **THEN** Profile Node는 기존 Profile 조회 정책을, Post·Media는 viewer 방향의 콘텐츠 정책을, Follow 후보는 양방향 보호 정책을 적용한다
- **AND** Profile Block 목록은 selected Local Profile이 Owner인 관계만 반환한다

#### Scenario: 관리 조회가 일반 Profile 조회의 우회 경로가 되지 않는다

- **WHEN** selected Local Owner가 자신의 Profile Block Node 또는 관리 connection을 조회한다
- **THEN** 시스템은 기존 `Profile` Target 정보와 Owner 소유 관계만 제공한다
- **AND** Post·Media·Follow 관계에는 각각의 기존 권한과 Profile Block surface policy를 적용한다
- **AND** 같은 Block ID를 Target 또는 다른 selected Profile이 조회하면 관계와 Target 식별 정보를 반환하지 않는다

#### Scenario: Mute와 Block 관리 관계를 독립적으로 유지한다

- **WHEN** selected Local Owner가 같은 Target을 Mute한 뒤 Block한다
- **THEN** 일반 Target Profile은 기존 Profile 조회 정책에 따라 조회할 수 있다
- **AND** 기존 Profile Mute는 Owner의 Mute connection·관계 Node·해제 경로에 계속 남는다
- **AND** Block·Mute 관계의 `targetProfile`은 기존 `Profile` global ID를 사용한다

#### Scenario: 같은 operation에서 selected Profile이 바뀌면 이전 actor 권한을 재사용하지 않는다

- **WHEN** 하나의 GraphQL Mutation에서 selected Profile이 A에서 B로 바뀐 뒤 후속 직렬 top-level field가 Block 관계를 조회하거나 변경한다
- **THEN** 후속 field는 B의 현재 actor context와 Owner scope를 기준으로 판정한다
- **AND** A에서 채운 loader cache나 scope grant로 A의 Block 관계 또는 보호된 Target을 반환하지 않는다

#### Scenario: 직접 route 진입에서도 Owner의 차단과 해제 대상을 확인한다

- **WHEN** selected Local Owner가 이전 Profile·Block client cache 없이 route handle로 이미 차단한 Target의 Profile에 직접 진입하거나 새로고침한다
- **THEN** API는 기존 Profile 조회 정책을 충족한 Target Profile과 현재 Owner의 차단 여부·해제할 Profile Block ID를 제공한다
- **AND** 기존 Block 목록의 client cache가 있어야 이 결과를 제공할 수 있다는 조건을 두지 않는다
- **AND** Post·Media·social field는 각 surface의 Profile Block 정책을 적용한다
- **AND** 구체 field·payload 이름과 관리 조회의 배치는 구현 PR이 기존 GraphQL 계약 안에서 정한다

#### Scenario: 자신의 Block이 없는 route에 다른 Owner의 관계를 반환하지 않는다

- **WHEN** selected Local Profile이 route handle의 Target을 조회하고 자신이 Owner인 Block은 없다
- **THEN** API는 자신의 차단 관리 결과에 해제할 관계가 없음을 나타낸다
- **AND** 상대가 Owner인 Block ID를 반환하지 않는다

### Requirement: Profile Block GraphQL durable result

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/architecture/core-services.md`, `memory/coding-style.md`, `PROD-821`, `PROD-822`. GraphQL 생성·해제 mutation은 검증된 selected Local Profile을 Owner actor로 전달하고 부모 layer가 제공하는 durable action의 완료 결과를 응답해야 한다(MUST). 필수 cleanup 완료 전에 성공 payload를 반환하거나 GraphQL에서 Block row를 직접 삭제해 성공 gate를 우회해서는 안 된다(MUST NOT). 성공한 해제는 client가 제거할 정확한 관계 ID를 반환해야 한다(MUST). 구체 field·payload 이름은 기존 GraphQL 규칙과 실제 generated schema에 맞춰 구현 PR에서 정한다.

#### Scenario: 필수 cleanup 완료를 기다린 뒤 mutation 결과를 반환한다

- **WHEN** selected Local Owner의 Block 또는 Unblock 요청에서 required cleanup이 진행 중이다
- **THEN** GraphQL은 durable action의 완료를 기다린다
- **AND** timeout이나 실패를 성공 payload로 바꾸지 않는다
- **AND** 실패 응답만을 근거로 남아 있는 Block을 제거하거나 삭제된 Follow를 복구하지 않는다

#### Scenario: 해제 성공은 삭제한 Owner 관계의 식별자를 반환한다

- **WHEN** selected Local Owner의 Unblock이 required cleanup과 관계 제거를 완료한다
- **THEN** mutation은 실제 제거한 Profile Block의 식별자를 반환한다
- **AND** 다른 Owner의 관계나 이후 생성된 별도 Block을 삭제 결과로 반환하지 않는다
- **AND** 관계를 제거하지 않은 결과만 `null`로 반환하며 오류·partial 결과를 성공으로 취급하지 않는다
