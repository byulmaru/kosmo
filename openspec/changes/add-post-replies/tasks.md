## 1. PROD-393 Reply Parent 저장과 공통 구조 검증

**Authority / Provenance**

- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/objects/post.md`
- `PROD-393`

**Deliverable**

Content가 있는 Post가 nullable 직접 Reply Parent를 저장하고 Repost Source와 독립적으로 공존하며, core 생성 경계가 허용된 Post 관계 조합과 Reply Parent 대상을 원자적으로 검증한다.

**Guardrails**

- PROD-394의 Repost Source migration과 partial unique index를 변경하거나 재구현하지 않는다.
- Reply Parent는 존재하는 contentful Post여야 하며 구조 validator는 Parent와 Source가 같은 대상 Post를 가리키는 조합을 허용한다.
- Content 없는 Reply와 양 관계의 직접 self-reference를 거부한다.
- Reply Parent 변경 API, recursive cycle scan, constraint trigger와 하위 Reply 조회 index를 추가하지 않는다.
- 기존 Local/ActivityPub contentful 호출과 반환 shape 및 ActivityPub first-write-wins를 유지한다.

**Verification**

- 기존 row가 있는 PROD-394 schema에 additive migration을 적용해 nullable FK·직접 self CHECK·기존 Repost index와 Tombstone 관계 보존을 검증한다.
- Local/ActivityPub Post·Reply 저장과 Parent의 missing/contentless 실패 및 transaction rollback을 service test로 검증한다. package 내부 구조 validator 단위 test로 Post·Reply·Quote·Reply+Quote·Repost와 동일 Parent/Source, self-reference 및 contentless+Reply 조합을 검증하고 DB CHECK test로 직접 Parent self-reference를 검증한다.
- core 전체 test, migration runner·contract test, lint·format과 strict OpenSpec validation을 통과시킨다.

- [x] 1.1 Reply Parent additive schema·migration과 DB 관계·회귀 검증을 구현한다.
- [x] 1.2 package 내부 공통 Post 구조 validator와 Parent 대상 검증을 구현하고 Local/ActivityPub `createPost`에 optional `replyParentId` 저장을 추가한다.
- [x] 1.3 validator 허용·거부 조합, DB CHECK, Parent error field, rollback과 기존 생성 계약 회귀 test를 추가하고 관련 check를 통과시킨다.

## 2. PROD-398 직접 Reply Parent 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `PROD-398`

**Deliverable**

기존 단일 GraphQL `Post` Node가 조회 가능한 저장된 직접 Parent를 nullable `replyParent`로 제공한다.

**Guardrails**

- 현재 Post와 Parent의 Visibility·Eligibility를 독립적으로 판정한다.
- Parent가 unavailable이어도 현재 Post는 유지하고 `replyParent`만 `null`로 반환한다.
- Parent를 다른 Post로 평탄화하거나 별도 Reply concrete type을 만들지 않는다.

**Verification**

- Parent 없음, 조회 가능, Tombstone, visibility/eligibility 실패와 Reply+Quote의 직접 Parent를 API integration test로 검증한다.

- [x] 2.1 nullable `Post.replyParent` 공개 계약과 resolver를 구현한다.
- [x] 2.2 Parent 독립 조회 정책과 schema·API 회귀 test를 추가하고 관련 check를 통과시킨다.

## 3. PROD-399 Reply 조상 경로 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `PROD-399`

**Deliverable**

Reply가 저장된 직접 Parent 관계 순서를 보존한 조회 가능한 조상 Post 경로를 제공한다.

**Guardrails**

- 조회 불가능한 Parent에서 경로를 중단하고 숨겨진 조상을 건너뛰거나 평탄화하지 않는다.
- 각 요소는 기존 단일 `Post` Node를 사용하고 비정상 cycle에서도 유한하게 종료한다.
- 공개 field는 pagination 없는 `Post.replyAncestors: [Post!]!`이며 직접 Parent부터 root 방향으로 반환하고 조상이 없으면 빈 배열이다.
- 정상 경로를 임의의 최대 깊이로 절단하지 않으며 단일 recursive query와 visited path로 단계별 N+1 조회와 cycle을 방어한다.

**Verification**

- Parent 없음, 일반·다단계·Reply+Quote 조상의 직접 Parent 우선 순서, unavailable 중단, 숨은 조상 비노출과 cycle 방어를 API test로 검증한다.
- schema contract에서 non-null list와 pagination 미노출을 확인하고, query count·긴 경로 fixture로 단일 조회와 임의 절단이 없음을 확인한다.

- [x] 3.1 조상 경로의 공개 GraphQL field·collection·순서 계약을 Linear에서 확정하고 OpenSpec decision을 갱신한다.
- [x] 3.2 승인된 공개 계약에 따라 `Post.replyAncestors`와 단일 recursive 조상 조회를 구현한다.
- [x] 3.3 권한 중단·비평탄화·cycle 방어 test와 관련 check를 통과시킨다.

## 4. PROD-400 하위 Reply 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `PROD-400`

**Deliverable**

현재 Post를 직접 또는 간접 Parent로 참조하는 모든 조회 가능한 descendant Post를 각자의 조회 정책에 따라 제공한다.

**Guardrails**

- 숨겨진 Parent Content를 노출하지 않으면서 그 아래의 independently visible Reply를 Parent 비노출만으로 제거하지 않는다.
- Reply+Quote descendant를 같은 관계로 처리하고 별도 Reply type을 만들지 않는다.
- 기존 단일 `Post` Node의 non-null `replyDescendants: PostConnection!` field에서 `first`/`after`와 `last`/`before`를 지원하고 `createdAt ASC, id ASC`로 정렬한다.
- 임의의 최대 Reply 깊이를 두지 않고 cycle에서 같은 Post를 반복하지 않으며 Parent-before-child 위상 순서를 별도로 보장하지 않는다.
- 구조 traversal 뒤 각 descendant의 visibility/eligibility를 pagination 전에 적용하고, index는 실제 recursive query plan으로 필요한 최소 형태만 선택한다.

**Verification**

- 직접·간접·Reply+Quote descendant, 각 Post의 visibility/eligibility, 숨겨진 Parent 아래 visible Reply,
  unavailable Source를 가진 Reply+Quote 유지와 cycle 방어를 API test로 검증한다.
- 동일 생성 시각 tie-break, 양방향 pageInfo, 잘못된 cursor와 filter-before-limit을 API test로 검증한다.
- 대표 fan-out·depth 데이터의 실제 query와 `EXPLAIN (ANALYZE, BUFFERS)`로 pagination·index 선택을 검증한다.

- [x] 4.1 descendant 공개 GraphQL field·connection·pagination·정렬 계약을 Linear에서 확정하고 OpenSpec decision을 갱신한다.
- [x] 4.2 승인된 공개 계약에 따라 descendant 조회와 필요한 index를 구현한다.
- [x] 4.3 독립 조회 정책·숨겨진 Parent 경계·query plan test와 관련 check를 통과시킨다.

## 5. PROD-429 Home/Profile Reply 후보 정책

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `PROD-429`

**Scope Boundary**

Home/Profile Post List의 Reply 후보 정책 구현·검증만 포함한다.

**Deliverable**

Home은 viewer와 관련된 eligible Reply를 포함하고 Profile Post List는 Reply Parent가 있는 Post를 제외한다.

**Guardrails**

- 각 후보의 Visibility와 Eligibility를 먼저 적용하고 Reply 판정을 page limit 이전에 적용한다.
- Reply+Quote에 같은 Reply 후보 규칙을 적용한다.
- 새 정렬 정책, Reply 생성·UI와 ActivityPub 처리를 추가하지 않는다.

**Verification**

- viewer 작성·viewer Post의 Reply·상호 followee 맥락과 관련 없는 Reply, Reply+Quote, Profile 제외 및 기존 Post/Repost/Quote 목록 회귀를 검증한다.

- [x] 5.1 Home의 viewer 관련 Reply 후보 정책을 구현한다.
- [x] 5.2 Profile의 Reply 제외 정책을 구현한다.
- [x] 5.3 권한·pagination limit·기존 목록 회귀 test와 관련 check를 통과시킨다.

## 6. PROD-422 Post 상세 Reply thread 통합

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `PROD-422`

**Deliverable**

Post 상세가 API에서 제공한 조회 가능한 조상 경로, 현재 Post와 하위 Reply를 하나의 thread 맥락으로 연결한다.

**Guardrails**

- 각 Post는 기존 단일 Post fragment·rendering을 사용하고 Reply+Quote의 Content·Source 맥락을 유지한다.
- API가 중단한 권한 경계를 우회하거나 thread 관계를 평탄화하지 않는다.
- Reply 작성·Media·presentation fixture/Storybook 범위를 포함하지 않는다.
- PROD-398·399·400의 승인된 API 계약과 구현이 완료되기 전 시작하지 않는다.

**Verification**

- 조상·현재·하위 Reply 조합, Reply+Quote, unavailable 조상 경계, 각 Post 상세 이동과 fragment·route integration을 client test로 검증한다.

- [ ] 6.1 승인된 Parent·조상·descendant 결과를 Post 상세 query와 colocated fragment에 연결한다.
- [ ] 6.2 thread 맥락과 각 Post 상세 이동을 유니버설 route에 연결한다.
- [ ] 6.3 Reply+Quote·권한 경계·fragment integration test와 관련 client check를 통과시킨다.

## 7. PROD-388 Reply 계약 통합 검증과 archive

**Authority / Provenance**

- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `PROD-388`

**Deliverable**

Reply 저장부터 조회·목록·상세 thread까지 승인된 구현 결과가 하나의 계약으로 동작하고 active OpenSpec spec에 통합된다.

**Guardrails**

- 모든 구현 자식과 PR, Blocked decision 및 최종 통합 검증이 완료되기 전 change를 archive하지 않는다.
- Reply/Quote 작성 action, ActivityPub, Media와 Notification을 통합 범위로 확대하지 않는다.
- archive 직전에 최신 canonical·Linear와 구현·OpenSpec을 독립 대조한다.

**Verification**

- 관계 조합별 저장→직접 Parent·조상·descendant 조회→Home/Profile 후보→Post 상세 thread 흐름을 통합 검증한다.
- 모든 task 완료, Blocked decision 해소, strict validation과 archive 후 validation을 확인한다.

- [ ] 7.1 모든 구현 자식의 결과와 requirement scenario를 연결하는 최종 통합 검증을 수행한다.
- [ ] 7.2 최신 canonical·Linear, 구현과 OpenSpec의 정합성 및 남은 decision을 확인한다.
- [ ] 7.3 Completion Gate 승인 뒤 change를 archive하고 archive 후 strict validation을 통과시킨다.
