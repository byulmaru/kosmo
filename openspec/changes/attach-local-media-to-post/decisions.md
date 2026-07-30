## Context

이 기록은 canonical PostContent revision·Media node·ActivityPub projection 결정, PROD-461 계약 부모와
PROD-554·553·559 구현 경계를 기존 attachment-table 초안 대신 구현 가능한 하나의 새 Post 작성 흐름으로
정렬한다.

## Decision Records

### Media는 PostContent V1의 additive node다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554
- Status: Active
- Context / Problem: PostContent row revision과 document schema version을 구분하고 향후 rich editing에서도 Media
  위치를 보존해야 한다.
- Decision Outcome: `document.version`은 breaking schema version으로 유지하고 V1 body에 Media block node,
  document root에 omitted=false Sensitive Media attr를 additive하게 추가한다. PostContent row가 revision이다.
- Alternatives Considered: Media 추가만으로 V2를 만들면 non-breaking 확장에 migration을 강제한다. document
  attrs의 Media array는 본문 내 위치를 표현하지 못한다.
- Consequences: 기존 V1은 유효하며 canonicalizer, type guard와 projection은 새 V1 node를 함께 이해해야 한다.
- Confirmation / Follow-up: 기존 V1 round trip, Media/paragraph 혼합, omitted attr와 unknown node/attr 거부를 검증한다.

### Media 관계 의미는 document만 소유한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554
- Status: Active
- Context / Problem: Media identity, 순서, Alt Text와 Sensitive Media를 revision과 함께 바꾸면서 두 source of
  truth를 만들지 않아야 한다.
- Decision Outcome: Media node가 Media identity와 nullable Alt Text를, node 위치가 순서를, document root가
  Sensitive Media를 소유한다. 별도 relation table, ID array, Post/Media 표시 column을 만들지 않는다.
- Alternatives Considered: `post_media` 또는 derived projection은 FK를 제공하지만 현재 write/read source를
  중복한다. Post attrs의 Media array는 rich placement를 잃는다.
- Consequences: write-time Media 검증과 Media 물리 삭제 금지가 JSON reference 안전성을 책임진다.
- Confirmation / Follow-up: DB schema에 중복 projection이 없고 create rollback과 과거 document 보존을 확인한다.

### persistence Media ID와 GraphQL global ID를 경계에서 변환한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post-content.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554
- Status: Active
- Context / Problem: canonical document가 durable Media identity를 가져야 하지만 DB persistence를 GraphQL
  typename encoding에 결합하거나 내부 UUID를 consumer에게 노출할 수 없다.
- Decision Outcome: persistence Media node는 Media DB UUID를 저장하고 GraphQL create input에서 global ID를
  decode하며 document output에서 UUID를 Media global ID로 encode한다.
- Alternatives Considered: global ID를 DB에 저장하면 core가 GraphQL transport에 결합된다. raw UUID를 output하면
  기존 Node identity 경계를 우회한다. 별도 public Media key는 현재 concrete 필요보다 큰 identity 모델이다.
- Consequences: storage document와 GraphQL wire document는 Media ID 표현만 경계 변환하며 node 의미와 순서는 같다.
- Confirmation / Follow-up: wrong typename, malformed/missing Media, input decode와 output encode round trip을 검증한다.

### Composer는 갤러리 선택 즉시 item별로 업로드한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, PROD-461, PROD-553
- Status: Active
- Context / Problem: 선택 source, upload 시점과 여러 이미지 실패 상태를 플랫폼에서 일관되게 정해야 한다.
- Decision Outcome: Web/iOS/Android에서 library-only 선택을 제공하고 최대 4개의 asset을 선택 즉시 direct
  PUT·Ready 완료한다. item별 preview·상태·재시도·제거·Alt Text와 document-wide Sensitive Media를 관리한다.
- Alternatives Considered: 게시 시 일괄 upload는 submit latency와 복합 실패를 키운다. 카메라는 현재 범위가 아니다.
- Consequences: picker dependency와 local-key async state가 필요하며 모든 선택 item이 Ready일 때만 게시한다.
- Confirmation / Follow-up: 취소·다중 선택·부분 실패·재시도·제거·late completion과 platform 접근성을 확인한다.

### 실패 재시도는 새 Uploading Media로 시작한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0013-media-storage-service-boundary.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-461, PROD-553
- Status: Active
- Context / Problem: 실패한 제한 URL의 만료·소비·부분 저장 여부를 앱이 안전하게 판단할 수 없다.
- Decision Outcome: 재시도는 새 `issueMediaUploadUrl`부터 전체 흐름을 다시 시작하고 제거는 Composer state만
  정리한다.
- Alternatives Considered: 기존 URL 재사용은 provider 상태에 의존한다. 삭제/cancel은 승인되지 않은 lifecycle이다.
- Consequences: orphan Media가 남을 수 있으며 cleanup은 후속 정책이다.
- Confirmation / Follow-up: PUT/완료 실패, 제거 뒤 late completion과 retry Media identity를 검증한다.

### ActivityPub HTML과 Media attachment를 분리한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-436, PROD-461, PROD-559
- Status: Active
- Context / Problem: ProseMirror document에는 Media 위치가 있지만 ActivityPub은 HTML content와 attachment
  Image를 별도 표현한다. 공개 표현을 조회할 때마다 저장 서비스에서 해석하면 read latency와 가용성이 외부
  I/O에 결합된다.
- Decision Outcome: Media를 제거한 body만 기존 DOMSerializer로 HTML화하고 Media node는 document 순서의
  `attachment` Image로 만든다. 업로드 완료 시 저장한 Original URL·MIME, document Alt Text와 sensitive를
  제공하고 HTML `<img>`를 중복하지 않는다. read projection은 Media Storage Service를 호출하지 않는다.
- Alternatives Considered: projection마다 provider API를 호출하면 요청 증폭·timeout·장애 전파가 생긴다. Kosmo가
  URL을 직접 조립하면 provider 규칙에 결합된다. Media node를 `toDOM` `<img>`로 만들면 attachment와 중복된다.
- Consequences: Ready 전환이 표현 metadata의 완전성을 책임진다. federation에서는 내부 삽입
  위치가 attachment 순서로 축약된다. Post 수정과 `Update(Note)`는 독립 Backlog다.
- Confirmation / Follow-up: 역참조와 최초 Create(Note)의 exact content/attachment/sensitive를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 기존 “Post Media와 표시 속성은 소유 객체에 additive 저장한다” 초안은 Media node가 revision 관계·Alt Text·순서와
  Sensitive Media를 소유하고 별도 table/column을 만들지 않는 결정으로 대체한다.
- 기존 `mediaIds`, `Post.media`, `Post.sensitiveMedia`, `Media.altText`와 `updateMediaAltText` 초안은 ordered
  `{ mediaId, altText }` create input과 PostContent document output으로 대체한다.
- 기존 Composer 결정 중 Alt Text를 별도 mutation으로 먼저 저장하는 부분은 create input의 revision-owned Alt
  Text로 대체한다. 선택 즉시 upload와 item별 상태 결정은 유지한다.
