## Context

현재 `apps/web` Hono BFF는 모든 요청을 Fedify에 먼저 전달한 뒤 login·logout·GraphQL route와 Expo 정적 파일을 처리한다. 정적 route는 실제 파일을 찾지 못한 browser navigation 요청에 `index.html`을 반환하므로, 별도 route가 없는 `/sitemap.xml`은 검색엔진용 표현이 아니라 SPA shell이 될 수 있다. Web runtime에는 `DATABASE_URL`과 `PUBLIC_ORIGIN`이 이미 주입되고, configured Local Instance resolver는 두 값을 연결한 Local·Active Instance를 검증한다.

현재 저장 모델에서 Profile은 `instanceId`, state, handle과 생성 시각을 가지지만 신뢰 가능한 마지막 수정 시각은 없다. Post는 state, visibility, Author Profile, Current Content와 생성 시각을 가지며, Current Content가 가리키는 immutable Post Content revision의 생성 시각은 실제 콘텐츠 수정 시각으로 사용할 수 있다. 공개 Post route의 `postId`는 DB UUID 자체가 아니라 기존 `Post` GraphQL global ID이고, Local Profile route는 `@{handle}`을 사용한다.

Sitemap protocol과 Google은 단일 sitemap을 50,000 URL·압축 해제 기준 50 MB 이하로 제한한다. Google Search Console과 Bing Webmaster Tools는 XML sitemap 또는 sitemap index 제출·처리 상태를 제공한다. 이 외부 문서는 상위 제품 권위가 아니라 interoperability와 운영 검증 제약으로 사용한다.

- <https://www.sitemaps.org/protocol.html>
- <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>
- <https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed>

## Goals / Non-Goals

**Goals:**

- `/sitemap.xml`을 SPA fallback과 분리된 동적 XML route로 제공한다.
- 공개 정적 route, configured Local Instance의 공개 Profile과 Public Content Post만 일괄 조회한다.
- 기존 canonical origin·relative handle·Post global ID 계약을 재사용해 URL을 만들고 안전하게 XML 직렬화한다.
- 실제로 신뢰 가능한 Post Content revision 시각만 `lastmod`로 제공한다.
- 자동 검증, 프로덕션 HTTP 검증과 검색엔진 제출 결과를 한 이슈의 완료 증거로 연결한다.

**Non-Goals:**

- SSR, 페이지별 HTML metadata·canonical tag와 search ranking 최적화
- `robots.txt`의 crawler·AI bot 정책 또는 `Sitemap` 지시어 변경(`PROD-736` 소유)
- Remote 원본의 Kosmo mirror URL, 제한 공개 콘텐츠, 보호·내부 route 노출
- `changefreq`, `priority`, 추정 `lastmod`, IndexNow·URL Submission API 자동화
- GraphQL schema, 데이터베이스 schema·migration, 새 dependency 추가

## Implementation Guidance

### Current Constraints

- sitemap route가 Expo 정적 route 뒤에 등록되면 browser navigation 요청이 `index.html`로 흡수된다. 반대로 전역 Fedify middleware보다 앞에 두면 현재 federation-first representation 계약을 바꾼다.
- read-only list는 `packages/core/services`의 state-changing application action이 아니므로 Web 진입점의 query 계층에서 `@kosmo/core/db`와 configured Local Instance를 사용해야 한다.
- Profile state의 현재 DB projection은 `ACTIVE`만 공개 Active·Normal 상태로 취급하고 `DISABLED`·`SUSPENDED`를 제외한다. Local 여부는 요청 Host나 handle 모양이 아니라 configured Local Instance ID로 제한해야 한다.
- Post canonical route는 DB UUID를 직접 노출하지 않는다. 기존 global ID encoder와 Local Author handle을 사용해야 한다.
- `Profiles`와 `Posts`에는 일반적인 `updatedAt`이 없다. `Posts.createdAt`, 요청 시각 또는 배포 시각은 현재 페이지 수정 시각을 대신하지 못한다.
- Current Content가 없는 Post는 독립 canonical detail을 제공하지 않는 Repost일 수 있다. Post query는 Current Content를 실제 revision과 연결해야 한다.

### Recommended Approach

1. 전역 Fedify middleware와 기존 BFF 전용 route 흐름은 유지하고, sitemap Hono route를 GraphQL 뒤·Expo 정적 route 앞에 등록한다. GET `/sitemap.xml`은 명시적인 `application/xml; charset=utf-8` 응답을 만들고 cache는 매 요청 재검증되는 방향을 기본으로 한다.
2. Web 진입점의 read-only loader가 configured Local Instance를 한 번 해석한 뒤 정적 allowlist, Profile, Post entry를 만든다. 현재 정적 allowlist는 공개 landing `/`와 공개 개인정보 처리방침 `/privacy`로 제한한다.
3. Profile은 configured Local Instance ID와 `ACTIVE` state로 제한해 handle을 가져오고 `/{@handle}` URL을 만든다. Post는 같은 Local Author, `ACTIVE`, `PUBLIC`, non-null Current Content를 명시적으로 join하고 Current Post Content revision 생성 시각을 함께 가져온다. 두 동적 집합은 ID 기반의 안정적인 순서로 조회해 출력과 테스트를 결정적으로 유지한다.
4. Post URL은 기존 global ID encoder로 DB UUID를 `Post` ID로 바꾼 뒤 `/{@handle}/{postGlobalId}`로 구성한다. 모든 URL은 resolver가 검증한 canonical origin을 기준으로 `URL`을 통해 만들고 query·hash를 추가하지 않는다.
5. XML 생성은 entry 목록을 받는 순수 직렬화 경계로 두어 XML declaration, sitemap namespace, `<url>`·`<loc>`·선택적 `<lastmod>`를 한 곳에서 생성한다. XML text의 예약 문자를 escape하고 Post revision의 `Temporal.Instant`만 표준 문자열로 출력하며 정적·Profile entry의 `lastmod`는 생략한다.
6. 생성 전 URL 수와 생성 후 UTF-8 byte 크기를 protocol 한도와 비교한다. 한도를 넘으면 일부 URL만 담은 성공 응답이나 무효 XML을 반환하지 말고 명시적 서버 오류로 실패시킨다. 배포 전 실제 eligible count·예상 크기가 한도 아래인지 확인하고, 한도에 도달했다면 같은 구현에서 sitemap index와 분할 child sitemap으로 전환한다.
7. 순수 XML 단위 테스트는 escaping, 중복 제거, metadata 생략과 content type을 검증한다. Web runtime test는 navigation header에서도 SPA가 아닌 XML임을 확인한다. 기존 격리 PostgreSQL·Playwright E2E 경계에서는 Local/Remote, Profile state, Post visibility/state/content 조합을 seed해 실제 포함·제외 URL과 global ID·`lastmod`를 검증한다.

### Allowed Alternatives

- 현재 eligible URL이 단일 문서 한도에 가깝거나 초과한다면 `/sitemap.xml`을 sitemap index로 만들고 정적·Profile·Post child sitemap을 분할할 수 있다. root와 child 전체가 동일한 include/exclude·origin·metadata 계약을 만족하고 제출 검증이 root index에서 시작되어야 한다.
- route 내부 모듈 분리와 테스트 seam의 구체적 형태는 달라도 된다. 다만 read-only query를 state-changing core service로 포장하거나 production에 없는 generic database interface를 테스트만을 위해 공개해서는 안 된다.
- 짧은 bounded cache나 ETag를 사용할 수 있지만, 삭제·비공개 전환 URL이 장기간 남지 않고 새 공개 URL과 수정 시각이 다음 crawler fetch에서 갱신된다는 점을 검증해야 한다.

### Known Traps

- `apps/app/public`에 빌드 시점 XML을 두면 runtime DB의 생성·삭제·visibility 변경을 반영하지 못한다.
- request Host, `PUBLIC_API_ORIGIN`, ActivityPub Note URI 또는 Remote 원본 URL을 `<loc>` 기준으로 사용하면 canonical Web origin 계약을 깨뜨린다.
- Post DB UUID를 route에 직접 넣으면 클라이언트가 사용하는 GraphQL global ID route와 다른 URL이 된다.
- `Profiles.state = ACTIVE`만 보고 Instance ID를 제한하지 않으면 Remote 또는 다른 Local Instance Profile이 섞인다.
- `Posts.visibility = PUBLIC`만 보고 Author/Profile/Instance state와 Current Content를 확인하지 않으면 삭제·unavailable·Content 없는 항목이 노출된다.
- `Date.now()`, Post 생성 시각 또는 Profile 생성 시각을 `lastmod`로 복제하면 실제 수정 시각이라는 신호가 거짓이 된다.
- XML escaping, UTF-8 byte 크기, 50,000 URL 제한을 테스트하지 않으면 잘 형성된 것처럼 보이는 무효 sitemap을 배포할 수 있다.
- 이 change에서 `robots.txt`까지 수정하면 `PROD-736`의 crawler·ActivityPub 안전 경계와 책임이 섞인다.

## Risks / Trade-offs

- [동적 sitemap이 DB 가용성에 의존] → 설정·조회 실패를 부분 성공으로 숨기지 않고 기존 Web 오류 경계와 Sentry에 전달한다. 정상 응답은 매번 현재 eligibility를 반영한다.
- [전체 entry materialization의 메모리·응답 크기] → 배포 전 count·byte 크기를 측정하고 protocol 한도를 runtime에서 방어한다. 한도에 가까우면 sitemap index로 전환한다.
- [공개 콘텐츠 증가로 현재 단일 urlset이 한도를 초과] → URL을 누락한 채 성공하지 않고 실패시킨다. 구현·배포 gate에서 현재 규모를 확인하며, 초과 시 허용 대안인 분할 index를 같은 이슈 범위에서 적용한다.
- [두 read query 사이에 콘텐츠 상태가 바뀜] → sitemap은 discovery snapshot이며 다음 fetch에서 수렴한다. 강한 snapshot을 위해 장시간 transaction이나 lock을 추가하지 않는다.
- [crawler 요청이 DB 읽기 부하를 만든다] → Profile의 instance-prefix unique index와 Post의 profile index를 활용하는 join을 유지하고, 실제 query plan·응답 시간을 E2E/프로덕션에서 확인한다. 필요성이 확인되기 전 schema index를 선제 추가하지 않는다.
- [검색엔진 계정 권한이 없어 완료 검증 지연] → 구현과 별개로 Search Console·Bing Webmaster Tools의 verified property와 제출 권한을 프로덕션 배포 전에 확인하고, 누락 시 `PROD-731` blocker로 기록한다.

## Migration Plan

1. sitemap query·직렬화·route와 자동 검증을 추가하고 `openspec validate add-public-sitemap --strict`, Web unit/E2E, typecheck를 통과시킨다.
2. 데이터 migration 없이 기존 immutable Web image로 배포한다. `PROD-736`의 robots 지시어는 sitemap이 프로덕션에서 성공한 뒤 별도 배포·검증한다.
3. 프로덕션 `/sitemap.xml`의 상태, `Content-Type`, XML parse, URL 수·byte 크기, 대표 정적/Profile/Post 포함과 제한·Remote·삭제 항목 제외를 확인한다. 실제 사용자 콘텐츠나 내부 식별 값을 증거에 복사하지 않는다.
4. Google Search Console과 Bing Webmaster Tools에 canonical `/sitemap.xml`을 제출하고 fetch/processing 상태와 확인 시각을 `PROD-731`에 기록한다.
5. rollback은 sitemap route가 없는 직전 Web image로 되돌린다. DB·GraphQL·정적 자산 migration이 없으므로 데이터 복구는 필요 없으며, 제출 도구에는 일시적인 fetch 실패가 나타날 수 있음을 기록한다.

## Open Questions

- 프로덕션의 현재 eligible URL 수와 생성 XML byte 크기는 아직 확인하지 못했다. 구현 완료 전 protocol 한도 아래임을 계수하고, 초과하거나 임박하면 sitemap index 대안을 적용해야 한다.
- Google Search Console과 Bing Webmaster Tools의 production property·제출 권한 보유자는 아직 확인하지 못했다. 배포 전 운영 담당자와 권한을 확인해야 한다.
