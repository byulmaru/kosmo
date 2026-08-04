## Context

현재 `PostComposer`는 React Native `TextInput`의 Plain Text와 Media state를 관리하고, 같은 컴포넌트를
`ReplyComposerSurface`가 `replyParentId`와 함께 재사용한다. GraphQL `createPost`는 `bodyText`를 서버에서 V1
PostContent document로 변환하고 `packages/core/services/post.ts`의 transaction에서 Post와 첫 PostContent를
저장하지만 Mentioned Profile 입력이나 관계 테이블은 없다.

Profile 검색은 로그인 전용 `searchProfiles` connection으로 이미 local/저장 remote 부분 검색과 명시적 remote
qualified handle materialization을 제공한다. 조회 visibility predicate는 현재 API에 있으며, Mentioned Profile
ID의 commit-time 검증도 같은 staged visibility를 사용해야 한다. 작성 서버는 body text를 다시 파싱하거나
network lookup을 해서는 안 된다.

이 change는 PROD-652 하나가 일반 Post·Reply UI, GraphQL 입력, core transaction, migration과 해당 검증을
소유한다. PROD-462의 `DIRECT`, PROD-340의 typed Mention node와 PROD-359의 remote recipient는 별도 생명주기를
유지한다.

## Goals / Non-Goals

**Goals:**

- 하나의 universal Composer에서 local/remote Profile을 검색·구분·선택하고 `relativeHandle` Plain Text와 stable
  Profile ID를 함께 관리한다.
- 직접 입력한 text와 명시적 선택을 구분하면서 편집·삭제·context 전환 뒤 stale ID가 제출되지 않게 한다.
- `CreatePostInput`과 core transaction을 additive하게 확장해 Post Mentioned Profile 관계를 원자적으로 저장한다.
- 일반 Post·Reply, Web·Native, Media와 actor별 Relay Environment의 기존 경계를 보존한다.

**Non-Goals:**

- `DIRECT` 노출·최소 recipient·조회 authorization
- ProseMirror Mention node, rich-text editor 또는 PostContent revision-owned Mention relation
- ActivityPub Mention/recipient projection·materialization·delivery
- Mention Notification, DM/group audience, 기존 text backfill과 Post 수정 UI

## Implementation Guidance

### Current Constraints

- `PostComposer`는 `onChangeText`로 완성된 문자열만 받는다. 선택된 mention을 단순 문자열 재검색으로 복구하면
  사용자가 직접 입력한 같은 text까지 관계로 승격하거나, token 일부 편집 뒤 stale ID를 유지한다.
- 현재 `TextInput` selection을 별도 state로 보존하지 않으므로 cursor 기준 `@` token 계산과 선택 뒤 cursor
  복원이 필요하다. selected Profile·Reply Parent·Relay Environment 전환은 기존 generation/remount 경계와
  함께 동작해야 한다.
- `searchProfiles`는 Relay connection이지만 Composer suggestion은 현재 token의 첫 제한 page만 필요하다. route의
  사람 검색용 `ProfileListItem`은 navigation·Follow action을 포함하므로 선택 option으로 재사용하기에 맞지 않는다.
- concrete global ID decode만으로 Profile의 현재 visibility는 보장되지 않는다. core transaction 안에서 Profile과
  Instance를 다시 조회해야 한다.
- Profile visibility predicate를 API와 core가 별도로 복제하면 staged visibility 종료 시 두 write/read 경계가
  어긋날 수 있다. server-only 공용 predicate가 필요하다.
- 기존 `PostContent` V1은 paragraph/text/hard-break/link/Media만 지원한다. 이번 mention은 Plain Text projection과
  Post-level relation이며 document schema를 확장하지 않는다.

### Recommended Approach

1. `post_mention`을 additive join table로 만들고 surrogate UUIDv7 ID, `post_id`, `profile_id`와 생성 시각을 둔다.
   두 foreign key와 `(post_id, profile_id)` unique constraint, future recipient lookup을 위한 `profile_id` index를
   사용한다. existing Post text는 backfill하지 않는다.
2. 현재 `visibleProfileWhere`를 server-only core export로 옮기고 API 경계는 이를 재사용한다. core `createPost`의
   Local input에 optional Mentioned Profile DB ID 목록을 추가해, transaction 안에서 중복을 먼저 거부하고 한 번의
   Profile/Instance query로 모든 ID가 현재 staged visibility를 통과하는지 확인한다. 검증 성공 뒤 Post와
   PostContent를 만든 같은 transaction에서 관계를 bulk insert한다.
3. GraphQL은 optional `globalIDList({ for: Profile })` 형태의 `mentionedProfileIds`를 노출하고 decoded DB ID만 core에
   전달한다. 생략·빈 목록은 동일하게 기존 작성으로 처리하고, wrong typename·중복·없는/숨긴 Profile은 field가
   `mentionedProfileIds`인 안전한 validation 오류로 수렴시킨다.
4. Composer에는 본문, collapsed selection과 선택으로 만든 mention occurrence를 함께 처리하는 작은 순수 state
   경계를 둔다. occurrence는 Profile ID, 삽입 당시 `relativeHandle`과 현재 text range를 가진다. `onChangeText`
   이전·이후의 단일 edit 범위를 계산해 edit 앞 occurrence는 offset을 이동하고, edit와 겹치거나 저장 text와 더
   이상 일치하지 않는 occurrence는 제거한다. 제출 ID는 남은 occurrence의 Profile ID를 안정적으로 중복 제거해
   만든다.
5. cursor가 collapsed 상태이고 현재 whitespace-delimited token이 `@`로 시작할 때만 suggestion context를 연다.
   검색 가능한 handle 부분이 생기면 colocated Relay query로 `searchProfiles(first: 20)`를 요청한다. query child는
   loading/error boundary로 격리해 editor·Media·mention state를 suspend하거나 잃지 않게 한다. 선택 시 현재 token
   전체를 `relativeHandle`로 교체하고 occurrence를 추가한 뒤 cursor를 삽입 text 끝으로 복원한다.
6. suggestion row는 navigation·Follow action이 없는 전용 option fragment로 Avatar, displayName,
   `relativeHandle`만 읽는다. Web은 listbox/option과 roving focus, Arrow/Home/End/Enter/Escape를 제공하고 Native는
   Pressable option과 screen-reader name/state를 제공한다. 결과는 editor surface의 기존 Reply 중앙 scroll과
   modal focus trap 안에 둔다.
7. 기존 `PostComposer`의 context key/remount와 mutation generation guard에 mention query/state를 포함한다.
   성공 시 body·Media와 함께 occurrence를 초기화하고, 실패 시 모두 유지한다. Reply는 같은 컴포넌트에서
   `replyParentId`와 `mentionedProfileIds`를 함께 제출하며 별도 query/mutation/state를 만들지 않는다.

### Allowed Alternatives

- occurrence range 갱신은 위 단일-edit diff reducer 대신 React Native가 제공하는 selection/change event를 조합한
  동등한 순수 reducer로 구현할 수 있다. 단, 직접 입력 text를 선택 identity로 승격하지 않고 부분 편집·paste·undo
  뒤 stale ID를 제거해야 한다.
- Relay suggestion query는 editor를 suspend하지 않고 loading·empty·error를 독립 표시한다면 `fetchQuery`
  observable 또는 preloaded query child를 사용할 수 있다. raw network `fetch`와 route 검색 state 재사용은 허용하지
  않는다.
- join table은 specs의 foreign key·unique·원자성·조회 비용을 보존한다면 Drizzle이 생성하는 동등한 index 이름을
  사용할 수 있다.

### Known Traps

- body에서 `@handle`을 정규식으로 찾아 서버나 client가 Profile ID를 재구성하면 같은 handle/instance를 구분하지
  못하고 직접 입력 text가 권한 관계로 승격된다.
- mention text를 PostContent Mention node로 저장하거나 `post_content`별 relation으로 만들면 PROD-340의 별도
  revision 계약과 이번 Post-level 관계 경계를 섞는다.
- Profile global ID의 typename만 검사하고 current visibility query를 생략하면 삭제·정지·Instance 정지 이후의 stale
  선택을 저장할 수 있다.
- search 결과를 body text와 같은 state로만 관리하면 늦은 이전 query가 새 token, Parent 또는 actor 결과를 덮을 수
  있다.
- `ProfileListItem`을 option으로 재사용하면 선택 대신 route 이동/Follow action을 노출하고 modal 작성 상태를 잃을
  수 있다.
- `DIRECT` 최소 cardinality, viewer predicate, ActivityPub audience 또는 Mention Notification을 현재 relation이
  존재한다는 이유만으로 함께 구현하면 이슈·change 경계를 위반한다.

## Risks / Trade-offs

- [Plain Text range는 rich-text identity보다 편집에 취약함] → 선택 occurrence를 range로 추적하고 겹치는 edit에서
  보수적으로 관계를 제거한다. PROD-340의 typed node가 도입되기 전에는 관계 유지보다 stale identity 방지를
  우선한다.
- [검색 query가 빠른 입력마다 요청될 수 있음] → 현재 token만 요청하고 Relay가 이전 observable을 해제하도록 하며,
  필요하면 결과 지연 없이 짧은 deferred/debounce 경계를 사용한다.
- [관계 수에 제품 상한이 없음] → input 중복과 request/parser의 기존 비용 제한을 적용하고 bulk query/insert를
  사용한다. 새 제품 상한은 PROD-652 근거 없이 추가하지 않는다.
- [staged Profile visibility가 최종 moderation보다 넓음] → exact/partial search와 같은 공용 predicate를 사용하고
  ADR 0017 종료 시 read와 mention write 검증을 함께 전환한다.
- [old client는 relation을 만들 수 없음] → optional input으로 호환성을 유지하며 text를 추론·backfill하지 않는다.

## Migration Plan

1. Drizzle schema에 additive `post_mention` table을 추가하고 timestamped migration/snapshot을 생성한다.
2. 빈 database migration, 기존 migration history 재실행과 대표 schema 검증을 통과시킨다. 기존 Post text backfill은
   실행하지 않는다.
3. core와 API를 배포한 뒤 optional input을 사용하는 universal app을 배포한다. 이전 앱은 필드를 생략해 기존
   Post·Reply를 계속 작성한다.
4. application rollback은 새 입력과 write를 사용하지 않는 이전 코드로 되돌린다. additive table은 그대로 둘 수
   있으며, 이미 적용한 production migration을 역실행하지 않는다. table 제거가 필요하면 별도 contract migration로
   진행한다.

## Open Questions

없음.
