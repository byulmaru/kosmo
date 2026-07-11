## Context

이 기록은 PROD-267의 확정 범위, 현재 DB·GraphQL·Relay 구현 조사, `post`/`data-model` delta spec과 사용자 확인 결과를 반영한다. 제품은 최대 500자의 서식 없는 본문만 제공하며 PR #217 이후 앱 UI도 이미 Plain Text 입력을 사용한다.

## Decision Records

### `body_text`를 유일한 canonical 본문으로 사용한다

- Status: Accepted
- Context / Problem: 현재 `post_content`는 같은 본문을 `body_text`, TipTap `body_json`, 선택적 `body_html`로 표현해 불일치 가능성과 변환 비용을 만든다.
- Decision Outcome: 기존 `body_text`를 수정 없이 canonical로 승격하고 `body_json`, `body_html`을 같은 migration에서 제거한다. `spoiler_text`는 값을 보존한 채 `content_warning`으로 이름을 바꾼다.
- Alternatives Considered: JSON에서 `body_text`를 재생성하거나 두 값의 일치를 엄격히 검사하는 방안은 사용자가 필요 없다고 결정했다. 컬럼을 deprecated 상태로 유지하는 방안은 TipTap을 제품 계약에서 제거한다는 목표와 맞지 않는다.
- Consequences: migration은 단순하고 기존 Plain Text를 그대로 보존하지만, 과거 JSON과의 잠재적 차이를 탐지하지 않는다. rollback에는 DB backup 복원이 필요하다.
- Confirmation / Follow-up: migration fixture에서 `body_text`, revision ID, post 연결, Content Warning과 생성 시각이 보존되는지 확인한다.

### Content Warning을 Kosmo 도메인 용어로 사용한다

- Status: Accepted
- Context / Problem: 현재 `spoilerText`는 Mastodon REST API의 `spoiler_text` 명칭에 가깝고, Kosmo domain 문서는 `Content Warning`을 확정 용어로 사용한다. ActivityStreams wire property는 `summary`다.
- Decision Outcome: DB는 `content_warning`, GraphQL은 `contentWarning`을 사용하고 ActivityPub adapter에서 Note `summary`와 상호 변환한다.
- Alternatives Considered: `summary`를 내부 이름으로 사용하면 Profile bio에도 쓰이는 ActivityStreams actor `summary`와 의미가 겹친다. `spoilerText` 유지는 확정 도메인 용어와 다르다.
- Consequences: migration과 GraphQL에 추가 breaking rename이 생기지만 내부 의미가 명확해지고 federation wire 명칭이 domain model로 누출되지 않는다.
- Confirmation / Follow-up: canonical domain 문서, schema와 migration을 함께 갱신한다.

### 구조적 본문 참조는 PostContent 관계로 확장한다

- Status: Accepted
- Context / Problem: 향후 Mention, Hashtag, Custom Emoji를 지원하려면 Plain Text 안의 token과 domain entity를 연결해야 하지만 이를 위해 TipTap 같은 rich-text AST를 유지할 필요는 없다.
- Decision Outcome: canonical `bodyText`는 유지하고 기능 구현 시 `PostContent` revision이 소유하는 명시적 token-to-entity 관계로 확장한다. 초기 관계는 source token과 entity ID를 저장하며 offset annotation은 실제 요구가 생길 때만 추가한다.
- Alternatives Considered: 범용 JSON AST는 editor·validation·migration 복잡도를 다시 만든다. 범용 polymorphic entity table은 foreign key 무결성을 약하게 만든다. offset을 미리 저장하면 Unicode index와 편집 동기화 정책을 지금 확정해야 한다.
- Consequences: 이번 변경은 speculative 테이블을 만들지 않는다. Mention 기반 visibility와 federation `tag`는 해당 기능에서 현재 PostContent 관계를 통해 계산한다.
- Confirmation / Follow-up: Mention, Hashtag 또는 Custom Emoji 구현 OpenSpec에서 명시적 관계와 token canonicalization을 확정한다.

### GraphQL은 `bodyText` 입력과 `PostContent` revision 출력을 사용한다

- Status: Accepted
- Context / Problem: `CreatePostInput.content: TipTapDocument!`와 `PostContent.bodyJson`이 제품에 없는 rich document를 공개 계약으로 고정한다.
- Decision Outcome: 입력을 `CreatePostInput.bodyText: String!`로 바꾸고 출력은 기존 revision 경계인 `Post.content.bodyText`를 유지한다. `TipTapDocument` scalar와 `bodyJson` field는 제거한다.
- Alternatives Considered: `content: String!`은 타입은 단순하지만 필드 의미가 모호하다. `Post.bodyText`로 평탄화하면 현재·과거 revision의 소유 경계를 잃는다.
- Consequences: 구버전 GraphQL document는 깨지며 Relay artifact를 재생성해야 한다. `PostContent` Node ID, revision과 visibility 접근 경계는 유지된다.
- Confirmation / Follow-up: API schema snapshot, Relay compiler, mutation unit와 조회/E2E로 검증한다.

### DB·API·앱을 한 번의 breaking release로 전환한다

- Status: Accepted
- Context / Problem: TipTap scalar와 컬럼을 즉시 제거하면 구버전 API 또는 앱이 새 계층과 호환되지 않는다.
- Decision Outcome: 임시 호환 scalar/input/column 없이 DB migration, API schema와 Relay 앱을 한 PR과 coordinated release로 전환한다.
- Alternatives Considered: expand/contract 방식의 2단계 배포는 호환 기간을 주지만 제거 대상 계약과 변환 코드를 더 오래 유지한다.
- Consequences: 배포 순서를 분리할 수 없으며 구버전 클라이언트 호환을 보장하지 않는다. 검증은 전체 stack을 함께 실행해야 한다.
- Confirmation / Follow-up: PR 검증에서 migration, API/app/Storybook/Web E2E를 모두 통과시킨다.

### 변경을 merge-safe한 준비 PR과 atomic cutover PR로 나눈다

- Status: Accepted
- Context / Problem: DB column drop, GraphQL mutation input과 Relay composer를 서로 다른 시점에 바꾸면 중간 main의 게시글 작성이 실패하지만, read path와 validation 준비는 기존 계약을 유지한 채 먼저 머지할 수 있다.
- Decision Outcome: PROD-268은 CW rename, Plain Text validation과 앱의 `bodyText` 직접 조회를 담당하고 기존 TipTap write/storage를 유지한다. PROD-267은 PROD-268 이후 DB drop, API input과 앱 write path를 하나의 atomic cutover로 수행한다.
- Alternatives Considered: 모든 변경을 한 PR에 두면 리뷰 범위가 크다. DB/API/app을 각각 분리하면 임시 dual contract가 없이는 중간 main이 깨진다. dual contract를 추가하는 방식은 이미 확정한 호환 계층 없음 결정과 충돌한다.
- Consequences: PROD-268은 독립적으로 main에 머지할 수 있고 PROD-267은 그 이후 머지해야 한다. OpenSpec change는 두 PR에 걸쳐 진행되며 준비 PR 머지 시 일부 task가 pending 상태로 남는다.
- Confirmation / Follow-up: PROD-268에서 기존 TipTap create E2E를 유지하고, PROD-267에서 전체 cutover 검증을 실행한다.

### ActivityPub projection은 Plain Text output으로 재범위화한다

- Status: Accepted
- Context / Problem: PROD-259는 아직 구현되지 않은 remote Note projection을 canonical TipTap document로 만드는 계획이어서 이 변경과 충돌한다.
- Decision Outcome: PROD-259의 output을 실행 가능한 HTML이나 TipTap JSON이 아닌 safe Plain Text로 바꾼다. remote Note 수신과 materialization 구현은 해당 ActivityPub 작업에 남긴다.
- Alternatives Considered: PROD-267에서 remote Note ingestion까지 새로 구현하면 TipTap 제거와 무관한 federation 범위를 끌어온다. PROD-259를 취소하면 필요한 외부 content 정규화 책임이 사라진다.
- Consequences: PROD-259는 더 작은 Plain Text projection 문제가 되며 `@tiptap/html`, server TipTap entrypoint와 document canonicalization이 필요 없다.
- Confirmation / Follow-up: PROD-259 설명과 완료 기준을 Plain Text 기준으로 갱신한다.

### 새 목록 membership 갱신은 계속 subscription으로 미룬다

- Status: Accepted
- Context / Problem: create mutation 전환 중 생성된 게시글을 열린 Home/Profile connection에 넣는 updater를 추가할 유혹이 있지만 PR #217의 확정 범위와 다르다.
- Decision Outcome: create mutation은 생성된 `Post.id`만 반환하고 connection membership은 후속 subscription이 담당한다.
- Alternatives Considered: `@prependNode` 또는 수동 Relay updater는 현재 화면만 임시로 고치고 subscription과 중복된다.
- Consequences: 게시 성공 후 이미 열린 목록은 refetch 전까지 즉시 갱신되지 않는다.
- Confirmation / Follow-up: composer mutation에 connection updater가 추가되지 않았는지 검토한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `add-post-create-graphql`에서 채택한 “TipTap document JSON을 canonical 입력·저장 원본으로 사용하고 Plain Text를 projection으로 둔다”는 결정을 “Plain Text를 유일한 canonical 입력·저장 본문으로 사용한다”로 대체한다. 현재 제품에 rich text 기능이 없고 PR #217 이후 앱 입력도 Plain Text이기 때문이다.
- `migrate-frontend-to-expo-relay`에서 채택한 “native-safe adapter가 Plain Text와 TipTap doc/paragraph/text subset을 변환한다”는 결정을 “앱이 Plain Text를 직접 제출·표시한다”로 대체한다. GraphQL과 저장 계약에서 TipTap document가 제거되기 때문이다.
