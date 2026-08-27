## Why

현재 Web BFF는 `/sitemap.xml`에 대응하는 export asset이 없어 browser navigation 요청에서 Expo SPA HTML을 반환할 수 있다. 현재 공개하기로 확정한 세 canonical URL을 검색엔진이 발견하고 Google Search Console과 Naver Search Advisor에서 처리 결과를 확인할 수 있도록 정적 sitemap이 필요하다.

## What Changes

- Web origin의 `/sitemap.xml`에서 Expo export에 포함된 정적 UTF-8 `application/xml` sitemap을 제공한다.
- sitemap은 `https://kos.moe/`, `https://kos.moe/privacy`, Kosmo 공식 안내 계정 `https://kos.moe/@kosmo`만 각각 한 번 포함한다.
- 일반 Local·Remote Profile과 Post를 열거하지 않고, DB 조회나 런타임 동적 생성 없이 제공한다.
- 현재 세 URL에는 `lastmod`, `changefreq`, `priority`를 제공하지 않는다.
- 정적 asset이 browser navigation에서도 SPA fallback보다 먼저 제공되는지 자동 검증하고, 프로덕션 무인증 응답을 확인한다.
- 배포 뒤 Google Search Console과 Naver Search Advisor 제출은 durable capability가 아닌 일회성 운영 task로 수행하고 결과를 `PROD-731`에 기록한다.
- Profile·Post 등 공개 URL을 데이터 상태에 따라 포함하는 동적 sitemap은 별도 Linear 이슈와 OpenSpec change에서 공개 eligibility, 갱신·삭제 반영, cache/invalidation, protocol 용량과 index 전환 기준을 결정한 뒤 구현한다.
- `robots.txt`의 crawler 분류와 `Sitemap` 지시어는 관련 이슈 `PROD-736`이 소유하므로 이 change에서는 수정하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`의 Local Profile relative handle route 계약; 적용되는 sitemap 전용 `docs/design` 문서는 없음.
- Linear Contract: `PROD-731` 본문과 관계(2026-08-27 정적 3-URL 범위로 갱신하고 사용자 승인 반영).
- Linear Implementation: `PROD-731`이 정적 sitemap 구현·자동 검증·프로덕션 무인증 응답 검증과 Google·Naver 일회성 제출 task를 소유한다. 동적 sitemap과 반복 제출 capability는 소유하지 않는다.
- Related Boundary: `PROD-736`은 `robots.txt` crawler 정책, Cloudflare edge 적용·검증과 `Sitemap` 지시어를 별도로 소유한다.

## Capabilities

### New Capabilities

- `public-sitemap`: 현재 승인된 세 canonical URL의 정적 XML 표현과 프로덕션 무인증 접근을 정의한다.

### Modified Capabilities

- `web-platform`: Expo export asset과 SPA fallback 우선순위 계약에 공개 `/sitemap.xml` 정적 asset을 추가한다.

## Impact

- `apps/app/public/sitemap.xml` 정적 asset과 Web asset-serving 회귀 테스트가 추가된다.
- 기존 PR의 `apps/web` 동적 sitemap route·DB query·XML serializer와 해당 단위·DB E2E 테스트는 제거된다.
- 데이터베이스 schema·migration, GraphQL schema, Expo UI, 새 runtime dependency, `apps/app/public/robots.txt`는 변경하지 않는다.
- 프로덕션에서는 배포된 정적 asset을 확인하고 Google·Naver 제출 결과를 기록한다.
