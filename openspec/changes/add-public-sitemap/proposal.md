## Why

현재 Web BFF는 `/sitemap.xml` 요청을 검색엔진용 XML로 처리하지 않아 브라우저 navigation에서는 Expo SPA HTML을 반환할 수 있다. 그 결과 검색엔진이 공개 Profile과 Public Post의 canonical Web URL을 안정적으로 발견할 단일 진입점이 없으므로, 첫 프로덕션 운영 직후 검색 노출과 제출 결과를 검증할 수 있는 sitemap이 필요하다.

## What Changes

- Web origin의 `/sitemap.xml`에서 UTF-8 `application/xml` sitemap을 동적으로 제공한다.
- 명시적으로 공개된 정적 route(`/`, `/privacy`), configured Local Instance의 Active Profile, 그리고 Active·Public·Content 보유 Local Post의 canonical Web URL만 포함한다.
- Remote Profile·Remote Post, Unlisted·Followers Only·Mentioned Profiles Post, 비활성·정지·삭제된 Profile/Post, Content 없는 Repost와 보호·내부 route를 제외한다.
- 모든 URL을 `PUBLIC_ORIGIN`과 기존 canonical route 계약에서 파생한 절대 URL로 만들고 XML escaping을 적용한다. 신뢰 가능한 수정 시각이 있는 Post에만 현재 Post Content revision 시각을 `lastmod`로 제공하며 Profile과 정적 route에는 추정 시각을 만들지 않는다.
- Web BFF route·조회·직렬화 자동 검증과 프로덕션 응답 검증을 추가하고, Google Search Console 및 Bing Webmaster Tools의 제출·처리 결과를 `PROD-731`에 기록한다.
- `robots.txt`의 crawler 분류와 `Sitemap` 지시어는 관련 이슈 `PROD-736`이 소유하므로 이 change에서는 수정하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0015-post-share-reference.md`; 적용되는 sitemap 전용 `docs/design` 문서는 없음.
- Linear Contract: `PROD-731` 본문과 관계(2026-08-10 조회, 계약 변경 댓글 없음).
- Linear Implementations: `PROD-731`이 구현·자동 검증·프로덕션 제출 검증을 함께 소유한다.
- Related Boundary: `PROD-736`은 `robots.txt` crawler 정책과 sitemap 지시어를 별도로 소유한다.

## Capabilities

### New Capabilities

- `public-sitemap`: 공개 canonical 정적·Profile·Post URL의 선택, XML 응답, 신뢰 가능한 `lastmod`, 프로덕션 검색엔진 제출 검증을 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/web`의 federation-first 라우팅과 SPA fallback 사이에 sitemap 전용 read-only route와 조회·XML 직렬화가 추가된다.
- 기존 `@kosmo/core/db`, configured Local Instance 해석, Profile handle, Post GraphQL global ID 계약을 재사용한다.
- Web BFF 단위 테스트와 격리 PostgreSQL 기반 조회 테스트, 프로덕션 HTTP·검색엔진 운영 검증이 추가된다.
- 데이터베이스 schema·migration, GraphQL schema, Expo UI, 새 runtime dependency, `apps/app/public/robots.txt`는 변경하지 않는다.
