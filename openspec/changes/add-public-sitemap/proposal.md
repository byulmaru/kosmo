## Why

현재 Web BFF는 `/sitemap.xml` 요청을 검색엔진용 XML로 처리하지 않아 브라우저 navigation에서는 Expo SPA HTML을 반환할 수 있다. 그 결과 검색엔진이 공개 Profile과 Public Post의 canonical Web URL을 안정적으로 발견할 단일 진입점이 없으므로, 첫 프로덕션 운영 직후 검색 노출과 제출 결과를 검증할 수 있는 sitemap이 필요하다.

## What Changes

- Web origin의 `/sitemap.xml`에서 UTF-8 `application/xml` sitemap을 동적으로 제공한다.
- 명시적으로 공개된 정적 route(`/`, `/privacy`), configured Local Instance의 Active Profile, 그리고 Active·Public·Content 보유 Local Post의 canonical Web URL만 포함한다.
- Remote Profile·Remote Post, Unlisted·Followers Only·Mentioned Profiles Post, 비활성·정지·삭제된 Profile/Post, Content 없는 Repost와 보호·내부 route를 제외한다.
- 모든 URL을 `PUBLIC_ORIGIN`과 기존 canonical route 계약에서 파생한 절대 URL로 만들고, route segment의 URL percent-encoding과 완성된 URL의 XML escaping을 분리한다. 신뢰 가능한 수정 시각이 있는 Post에만 현재 Post Content revision 시각을 `lastmod`로 제공하며 Profile과 정적 route에는 추정 시각을 만들지 않는다.
- 단일 sitemap의 URL 수와 압축하지 않은 UTF-8 XML 크기를 protocol 상한 안에서 검증하고, 일부 URL을 잘라 성공 응답을 만들지 않는다.
- Web BFF route·조회·직렬화 자동 검증과 프로덕션 무인증 응답 검증을 추가한다. 배포 뒤 Google Search Console과 Naver Search Advisor 제출은 durable capability가 아닌 일회성 운영 task로 수행하고 결과를 `PROD-731`에 기록한다.
- URL 수가 45,000개 또는 압축하지 않은 UTF-8 XML 크기가 45 MB(47,185,920 bytes)에 도달하면 sitemap index 지원을 위한 별도 Linear 이슈와 OpenSpec change를 생성한다. 이 change에서는 sitemap index와 child sitemap을 구현하지 않는다.
- `robots.txt`의 crawler 분류와 `Sitemap` 지시어는 관련 이슈 `PROD-736`이 소유하므로 이 change에서는 수정하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0015-post-share-reference.md`; 적용되는 sitemap 전용 `docs/design` 문서는 없음.
- Runtime Boundary: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`의 application query·공유 runtime DB 경계를 따른다.
- Linear Contract: `PROD-731` 본문과 관계(2026-08-27 재조회 및 승인 결정 반영).
- Linear Implementations: `PROD-731`이 단일 sitemap 구현·자동 검증·프로덕션 무인증 응답 검증과 Google·Naver 일회성 제출 task를 소유한다. 반복 제출 capability와 sitemap index 구현은 소유하지 않는다.
- Related Boundary: `PROD-736`은 `robots.txt` crawler 정책, Cloudflare edge 적용·검증과 `Sitemap` 지시어를 별도로 소유한다. 해당 이슈의 2026-08-18 계약 갱신은 `/sitemap.xml` 구현 소유권을 `PROD-731`에 유지한다.

## Capabilities

### New Capabilities

- `public-sitemap`: 공개 canonical 정적·Profile·Post URL의 선택, 단일 XML 응답, 신뢰 가능한 `lastmod`, protocol 상한과 프로덕션 무인증 접근을 정의한다.

### Modified Capabilities

- `web-platform`: 기존 Web BFF server endpoint와 SPA fallback 우선순위 계약에 공개 `/sitemap.xml` endpoint를 추가한다.

## Impact

- `apps/web`의 federation-first 라우팅과 SPA fallback 사이에 sitemap 전용 read-only route와 조회·XML 직렬화가 추가된다.
- 기존 공유 runtime DB와 application policy helper, configured Local Instance 해석, Profile handle, Post GraphQL global ID 계약을 재사용한다. sitemap의 공개 검색 후보는 일반 익명 조회가 허용하는 Unlisted까지 포함하지 않도록 Public-only 조건을 명시적으로 합성한다.
- Web BFF 단위 테스트와 격리 PostgreSQL 기반 조회 테스트, 프로덕션 HTTP 검증이 추가된다. Google·Naver 제출은 배포 후 한 번 수행하는 이슈 완료 task이며 반복 가능한 제품 capability나 배포 자동화가 아니다.
- 데이터베이스 schema·migration, GraphQL schema, Expo UI, 새 runtime dependency, operation-scoped DB session·actor GUC·GraphQL RLS 경계, `apps/app/public/robots.txt`는 추가하거나 변경하지 않는다.
