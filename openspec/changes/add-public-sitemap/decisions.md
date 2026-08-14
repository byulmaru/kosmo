## Context

이 결정 기록은 `PROD-731`의 현재 본문·관계와 계약 변경 댓글이 없다는 사실, 공개 Profile·Post·Instance의 canonical 문서, 그리고 이 change의 proposal·spec·design을 대조해 만든다. OpenSpec 자체는 제품 권위로 사용하지 않으며, 아래 구현 선택은 현재 승인된 sitemap 범위 안에서만 효력을 가진다.

### Gate Snapshot

- Domain Gate: Pass — `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0015-post-share-reference.md`에서 공개 eligibility와 canonical route 계약을 확인했다.
- Issue Gate: Pass — `PROD-731` 본문·관계·댓글을 2026-08-10에 다시 읽었고, 사용자가 현재 세션에서 `PROD-731` spec workflow 실행을 명시적으로 요청했다.
- OpenSpec Gate: Pending — 이 산출물의 구현 착수 승인은 사용자 확인 전까지 보류한다.

## Decision Records

### 공개 Local Profile과 Post만 sitemap 대상으로 선택한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`의 Profile Origin·Lifecycle·Suspension·공개 조회 정책, `docs/domain/objects/post.md`의 Visibility·Post Eligibility·Post 상세 정책, `docs/domain/objects/instance.md`의 configured Local Instance 계약, `docs/domain/decisions/0015-post-share-reference.md`, `PROD-731` 본문.
- Status: Active
- Context / Problem: 공개 Web URL 전체를 기계적으로 열거하면 Remote mirror, 제한 공개 콘텐츠, 삭제·정지된 객체 또는 독립 상세가 없는 Repost가 노출될 수 있다.
- Decision Outcome: configured Local Instance의 공개 조회 가능한 Active·Normal Profile과, 해당 Profile이 작성한 Active·Public·Current Content 보유 Post만 포함한다. Remote·다른 Local Instance·비활성 Profile, 제한 공개·Tombstone·Content 없는 Repost는 제외한다.
- Alternatives Considered: 모든 DB Profile/Post 포함은 공개 정책을 위반하므로 제외했다. ActivityPub object URI나 Remote 원본 URL 포함은 Kosmo canonical Web sitemap 범위가 아니므로 제외했다.
- Consequences: 조회는 Profile·Post 상태만이 아니라 configured Local Instance, Author 공개 가능성, visibility와 Current Content를 함께 검사해야 한다.
- Confirmation / Follow-up: 격리 DB 기반 테스트에서 Local/Remote, Profile state, Post visibility/state/content 조합의 포함·제외를 검증한다.

### Sitemap을 Web BFF의 동적 전용 route로 제공한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 `/sitemap.xml` XML 응답·공개 DB 객체 포함·프로덕션 검증 범위, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`.
- Status: Active
- Context / Problem: 빌드 시점 정적 XML은 runtime DB 변화를 반영하지 못하고, 현재 SPA fallback은 `/sitemap.xml` browser navigation에 `index.html`을 반환할 수 있다.
- Decision Outcome: Web BFF에 read-only 동적 GET `/sitemap.xml` route를 추가하고, 전역 federation middleware 뒤이면서 Expo 정적 파일·SPA fallback 앞에 등록한다. 성공 응답은 `application/xml; charset=utf-8`을 사용한다.
- Alternatives Considered: `apps/app/public` 정적 파일은 데이터 변화를 반영하지 못해 제외했다. GraphQL endpoint로만 제공하면 표준 crawler 진입점이 아니므로 제외했다. federation middleware 앞 등록은 현재 representation 순서를 바꾸므로 제외했다.
- Consequences: sitemap 정상 응답은 DB와 configured Local Instance 해석에 의존한다. 실패를 부분 sitemap 성공으로 숨기지 않고 기존 Web 오류 관측 경계로 전달해야 한다.
- Confirmation / Follow-up: crawler와 browser navigation header 양쪽에서 XML이 반환되고 SPA HTML이 반환되지 않는지 runtime test로 확인한다.

### 공개 정적 route는 `/`와 `/privacy`로 제한한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 검색 노출 가치가 있는 공개 정적 페이지 포함 범위와 보호·내부 페이지 제외 범위, `docs/design/README.md`에서 sitemap 전용 결정 문서가 없다는 현재 상태.
- Status: Active
- Context / Problem: Expo Router 또는 SPA fallback으로 열리는 모든 경로가 검색 노출 대상이라는 뜻은 아니며, 인증·callback·내부 endpoint를 자동 탐색해 포함하면 범위가 과도하게 넓어진다.
- Decision Outcome: 현재 공개 정적 allowlist를 landing `/`와 개인정보 처리방침 `/privacy`로 고정한다. 이후 추가는 공개성과 검색 가치를 확인한 명시적 변경으로 처리한다.
- Alternatives Considered: Router 파일 자동 탐색은 보호 여부와 검색 가치를 판별하지 못해 제외했다. landing만 포함하면 이미 공개된 개인정보 처리방침 발견성을 불필요하게 누락하므로 제외했다.
- Consequences: 구현은 파일 시스템 탐색이 아니라 작은 명시적 allowlist를 사용하고, 로그인·callback·GraphQL·health·보호 route를 포함하지 않는다.
- Confirmation / Follow-up: 자동 검증에서 `/`와 `/privacy`를 한 번씩 포함하고 대표 보호·내부 route를 제외하는지 확인한다.

### Canonical origin·relative handle·Post global ID로 URL을 구성한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/instance.md`의 public origin·configured Local Instance 계약, `docs/domain/objects/profile.md`의 relative handle 계약, `docs/domain/objects/post.md`의 canonical 상세 route, `docs/domain/decisions/0015-post-share-reference.md`, `PROD-731`의 `PUBLIC_ORIGIN` 기준 절대 URL 범위.
- Status: Active
- Context / Problem: request Host, API origin, ActivityPub URI 또는 Post DB UUID를 사용하면 클라이언트가 여는 canonical Web route와 다른 URL이 생성된다.
- Decision Outcome: configured Local Instance resolver가 검증한 canonical `PUBLIC_ORIGIN`을 base로 사용한다. Profile은 `/{relativeHandle}`, Post는 기존 `Post` GraphQL global ID를 사용한 `/{relativeHandle}/{postId}`로 만들고 query와 fragment를 붙이지 않는다.
- Alternatives Considered: request Host와 `PUBLIC_API_ORIGIN`은 canonical Web origin이 아니므로 제외했다. Post DB UUID 직접 노출은 기존 public route ID 계약과 다르므로 제외했다.
- Consequences: sitemap query/mapper는 기존 global ID encoder를 재사용해야 하며, URL 생성과 XML text escaping을 별도 단계로 유지해야 한다.
- Confirmation / Follow-up: 테스트에서 configured origin, `@handle`, encoded Post global ID와 XML 예약 문자 escaping을 검증한다.

### Current Post Content revision 시각에만 `lastmod`를 제공한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 Post Content revision·현재 콘텐츠 계약, `PROD-731`의 실제 수정 시각만 `lastmod`로 제공하고 `changefreq`·`priority`·현재 시각 추정을 금지한 범위.
- Status: Active
- Context / Problem: Profile과 Post row에는 일반적인 실제 페이지 수정 시각이 없으며, 생성 시각·요청 시각·배포 시각을 복제하면 crawler에 거짓 freshness 신호를 준다.
- Decision Outcome: 포함 대상 Post의 Current Content가 가리키는 immutable revision 생성 시각만 W3C datetime `lastmod`로 직렬화한다. 정적 route와 Profile은 `lastmod`를 생략하고 모든 entry에서 `changefreq`와 `priority`를 생략한다.
- Alternatives Considered: Profile/Post 생성 시각, 현재 시각, 배포 시각은 실제 마지막 수정 시각이 아니므로 제외했다. 별도 `updatedAt` schema 추가는 현재 이슈 범위를 벗어나므로 제외했다.
- Consequences: Post 조회는 Current Content revision을 join해야 한다. schema migration 없이 보수적인 metadata만 제공한다.
- Confirmation / Follow-up: unit/E2E에서 Post revision 시각의 정확한 출력과 정적·Profile metadata 생략을 검증한다.

### Protocol 한도 안에서는 단일 urlset을 사용하고 초과하면 분할 index로 전환한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 유효한 sitemap·URL escaping·프로덕션 응답 검증 범위, Sitemap protocol `<https://www.sitemaps.org/protocol.html>`의 interoperability 한도.
- Status: Active
- Context / Problem: 현재 프로덕션 eligible URL 수와 byte 크기는 아직 확인되지 않았고, 일부만 조용히 반환하면 성공처럼 보이는 불완전한 discovery 문서가 된다.
- Decision Outcome: 배포 전 측정값이 50,000 URL 및 UTF-8 50 MB 미만이면 단일 urlset을 사용한다. 생성 시 URL 수와 byte 크기를 방어하고, 한도를 초과하거나 임박하면 같은 계약을 유지하는 sitemap index와 분할 child sitemap으로 전환한다. 한도를 넘긴 단일 문서는 일부 URL을 잘라 성공시키지 않는다.
- Alternatives Considered: 무제한 단일 응답은 protocol 위반 위험이 있어 제외했다. 임의 truncation은 포함 계약과 완료 증거를 깨므로 제외했다. 현재 규모를 모른 채 선제 분할하면 route·테스트·운영 복잡도를 늘리므로 기본안에서 제외했다.
- Consequences: 구현 전·프로덕션 배포 전 eligible count와 생성 byte 크기를 측정해야 한다. 단일 문서가 충분하면 분할 route를 만들지 않는다.
- Confirmation / Follow-up: 한도 경계 unit test와 프로덕션 count·byte 측정 결과를 `PROD-731`에 기록한다.

### Google Search Console과 Bing Webmaster Tools에서 제출을 검증한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 검색엔진 등록·fetch 결과 기록 범위, Google 공식 sitemap 제출 문서 `<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>`, Bing Webmaster Tools sitemap 문서 `<https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed>`.
- Status: Active
- Context / Problem: 구현 완료만으로 실제 production origin의 접근성이나 주요 검색엔진 도구가 sitemap을 처리하는지 증명할 수 없다.
- Decision Outcome: 프로덕션 검증 뒤 canonical `/sitemap.xml`을 Google Search Console과 Bing Webmaster Tools에 제출하고, 대상·확인 시각·fetch 또는 처리 상태·오류를 `PROD-731`에 기록한다. 개별 URL 색인 완료는 이 제출 증거에 포함하지 않는다.
- Alternatives Considered: 한 검색엔진만 확인하면 `PROD-731`의 복수 검색엔진 등록 목적을 좁히므로 제외했다. IndexNow·URL Submission API 자동화는 현재 범위를 넓히므로 제외했다.
- Consequences: 배포 전에 두 도구의 production property와 제출 권한을 확인해야 하며, 권한 부재는 코드 결함과 구분해 이슈 blocker로 기록한다.
- Confirmation / Follow-up: 제출 UI/API가 보고한 처리 결과를 비민감한 형태로 이슈에 남기고, 실제 색인 여부를 과장하지 않는다.

### `robots.txt` 정책과 Sitemap 지시어는 이 change에서 수정하지 않는다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-731`의 sitemap 구현 범위, 관련 이슈 `PROD-736`의 crawler·search/AI bot 정책과 `Sitemap` 지시어 소유 범위 및 ActivityPub 영향 댓글.
- Status: Active
- Context / Problem: sitemap 제공과 crawler 허용 정책을 한 변경에 섞으면 `PROD-736`의 보안·ActivityPub 검증 경계를 우회할 수 있다.
- Decision Outcome: 이 change는 `/sitemap.xml` 생성·응답·제출 증거만 소유한다. `apps/app/public/robots.txt`, crawler 분류, bot 차단과 `Sitemap` 지시어는 수정하지 않는다.
- Alternatives Considered: 같은 PR에서 robots 지시어까지 추가하면 운영 순서는 단순해지지만 별도 이슈의 crawler 안전 검증을 섞으므로 제외했다.
- Consequences: 검색엔진 제출은 sitemap URL을 직접 사용한다. `PROD-736`은 sitemap 프로덕션 성공을 확인한 뒤 자체 범위와 검증으로 진행한다.
- Confirmation / Follow-up: 구현 diff와 테스트 범위에서 `robots.txt`가 바뀌지 않았는지 확인하고, 필요 시 `PROD-736`에 sitemap 준비 상태만 연결한다.

## Remaining Decisions

- 없음. 프로덕션 URL 수·byte 크기와 검색엔진 계정 권한은 구현·배포 verification gate에서 확인할 운영 사실이며, 현재 제품 결정을 요구하지 않는다.

## Superseded Decisions

- 없음.
