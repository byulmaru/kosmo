## Context

PROD-389는 Repost 저장부터 생성·취소, GraphQL 조회·count, Home/Profile 목록, 유니버설 UI와 Notification lifecycle까지 하나의 계약으로 통합 검증한다. Domain Gate는 `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`와 ADR 0010·0014에서 확정됐고, 구현은 10개 직접 자식과 PROD-415의 하위 presentation slice인 PROD-453으로 나뉜다.

현재 `post` table은 nullable `current_content_id`만 가지며 Repost Source나 Reply Parent 관계가 없다. core `createPost`는 Local과 ActivityPub Content Post만 생성하고 Post Tombstone service는 없다. API의 Post visibility predicate, Node, Home/Profile connection은 Repost Source eligibility를 모르며, 앱의 공용 Post list item도 Author·Content만 표시한다. Notification 기반은 단일 loose source projection과 Follow 전용 visible query/API/UI를 제공하지만 kind별 projection으로 일반화되지 않았다.

## Goals / Non-Goals

**Goals:**

- Repost와 Quote가 공유하는 direct Source 관계와 Active Repost 유일성의 저장 기반을 additive migration으로 도입한다.
- 권한·visibility·멱등성을 지키는 Repost 생성과 Post Tombstone 취소를 제공한다.
- Content 없는 Repost는 Source 접근 가능성을 자신의 eligibility에 포함하고, Content 있는 Quote는 Source와
  독립적으로 자신의 Node·Content·목록 후보를 유지한다.
- 기존 Notification projection·Node·inbox·Read·badge 경계에 Repost kind를 추가하고 실패를 source action과 격리한다.
- 각 Linear 구현 이슈가 자기 구현과 테스트를 소유하고 부모가 최종 vertical flow와 archive를 검증하게 한다.

**Non-Goals:**

- Quote 작성 action·composer, Mentioned Profiles Repost, Post Media와 ActivityPub Repost/Quote ingress·delivery
- 별도 Post Kind, Repost table, Quote Source, GraphQL concrete Post subtype
- Notification retry/outbox/backfill·범용 cleanup worker, 공통 Post Action Bar surface rollout
- 기존 Notification 기반이나 Post list/pagination 체계의 범용 재설계

## Implementation Guidance

### Current Constraints

- `Posts`와 `PostContents`는 서로의 nullable foreign key를 사용해 content를 transaction 안에서 연결한다. self-reference를 추가할 때 Drizzle의 순환 column typing과 migration snapshot을 함께 검증해야 한다.
- 기존 `createPost` caller는 Local GraphQL content creation과 ActivityPub Note ingestion뿐이며 `content` non-null 반환을 기대한다. 단순히 모든 반환을 nullable로 넓히면 기존 caller contract가 불필요하게 약해진다.
- Source 접근 실패는 nullable 관계 field의 결과이며 Content 있는 Quote 자체의 eligibility를 바꾸지 않는다.
  Content 없는 Repost만 직접 Source가 viewer 기준으로 조회 가능해야 한다.
- Node/Home/Profile/Bookmark가 공유하는 현재 Post visibility predicate는 Post 자체를 판정한다. Source 조건을
  전역 predicate에 추가하면 Quote와 Quote Content까지 잘못 숨기므로 구조별 조건을 분리해야 한다.
- Repost count는 viewer-independent지만 Post Node와 `viewerRepost`는 viewer-dependent다. viewer의 block/mute 결과를 count에 섞으면 동일 Post의 count가 viewer마다 달라진다.
- Notification connection/count/read와 client row는 Follow source에 하드코딩되어 있다. Repost를 join 하나만 덧붙이면 kind discriminator와 limit-before-filter가 어긋날 수 있다.
- Home/Profile은 공용 Post list item fragment를 쓰지만 Post detail은 별도 fragment다. PROD-415는 목록 연결을 소유하고 detail/action surface 조립은 관련 이슈 경계를 존중해야 한다.

### Recommended Approach

1. PROD-394에서 nullable `repost_source_id` self-reference와 Active contentless Repost용 partial unique index를 추가하고 migration·snapshot·DB 검증을 완료한다. 기존 `createPost`의 contentful Local/ActivityPub 계약과 non-null Content 반환은 변경하지 않는다.
2. PROD-401은 실제 caller와 함께 전용 public Repost action을 처음 추가하고 actor 권한, Source visibility/eligibility, derived visibility와 duplicate/concurrent idempotency를 하나의 transaction 경계에서 소유한다. 같은 Author/Source unique conflict는 기존 Active Repost를 다시 조회해 성공 결과로 정규화한다. Quote Source 연결은 실제 Quote 작성 action이 생기는 후속 작업에서 소유한다.
3. PROD-402·403은 direct `repostSource`와 batched count/selected Profile relation loader를 추가한다. viewer-independent count query와 viewer-relative Node loader를 분리한다.
4. Post Node와 목록 query는 Content 없는 Repost에만 direct Source visibility/eligibility를 적용하고 hidden
   Source Repost 후보를 page limit 전에 제거한다. Quote는 자신의 visibility/eligibility로 반환하며 nullable
   `repostSource`는 direct Source를 독립 조회해 unavailable이면 `null`로 정규화한다. Source link는 생성 때
   정해진 direct relation을 그대로 유지하고 flatten하지 않는다.
5. PROD-411은 Author와 Active 상태를 한 transaction에서 확인해 Post를 Tombstone으로 전이하고 최초 `deletedAt`과 `repostSourceId`를 보존한다. 일반 Post 삭제 경계를 재사용하되 이 slice는 Repost 취소·멱등성·유일성 해제를 검증한다.
6. PROD-453은 production fragment 형태를 따르는 Relay fixture/Storybook으로 Repost·Quote presentation과 mock navigation을 먼저 검증한다. PROD-415는 공용 list item fragment에 결과를 연결하고, PROD-414는 별도 Repost action fragment/mutations와 normalized payload로 actor Store를 갱신한다.
7. PROD-412는 기존 Notification table에 `REPOST` kind를 추가하고 source-only create 경계에서 Recipient·Related Profile·Related Post를 파생한다. kind별 visible projection을 connection/count/Node/Read에서 공통 조립하고, client는 concrete inline fragment로 Source Post 이동과 Read/cache를 처리한다.
8. PROD-416은 Repost Tombstone commit 뒤 같은 request에서 idempotent cleanup을 await하고 오류를 catch한다. 남은 row는 Active pure-Repost 구조와 Recipient 기준 관계 visibility를 검증하는 predicate로 모든 API surface에서 숨긴다.

### Allowed Alternatives

- Content 없는 Repost의 direct Source 접근 조건은 alias 가능한 SQL helper, query builder fragment 또는
  동등한 set-based query로 캡슐화할 수 있다.
- Notification mixed-kind projection은 kind별 `UNION ALL` 또는 nullable join과 discriminator별 predicate로 구성할 수 있다. 어느 방식이든 filter-before-limit, concrete typename route와 Recipient 기준 visibility를 만족해야 한다.
- Repost·Quote Source preview는 공용 leaf fragment component로 분리하거나 list item 안에 유지할 수 있다. 실제 재사용 경계와 중첩 Link 회피가 확인되는 쪽을 선택한다.
- PROD-401의 Repost 정책 검증은 전용 action의 transaction 경계에 둔다. caller 없는 저수준 Repost insert helper나 기존 `createPost`의 nullable overload를 미리 추가하지 않는다.

### Known Traps

- `content === null`만으로 Repost를 판별하지 않는다. Repost는 non-null Repost Source와 no Reply Parent까지 함께 만족해야 한다.
- Repost Source를 Source의 Source로 평탄화하거나 source snapshot을 저장하지 않는다.
- self-reference 거부만으로 Source 유효성 검증을 끝내지 않는다. 생성 시 Content 없는 Repost Source,
  Tombstone과 권한 없는 Source를 거부하고, 조회 시 Repost와 Quote의 unavailable Source 결과를 구분한다.
- 전역 Post/PostContent loader에 Source 접근 조건을 적용해 Source가 unavailable인 Quote와 자체 Content를
  함께 숨기지 않는다.
- count에 viewer block/mute를 적용하거나 resolver별 count query를 실행해 viewer-dependent 값 또는 N+1을 만들지 않는다.
- hidden Repost/Notification을 page limit 뒤 application filtering해 짧은 page와 cursor 누락을 만들지 않는다.
- Tombstone에서 `repost_source_id`를 null로 만들거나 Source Tombstone에 cascade delete를 적용하지 않는다.
- Notification을 Repost transaction 안에 넣거나 fire-and-forget으로 실행해 rollback 결합 또는 관측 불가능한 실패를 만들지 않는다.
- client가 raw object를 Relay fragment key로 cast하거나 route query에 presentation scalar를 중복 나열하지 않는다.
- Source preview Link를 전체 Post Link 안에 중첩하지 않는다.

## Risks / Trade-offs

- [Content 없는 Repost의 Source join 비용] → direct Source index와 실행 계획을 검증하고 Node batch/list
  query에서 page limit 전에 set-based로 평가한다.
- [nullable self-reference와 partial index의 migration lock] → additive migration으로 분류하고 실제 기존 schema와 migration test에서 catalog, lock 범위와 기존 row 보존을 확인한다.
- [동시 Source Tombstone과 Repost 생성] → 명시적 row lock을 추가하지 않고 transaction 시점의 Source 검증과 Post eligibility를 사용한다. 이후 Source가 Tombstone이면 생성된 Repost는 조회 후보에서 사라지며 관계는 보존된다.
- [Notification 기반 change와 archive 순서] → `add-in-app-notifications`의 실제 schema/API 기반이 완료된 뒤 PROD-412/416을 구현하고, 그 change를 authority로 사용하지 않으며 canonical·Linear 계약을 독립 대조한다.
- [여러 PR 사이 schema drift] → 각 child PR에서 공유 OpenSpec task와 선행 issue를 명시하고, 부모 PROD-389가 최종 schema/Relay/E2E 정합성을 검증한다.
- [UI action의 실제 surface 부재] → PROD-414는 독립 component/integration을 완료로 삼고 실제 공통 Action Bar rollout은 PROD-432에 남긴다.

## Migration Plan

1. PROD-394에서 nullable `repost_source_id`와 partial unique index를 포함한 expand migration, Drizzle schema·snapshot과 DB migration tests를 배포한다. 기존 workload와 contentful `createPost` 계약은 새 column을 비워 둔 채 계속 동작한다.
2. PROD-401·402·403에서 생성, direct Source, count와 viewer relation API를 추가하고 PROD-411에서 Tombstone 취소를 연결한다.
3. PROD-430에서 Home/Profile candidate query를 전환하고 PROD-453·415·414에서 presentation, 목록 연결과 action을 단계적으로 제공한다.
4. Notification 기반 선행 이슈가 완료된 뒤 PROD-412에서 enum/API/inbox를 확장하고 PROD-416에서 Tombstone cleanup을 연결한다.
5. PROD-389가 모든 child 결과를 연결한 vertical flow, canonical/OpenSpec 정합성과 strict validation을 확인한 뒤 archive한다.

코드 rollback은 nullable column과 unused enum을 남긴 채 이전 workload로 되돌릴 수 있다. 이미 적용된 migration directory나 SQL을 수정·삭제하지 않으며, schema 수정이 필요하면 새 forward migration을 만든다. Repost row가 생성된 뒤에는 column을 제거하는 contract migration을 이 change에 포함하지 않는다.

## Open Questions

없음.
