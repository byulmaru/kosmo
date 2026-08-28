## 1. PROD-731 정적 sitemap 구현

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `PROD-731` 본문과 2026-08-27 정적 3-URL 승인 결정

**Deliverable**

Web origin의 `/sitemap.xml`이 `https://kos.moe/`, `https://kos.moe/privacy`, `https://kos.moe/@kosmo`만 담은 유효한 정적 XML을 인증 없이 제공한다.

**Guardrails**

- 세 URL을 각각 한 번 포함하고 다른 정적 route, 일반 Profile 또는 Post URL을 포함하지 않는다.
- sitemap은 Expo public asset으로 제공하고 DB 조회, configured Local Instance 해석 또는 런타임 동적 생성을 사용하지 않는다.
- `lastmod`, `changefreq`, `priority`를 제공하지 않는다.
- 동적 sitemap용 loader, serializer, cache, protocol 상한 또는 index 전환 로직을 미래 대비용으로 남기지 않는다.
- sitemap 전용 unit/E2E 테스트 코드를 추가하지 않고 기존 test file을 변경하지 않는다.
- GraphQL·DB schema와 migration, 새 dependency, `robots.txt`를 변경하지 않는다.
- commit·push와 PR 갱신 전에 사용자에게 전체 diff 리뷰를 받는다.

**Verification**

- source XML의 형식, 정확한 URL 집합과 금지 metadata 부재를 검사한다.
- Expo Web export 산출물에 동일한 `sitemap.xml`이 포함되는지 확인한다.
- crawler와 browser navigation의 SPA fallback 비적용은 `PROD-731`의 배포 후 운영 체크리스트에서 검증하며 OpenSpec archive 조건으로 두지 않는다.
- 변경 diff에 sitemap 전용 DB query와 동적 Hono route가 남지 않았는지 검토한다.

- [x] 1.1 `apps/app/public/sitemap.xml`에 XML declaration, Sitemap protocol namespace와 승인된 세 `loc` entry만 추가한다.
- [x] 1.2 기존 sitemap 전용 Hono route, DB loader, XML serializer와 동적 Profile·Post eligibility·용량 경계 테스트 및 격리 DB E2E를 제거한다.
- [x] 1.3 sitemap 전용 unit/E2E 테스트를 추가하지 않고 `apps/web/src/server/app.test.ts`를 `main`과 동일하게 유지한다.
- [x] 1.4 source XML을 parse해 정확한 세 URL과 금지 metadata 부재를 확인한다.

## 2. PROD-731 저장소 검증

**Authority / Provenance**

- `PROD-731`의 XML 형식·정적 자산·SPA fallback 우선순위·DB 비의존 완료 조건
- 이 change의 `public-sitemap`과 `web-platform` specs

**Deliverable**

저장소 검증이 정적 sitemap의 공개 범위, XML 표현과 export 포함을 재현 가능하게 증명한다. Web 제공 경계의 배포 후 확인은 `PROD-731` 운영 체크리스트가 소유한다.

**Guardrails**

- 실제 사용자 데이터, production credential 또는 DB seed에 의존하지 않는다.
- 정적 파일의 source text 존재 여부만 검사하지 않고 Expo export 결과까지 검증한다.
- Web 요청 경계, `robots.txt`, 검색 순위와 개별 URL 색인 여부는 저장소 검증 범위가 아니다.

**Verification**

- 기존 Web 단위 테스트, app·web typecheck, lint, Prettier, Expo Web export, XML 검사와 `openspec validate add-public-sitemap --strict`를 통과시킨다.
- user-owned 기존 미커밋 변경을 보존하고 최종 diff에서 의도한 파일만 변경됐는지 확인한다.

- [x] 2.1 Expo Web export를 실행하고 산출물의 `sitemap.xml`이 source asset과 같으며 세 URL만 포함하는지 확인한다.
- [x] 2.2 기존 `@kosmo/app`·`@kosmo/web` test suite와 typecheck, workspace lint와 Prettier를 실행한다.
- [x] 2.3 `openspec validate add-public-sitemap --strict`를 실행하고 proposal·specs·design·decisions·tasks가 최신 Linear와 일치하는지 대조한다.
- [x] 2.4 전체 diff와 git status를 검토하고 commit·push·PR 갱신 전 사용자 리뷰를 요청한다.

## Requirement → Task Traceability

| Requirement                               | 구현 task | 저장소 검증 task |
| ----------------------------------------- | --------- | ---------------- |
| 정적 XML sitemap 응답                     | 1.1, 1.2  | 1.4, 2.1         |
| 현재 공개 URL 집합                        | 1.1       | 1.4, 2.1         |
| DB와 분리된 정적 제공                     | 1.1, 1.2  | 2.1, 2.2         |
| 보수적인 metadata                         | 1.1       | 1.4, 2.1         |
| 프로덕션 무인증 접근                      | 1.1, 1.2  | 2.1              |
| `web-platform` static asset·BFF 책임 수정 | 1.1, 1.2  | 2.1              |

프로덕션 응답 확인과 Google·Naver 일회성 제출은 `PROD-731`의 배포·운영 후속 체크리스트에서 추적하며, 이 change의 task나 archive 조건에 포함하지 않는다.
