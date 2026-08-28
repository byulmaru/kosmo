## Context

현재 `apps/web` Hono BFF는 모든 요청을 Fedify에 먼저 전달한 뒤 login·logout·GraphQL route와 Expo export asset을 처리한다. 정적 route는 요청 path와 일치하는 실제 파일을 먼저 제공하고, 파일을 찾지 못한 browser navigation 요청에만 `index.html`을 반환한다. 현재 Expo export에는 `sitemap.xml`이 없으므로 `/sitemap.xml` browser navigation은 검색엔진용 XML 대신 SPA shell이 될 수 있다.

2026-08-27 갱신한 `PROD-731`은 현재 sitemap URL 집합을 `https://kos.moe/`, `https://kos.moe/privacy`, Kosmo 공식 안내 계정 `https://kos.moe/@kosmo`로 고정했다. 일반 Profile·Post는 포함하지 않고, DB 조회와 런타임 동적 생성도 현재 범위에서 제외했다. 동적 sitemap은 공개 eligibility, 갱신·삭제 반영, cache/invalidation, protocol 용량과 sitemap index 전환 기준을 별도 Linear 이슈와 OpenSpec change에서 결정한 뒤 구현한다.

Expo는 `apps/app/public`의 정적 파일을 Web export 산출물에 포함하고, Web BFF는 기본 `apps/app/dist` 또는 `EXPO_WEB_ROOT`가 가리키는 export root를 제공한다. 따라서 현재 범위는 별도 Hono handler 없이 export asset으로 충족할 수 있다.

Google Search Console과 Naver Search Advisor 제출은 배포 후 한 번 수행하는 운영 task다. 반복 제출 자동화나 검색엔진별 runtime capability는 현재 범위가 아니다.

## Goals / Non-Goals

**Goals**

- 프로덕션 `/sitemap.xml`에서 유효한 UTF-8 `application/xml`을 인증 없이 제공한다.
- sitemap에 승인된 세 canonical URL만 각각 한 번 포함한다.
- browser navigation에서도 정적 sitemap asset이 SPA fallback보다 먼저 제공되게 한다.
- sitemap 제공을 DB와 런타임 query에서 분리한다.
- Expo Web export와 XML을 검증한다.
- 프로덕션 확인과 Google·Naver 일회성 제출은 OpenSpec archive와 분리된 `PROD-731` 운영 체크리스트로 남긴다.

**Non-Goals**

- 일반 Local·Remote Profile 또는 Post URL 포함
- DB 기반 공개 eligibility 판정과 런타임 동적 sitemap 생성
- `lastmod`, `changefreq`, `priority` 제공
- cache, ETag 또는 invalidation 정책 추가
- sitemap index와 child sitemap
- sitemap 전용 unit/E2E 테스트 코드
- SSR 또는 페이지 metadata 전반의 개편
- `robots.txt` crawler 정책과 `Sitemap` 지시어
- 반복 제출 자동화와 개별 URL 색인 완료 보장

## Decisions

### Current Constraints

- 전역 Fedify middleware의 federation-first representation 순서는 유지해야 한다.
- `/sitemap.xml`과 일치하는 export asset이 존재하면 기존 static route가 SPA fallback보다 먼저 파일을 제공한다.
- 현재 sitemap은 production canonical origin `https://kos.moe`의 세 URL만 포함한다. request Host나 개발 origin에 따라 본문을 바꾸지 않는다.
- 정적 asset은 DB, configured Local Instance resolver, application visibility helper 또는 GraphQL runtime에 의존해서는 안 된다.
- 현재 세 URL에는 신뢰할 수 있는 마지막 수정 시각이 없으므로 `lastmod`을 만들지 않는다.
- `PROD-736`이 소유하는 `robots.txt`와 Cloudflare crawler 정책은 변경하지 않는다.

### Recommended Approach

1. `apps/app/public/sitemap.xml`에 XML declaration, Sitemap protocol namespace와 세 `<url><loc>…</loc></url>` entry만 둔다.
2. 기존 PR에서 추가한 동적 Hono sitemap route, DB loader, XML serializer와 관련 단위·격리 DB E2E 테스트를 제거한다.
3. 새 sitemap 전용 unit/E2E 테스트를 추가하지 않고 source XML의 형식과 정확한 URL 집합을 검사한다.
4. Expo Web export에 source와 같은 `sitemap.xml`이 포함되는지 build 결과로 확인한다.
5. 배포 후 crawler와 browser navigation 형식의 무인증 production 응답에서 status, content type, XML 구조, 정확한 URL 집합과 SPA fallback 비적용을 `PROD-731` 운영 체크리스트로 확인한다.
6. canonical `/sitemap.xml`을 Google Search Console과 Naver Search Advisor에 한 번 제출하고 처리 결과를 `PROD-731`에 기록한다. 5–6은 OpenSpec archive 조건이 아니다.
7. 동적 sitemap이 필요해지면 현재 change에 DB 로직을 다시 추가하지 않고 별도 Linear 이슈와 OpenSpec change에서 범위와 운영 계약부터 결정한다.

### Allowed Alternatives

- 같은 고정 XML을 Hono handler에서 문자열로 반환할 수는 있지만, 현재 Linear가 정적 자산과 런타임 동적 생성 제외를 명시하므로 이 change의 허용 대안이 아니다.
- build-time template로 XML을 생성할 수는 있지만, 현재 canonical origin과 URL 집합이 모두 고정돼 있어 생성 script와 검증 경계를 추가할 이유가 없다.
- 정적 asset의 기존 `Cache-Control: no-cache` 동작은 유지할 수 있다. 새 cache 또는 ETag 정책은 현재 scope에 추가하지 않는다.

### Known Traps

- `sitemap.xml`을 Expo public asset 밖에 두면 Web export에서 누락돼 browser navigation이 SPA HTML로 fallback할 수 있다.
- 기존 동적 route import가 남으면 정적 asset보다 먼저 요청을 처리하고 DB 의존성을 유지할 수 있다.
- Profile·Post 전체 또는 공식 계정 이외의 Profile을 자동 열거하면 승인된 세 URL 범위를 위반한다.
- relative URL을 `<loc>`에 넣거나 request Host를 사용하면 production canonical URL 계약을 깨뜨린다.
- 신뢰 근거 없이 `lastmod`을 추가하면 검색 crawler에 잘못된 freshness 신호를 준다.
- 동적 구현의 spec, decision, task 또는 테스트를 남겨두면 후속 작업자가 현재 범위를 잘못 해석할 수 있다.
- 이 change에서 `robots.txt`를 수정하면 `PROD-736`의 crawler·ActivityPub 안전 경계와 책임이 섞인다.

## Risks / Trade-offs

- [새 공개 URL이 자동 반영되지 않음] → 현재 단계에서는 의도한 제한이다. 동적 확장은 별도 Linear·OpenSpec 승인 뒤 구현한다.
- [공식 안내 계정 handle 또는 공개 경로가 바뀌면 정적 파일이 낡음] → 현재 canonical route 변경 시 `PROD-731` 계약과 정적 asset을 명시적으로 갱신한다.
- [정적 파일도 배포 artifact에서 누락될 수 있음] → Expo export 결과와 배포 후 프로덕션 응답을 검증한다.
- [검색엔진 계정 권한으로 일회성 검증이 지연될 수 있음] → 권한 문제는 코드 결함과 구분해 `PROD-731` blocker로 기록한다.

## Migration Plan

1. Linear와 OpenSpec을 정적 3-URL 계약으로 정렬한다.
2. 기존 동적 sitemap 구현과 테스트를 제거하고 정적 asset만 남긴다. 새 sitemap 전용 테스트 코드는 추가하지 않는다.
3. 기존 workspace test, typecheck, lint, Expo Web export, XML 검사와 OpenSpec strict validation을 실행한다.
4. 사용자 diff 리뷰를 받은 뒤 commit·push하고 PR 본문과 상태를 갱신한다.
5. OpenSpec을 active spec과 동기화해 archive한다.
6. 배포 후 production `/sitemap.xml`을 인증 없이 검증하고 Google·Naver에 한 번 제출한 결과는 `PROD-731` 운영 체크리스트에 기록한다.
7. rollback은 sitemap asset이 없는 직전 Web image로 되돌린다. DB·GraphQL·migration 변경은 없으므로 데이터 복구는 필요 없다.

## Open Questions

- Google Search Console과 Naver Search Advisor의 production property·제출 권한 보유자는 배포 전에 확인해야 한다.
