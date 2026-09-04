## Context

이 기록은 `PROD-824`의 영구 Profile Mute 기반을 다룬 proposal, 기능 명세와 구현 설계를 반영한다. 제품 행동은 Profile Mute 기준 문서와 `PROD-814`·`PROD-824`에서 가져왔다. 구현 방식은 그 범위 안에서 현재 Core·GraphQL·migration 구조에 맞춰 골랐다. 사용자는 2026-09-02에 `expires_at`을 nullable 컬럼으로 먼저 두되 이번 생성 경로에서는 항상 `null`을 저장하는 범위를 확인했다.

## Decision Records

### v1은 영구 Mute만 만들고 nullable expires_at은 후속 확장 지점으로 남긴다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824`
- Status: Active
- Context / Problem: 기준 객체에는 nullable 만료 시각이 있지만 `PROD-824`의 제품 범위는 영구 Mute뿐이다. 컬럼을 뒤로 미루면 기간 지정 Mute를 도입할 때 저장 구조를 다시 확장해야 한다. 기간 동작을 지금 함께 열면 후속 계약을 앞질러 구현하게 된다.
- Decision Outcome: 저장 모델에는 nullable `expires_at`을 추가한다. `PROD-824`의 Core와 GraphQL 생성 경로는 값으로 `null`만 쓰고, 기간 입력·변경·자동 만료 기능은 제공하지 않는다. 같은 Owner·Target의 기존 non-null `expires_at` row는 같은 ID를 유지한 채 `null`로 갱신해 영구 관계로 활성화하고 반환한다. 공개 GraphQL schema에도 만료 입력이나 필드를 노출하지 않는다.
- Alternatives Considered: `expires_at` 자체를 `PROD-826`까지 미루는 안은 가까운 시일 안에 migration을 하나 더 만들고 기준 객체 형태와도 어긋나므로 선택하지 않았다. 기간 입력과 만료 판정을 함께 구현하는 안은 현재 이슈의 승인 범위를 넘으므로 제외했다.
- Consequences: 현재 적용 여부는 이 변경이 만든 `expires_at IS NULL` 관계만 다룬다. 기존 non-null row의 재-Mute는 앞선 Decision Outcome대로 `null`로 수렴하며, 기간 지정 입력으로 non-null 값을 생성하거나 그 만료를 해석·정리하는 제품 동작은 `PROD-826`에서 정한다.
- Confirmation / Follow-up: DB·Core·GraphQL 테스트에서 모든 생성 결과의 `expires_at`이 `null`인지 확인하고, 공개 schema에 기간·만료 입력과 필드가 없는지 검사한다. `PROD-826`은 기간 지정 Mute 생성, 만료 판정·정리와 필요 시 이 v1 계약을 명시적으로 대체할지를 별도로 확정한다.

### Owner와 Target 조합은 하나의 현재 관계 row를 공유한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `PROD-814`, `PROD-824`
- Status: Active
- Context / Problem: 중복 요청과 동시 생성이 별도 관계를 만들지 않도록 데이터베이스 수준의 식별 경계가 필요하다. 이 관계는 감사 이력 객체가 아니라 현재 Mute 상태를 나타낸다.
- Decision Outcome: `profile_mute`는 UUIDv7 ID, Owner·Target foreign key, 생성 시각과 nullable `expires_at`을 가진다. `(owner_profile_id, target_profile_id)` 전체에 unique constraint를 두고, 같은 조합은 하나의 현재 row로 표현한다. 두 Profile이 물리적으로 삭제되면 관계도 cascade로 삭제한다.
- Alternatives Considered: 애플리케이션 선조회만으로 중복을 막는 방식은 동시 요청에 취약해 제외했다. 부분 unique index로 적용 중 row만 제한하는 방식과 여러 이력 row를 저장하는 방식도 선택하지 않았다. 이번 범위에는 이력 요구가 없고 기간 처리 방식도 아직 정해지지 않았기 때문이다.
- Consequences: 동시성의 최종 판정은 데이터베이스가 맡는다. `PROD-826`이 여러 기간 이력을 필요로 한다면 constraint 변경과 데이터 전환을 별도 migration으로 다뤄야 한다.
- Confirmation / Follow-up: schema·migration 검사와 순차·동시 중복 생성 테스트로 row가 하나만 남는지 확인한다.

### Owner는 인증된 요청의 현재 selected Profile로만 정한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-814`, `PROD-824`
- Status: Active
- Context / Problem: 한 Account가 여러 Profile Membership을 가질 수 있으므로 Account 인증만으로 관계 Owner를 정하면 다른 selected Profile의 Mute가 섞일 수 있다.
- Decision Outcome: GraphQL은 `usingProfile`을 통과한 `ctx.session.profileId`만 Owner로 사용하고 Owner ID 입력을 받지 않는다. Core action은 검증된 Owner identity를 받아 Active·Normal Local 조건, self-target 금지와 Target 존재 여부를 검사한다. 목록·Node·viewer-relative 조회와 해제 query에도 Owner 조건을 포함한다.
- Alternatives Considered: Account 단위 Mute와 Account의 모든 Profile이 공유하는 Mute는 Profile Mute 객체 정의에 어긋나 제외했다. resolver가 Membership과 Account 상태를 다시 검증하는 방식은 `usingProfile` 경계와 책임이 겹치므로 선택하지 않았다.
- Consequences: 같은 Account의 Profile끼리도 Mute 목록과 상태가 완전히 분리된다. Remote selected Profile은 Membership이 있어도 이 action의 Local Owner 조건 때문에 생성·해제를 실행할 수 없다.
- Confirmation / Follow-up: 다른 Account, 같은 Account의 다른 selected Profile, Remote selected Profile과 다른 Owner 관계 해제 시도를 GraphQL 통합 테스트에 포함한다.

### 생성·해제 transaction과 중복 수렴은 Core action이 소유한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/profile-mute.md`, `PROD-824`
- Status: Active
- Context / Problem: GraphQL과 후행 호출자가 저마다 검증·transaction·중복 처리를 구성하면 transport마다 결과가 달라진다. 중복 insert 충돌에서 `DO NOTHING RETURNING`만 쓰면 기존 row를 돌려줄 수 없다.
- Decision Outcome: 생성과 해제는 transport-neutral Core action으로 구현하며 각 action이 자신의 transaction을 연다. 생성은 unique conflict를 `onConflictDoUpdate`로 처리해 기존 row의 `expires_at`을 `null`로 갱신하고 같은 ID를 반환한다. 해제는 Owner와 Profile Mute 관계 ID를 함께 조건으로 삭제하며, 관계가 이미 없으면 정보 노출 없이 빈 결과로 수렴한다. Profile이나 관계 row에 비관적 lock을 추가하지 않는다.
- Alternatives Considered: resolver가 transaction을 열거나 insert 전에 row를 잠그는 방식은 Core 서비스 경계와 기존 관계 action 패턴에 맞지 않아 제외했다. unique violation을 오류로 반환하는 방식은 승인된 중복 수렴 결과를 만족하지 못한다.
- Consequences: GraphQL 외의 호출자도 같은 권한·동시성 의미를 재사용할 수 있다. 충돌한 기존 row도 upsert와 `returning()`으로 같은 ID와 영구 관계 의미에 수렴한다.
- Confirmation / Follow-up: Core 테스트에서 첫 생성, 반복 생성, 동시 생성, 반복 해제와 다른 Owner 해제를 검증한다.

### GraphQL은 Owner 전용 ProfileMute Node와 Profile 중심 진입점을 제공한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824`
- Status: Superseded
- Superseded Date: 2026-09-03
- Superseded by: `ProfileMute는 Target visibility를 따르고 해제는 관계 identity를 사용한다`
- Context / Problem: 후행 UI는 현재 Profile의 관리 목록, Target Profile 화면의 viewer-relative 상태와 생성·해제 결과를 Relay identity로 연결해야 한다. Target이나 제삼자가 Node 경로로 관계를 발견해서도 안 된다.
- Decision Outcome: 공개 schema에 `ProfileMute implements Node`를 추가하고 `targetProfile`, `targetProfileId: ID!`, `createdAt`을 제공한다. 현재 Profile에는 Owner 전용 `profileMutes` connection을, `ProfileViewerState`에는 `profileMute`를 추가한다. Target이 비가시화되어 nullable `targetProfile`이 `null`이어도 `targetProfileId`의 Profile global ID를 기존 `unmuteProfile` Profile ID 입력에 그대로 재사용할 수 있다. `muteProfile(input: { id: Profile global ID })`는 `MuteProfilePayload.profileMute`를 반환한다. `unmuteProfile(input: { id: Profile global ID })`는 nullable `UnmuteProfilePayload.profileMuteId`를 반환한다. `ProfileMute` ID 조회와 connection은 현재 selected Profile이 Owner일 때만 관계를 돌려준다.
- Alternatives Considered: Target Profile 목록만 반환하면 관계 identity를 보존하고 삭제 결과를 cache에 정확히 반영하기 어렵다. top-level 전용 query는 기존 Profile 중심 GraphQL 구조에 진입점만 늘린다. 해제 입력으로 ProfileMute ID를 받으면 직접 Profile 화면에서 Target ID만 가진 호출자가 관계 ID를 먼저 조회해야 한다. 이 세 가지 방식은 사용하지 않는다.
- Consequences: schema 이름과 payload는 후행 Relay 코드가 의존하는 공개 계약이 된다. `Profile.profileMutes` resolver는 상위 Profile ID가 selected Profile과 같은지 별도로 확인해야 하며, Node loader도 Owner 조건을 적용해야 한다.
- Confirmation / Follow-up: schema 생성 결과, Node 직접 조회, 양방향 pagination, viewer-relative 상태와 mutation payload를 GraphQL 통합 테스트로 확인한다.

### ProfileMute는 Target visibility를 따르고 해제는 관계 identity를 사용한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824`
- Status: Active
- Context / Problem: 이전 결정은 비가시화된 Target을 nullable `targetProfile`과 별도 `targetProfileId`로 노출하고 Profile global ID로 해제하도록 기록했다. 이는 Target 관계를 Owner에게만 조회한다는 canonical visibility 경계와 관계 자체를 식별하는 Relay identity를 분리하지 못한다.
- Decision Outcome: `ProfileMute`의 공개 `targetProfile`은 `Profile!`이며 Target Profile과 Instance가 `visibleProfileWhere`를 통과하지 못하면 `ProfileMute` Node와 Owner connection에서 관계 전체를 반환하지 않는다. 생성 action의 `ensureTarget`도 같은 Core transaction에서 이 predicate를 적용해 DISABLED Profile과 SUSPENDED Instance Target의 관계 저장을 거부한다. `targetProfileId` 공개 필드는 제공하지 않는다. `unmuteProfile(input: { id: ProfileMute global ID })`는 관계 identity와 selected Owner를 Core에 전달하고, nullable `profileMuteId` payload로 삭제된 관계 ID를 반환한다. `muteProfile(input: { id: Profile global ID })`의 Target 입력과 기존 Owner·Target unique upsert 및 같은 ID로 수렴하는 생성 semantics는 유지한다.
- Alternatives Considered: 비가시 Target을 nullable Target과 Profile ID로 계속 반환하는 방식은 관계의 공개 visibility와 Node identity를 분리해 hidden relation을 발견하게 하므로 제외했다. Target ID를 먼저 조회한 뒤 해제하는 방식은 hidden Target의 공개 경계를 우회하고 추가 조회를 요구하므로 선택하지 않는다.
- Consequences: Owner는 hidden Target의 관계를 목록이나 Node에서 볼 수 없지만 보관한 관계 global ID로 정확히 해제할 수 있다. 후속 UI는 nullable Target fallback이나 `targetProfileId` field에 의존하지 않고 관계 ID를 cache identity로 사용해야 한다.
- Confirmation / Follow-up: disabled/suspended Target의 Node·Owner connection 제외, non-null Local·Remote Target field, 다른 Owner와 selected Profile 격리, ProfileMute global ID 해제를 GraphQL 통합 테스트로 확인한다.

### 저장 변경은 backfill 없는 additive migration으로 배포한다

- Decision Date: 2026-09-02
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-824`
- Status: Active
- Context / Problem: 기존 데이터에는 Profile Mute가 없고 이전 애플리케이션은 새 테이블을 참조하지 않는다. rollback 때문에 이미 적용된 migration history를 되쓰거나 테이블을 즉시 제거할 이유가 없다.
- Decision Outcome: 새 테이블과 constraint·index만 추가하는 migration을 생성하고 backfill은 하지 않는다. migration을 먼저 적용한 뒤 애플리케이션을 배포한다. 애플리케이션 rollback 시 테이블은 남겨 두며, 제거가 필요하면 사용 중단과 데이터 보존을 확인한 별도 contract migration을 만든다.
- Alternatives Considered: 기존 migration을 수정하는 방식은 환경별 history를 깨뜨리므로 제외했다. down migration으로 즉시 테이블을 삭제하는 방식은 생성된 관계를 잃을 수 있어 기본 rollback으로 삼지 않는다.
- Consequences: 이전 애플리케이션과 새 schema가 함께 존재하는 구간이 안전하다. 코드 rollback 뒤에는 사용하지 않는 테이블이 남을 수 있지만 데이터는 보존된다.
- Confirmation / Follow-up: 빈 DB와 누적 migration DB에서 migration을 검증한다. 이전 애플리케이션이 새 테이블이 있는 schema에서도 정상 동작하는지 살펴 additive 변경임을 확인한다.

### 콘텐츠·Notification·ActivityPub 효과는 후행 구현과 분리한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824`
- Status: Active
- Context / Problem: 기준 객체는 Mute가 콘텐츠와 새 Notification 노출에 미치는 결과까지 정의한다. `PROD-824`는 해당 정책들이 사용할 관계 기반만 전달한다.
- Decision Outcome: 이 변경은 Profile Mute의 생성·해제·관리 조회와 적용 여부 조회까지만 구현한다. Post 목록 Exclude·Collapse, 새 Notification 생성 억제, UI·Relay와 ActivityPub 효과는 추가하지 않는다. Mute 생성·해제는 기존 Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark, Notification과 Read State를 바꾸지 않는다.
- Alternatives Considered: 관계 생성과 콘텐츠·Notification 정책을 한 배포에 묶는 방식은 이슈 의존성과 검증 책임을 흐리므로 제외했다.
- Consequences: `PROD-824`가 끝나도 사용자 노출 정책 전체가 완성되지는 않는다. `PROD-825`와 `PROD-814`가 이 관계를 사용하고 여러 구현 단위에 걸친 검증을 마칠 때까지 OpenSpec을 archive하지 않는다.
- Confirmation / Follow-up: 이번 테스트는 기존 객체가 변하지 않는지만 확인한다. 콘텐츠 정책은 `PROD-825`, UI·Relay·전체 E2E와 archive는 `PROD-814`가 맡는다.

## Remaining Decisions

- `PROD-826`: 기간 지정 Mute 생성, 만료 시각 검증과 non-null `expires_at`의 만료 판정·정리. 동일 pair의 기존 non-null row를 v1 재-Mute에서 같은 ID의 `null` row로 수렴시키는 계약은 이 change에서 확정하며, `PROD-826`이 필요하면 이를 명시적으로 대체할 수 있다. 이 항목은 `PROD-824` 구현을 막지 않는다.

## Superseded Decisions

- 2026-09-02의 `GraphQL은 Owner 전용 ProfileMute Node와 Profile 중심 진입점을 제공한다` 결정 중 `targetProfileId`, nullable `targetProfile`과 Profile global ID 해제 계약은 2026-09-03의 `ProfileMute는 Target visibility를 따르고 해제는 관계 identity를 사용한다` 결정으로 대체되었다. Owner 전용 Node·connection, `muteProfile` 생성 입력, 중복 생성 수렴과 nullable payload ID는 유효한 계약으로 보존한다.
