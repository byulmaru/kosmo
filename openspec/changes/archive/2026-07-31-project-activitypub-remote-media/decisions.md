## Context

이 기록은 PROD-585와 canonical Media/PostContent 문서가 정한 Remote Media projection을 구현 가능한 저장·수신 경계로 구체화한다. 원격 URL identity, Local/Remote field variant, attachment cardinality, 부적합 입력, network fetch와 transaction 선택을 추적한다.

## Decision Records

### 원격 원본 URL을 기존 Media URL에 저장한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585
- Status: Active
- Context / Problem: canonical 문서는 Remote URL 속성과 lifecycle을 요구하지만 물리 schema 표현은 정하지 않는다. PROD-585가 기존 `media.url` 재사용과 별도 `remote_url` 미추가를 구현 범위로 정했다.
- Decision Outcome: Remote Image의 canonical HTTP(S) 원본 URL을 `media.url`에 저장하고 별도 `remote_url` column을 만들지 않는다.
- Alternatives Considered: 새 `remote_url` column은 URL 역할을 source별로 중복하고 사용자가 정한 단일-column 방향과 다르므로 선택하지 않았다. `storageReference` 재사용은 Media Storage Service opaque identity와 원격 URL을 혼합하므로 선택하지 않았다.
- Consequences: `url`의 의미는 source에 따라 Local 공개 표현 또는 Remote 원본 위치이며, 조회 projection은 Media source와 조회 정책을 함께 적용해야 한다.
- Confirmation / Follow-up: migration schema와 Remote insert/read test에서 실제 `media.url` 값을 검증한다.

### Media를 source별 nullable variant로 저장한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585
- Status: Active
- Context / Problem: canonical 문서는 Local/Remote Media의 서로 다른 lifecycle과 속성 존재 조건을 요구하지만 nullable column과 CHECK의 물리 표현은 정하지 않는다. PROD-585 범위에 맞춰 현재 non-null Local upload field를 어떻게 정렬할지 결정해야 한다.
- Decision Outcome: 세 physical column의 NOT NULL을 해제하되 source CHECK로 Local row에는 계속 요구하고, Remote row에는 `READY`, URL 존재와 Local upload field 부재를 요구한다. Remote media type은 nullable이고 ready 시각은 Local Ready 전용이므로 Remote에서 null이다.
- Alternatives Considered: synthetic Account/storage reference/expiry는 존재하지 않는 Local upload lifecycle을 조작하므로 선택하지 않았다. 별도 Remote Media table은 canonical 단일 Media identity와 PostContent reference를 분리하므로 선택하지 않았다.
- Consequences: Drizzle select type에서 세 field가 nullable이 되며 Local code는 source를 좁히거나 기존 application invariant를 명시적으로 유지해야 한다.
- Confirmation / Follow-up: Local Uploading/Ready와 Remote Ready의 허용 조합, Remote Uploading 및 금지 field 조합의 DB rejection을 migration test로 검증한다.

### 초과 Image가 있으면 Note 전체를 거부한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585
- Status: Superseded
- Context / Problem: PostContent V1 최대 네 개보다 많은 Image를 받은 경우의 초기 구현 선택이 필요했다.
- Decision Outcome: 초기 초안에서는 partial projection을 피하기 위해 다섯 개 이상이면 Note 전체를 거부하기로 했다.
- Alternatives Considered: 앞 네 개 저장은 일부 원격 표현 손실이 있어 초기에는 선택하지 않았다.
- Consequences: 없음. 같은 날짜의 “앞 네 Image만 저장한다” 결정으로 구현 전에 대체됐다.
- Confirmation / Follow-up: 이 동작을 구현하거나 테스트하지 않는다.

### 원래 순서의 앞 네 Image만 저장한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, PROD-585
- Status: Active
- Context / Problem: 원격 Note는 PostContent V1 최대 네 개보다 많은 Image attachment를 가질 수 있다.
- Decision Outcome: non-Image를 제외한 지원 가능한 embedded typed Image 중 원래 attachment 순서의 앞 네 개만 후보로 저장하고 이후 Image는 무시한다.
- Alternatives Considered: Note 전체 거부는 사용자 결정으로 폐기했다. 마지막 네 개 또는 임의 선택은 원격 순서를 결정적으로 보존하지 못하므로 선택하지 않았다.
- Consequences: 다섯 번째 이후 원격 이미지는 Kosmo 표현에서 손실되지만 Note 본문과 앞 네 이미지는 materialize된다.
- Confirmation / Follow-up: 4개와 5개 fixture에서 순서, Media row 수와 document node 수를 검증한다.

### 앞 네 후보의 부적합 Image는 Note 전체를 거부한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585
- Status: Active
- Context / Problem: URL이 없거나 여러 개, 비 HTTP(S), canonical duplicate인 Image를 개별적으로 버릴지 Note를 거부할지 정해야 한다.
- Decision Outcome: 저장 대상으로 선택된 앞 네 후보 중 하나라도 부적합하면 일부 Media만 투영하지 않고 Note 전체를 side-effect 없는 no-op으로 처리한다.
- Alternatives Considered: 부적합 Image만 skip하면 원격 작성자가 제공한 attachment subset이 조용히 달라지고 위치가 당겨지므로 선택하지 않았다.
- Consequences: 한 개의 malformed Image가 본문까지 materialize되지 않게 하지만 partial representation과 orphan row를 피한다.
- Confirmation / Follow-up: 각 malformed/duplicate fixture에서 Post, PostContent, mapping과 Media가 모두 없는지 검증한다.

### embedded Image만 추가 fetch 없이 처리한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585, `docs/domain/objects/media.md`
- Status: Active
- Context / Problem: Fedify attachment accessor는 IRI-only attachment를 document loader로 resolve할 수 있어 새 request-time network와 resource budget이 생길 수 있다.
- Decision Outcome: 현재 수신 payload에서 typed Image로 hydrate된 embedded attachment만 처리하고 IRI-only attachment는 무시한다. attachment metadata와 image byte를 위한 network fetch를 추가하지 않는다.
- Alternatives Considered: IRI hydration은 PROD-465의 response budget과 retry/failure 계약 없이 범위를 넓히므로 선택하지 않았다. raw JSON-LD parser는 Fedify protocol primitive 재사용 원칙을 어기므로 선택하지 않았다.
- Consequences: embedded Image가 아닌 원격 attachment는 이번 capability에서 표시되지 않는다.
- Confirmation / Follow-up: document loader가 호출되지 않는 embedded/IRI-only fixture를 검증한다.

### Remote URL identity는 owner를 바꾸지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, PROD-585
- Status: Active
- Context / Problem: canonical Media는 같은 Remote URL 중복을 금지하면서 원본 Remote Profile을 소유자로 요구한다.
- Decision Outcome: `source=REMOTE` URL partial uniqueness를 사용하고 같은 Profile의 기존 Media만 재사용한다. 다른 Profile이 소유한 같은 URL과 충돌하면 owner를 변경하거나 중복 row를 만들지 않고 Note 전체를 거부한다.
- Alternatives Considered: URL당 여러 Media는 canonical dedupe를 어기며, 최초 owner Media를 다른 author Post가 참조하면 Remote Media Profile 관계를 어기므로 선택하지 않았다.
- Consequences: 여러 actor가 같은 CDN URL을 의도적으로 공유하면 후속 actor의 Note가 저장되지 않을 수 있다.
- Confirmation / Follow-up: same-owner reuse, cross-owner conflict와 concurrent insert를 검증한다.

### Remote Media를 기존 Post transaction에 참여시킨다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: PROD-585, PROD-256
- Status: Active
- Context / Problem: Media ID는 persistence 뒤에 생기지만 PostContent document가 그 ID를 참조하며, object duplicate와 실패 시 orphan을 남기면 안 된다.
- Decision Outcome: core ActivityPub Post action이 protocol-neutral media 후보를 받아 기존 ActivityPub mapping/Post/PostContent transaction 안에서 Media insert/reuse와 document 결합을 수행한다.
- Alternatives Considered: Fedify handler에서 Media를 선행 commit하면 duplicate/failure 때 orphan이 남는다. 별도 후속 transaction은 attachment-only content와 currentContent를 부분 상태로 노출하므로 선택하지 않았다.
- Consequences: `createPost` ActivityPub variant의 입력은 Remote Media 후보를 표현하며, rich document 구조를 보존한 채 transaction 안에서 Media node를 결합해야 한다.
- Confirmation / Follow-up: 성공, object duplicate, URL conflict와 강제 storage failure의 commit/rollback을 검증한다.

### 기존 dev Ready Local Media를 권위 있는 representation으로 백필한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, PROD-585
- Status: Active
- Context / Problem: PR #428 이전 완료 경로가 URL/media type 없이 만든 dev의 `LOCAL + READY` Media 8개가 source/state CHECK 적용을 막았다.
- Decision Outcome: 각 row의 storage reference를 Media Storage Service representation endpoint에서 재조회하고, 모두 HTTP 200으로 반환한 실제 공개 URL과 `image/webp` media type을 exact ID/reference 조건의 단일 transaction으로 백필했다. 완료 뒤 dev Ready Local 13개 중 metadata 누락은 0개이며 prod에는 아직 Media table이 없다.
- Alternatives Considered: CHECK를 `NOT VALID`로 추가하면 이전 workload의 신규 invalid write와 rollback 호환성이 남고 canonical Ready invariant를 완성하지 못한다. 기존 row 삭제나 synthetic metadata는 실제 Media identity와 저장 서비스 권위를 훼손하므로 선택하지 않았다.
- Consequences: migration은 Local Ready의 URL/media type/ready 시각을 즉시 CHECK할 수 있다. dev는 URL/media type 없이 READY로 전환하는 PR #428 이전 workload로 rollback하지 않는다.
- Confirmation / Follow-up: migration 직전 누락 0개 집계와 migration test에서 legacy fixture 백필 전 실패/백필 후 성공을 검증한다.

### 원격 Image name은 Media Alt Text로 저장한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-585
- Status: Active
- Context / Problem: 최신 canonical 계약은 Alt Text를 Media가 소유하고 PostContent Media node에는 Media ID와 순서만 저장하도록 정렬됐다.
- Decision Outcome: 원격 Image의 nullable name은 생성 또는 재사용한 Remote Media의 `altText`에 저장하고, PostContent Media node에는 `mediaId`만 기록한다. 같은 작성자의 새 object가 같은 URL을 재사용하면 Alt Text는 최신 Image name으로 갱신하되 URL, media type과 Profile은 유지한다. duplicate object no-op은 기존 Alt Text를 갱신하지 않는다.
- Alternatives Considered: revision별 Media node에 Alt Text를 저장하면 최신 canonical Media 소유권과 중복 source of truth를 만들므로 선택하지 않았다. 기존 Media의 Alt Text를 항상 보존하면 같은 Media를 다시 첨부할 때 최신 입력으로 갱신하는 공통 Post 첨부 계약과 달라지므로 선택하지 않았다.
- Consequences: 같은 Remote Media를 참조하는 기존 Post에도 최신 Alt Text가 보인다. Image 순서는 계속 PostContent document가 소유한다.
- Confirmation / Follow-up: 신규 Remote Media, same-owner URL 재사용과 duplicate object 테스트에서 Media Alt Text와 mediaId-only document를 검증한다.

### 다중 Remote URL insert 순서를 별도로 정렬하지 않는다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-585 사용자 결정
- Status: Active
- Context / Problem: 서로 다른 Note가 같은 다중 이미지 집합을 반대 순서로 동시에 재사용하면 URL unique index lock을 서로 다른 순서로 획득할 가능성이 제기됐다.
- Decision Outcome: 일반 제품 사용에서 같은 이미지 집합의 중복 재사용을 전제하지 않으므로 이번 change는 insert 대상 정렬이나 deadlock retry를 추가하지 않는다. 기존 attachment 순서와 단일 URL duplicate/concurrent 수렴 계약만 유지한다.
- Alternatives Considered: URL 정렬은 PostContent 표시 순서와 별도로 insert 순서만 고정할 수 있지만 현재 제품 시나리오에 없는 경합을 위해 구현과 테스트를 추가하므로 선택하지 않았다. bounded deadlock retry도 현재 수신 경계에 별도 retry 정책을 추가하므로 선택하지 않았다.
- Consequences: 비일반적인 역순 다중 URL 동시 재사용에서는 한 delivery가 PostgreSQL deadlock 오류로 실패할 가능성을 수용한다.
- Confirmation / Follow-up: 기존 단일 URL duplicate/concurrent 테스트를 유지하며 실제 제품 사용에서 다중 URL 재사용이 관찰되면 별도 이슈에서 lock ordering을 재평가한다.

### embedded Image와 image Document를 함께 지원한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: PROD-585 사용자 결정, ActivityStreams Image/Document vocabulary, Mastodon·Hackers’ Pub 실제 outbound 표현
- Status: Active
- Context / Problem: 초기 구현은 embedded `Image`만 후보로 선택했지만, Mastodon과 Hackers’ Pub은 Note 이미지 attachment를 `Document`와 `mediaType=image/*`로 전송한다. 이 구현은 표준 `Image`는 수용하면서 실제 상호운용 대상의 이미지를 모두 누락했다.
- Decision Outcome: embedded `Image`는 nullable Media Type과 관계없이 이미지 후보로 수용하고, embedded `Document`는 Media Type의 MIME essence가 `image/*`일 때만 후보로 수용한다. 원본 nullable Media Type 문자열은 저장 시 정규화하지 않는다. 다른 Document, malformed/non-image Media Type과 IRI-only attachment는 무시한다.
- Alternatives Considered: Image-only는 실제 대상 서버와 상호운용되지 않아 폐기했다. Document-only는 유효한 표준 Image 표현을 불필요하게 거부하므로 선택하지 않았다. URL 확장자로 종류를 추론하면 원격 표현 계약에 없는 휴리스틱이 생기므로 선택하지 않았다.
- Consequences: Mastodon·Hackers’ Pub의 일반적인 이미지 attachment와 표준 Image를 모두 처리한다. Media Type이 없는 Image는 `media.mediaType=NULL`로 저장되므로 GraphQL `PostContent.media`도 URL이 있는 Ready Remote Media를 nullable Media Type과 함께 노출한다.
- Confirmation / Follow-up: Image의 nullable Media Type, image/non-image Document, MIME 대소문자·parameter 보존과 GraphQL nullable Media Type 회귀를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- “초과 Image가 있으면 Note 전체를 거부한다”는 사용자의 2026-07-30 정정에 따라 “원래 순서의 앞 네 Image만 저장한다”로 대체됐다.
- 기존 data rewrite 없는 migration guidance는 2026-07-31 live dev 누락 확인과 사용자 백필 결정에 따라 권위 있는 representation 사전 백필로 대체됐다.
