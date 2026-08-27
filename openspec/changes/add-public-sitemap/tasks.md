## 1. PROD-731 공개 sitemap 구현

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0015-post-share-reference.md`
- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-731` 본문과 2026-08-27 승인 결정

**Deliverable**

Web origin의 `/sitemap.xml`이 공개 정적 페이지와 eligible Local Profile·Post의 canonical URL만 담은 유효한 최신 XML을 인증 없이 제공한다.

**Guardrails**

- 공개 정적 route는 `/`와 `/privacy`로 제한하고 보호·인증·callback·내부 endpoint를 포함하지 않는다.
- configured Local Instance의 공개 가능한 Active Profile과 Active·Public·Current Content 보유 Post만 포함하며 Remote·제한 공개·삭제·Content 없는 Repost를 제외한다. 일반 익명 visibility가 허용하는 Unlisted는 sitemap 검색 후보에서 명시적으로 제외한다.
- 조회는 공유 runtime DB와 application policy 경계를 사용한다. operation-scoped DB session·actor GUC·GraphQL RLS 경계를 추가하거나 복원하지 않는다.
- URL은 canonical `PUBLIC_ORIGIN`, relative handle, 기존 `Post` global ID 계약을 사용한다. route segment의 URL percent-encoding과 완성된 URL의 XML text escaping을 별도 단계로 적용한다.
- Post Current Content revision의 실제 시각에만 `lastmod`를 제공하며 정적·Profile에는 추정 시각, `changefreq`, `priority`를 제공하지 않는다.
- 하나의 `urlset`만 제공하고, 일부 URL을 잘라 성공시키지 않으며 Sitemap protocol의 50,000 URL·52,428,800 UTF-8 byte 상한을 지킨다.
- 45,000 URL 또는 45 MB(47,185,920 bytes)에 도달하면 sitemap index를 현재 change에 추가하지 않고 별도 Linear 이슈와 OpenSpec change를 생성한다.
- GraphQL·DB schema와 migration, 새 dependency, `robots.txt`를 변경하지 않는다.

**Verification**

- `/sitemap.xml`의 상태·content type·XML parse 결과와 SPA fallback 비적용을 검증한다.
- 정적/Profile/Post 포함·제외 matrix, Content가 있는 Reply·Quote, Public 포함·Unlisted 제외, canonical URL, global ID, URL percent-encoding, XML escaping, `lastmod`와 protocol 한도 경계를 자동화된 테스트로 검증한다.

- [ ] 1.1 구현 직전 eligible URL 수와 압축하지 않은 UTF-8 XML byte 크기를 측정하고, 단일 `urlset`이 protocol 상한 아래인지 확인한다. 45,000 URL 또는 45 MB(47,185,920 bytes)에 도달했다면 sitemap index 지원용 별도 Linear 이슈와 OpenSpec change를 생성하고 링크를 `PROD-731`에 기록한다.
- [x] 1.2 공유 runtime DB의 application policy를 재사용·합성하고 Public-only 조건을 명시해 공개 정적 route와 eligible Local Profile·Post를 canonical sitemap entry로 제공하는 read-only Web 동작을 구현한다.
- [x] 1.3 XML response, metadata 생략, URL percent-encoding과 XML escaping의 분리, 중복 방지와 URL 수·byte 상한 초과 시 비부분 실패 동작을 구현한다.
- [x] 1.4 `/sitemap.xml`이 federation-first 동작을 유지하면서 Expo SPA fallback보다 우선하는 전용 XML 표현이 되도록 Web route에 연결한다.

## 2. PROD-731 자동 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0015-post-share-reference.md`
- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-731`의 포함·제외, URL escaping·canonical origin·`lastmod`, Web 응답 완료 조건

**Deliverable**

회귀가 발생하면 공개 범위, URL 표현, XML 형식 또는 route 우선순위 중 어떤 계약이 깨졌는지 자동 검증이 구체적으로 보여 준다.

**Guardrails**

- 실제 production과 다른 공개 database abstraction을 테스트만을 위해 추가하지 않는다.
- operation-scoped DB session·actor GUC·GraphQL RLS 경계를 테스트 편의를 위해 추가하지 않는다.
- 테스트는 기존 격리 PostgreSQL과 Web runtime 경계를 재사용하고 실제 사용자 데이터나 비밀값에 의존하지 않는다.
- `robots.txt`와 검색 ranking·개별 URL 색인 여부는 이 그룹의 검증 범위가 아니다.

**Verification**

- XML serializer 단위 테스트, Web route/runtime 테스트, 격리 DB 기반 inclusion/exclusion 테스트를 각각 통과시킨다.
- 변경 범위의 typecheck·lint와 `openspec validate add-public-sitemap --strict`를 통과시킨다.

- [x] 2.1 XML declaration·namespace·URL percent-encoding·XML escaping·중복 제거·선택적 `lastmod`·금지 metadata와 URL 수·byte 상한 경계 단위 테스트를 추가한다.
- [x] 2.2 crawler와 browser navigation 요청 모두 `application/xml`을 받고 Expo `index.html`을 받지 않는 Web route 테스트를 추가한다.
- [x] 2.3 Local/Remote Instance·Profile state·Post visibility/state/Current Content 조합을 seed해 실제 포함·제외, 특히 Content가 있는 eligible Reply·Quote 포함, Content 없는 Repost 제외, Public 포함과 일반 익명 조회 가능한 Unlisted 제외, canonical origin·handle·Post global ID·revision `lastmod`를 검증한다.
- [x] 2.4 변경 범위의 test·typecheck·lint와 OpenSpec strict validation을 실행하고 결과를 기록한다.

## 3. PROD-731 프로덕션 응답과 일회성 검색엔진 등록

**Authority / Provenance**

- `PROD-731`의 프로덕션 응답 확인·검색엔진 제출·완료 증거 범위
- Sitemap protocol `<https://www.sitemaps.org/protocol.html>`
- Google Search Central sitemap 제출 문서 `<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>`
- Naver Search Advisor sitemap 제출 문서 `<https://searchadvisor.naver.com/guide/request-feed>`
- 관련 이슈 `PROD-736`의 `robots.txt`·crawler 정책 소유 범위

**Deliverable**

프로덕션 sitemap을 인증 없이 가져갈 수 있고, Google과 Naver의 일회성 제출 결과가 `PROD-731` 완료 증거로 남는다. 검색엔진 제출 자동화나 반복 가능한 제품 capability는 만들지 않는다.

**Guardrails**

- 프로덕션 검증 증거에 실제 사용자 콘텐츠, 비공개 식별자, credential을 복사하지 않는다.
- sitemap fetch·processing 성공과 개별 URL의 실제 색인·검색 노출 완료를 구분한다.
- Google·Naver 제출은 배포 후 한 번 수행하며 정기 재제출이나 배포 자동화를 추가하지 않는다.
- Naver 제출 전에 실제 sitemap file이 현재 도구의 10 MB 미만·50,000 URL 미만 조건을 충족하는지 확인한다.
- `robots.txt`의 `Sitemap` 지시어와 crawler·AI bot 정책은 `PROD-736`에서 별도로 검증한다.

**Verification**

- 프로덕션 HTTP 상태·content type·XML parse·URL 수·UTF-8 byte 크기와 비민감한 대표 포함·제외 결과를 확인한다.
- Google Search Console과 Naver Search Advisor의 제출 대상, 확인 시각, fetch/processing 상태와 오류를 `PROD-731`에 기록한다.

- [ ] 3.1 배포 전에 Google Search Console과 Naver Search Advisor의 production property·제출 권한 보유자를 확인한다. Naver 제출 파일이 10 MB 미만이고 URL이 50,000개 미만인지 측정하며, 권한 또는 도구 제약이 있으면 코드 결함과 구분해 `PROD-731` blocker로 기록한다.
- [ ] 3.2 배포한 `/sitemap.xml`을 인증 없이 요청해 상태·content type·XML parse·URL 수·byte 크기와 비민감한 대표 포함·제외 결과를 검증한다.
- [ ] 3.3 canonical `/sitemap.xml`을 Google Search Console에 제출하고 확인 시각·처리 상태·오류를 `PROD-731`에 기록한다.
- [ ] 3.4 canonical `/sitemap.xml`을 Naver Search Advisor에 한 번 제출하고 확인 시각·처리 상태·오류를 `PROD-731`에 기록한다.
- [ ] 3.5 자동 검증과 두 검색엔진의 fetch/processing 증거가 모두 준비된 뒤 `PROD-731` 완료 조건을 다시 확인한다.

## Requirement → Task Traceability

| Requirement | 구현 task | 검증·운영 task |
| --- | --- | --- |
| 전용 XML sitemap 응답 | 1.3, 1.4 | 2.1, 2.2, 3.2 |
| 공개 정적 route allowlist | 1.2 | 2.3, 3.2 |
| 공개 Local Profile URL 선택 | 1.2 | 2.3, 3.2 |
| 공개 Local Post URL 선택 | 1.2 | 2.3, 3.2 |
| canonical URL과 보수적인 metadata | 1.2, 1.3 | 2.1, 2.3, 3.2 |
| 단일 sitemap의 완전성과 protocol 상한 | 1.1, 1.3 | 2.1, 3.2 |
| 프로덕션 무인증 접근 | 1.4 | 2.2, 3.2 |
| `web-platform` server endpoint·BFF 책임 수정 | 1.4 | 2.2 |
| Google·Naver 일회성 제출(운영 task, spec requirement 아님) | 없음 | 3.1, 3.3, 3.4, 3.5 |
