## Context

Profile Mute의 제품 의미와 UI 계약은 기준 문서와 `PROD-814`에 정리되어 있다. `PROD-824`는 관계를
저장하는 테이블과 Core·GraphQL 경계를 마련했다. `PROD-825`는 이 기반을 현재 Post List에 적용해 Home에서
개인 노출을 억제하고 Repost Author와 Source Author를 함께 판정한다. Target Profile을 직접 방문한 목록에는
Profile Mute를 적용하지 않는다.

현재 Core에서는 서비스 계층이 관계 action의 상태 변경과 transaction을 맡고, 읽기 전용 요청은 DB query나 GraphQL loader가 처리한다. GraphQL은 Pothos의 loadable Node, 요청 단위 DataLoader, Relay connection과 `usingProfile` 인증 경계를 사용한다. 공개 schema는 생성 결과물인 `apps/api/schema.graphql`과 항상 맞아야 한다.

이번 단계에서는 영구 Mute만 제공한다. 데이터 모델에는 후속 기간 지정 Mute를 위한 nullable `expires_at`을 두지만, 애플리케이션은 `null`만 기록하고 기간 관련 API를 열지 않는다.

## Goals / Non-Goals

**Goals:**

- Owner·Target Profile Mute 관계와 고유성, 조회용 index를 additive migration으로 추가한다.
- 생성·중복 수렴·해제를 transport에 묶이지 않는 Core action으로 제공한다.
- 현재 selected Profile 기준의 적용 여부, Owner 전용 목록과 Target viewer-relative 상태를 효율적으로 조회한다.
- Local·Remote Target과 selected Profile 격리를 DB·Core·GraphQL 통합 테스트로 확인한다.
- 활성 관계를 Owner·Target·`expires_at` 조건으로 판정할 수 있는 저장 의미를 명확히 한다.
- 현재 selected Profile이 Mute한 Author의 Home 후보를 page limit 전에 제외한다.
- Repost Source가 있는 Home 후보에서 바깥 Author와 Source Author를 함께 판정한다.
- Target Profile의 직접 Post List는 Profile Mute와 무관하게 기존 표시 결과를 유지한다.
- Mute 해제와 selected Profile 전환을 새 조회 결과에 정확히 반영한다.

**Non-Goals:**

- 기간 지정 Mute 생성·만료 시각 변경, 자동 만료·정리와 만료된 관계의 자동 재활성화 정책
- Hashtag Post List API·projection과 Profile Mute 통합(`PROD-827`)
- Local Timeline의 Profile Mute 통합(`PROD-814`)
- Target Profile Post List의 Mute 전용 Collapse·reveal과 GraphQL control decision field
- 새 Notification 생성 억제 또는 기존 Notification·Read State 변경
- UI, Relay artifact와 클라이언트 cache 갱신
- ActivityPub 전달, 전체 사용자 흐름 E2E와 OpenSpec archive

## Implementation Guidance

### Current Constraints

- 관계 테이블은 `packages/core`의 Drizzle schema와 생성된 migration history에 함께 반영해야 한다. 기존 history는 수정하지 않고 새 migration만 추가한다.
- `usingProfile`은 Active Account, Membership과 selected Profile의 조회 가능 상태까지만 보장한다. Profile Mute 고유 조건인 Active·Normal Local Owner, self-target 금지와 `visibleProfileWhere`를 통과하는 Target 존재 여부는 Core action이 같은 transaction에서 검증해야 한다.
- Core의 상태 변경 action은 자신의 transaction을 소유한다. GraphQL resolver에서 transaction handle이나 데이터베이스별 중복 처리 절차를 조립하면 기존 서비스 경계가 무너진다.
- `Profile.viewerState` loader는 요청의 selected Profile에 묶여 있다. Mute loader도 같은 경계를 지키지 않으면 Target ID가 같을 때 다른 Owner의 관계를 잘못 재사용할 수 있다.
- `Profile` 객체에 Owner 전용 connection을 추가할 때 `usingProfile`만 적용하면 충분하지 않다. field의 Profile ID와 `ctx.session.profileId`가 같은지도 확인해야 한다.
- `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`은 충돌한 기존 row를 같은 ID로 반환하면서 `expires_at`을 `null`로 수렴시킬 수 있다.

### Recommended Approach

1. Core DB schema에 `profile_mute` 관계 테이블을 추가한다. 기존 관계 객체처럼 UUIDv7 식별자와 생성 시각을 사용하고, Owner·Target은 `profiles.id`를 참조한다. Profile이 물리적으로 삭제되면 관계도 정리되도록 두 foreign key에 cascade를 적용한다. `expires_at`은 timezone을 보존하는 nullable timestamp로 선언한다.
2. `(owner_profile_id, target_profile_id)` unique constraint로 중복을 막는다. Owner 목록을 안정적으로 읽을 수 있는 Owner·ID index와 Target foreign key 정리 비용을 위한 Target index를 둔다. 목록은 기존 UUIDv7 관계와 같은 ID 내림차순 cursor를 기본으로 삼는다.
3. 생성 action은 Owner와 `visibleProfileWhere`를 통과하는 Target을 검증한 뒤 insert를 시도한다. Target 검증은 Core가 소유한 같은 transaction에서 수행해 DISABLED Profile과 SUSPENDED Instance Target을 관계 저장 전에 거부한다. unique 충돌은 `onConflictDoUpdate`로 기존 row의 `expires_at`을 `null`로 바꾸고 같은 ID를 `returning()`으로 반환하는 정상적인 멱등 경로로 다룬다. Profile row나 관계 row에는 비관적 lock을 걸지 않는다.
4. 해제 action은 Owner ID와 Profile Mute 관계 ID를 함께 조건으로 사용해 정확한 관계만 삭제한다. 반복 해제는 관계가 없다는 결과로 수렴시키되, 다른 Owner의 관계가 있었는지는 드러내지 않는다.
5. 적용 여부와 목록은 공통 Core DB query helper나 transport-neutral 읽기 경계 없이 각 소비자의 query가 Owner·Target·`expires_at IS NULL` 조건을 직접 조합한다. GraphQL의 viewer-relative 조회와 Owner 목록은 selected Profile을 고정한 기존 요청 단위 loader·connection query의 JOIN을 유지한다. `ProfileMute` Node 자체를 ID로 불러올 때도 Owner 조건과 `visibleProfileWhere`를 포함해 비가시 Target, Target 및 제삼자에게 관계가 보이지 않게 한다. `PROD-825`의 Home 목록 query는 `ProfileMutes`를 JOIN 또는 correlated EXISTS로 결합해 같은 활성 관계 조건을 적용한다.
6. GraphQL에는 `ProfileMute` Node, Owner 전용 non-null `targetProfile: Profile!`, `ProfileViewerState`의 nullable Mute 관계, 현재 Profile의 Owner 전용 connection과 생성·해제 mutation을 추가한다. 비가시화된 Target의 관계는 Node와 Owner connection에서 제외하되, Owner가 보관한 `ProfileMute` global ID를 `unmuteProfile` 입력에 재사용할 수 있게 한다. 생성 mutation 입력은 concrete `Profile` global ID인 Target만 받고 해제 mutation 입력은 concrete `ProfileMute` global ID인 관계만 받으며 Owner는 session에서 정한다. 공개 schema를 다시 생성해 source와 함께 검증한다.
7. DB schema·migration, Core action과 GraphQL integration을 각각 테스트한다. 특히 Remote Target, 중복·동시 생성, self-target, 비-Local Owner, 다른 Account와 같은 Account의 다른 selected Profile, 다른 Owner 해제 시도를 포함한다. 기존 관계·상호작용·Notification이 그대로인지도 회귀 테스트로 고정한다.
8. Home 후보 query는 요청의 selected Profile을 Owner로 고정하고 `ProfileMutes`를 JOIN 또는 correlated
   `NOT EXISTS`로 결합한다. Repost Source가 있는 후보는 바깥 Author와 direct Source Author를 같은 활성
   관계 조건으로 판정한다.
9. Home 후보는 기존 Visibility·Eligibility와 구조 조건을 통과한 뒤 Profile Mute를 적용하고, 제외를 마친
   결과에 page limit과 cursor를 적용한다. Mute 후보를 가져온 뒤 애플리케이션에서 제거하는 방식은
   페이지 크기와 cursor를 왜곡하므로 사용하지 않는다.
10. `Profile.posts`는 기존 query와 `PostConnection`을 유지한다. Profile Mute 관계를 조회하거나 별도의
    Collapse 값을 만들지 않고, 기존 Visibility·Eligibility와 Repost Source 정책만 적용한다.
11. Home query는 매 요청의 selected Profile ID를 Owner 조건으로 사용한다. Mute 해제 뒤 시작한 새 요청은
    관계를 다시 읽으며, 클라이언트의 기존 connection 갱신은 `PROD-814`가 담당한다.

### Allowed Alternatives

- Owner 목록의 순서가 안정적이라면 `created_at`과 ID를 함께 쓰는 복합 cursor도 허용한다. 이 경우 cursor 조건, 역방향 pagination과 index가 같은 정렬을 따르는지 통합 테스트로 증명해야 한다.
- Home 후보의 Profile Mute 합성은 owner-scoped anti-join 또는 correlated `NOT EXISTS`로 구현할 수 있다.
  어느 방식을 사용해도 Owner·Target·`expires_at IS NULL` 조건을 query 안에서 직접 조합하고 page limit 전에
  적용해야 하며, selected Profile 격리를 테스트로 증명해야 한다.

### Known Traps

- mutation 입력으로 Owner ID를 받거나 resolver의 상위 `Profile`만 믿으면 selected Profile 격리가 뚫린다.
- 해제 query를 관계 ID와 Owner 조건 없이 실행하면 다른 Owner의 관계를 잘못 삭제하거나 관계 존재를 드러낼 수 있다.
- `ProfileMute` ID loader에 Owner 조건을 빼면 Relay Node 조회가 Target에게 관계 존재를 노출한다.
- `expires_at`을 받거나 non-null 값을 쓰는 임시 API를 추가하면 `PROD-826`의 기간 지정 계약을 앞질러 고정하게 된다.
- Mute 생성 시 Follow나 Notification을 정리하거나 목록 필터를 함께 바꾸면 `PROD-824`의 구현 경계를
  넘는다. 목록 필터는 `PROD-825`의 Post List 정책 경계에서만 적용한다.
- 생성 action에서 Target 존재만 확인하고 `visibleProfileWhere`를 빠뜨리면 비가시 Target 관계가 저장될 수 있으므로, Core transaction 안에서 Profile·Instance visibility predicate를 함께 적용한다.
- Drizzle schema만 바꾸고 migration snapshot 또는 공개 GraphQL schema를 갱신하지 않으면 CI와 실제 배포 계약이 어긋난다.
- Profile Mute를 후보 조회 뒤 애플리케이션 메모리에서 제거하면 page limit보다 적은 결과와 끊긴 cursor가
  생긴다.
- Repost의 바깥 Author만 확인하면 Mute Target의 Source가 Home에 남고, Source Author만 확인하면 Mute
  Target이 만든 Repost가 남는다.
- Target Profile의 Mute 상태를 일반 `Post` field나 connection edge에 넣으면 같은 Post의 값이 목록 문맥에
  따라 달라진다. 직접 Profile 목록에는 Mute 전용 결과를 추가하지 않는다.
- Account ID나 Target ID만으로 Mute 판정을 cache하면 같은 Account의 다른 selected Profile 결과가 섞인다.

## Risks / Trade-offs

- [nullable `expires_at`은 당장 쓰지 않는 상태를 허용한다] → 모든 v1 쓰기 경로와 테스트에서 `null`을 강제하고, non-null 입력·변경·만료 정책은 `PROD-826` 전까지 공개하지 않는다.
- [Owner·Target 전체 unique constraint는 후속 기간 지정 Mute의 저장 방식을 제한한다] → `PROD-826`은 새 이력 row를 쌓지 않고 현재 관계의 만료 시각을 갱신하거나 만료 row를 정리하는 방식을 이 제약 안에서 결정한다. 제약을 바꿔야 한다면 별도 migration 계약으로 다룬다.
- [관계 Node와 목록은 민감한 Owner 전용 정보다] → 모든 직접 조회와 connection query에 Owner를 포함하고, 같은 Account의 다른 selected Profile까지 포함한 격리 테스트를 둔다.
- [중복 생성 경쟁이나 기존 기간 row가 남아 있을 수 있다] → unique constraint를 최종 경계로 삼고 충돌 시 `onConflictDoUpdate`로 `expires_at`을 `null`로 갱신해 같은 ID와 성공 결과로 수렴한다.
- [후행 정책이 관계 조회를 대량 호출하면 N+1 또는 index 부하가 생길 수 있다] → GraphQL은 기존 요청 단위 loader·join으로 묶어 조회하고, `PROD-825` 목록 query는 개별 Core helper 호출 대신 `ProfileMutes`를 JOIN 또는 correlated EXISTS로 결합한다. 두 경로 모두 Owner·Target·`expires_at IS NULL` 조건과 관련 index를 직접 사용해 실제 목록 정책에서 검증한다.
- [Repost Source Author 판정이 후보 query를 복잡하게 만들 수 있다] → 바깥 Author와 direct Source Author를
  한 번의 owner-scoped 판정 집합으로 만들고 Content 없는 Repost·Quote를 함께 검증한다.
- [Mute 관계가 pagination 뒤에 적용되면 페이지와 cursor가 불안정해진다] → 모든 Mute 제외를 page limit
  전에 수행하고 제외 후보 사이의 다음 eligible Post로 페이지가 채워지는지 통합 테스트로 확인한다.
- [PROD-825 rollback 뒤에도 Mute 관계는 남는다] → 목록 정책 코드만 이전 동작으로 되돌리고 `PROD-824`의
  관계 데이터와 관리 API는 유지한다.

## Migration Plan

1. Drizzle schema와 새 additive migration에 테이블, foreign key, unique constraint와 index를 추가한다.
2. 빈 데이터베이스와 기존 migration history 위에서 migration을 검증한다. 기존 row를 backfill할 필요는 없다.
3. Core·GraphQL 코드를 배포하기 전에 migration이 적용되도록 기존 배포 순서를 따른다.
4. 애플리케이션 rollback이 필요하면 이전 코드를 되돌리고 새 테이블은 사용하지 않은 채 남긴다. 이미 배포된 migration을 수정하거나 운영 데이터가 든 테이블을 즉시 제거하지 않는다.
5. 테이블 제거가 필요해지면 사용 중단과 데이터 보존 여부를 확인한 별도 contract migration으로 처리한다.
6. `PROD-825`는 새 migration 없이 `PROD-824`의 관계 테이블을 소비한다. 목록 정책은 `PROD-824`가
   배포된 뒤 배포하며, rollback 시 Home 정책 코드만 되돌리고 기존 관계와 API는 보존한다.

## Open Questions

없음. v1 재-Mute는 기존 동일 pair row의 ID를 보존하고 `expires_at`을 `null`로 수렴시킨다. 기간 지정
Mute 생성, 만료 판정·정리와 이 v1 계약의 대체 여부는 `PROD-826`이 명시적으로 정한다. Hashtag Post List
runtime은 `PROD-827`, Local Timeline 통합은 `PROD-814`의 독립 책임으로 확정됐다.
