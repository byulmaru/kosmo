## Context

이 결정 기록은 2026-08-27 갱신한 `PROD-731` 본문, 사용자가 승인한 공개 route·검색엔진 제출·용량 전환 기준, 공개 Profile·Post·Instance의 canonical 문서, application policy와 runtime DB 경계 ADR, 그리고 이 change의 proposal·spec·design을 대조해 만든다. OpenSpec 자체는 제품 권위로 사용하지 않으며, 아래 구현 선택은 현재 승인된 sitemap 범위 안에서만 효력을 가진다.

### Gate Snapshot

- Domain Gate: Pass — `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`에서 공개 eligibility, canonical route와 runtime query 경계를 확인했다.
- Issue Gate: Pass — `PROD-731` 본문·관계와 관련 `PROD-736` 경계를 2026-08-27에 다시 읽고 승인된 세 결정을 Linear 본문에 반영했다.
- OpenSpec Gate: Pass for document update — 사용자가 2026-08-27에 문서 수정을 승인했다. 이 승인은 구현 착수나 OpenSpec archive 승인을 뜻하지 않는다.

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

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 `/sitemap.xml` XML 응답·공개 DB 객체 포함·프로덕션 검증 범위, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`.
- Status: Active
- Context / Problem: 빌드 시점 정적 XML은 runtime DB 변화를 반영하지 못하고, 현재 SPA fallback은 `/sitemap.xml` browser navigation에 `index.html`을 반환할 수 있다.
- Decision Outcome: Web BFF에 read-only 동적 GET `/sitemap.xml` route를 추가하고, 전역 federation middleware 뒤이면서 Expo 정적 파일·SPA fallback 앞에 등록한다. 성공 응답은 `application/xml; charset=utf-8`을 사용한다. 조회는 application query의 공유 runtime DB 경계를 사용하며 operation-scoped DB session·actor GUC·GraphQL RLS 경계를 추가하지 않는다.
- Alternatives Considered: `apps/app/public` 정적 파일은 데이터 변화를 반영하지 못해 제외했다. GraphQL endpoint로만 제공하면 표준 crawler 진입점이 아니므로 제외했다. federation middleware 앞 등록은 현재 representation 순서를 바꾸므로 제외했다.
- Consequences: sitemap 정상 응답은 DB와 configured Local Instance 해석에 의존한다. 실패를 부분 sitemap 성공으로 숨기지 않고 기존 Web 오류 관측 경계로 전달해야 한다.
- Confirmation / Follow-up: crawler와 browser navigation header 양쪽에서 XML이 반환되고 SPA HTML이 반환되지 않는지 runtime test로 확인한다.

### 공개 정적 route는 `/`와 `/privacy`로 제한한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 정확한 공개 정적 route allowlist와 보호·내부 페이지 제외 범위, `docs/design/README.md`에서 sitemap 전용 결정 문서가 없다는 현재 상태.
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

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`의 Post Content revision·현재 콘텐츠 계약, `PROD-731`의 실제 수정 시각만 `lastmod`로 제공하고 `changefreq`·`priority`·현재 시각 추정을 금지한 범위, Google 공식 sitemap 문서 `<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>`의 정확하고 검증 가능한 `lastmod` 지침.
- Status: Active
- Context / Problem: Profile과 Post row에는 일반적인 실제 페이지 수정 시각이 없으며, 생성 시각·요청 시각·배포 시각을 복제하면 crawler에 거짓 freshness 신호를 준다.
- Decision Outcome: 포함 대상 Post의 Current Content가 가리키는 immutable revision 생성 시각만 W3C datetime `lastmod`로 직렬화한다. 정적 route와 Profile은 `lastmod`를 생략하고 모든 entry에서 `changefreq`와 `priority`를 생략한다.
- Alternatives Considered: Profile/Post 생성 시각, 현재 시각, 배포 시각은 실제 마지막 수정 시각이 아니므로 제외했다. 별도 `updatedAt` schema 추가는 현재 이슈 범위를 벗어나므로 제외했다.
- Consequences: Post 조회는 Current Content revision을 join해야 한다. schema migration 없이 보수적인 metadata만 제공한다.
- Confirmation / Follow-up: unit/E2E에서 Post revision 시각의 정확한 출력과 정적·Profile metadata 생략을 검증한다.

### 파생된 Public-only 계약을 application policy에 명시적으로 합성한다

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`의 Public 검색 후보와 Unlisted 검색 제외 계약, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`의 application policy·공유 runtime DB 경계, `PROD-731`의 공개 Post 포함·비공개 콘텐츠 제외 범위.
- Status: Active
- Context / Problem: Public만 검색 후보이고 Unlisted는 제외한다는 제품 정책은 위 첫 번째 Derived Contract 결정에 이미 기록되어 있다. 현재 일반 익명 Post visibility helper는 Public과 Unlisted를 모두 조회 가능 대상으로 취급하므로, 이를 그대로 sitemap 후보 조건으로 사용하면 Web에서 읽을 수 있지만 검색 후보가 아닌 Unlisted Post가 노출된다. 반대로 공개 조건을 별도 정책 체계로 복제하면 application policy drift가 발생한다.
- Decision Outcome: 이 기록은 Public-only 제품 정책을 다시 선택하지 않고 그 파생 계약의 구현 방식을 결정한다. sitemap query는 현재 application visibility·eligibility 조건을 재사용·합성하되 `PostVisibility.PUBLIC`을 독립 조건으로 강제한다. configured Local Instance, Active·공개 가능한 Author, Active Post와 Current Content 조건도 canonical 검색·Eligibility 계약에 맞춰 함께 적용한다. 이를 위해 operation-scoped DB session, actor GUC 또는 GraphQL RLS 경계를 복원하지 않는다.
- Alternatives Considered: 일반 익명 visibility helper 단독 사용은 Unlisted 노출 때문에 제외했다. sitemap 전용으로 모든 visibility·eligibility 규칙을 복사하는 방식은 정책 drift 위험 때문에 제외했다. 과거 operation-scoped DB/RLS 경계를 다시 도입하는 방식은 ADR-0024와 맞지 않아 제외했다.
- Consequences: 공개 검색 후보 조건은 공통 application policy와 작은 sitemap 전용 `PUBLIC` 제약의 합성으로 드러나야 한다. helper 계약 변경 시 sitemap 회귀 테스트가 차이를 검출해야 한다.
- Confirmation / Follow-up: 격리 DB 테스트에서 Public은 포함하고 Unlisted는 일반 익명 조회 가능 여부와 무관하게 제외하며, 현재 공유 runtime DB 구성으로 route가 동작하는지 검증한다.

### PROD-731은 단일 urlset만 제공하고 조기 기준에서 별도 index change를 만든다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 단일 sitemap 범위와 45,000 URL·45 MB(47,185,920 bytes) 후속 전환 기준, Sitemap protocol `<https://www.sitemaps.org/protocol.html>`의 interoperability 한도.
- Status: Active
- Context / Problem: 현재 프로덕션 eligible URL 수와 byte 크기는 아직 확인되지 않았고, 일부만 조용히 반환하면 성공처럼 보이는 불완전한 discovery 문서가 된다. 반면 현재 이슈에서 sitemap index까지 구현하면 승인 범위를 넓힌다.
- Decision Outcome: `PROD-731`의 `/sitemap.xml`은 하나의 `urlset`만 제공한다. 성공 응답은 모든 eligible URL을 포함하면서 50,000 URL 이하, 압축하지 않은 UTF-8 XML 52,428,800 bytes 이하를 지켜야 한다. 어느 상한이든 넘으면 entry를 자르거나 index로 자동 전환하지 않고 관측 가능한 서버 오류로 실패시킨다. URL 수가 45,000개 또는 XML 크기가 45 MB(47,185,920 bytes)에 도달하면, protocol 상한 전에 sitemap index를 배포할 수 있도록 별도 Linear 이슈와 OpenSpec change를 생성한다.
- Alternatives Considered: 무제한 단일 응답과 임의 truncation은 protocol 및 완전성 계약을 깨므로 제외했다. 같은 change의 조건부 sitemap index는 현재 승인 범위를 넓히므로 제외했다. 선제 index 구현은 현재 규모에서 불필요한 route·테스트·운영 복잡도를 추가하므로 제외했다.
- Consequences: 구현 전·프로덕션 배포 전 eligible count와 생성 byte 크기를 측정해야 한다. 조기 기준에 닿으면 현재 구현에 child route를 추가하는 대신 별도 change를 시작한다.
- Confirmation / Follow-up: protocol 상한 경계 unit test와 프로덕션 count·byte 측정 결과를 `PROD-731`에 기록하고, 조기 기준에 닿으면 후속 이슈와 change 링크를 남긴다.

### Google과 Naver 제출은 일회성 운영 task로 수행한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 Google·Naver 일회성 등록 범위, Google 공식 sitemap 제출 문서 `<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>`, Naver Search Advisor 제출 문서 `<https://searchadvisor.naver.com/guide/request-feed>`.
- Status: Active
- Context / Problem: 구현 완료만으로 실제 production origin의 접근성이나 선정한 검색엔진 도구가 sitemap을 처리하는지 증명할 수 없다. 그러나 관리 도구 제출은 제품이 계속 제공해야 하는 runtime capability가 아니다.
- Decision Outcome: 프로덕션 무인증 응답을 검증한 뒤 canonical `/sitemap.xml`을 Google Search Console과 Naver Search Advisor에 한 번 제출하고, 대상·확인 시각·fetch 또는 처리 상태·오류를 `PROD-731`에 기록한다. 이 운영 task를 spec requirement, 반복 제출 자동화 또는 배포별 재제출 capability로 만들지 않는다. 개별 URL 색인 완료는 제출 증거에 포함하지 않는다.
- Alternatives Considered: Bing 제출은 승인된 대상이 아니므로 제외했다. 한 검색엔진만 제출하면 승인된 Google·Naver 범위를 충족하지 못한다. IndexNow·URL Submission API 및 반복 자동화는 현재 범위를 넓히므로 제외했다.
- Consequences: 배포 전에 두 도구의 production property와 제출 권한을 확인해야 한다. Naver는 현재 10 MB 이상의 sitemap file과 50,000개 이상의 URL을 제출할 수 없다고 안내하므로 제출 시점의 실제 파일 크기와 URL 수를 별도로 확인한다. 권한 또는 도구 제약은 코드 결함과 구분해 이슈 blocker로 기록한다.
- Confirmation / Follow-up: 제출 UI가 보고한 처리 결과를 비민감한 형태로 이슈에 남기고, 실제 색인 여부를 과장하지 않는다.

### `robots.txt` 정책과 Sitemap 지시어는 이 change에서 수정하지 않는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-731`의 sitemap 구현 범위, 관련 이슈 `PROD-736`의 2026-08-18 본문·승인 스냅샷에 기록된 crawler·Cloudflare edge·ActivityPub 안전 경계와 `Sitemap` 지시어 소유 범위.
- Status: Active
- Context / Problem: sitemap 제공과 crawler 허용 정책을 한 변경에 섞으면 `PROD-736`의 보안·ActivityPub 검증 경계를 우회할 수 있다.
- Decision Outcome: 이 change는 `/sitemap.xml` 생성·응답·제출 증거만 소유한다. `apps/app/public/robots.txt`, crawler 분류, bot 차단과 `Sitemap` 지시어는 수정하지 않는다.
- Alternatives Considered: 같은 PR에서 robots 지시어까지 추가하면 운영 순서는 단순해지지만 별도 이슈의 crawler 안전 검증을 섞으므로 제외했다.
- Consequences: 검색엔진 제출은 sitemap URL을 직접 사용한다. `PROD-736`은 sitemap 프로덕션 성공을 확인한 뒤 자체 범위와 검증으로 진행한다.
- Confirmation / Follow-up: 구현 diff와 테스트 범위에서 `robots.txt`가 바뀌지 않았는지 확인하고, 필요 시 `PROD-736`에 sitemap 준비 상태만 연결한다.

## Remaining Decisions

- 없음. 프로덕션 URL 수·byte 크기와 검색엔진 계정 권한은 구현·배포 verification gate에서 확인할 운영 사실이며, 현재 제품 결정을 요구하지 않는다.

## Superseded Decisions

- 2026-08-27: “Protocol 한도에 임박하거나 초과하면 `PROD-731` 안에서 sitemap index와 child sitemap으로 전환한다”는 선택을 폐기했다. 현재 change는 단일 sitemap만 제공하고 45,000 URL 또는 45 MB(47,185,920 bytes)에서 별도 change를 만든다.
- 2026-08-27: “Google Search Console과 Bing Webmaster Tools 제출을 sitemap capability로 검증한다”는 선택을 폐기했다. Google·Naver 제출은 `PROD-731`의 일회성 운영 task이고 durable spec에는 프로덕션 무인증 접근만 남긴다.
