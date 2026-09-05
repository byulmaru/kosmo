## Context

이 기록은 `PROD-824`의 영구 Profile Mute 기반과 `PROD-825`의 현재 Post List 정책을 다룬 proposal, 기능
명세와 구현 설계를 반영한다. 제품 행동은 Profile Mute 기준 문서와 `PROD-814`·`PROD-824`·`PROD-825`에서
가져왔다. 사용자는 2026-09-02에 `expires_at`을 nullable 컬럼으로 먼저 두되 이번 생성 경로에서는 항상
`null`을 저장하는 범위를 확인했고, 2026-09-03에 Target Profile 정상 표시와 Hashtag·Local 책임 분리를
확인했다.

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

### PROD-824 기반은 콘텐츠·Notification·ActivityPub 효과와 분리한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824`, `PROD-825`
- Status: Active
- Context / Problem: 기준 객체는 Mute가 콘텐츠와 새 Notification 노출에 미치는 결과까지 정의한다. `PROD-824`는 해당 정책들이 사용할 관계 기반만 전달한다.
- Decision Outcome: `PROD-824` 구현 slice는 Profile Mute의 생성·해제·관리 조회와 적용 여부 조회까지만
  구현한다. `PROD-825`가 현재 Home·Local·Profile·Repost 정책을 후행 slice로 적용한다. 새 Notification 생성
  억제, UI·Relay와 ActivityPub 효과는 두 slice의 범위에 추가하지 않는다. Mute 생성·해제와 목록 판정은 기존
  Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark, Notification과 Read State를
  바꾸지 않는다.
- Alternatives Considered: 관계 생성과 콘텐츠·Notification 정책을 한 배포에 묶는 방식은 이슈 의존성과 검증 책임을 흐리므로 제외했다.
- Consequences: `PROD-824`가 끝나도 사용자 노출 정책 전체가 완성되지는 않는다. `PROD-825`와
  `PROD-814`가 이 관계를 사용하고 여러 구현 단위에 걸친 검증을 마칠 때까지 OpenSpec을 archive하지
  않는다. Hashtag Post List runtime은 이 lifecycle과 별개로 `PROD-827`이 맡는다.
- Confirmation / Follow-up: `PROD-824` 테스트는 기존 객체가 변하지 않는지 확인한다. 현재 Home·Local·Profile·Repost
  정책은 `PROD-825`, UI·Relay·전체 E2E와 archive는 `PROD-814`, Hashtag runtime은
  `PROD-827`이 맡는다.

### Profile Mute는 탐색 목록을 억제하고 Target Profile의 직접 목록에는 적용하지 않는다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`,
  `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-825`
- Status: Superseded — 2026-09-05의 「Post 조회 정책 통합과 Profile 방문 ID 예외」가 대체한다.
- Context / Problem: 기존 canonical 문서와 Linear 이슈는 Target Profile Post List를 Collapse하는 방향과
  직접 Profile에서 기존 Post를 유지하는 방향을 함께 담고 있어 직접 방문 시 행동이 일관되지 않았다.
- Decision Outcome: Profile Mute는 Home·Local·Hashtag 같은 탐색 목록의 개인 노출을 억제한다. 사용자가
  Target Profile을 직접 방문하면 `Profile.posts`에 Profile Mute를 적용하지 않고 기존 Post Visibility,
  Post Eligibility와 구조 정책을 통과한 Post를 정상적으로 표시한다. Mute 상태와 해제 action은 Profile
  surface에 남기되 Post를 Collapse하거나 별도 reveal을 요구하지 않는다.
- Alternatives Considered: Target Profile Post를 Collapse하고 reveal control을 제공하는 안은 직접 방문에서도
  Mute를 콘텐츠 접근 제한처럼 동작시키고 별도 서버·클라이언트 계약을 요구하므로 선택하지 않았다.
- Consequences: Profile Mute 여부와 관계없이 직접 Profile의 Post connection shape와 후보 정책은 유지된다.
  Profile UI는 관계 상태를 보여 주지만 Post presentation을 접지 않는다.
- Confirmation / Follow-up: Mute한 Target의 `Profile.posts`가 기존 eligible Post를 접거나 제외하지 않는지
  검증한다.

### Target Profile은 기존 PostConnection을 유지하고 Mute 전용 결과를 추가하지 않는다

- Decision Date: 2026-09-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`,
  `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-825`
- Status: Active
- Context / Problem: Target Profile의 Post를 정상적으로 표시하는 데 Mute 전용 GraphQL 결과는 필요하지 않다.
  이를 일반 `Post` field에 넣으면 같은 Post의 값이 목록 문맥에 따라 달라지고, connection edge나 별도
  wrapper를 추가하면 소비하지 않는 공개 계약이 생긴다.
- Decision Outcome: `Profile.posts`는 기존 `PostConnection`을 유지한다. Mute 전용 Post field,
  connection edge field, enum 또는 wrapper를 추가하지 않는다.
- Alternatives Considered: `PostConnectionEdge.controlDecision`과 별도 Mute-aware wrapper는 Target Profile
  Post를 Collapse하지 않는 제품 계약에서 사용할 결과가 없어 선택하지 않았다. 일반 `Post` field는 문맥
  의존 값을 Node에 넣게 되므로 제외했다.
- Consequences: `PROD-825`는 GraphQL schema shape를 바꾸지 않고 Home·Local·Profile 후보 정책과 Bookmark 비적용 회귀 테스트를 검증한다.
  Profile surface의 Mute 상태는 기존 `ProfileViewerState.profileMute`를 소비한다.
- Confirmation / Follow-up: schema diff에 Mute 전용 Post·edge field가 없고 `Profile.posts`가 기존
  `PostConnection`을 반환하는지 확인한다.

### Repost Source가 있는 Home 후보는 바깥 Author와 Source Author를 모두 판정한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/objects/post.md`,
  `docs/domain/policies/post-list.md`, `PROD-814`, `PROD-825`
- Status: Superseded — 2026-09-05의 「Post 조회 정책 통합과 Profile 방문 ID 예외」가 대체한다.
- Context / Problem: 바깥 Post의 Author만 확인하면 Mute Target의 Source가 Repost나 Quote를 통해 Home에
  남고, Source Author만 확인하면 Mute Target이 만든 바깥 Post가 남는다.
- Decision Outcome: Home 후보가 direct Repost Source를 가지면 바깥 Post의 Author와 Source Post Author에
  대한 Profile Mute를 각각 판정한다. 둘 중 하나라도 현재 selected Profile의 Mute Target이면 Content 없는
  Repost와 Content가 있는 Quote를 모두 page limit 전에 제외한다. Source의 Source로 판정을 재귀 확장하지
  않는다.
- Alternatives Considered: 바깥 Author만 판정하거나 Source Author만 판정하는 안은 승인된 양쪽 작성자 판정
  경계를 충족하지 못해 제외했다. Source chain을 평탄화하는 안은 Post가 direct Source만 참조하는 canonical
  구조를 바꾸므로 선택하지 않았다.
- Consequences: Home 후보 query는 바깥 Author와 direct Source Author를 같은 Owner 범위에서 판정해야 한다.
  Target Profile 직접 목록에는 이 Profile Mute 판정을 적용하지 않는다.
- Confirmation / Follow-up: 바깥 Author만 Mute한 경우, Source Author만 Mute한 경우, 둘 다 Mute하지 않은
  Repost·Quote와 pagination을 통합 테스트로 검증한다.

### 목록의 Profile Mute Owner는 요청의 selected Profile이며 해제는 새 조회부터 반영한다

- Decision Date: 2026-09-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`,
  `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/policies/post-list.md`,
  `PROD-814`, `PROD-825`
- Status: Active
- Context / Problem: Account 단위나 Target 단위로 Mute 판정을 공유하면 같은 Account의 다른 selected Profile
  결과가 섞이고, 해제한 관계가 후속 조회에도 남을 수 있다.
- Decision Outcome: 목록 판정의 Owner는 각 요청의 현재 selected Profile이다. 같은 Account의 다른 Profile
  관계를 재사용하지 않으며, Mute 해제 뒤 시작한 새 조회는 제거된 관계 없이 정책을 다시 계산한다.
- Alternatives Considered: Account 단위 Mute와 요청 간 전역 cache는 Profile 단위 관계와 해제 후 최신
  조회 계약에 어긋나므로 제외했다.
- Consequences: Home 후보 query는 매 요청의 selected Profile ID를 Owner 조건으로 사용하며 Account나 Target
  단위의 전역 cache를 재사용하지 않는다. 기존 클라이언트 connection의 즉시 갱신 방식은 `PROD-814`가
  소유한다.
- Confirmation / Follow-up: 같은 Account의 두 selected Profile과 Mute 해제 전후 새 Home 조회를 통합
  테스트로 확인한다.

### 목록 판정은 query에 합성 가능한 공통 Core 읽기 정책 경계를 재사용한다

- Decision Date: 2026-09-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/policies/post-list.md`,
  `PROD-814`, `PROD-825`, `PROD-827`
- Status: Superseded — 2026-09-05의 「Post 조회 정책 통합과 Profile 방문 ID 예외」가 대체한다.
- Context / Problem: Home·Local·Hashtag가 Profile Mute의 Owner·Target·활성 관계 의미를 각자 다시 조합하면
  같은 정책이 목록마다 달라지거나 후보별 DB 호출로 pagination 경계가 흐려질 수 있다.
- Decision Outcome: `PROD-825`는 selected Profile Owner와 후보 Target을 받아 `expires_at IS NULL`까지 포함한
  Profile Mute 판정을 소비자 query에 합성할 수 있는 공통 Core 읽기 정책 경계를 제공하고 Home에 적용한다.
  `PROD-814`와 `PROD-827`은 각각 Local·Hashtag 목록의 후보·Visibility·Eligibility·pagination 책임을
  유지하면서 이 경계를 후속 재사용한다. 직접 방문하는 `Profile.posts`에는 이 목록 경계를 적용하지 않는다.
- Alternatives Considered: 각 소비자가 Owner·Target·`expires_at IS NULL` 조건을 복제하는 방식은 정책
  drift를 만들 수 있어 제외했다. 후보를 읽은 뒤 행별 Core 조회나 application-memory filter로 제거하는 방식은
  page limit과 cursor를 왜곡하므로 선택하지 않는다.
- Consequences: 공통 경계는 transport-neutral query predicate/query fragment로 유지되고 소비자 query의
  page limit 전에 합성된다. Home은 바깥 Author와 direct Source Author에 같은 경계를 적용하며, 후속 목록은
  각자의 후보 정책과 정렬을 소유한다.
- Confirmation / Follow-up: Core 테스트에서 Owner·Target 격리와 `expires_at IS NULL` 의미를 실제 DB query로
  확인하고, API 테스트에서 Home이 바깥 Author·Source Author를 page limit 전에 제외하는지 검증한다.

## Remaining Decisions

- `PROD-826`: 기간 지정 Mute 생성, 만료 시각 검증과 non-null `expires_at`의 만료 판정·정리. 동일 pair의 기존 non-null row를 v1 재-Mute에서 같은 ID의 `null` row로 수렴시키는 계약은 이 change에서 확정하며, `PROD-826`이 필요하면 이를 명시적으로 대체할 수 있다. 이 후속 결정은 현재 `PROD-825` 구현을 막지 않는다.

## Superseded Decisions

- 2026-09-02의 `GraphQL은 Owner 전용 ProfileMute Node와 Profile 중심 진입점을 제공한다` 결정 중 `targetProfileId`, nullable `targetProfile`과 Profile global ID 해제 계약은 2026-09-03의 `ProfileMute는 Target visibility를 따르고 해제는 관계 identity를 사용한다` 결정으로 대체되었다. Owner 전용 Node·connection, `muteProfile` 생성 입력, 중복 생성 수렴과 nullable payload ID는 유효한 계약으로 보존한다.

### Post 조회 정책 통합과 Profile 방문 ID 예외

- Decision Date: 2026-09-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`,
  `docs/design/profile-mute-block.md`, 최신 `PROD-825`·`PROD-814` 본문,
  [PR #757 리뷰](https://github.com/byulmaru/kosmo/pull/757#discussion_r3940344313)와 사용자 승인
- Status: Active
- Context / Problem: Profile 전체를 Mute 비적용으로 두면 방문한 Profile이 다른 muted Author의 콘텐츠를
  Repost·Quote한 항목도 노출된다. Home에만 별도 조건을 조립하면 현재 제공되는 Local에서 정책이 누락된다.
- Decision Outcome: Home·Local은 outer Author와 direct Source Author의 영구 Mute를 모두 적용한다.
  Profile.posts는 방문한 Profile ID만 예외로 허용하고 다른 muted Source Author의 Repost·Quote를 제외한다.
  Bookmark·Post 직접 조회·상호작용은 Mute를 무시한다. Visibility·Eligibility를 유지하고 cursor·limit 전에
  모든 제외를 마치며 Content가 있는 Quote도 direct Source Author를 판정한다.
- Alternatives Considered: 기존 Profile 전체 비적용과 Local 후속 적용은 다른 muted Source의 우회 노출과
  현재 목록 간 정책 불일치를 남긴다. 사용자는 방문 대상의 Post를 유지하면서 다른 Target의 Mute도 지키는
  예외 범위와 이번 PR에서 Local을 함께 검증하는 방향을 승인했다.
- Consequences: 기존 `postAccessWhere` 안에 Mute 조건을 합성하고 호출부는 전체 적용·방문 ID만 예외·전체
  무시 정책을 필수 인수로 명시한다. 별도 public `profileMuteWhere`와 Home 전용 조립은 제거한다.
  `PROD-825`가 Home·Local·Profile·Bookmark 서버 구현·API 검증을 소유하며, `PROD-814`는 UI·Relay·통합
  E2E·최종 정합성 검증·공유 OpenSpec archive를 계속 소유한다. Hashtag runtime은 `PROD-827`이 맡는다.
- Supersedes: 직접 Profile 전체 비적용, Home 전용 두 Author 판정 범위, 별도 public Core 읽기 helper와
  Local 구현을 `PROD-814`로 미룬 이전 결정. PostConnection·schema, 관계 데이터와 UI presentation은 유지한다.
- Confirmation / Follow-up: Home·Local·Profile·Bookmark 실제 GraphQL 경로, Content 없는 Repost·Quote,
  방문 ID 예외, 양방향 pagination, selected Profile 격리·해제·비로그인 조회와 기존 Visibility·Eligibility를 검증한다.
