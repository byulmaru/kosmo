## Context

Profile Mute의 제품 의미와 UI 계약은 기준 문서와 `PROD-814`에 이미 정리되어 있다. 다만 현재 저장소에는 관계를 보관할 테이블도, 이를 다루는 Core·GraphQL 경계도 없다. `PROD-824`는 후행 콘텐츠 정책(`PROD-825`)과 UI·Relay 통합(`PROD-814`)이 함께 쓸 기반을 마련한다.

현재 Core에서는 서비스 계층이 관계 action의 상태 변경과 transaction을 맡고, 읽기 전용 요청은 DB query나 GraphQL loader가 처리한다. GraphQL은 Pothos의 loadable Node, 요청 단위 DataLoader, Relay connection과 `usingProfile` 인증 경계를 사용한다. 공개 schema는 생성 결과물인 `apps/api/schema.graphql`과 항상 맞아야 한다.

이번 단계에서는 영구 Mute만 제공한다. 데이터 모델에는 후속 기간 지정 Mute를 위한 nullable `expires_at`을 두지만, 애플리케이션은 `null`만 기록하고 기간 관련 API를 열지 않는다.

## Goals / Non-Goals

**Goals:**

- Owner·Target Profile Mute 관계와 고유성, 조회용 index를 additive migration으로 추가한다.
- 생성·중복 수렴·해제를 transport에 묶이지 않는 Core action으로 제공한다.
- 현재 selected Profile 기준의 적용 여부, Owner 전용 목록과 Target viewer-relative 상태를 효율적으로 조회한다.
- Local·Remote Target과 selected Profile 격리를 DB·Core·GraphQL 통합 테스트로 확인한다.
- 후행 정책이 재사용할 수 있는 관계 판정 경계를 남긴다.

**Non-Goals:**

- 기간 입력, 만료 시각 변경, 자동 만료와 만료된 관계의 재활성화 정책
- Home·Hashtag·Target Profile Post List의 Exclude·Collapse 적용
- 새 Notification 생성 억제 또는 기존 Notification·Read State 변경
- UI, Relay artifact와 클라이언트 cache 갱신
- ActivityPub 전달, 전체 사용자 흐름 E2E와 OpenSpec archive

## Implementation Guidance

### Current Constraints

- 관계 테이블은 `packages/core`의 Drizzle schema와 생성된 migration history에 함께 반영해야 한다. 기존 history는 수정하지 않고 새 migration만 추가한다.
- `usingProfile`은 Active Account, Membership과 selected Profile의 조회 가능 상태까지만 보장한다. Profile Mute 고유 조건인 Active·Normal Local Owner, self-target 금지와 Target 존재 여부는 Core action이 검증해야 한다.
- Core의 상태 변경 action은 자신의 transaction을 소유한다. GraphQL resolver에서 transaction handle이나 데이터베이스별 중복 처리 절차를 조립하면 기존 서비스 경계가 무너진다.
- `Profile.viewerState` loader는 요청의 selected Profile에 묶여 있다. Mute loader도 같은 경계를 지키지 않으면 Target ID가 같을 때 다른 Owner의 관계를 잘못 재사용할 수 있다.
- `Profile` 객체에 Owner 전용 connection을 추가할 때 `usingProfile`만 적용하면 충분하지 않다. field의 Profile ID와 `ctx.session.profileId`가 같은지도 확인해야 한다.
- `INSERT ... ON CONFLICT DO NOTHING RETURNING`은 충돌한 row를 반환하지 않는다. 중복 생성도 기존 관계를 반환해야 하므로 충돌 뒤 조회 경계가 필요하다.

### Recommended Approach

1. Core DB schema에 `profile_mutes` 관계 테이블을 추가한다. 기존 관계 객체처럼 UUIDv7 식별자와 생성 시각을 사용하고, Owner·Target은 `profiles.id`를 참조한다. Profile이 물리적으로 삭제되면 관계도 정리되도록 두 foreign key에 cascade를 적용한다. `expires_at`은 timezone을 보존하는 nullable timestamp로 선언한다.
2. `(owner_profile_id, target_profile_id)` unique constraint로 중복을 막는다. Owner 목록을 안정적으로 읽을 수 있는 Owner·ID index와 Target foreign key 정리 비용을 위한 Target index를 둔다. 목록은 기존 UUIDv7 관계와 같은 ID 내림차순 cursor를 기본으로 삼는다.
3. 생성 action은 Owner와 Target을 검증한 뒤 insert를 시도한다. unique 충돌은 정상적인 멱등 경로로 다루고 같은 transaction에서 기존 row를 다시 읽어 반환한다. Profile row나 관계 row에는 비관적 lock을 걸지 않는다.
4. 해제 action은 Owner ID와 Target ID를 함께 조건으로 사용해 정확한 관계만 삭제한다. 반복 해제는 관계가 없다는 결과로 수렴시키되, 다른 Owner의 관계가 있었는지는 드러내지 않는다.
5. 적용 여부와 목록은 읽기 전용 query 경계로 구현한다. GraphQL의 viewer-relative 조회는 요청 단위 loader에 selected Profile을 고정하고 Target ID를 batch key로 삼는다. `ProfileMute` Node 자체를 ID로 불러올 때도 Owner 조건을 포함해 Target이나 제삼자에게 관계가 보이지 않게 한다.
6. GraphQL에는 `ProfileMute` Node, `ProfileViewerState`의 nullable Mute 관계, 현재 Profile의 Owner 전용 connection과 생성·해제 mutation을 추가한다. mutation 입력은 concrete `Profile` global ID인 Target만 받고 Owner는 session에서 정한다. 공개 schema를 다시 생성해 source와 함께 검증한다.
7. DB schema·migration, Core action과 GraphQL integration을 각각 테스트한다. 특히 Remote Target, 중복·동시 생성, self-target, 비-Local Owner, 다른 Account와 같은 Account의 다른 selected Profile, 다른 Owner 해제 시도를 포함한다. 기존 관계·상호작용·Notification이 그대로인지도 회귀 테스트로 고정한다.

### Allowed Alternatives

- Owner 목록의 순서가 안정적이라면 `created_at`과 ID를 함께 쓰는 복합 cursor도 허용한다. 이 경우 cursor 조건, 역방향 pagination과 index가 같은 정렬을 따르는지 통합 테스트로 증명해야 한다.
- 읽기 경계는 요청 단위 loader와 재사용 가능한 Core DB query helper 중 어느 쪽에 둘 수 있다. 어느 방식을 택해도 Owner 조건을 query 자체에 포함하고 후행 정책이 GraphQL에 의존하지 않게 해야 한다.

### Known Traps

- mutation 입력으로 Owner ID를 받거나 resolver의 상위 `Profile`만 믿으면 selected Profile 격리가 뚫린다.
- 해제 query를 Target ID만으로 실행하면 다른 Owner의 관계까지 삭제할 수 있다.
- `ProfileMute` ID loader에 Owner 조건을 빼면 Relay Node 조회가 Target에게 관계 존재를 노출한다.
- `expires_at`을 받거나 non-null 값을 쓰는 임시 API를 추가하면 `PROD-826`의 기간 지정 계약을 앞질러 고정하게 된다.
- Mute 생성 시 Follow나 Notification을 정리하거나 목록 필터를 함께 바꾸면 `PROD-824`의 구현 경계를 넘는다.
- Drizzle schema만 바꾸고 migration snapshot 또는 공개 GraphQL schema를 갱신하지 않으면 CI와 실제 배포 계약이 어긋난다.

## Risks / Trade-offs

- [nullable `expires_at`은 당장 쓰지 않는 상태를 허용한다] → 모든 v1 쓰기 경로와 테스트에서 `null`을 강제하고, non-null 입력·변경·만료 정책은 `PROD-826` 전까지 공개하지 않는다.
- [Owner·Target 전체 unique constraint는 후속 기간 지정 Mute의 저장 방식을 제한한다] → `PROD-826`은 새 이력 row를 쌓지 않고 현재 관계의 만료 시각을 갱신하거나 만료 row를 정리하는 방식을 이 제약 안에서 결정한다. 제약을 바꿔야 한다면 별도 migration 계약으로 다룬다.
- [관계 Node와 목록은 민감한 Owner 전용 정보다] → 모든 직접 조회와 connection query에 Owner를 포함하고, 같은 Account의 다른 selected Profile까지 포함한 격리 테스트를 둔다.
- [중복 생성 경쟁에서 insert 결과가 비어 있을 수 있다] → unique constraint를 최종 경계로 삼고 충돌 뒤 기존 row를 읽어 동일 결과로 수렴한다.
- [후행 정책이 관계 조회를 대량 호출하면 N+1 또는 index 부하가 생길 수 있다] → Target 묶음 조회가 가능한 query 형태와 Owner 중심 index를 제공하고, 실제 목록 정책의 결합 방식은 `PROD-825`에서 검증한다.

## Migration Plan

1. Drizzle schema와 새 additive migration에 테이블, foreign key, unique constraint와 index를 추가한다.
2. 빈 데이터베이스와 기존 migration history 위에서 migration을 검증한다. 기존 row를 backfill할 필요는 없다.
3. Core·GraphQL 코드를 배포하기 전에 migration이 적용되도록 기존 배포 순서를 따른다.
4. 애플리케이션 rollback이 필요하면 이전 코드를 되돌리고 새 테이블은 사용하지 않은 채 남긴다. 이미 배포된 migration을 수정하거나 운영 데이터가 든 테이블을 즉시 제거하지 않는다.
5. 테이블 제거가 필요해지면 사용 중단과 데이터 보존 여부를 확인한 별도 contract migration으로 처리한다.

## Open Questions

없음. 기간 지정 입력·변경·만료와 non-null `expires_at`의 처리 방식은 `PROD-826`이 정한다.
