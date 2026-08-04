## Context

PROD-652의 일반 Post·Reply Profile mention 계약, 현재 Post/Profile/PostContent canonical 문서, Reply Composer
디자인과 staged Profile 검색 visibility를 구현 전에 독립 대조한 결과를 기록한다. 아래 결정은 `DIRECT`,
ActivityPub typed Mention/recipient와 Mention Notification을 현재 구현 범위로 확장하지 않는다.

## Decision Records

### 명시적 Profile 선택만 Mentioned Profile 관계를 만든다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-652`
- Status: Active
- Context / Problem: 같은 `@handle` 문자열은 local/remote 또는 서로 다른 Instance의 Profile을 유일하게 식별하지
  못하며, 사용자가 text만 입력했을 때 어떤 identity를 의도했는지 확정할 수 없다.
- Decision Outcome: Composer 검색 결과에서 사용자가 명시적으로 선택한 Profile ID만 Post Mentioned Profile
  관계가 된다. 서버와 client는 body 문자열을 파싱해 identity를 추론하지 않는다.
- Alternatives Considered: bare handle exact lookup과 body 정규식 추론은 동일 handle 충돌과 직접 입력 text의
  권한 관계 승격 위험 때문에 제외했다. remote actor URI를 body에 저장하는 방식은 현재 Plain Text 계약과
  ActivityPub 후속 범위를 침범해 제외했다.
- Consequences: 선택하지 않은 mention-looking text는 Plain Text로만 남는다. 기존 Post text는 관계로 backfill하지
  않는다.
- Confirmation / Follow-up: 직접 입력, 동일 handle local/remote 후보, stale/없는 ID와 transaction rollback을
  core/API/client에서 각각 검증한다.

### Plain Text는 relativeHandle을 사용하고 identity는 Profile ID로 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/design/reply-composer.md`, `PROD-652`
- Status: Active
- Context / Problem: 작성 본문은 Plain Text 호환성을 유지해야 하지만 같은 handle 후보의 domain 차이도 사용자에게
  보여야 하고, 표시 text를 stable identity로 사용할 수는 없다.
- Decision Outcome: 선택 시 configured local Profile은 `@handle`, 그 밖의 Profile은 `@handle@domain`인 기존
  `relativeHandle`을 본문에 삽입한다. 관계 identity와 제출값은 concrete Profile global ID/DB ID를 사용한다.
- Alternatives Considered: 모든 Profile에 qualified handle을 쓰면 local 표시 계약을 깨고, bare handle만 쓰면
  remote/local 후보를 본문에서 구분할 수 없다. document Mention node는 PROD-340의 별도 계약이므로 제외했다.
- Consequences: 사용자는 기존 Profile 표시 문자열을 본문에서 보며, text를 편집해 선택 occurrence의 의미가
  깨지면 관계가 보수적으로 제거된다.
- Confirmation / Follow-up: local/remote `relativeHandle` 삽입, 직접 입력 비승격과 500자 길이 계산을 검증한다.

### Post-level Mentioned Profile 관계와 후속 계약을 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `PROD-652`,
  `PROD-340`, `PROD-359`, `PROD-462`
- Status: Active
- Context / Problem: 현재 canonical 관계는 Post가 소유하지만, 후속 이슈는 revision-owned typed Mention과 remote
  audience recipient, `DIRECT` authorization을 각각 별도 생명주기로 정의한다.
- Decision Outcome: 이번 change는 Local 일반 Post·Reply의 Post-level Mentioned Profile 관계 최초 저장만
  구현한다. PostContent V1 schema, `DIRECT` cardinality/조회, ActivityPub projection과 Notification은 변경하지
  않는다.
- Alternatives Considered: PostContent relation을 먼저 만들면 현재 canonical `Post.MentionedProfile`과
  PROD-652의 재사용 계약을 바꿔야 한다. `DIRECT`까지 함께 구현하면 이번 사이클과 Backlog의 독립 승인·검증
  생명주기를 결합하므로 제외했다.
- Consequences: 현재 relation은 Plain Text 작성 selection의 canonical Post 관계지만 typed document 의미나
  viewer authorization을 단독으로 만들지 않는다. 후속 이슈는 최신 canonical authority를 다시 확인해야 한다.
- Confirmation / Follow-up: ActivityPub serializer, Visibility와 Notification에 새 side effect가 없는지 회귀
  검증한다.

### CreatePostInput은 optional mentionedProfileIds를 사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-652`
- Status: Active
- Context / Problem: existing `createPost`가 일반 Post와 Reply의 공통 entrypoint이므로 old client 호환성을 유지하며
  선택 identity 목록을 전달할 additive API shape가 필요하다.
- Decision Outcome: `CreatePostInput.mentionedProfileIds`를 optional `[ID!]` list로 추가하고 Pothos
  `globalIDList({ for: Profile })`로 concrete typename을 제한한다. 생략·빈 목록은 기존 작성과 같고, core에는
  decoded DB ID만 전달한다.
- Alternatives Considered: `{ profileId, text }` nested input은 body와 text를 중복 source로 만든다. 별도
  `createMentionedPost` mutation은 일반 Post·Reply transaction과 composer를 복제한다. required list는 old
  client를 깨뜨린다.
- Consequences: 공개 GraphQL input이 additive하게 확장된다. wrong typename은 GraphQL input 경계에서, 중복과
  current visibility는 core transaction에서 validation 오류로 처리한다.
- Confirmation / Follow-up: committed SDL, wrong typename, omitted/empty/duplicate/hidden ID와 기존 client input을
  API integration으로 검증한다.

### post_mention은 unique Post/Profile join relation으로 저장한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `PROD-652`
- Status: Active
- Context / Problem: canonical Post-to-Profile N:N 관계는 foreign key 무결성, 중복 방지와 향후 Profile 기준 recipient
  조회를 제공하면서 PostContent document의 두 번째 source가 되지 않아야 한다.
- Decision Outcome: additive `post_mention` table에 surrogate UUIDv7 ID, `post_id`, `profile_id`, 생성 시각을
  저장하고 두 foreign key, `(post_id, profile_id)` unique constraint와 `profile_id` 조회 index를 둔다. 관계는
  Post와 첫 PostContent를 만드는 core transaction에서 bulk insert한다.
- Alternatives Considered: Post의 Profile ID JSON 배열은 foreign key와 Profile 기준 조회를 잃는다. PostContent
  document Profile ID는 PROD-340의 revision 경계를 앞당긴다. text만 저장하면 identity 무결성이 없다.
- Consequences: migration은 additive하고 backfill이 없다. 동일 Profile text occurrence가 여러 개여도 relation은
  하나이며, relation 저장 실패는 작성 전체를 rollback한다.
- Confirmation / Follow-up: migration snapshot, foreign key·unique·index, 중복 insert와 rollback을 PostgreSQL에서
  검증한다.

### Mentioned Profile commit 검증은 현재 searchProfiles visibility를 재사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`,
  `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/domain/objects/post.md`, `PROD-652`
- Status: Active
- Context / Problem: 사용자가 검색 뒤 제출하기 전 Profile/Instance 상태가 바뀔 수 있고, global ID decode만으로
  현재 노출 가능성을 보장할 수 없다.
- Decision Outcome: core transaction은 exact/partial `searchProfiles`와 같은 Active Profile·non-Suspended
  Instance predicate로 모든 ID를 한 번 더 검증하고, 어떤 ID가 실패했는지 노출하지 않는 validation 오류로
  수렴시킨다. ID 검증은 network lookup, refresh 또는 materialization을 하지 않는다.
- Alternatives Considered: client 검색 결과를 신뢰하면 stale state를 저장한다. 최종 Domain Limit/Profile Domain
  Block 정책을 이번 write에만 선행 구현하면 exact/partial lookup과 다른 visibility를 만든다.
- Consequences: 현재 staged visibility의 알려진 범위를 공유한다. ADR 0017이 종료될 때 Profile read와 mention
  write predicate를 같은 rollout에서 전환해야 한다.
- Confirmation / Follow-up: 공용 server predicate parity, inactive Profile, Suspended Instance, missing ID와
  zero-network 검증을 추가한다.

### 일반 Post와 Reply는 하나의 mention composer state를 재사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/reply-composer.md`, `docs/domain/objects/post.md`, `PROD-652`
- Status: Active
- Context / Problem: Reply surface는 기존 `PostComposer`를 Parent context로 재사용하며, 별도 mention state나
  mutation을 만들면 일반 Post와 검색·편집·stale 제거 결과가 달라진다.
- Decision Outcome: 일반 Post와 모든 Reply surface가 같은 mention 검색·occurrence·ID state와 `createPost`
  mutation을 사용한다. Reply는 기존 `replyParentId`와 Mentioned Profile ID를 함께 전달한다.
- Alternatives Considered: Reply 전용 autocomplete와 mutation은 UI·Relay·validation을 중복하고 context 격리
  회귀 위험을 만든다.
- Consequences: mention state는 selected Profile, Parent와 Relay Environment의 기존 Composer context key에 함께
  묶인다. Reply modal/inline focus trap과 중앙 scroll 안에 결과를 조립해야 한다.
- Confirmation / Follow-up: 일반·Reply parity, Parent 전환, dirty/discard, 늦은 검색·mutation completion을
  unit/Storybook/runtime에서 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
