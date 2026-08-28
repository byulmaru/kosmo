## Context

이 결정 기록은 2026-08-27 정적 3-URL 범위로 갱신한 `PROD-731` 본문과 관계, Local Profile canonical route 문서, 기존 Web export asset 제공 경계, 그리고 이 change의 proposal·spec·design을 대조해 작성했다. OpenSpec 자체는 제품 권위로 사용하지 않으며, 아래 구현 선택은 현재 승인된 sitemap 범위 안에서만 효력을 가진다.

### Gate Snapshot

- Domain Gate: Pass — `docs/domain/objects/profile.md`에서 Local Profile의 relative handle canonical route를 확인했다. 현재 sitemap의 공개 URL 선정은 durable Profile eligibility 정책이 아니라 `PROD-731`의 단계별 rollout 범위이므로 별도 canonical sitemap 문서는 적용되지 않는다.
- Issue Gate: Pass — 사용자가 현재 URL을 `/`, `/privacy`, `/@kosmo`로 확정하고 동적 조회 제외, 후속 동적 확장 기록과 sitemap 전용 테스트 코드 제외를 승인했다. `PROD-731` 본문·관계는 이 결정으로 갱신했다.
- OpenSpec Gate: Pass for update — 사용자가 Linear → OpenSpec → 구현 정렬을 승인했다. commit·push와 PR 갱신 전에는 별도 사용자 diff 리뷰를 받는다.

## Decision Records

### 현재 sitemap은 세 canonical URL만 포함한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 포함 범위와 완료 조건, `docs/domain/objects/profile.md`의 Local Profile relative handle route 계약.
- Status: Active
- Context / Problem: 첫 공개 단계에서 검색엔진에 노출할 URL을 최소 범위로 제한하면서 landing, 개인정보 처리방침과 공식 안내 계정은 발견 가능하게 해야 한다.
- Decision Outcome: sitemap은 `https://kos.moe/`, `https://kos.moe/privacy`, Kosmo 공식 안내 계정 `https://kos.moe/@kosmo`만 각각 한 번 포함한다. 그 밖의 정적 route, 일반 Local·Remote Profile과 Post는 포함하지 않는다.
- Alternatives Considered: `/`와 `/privacy`만 포함하면 공식 안내 계정을 누락한다. 모든 공개 Profile·Post를 포함하면 현재 승인된 rollout 범위를 넓힌다.
- Consequences: 현재 sitemap은 세 URL의 고정 snapshot이며 새 공개 콘텐츠를 자동 발견하지 않는다.
- Confirmation / Follow-up: XML과 production 응답에서 정확한 세 `<loc>`만 존재하는지 검증한다.

### Expo public asset으로 정적 sitemap을 제공한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 정적 자산·DB 조회와 런타임 동적 생성 제외 범위, 기존 `web-platform`의 Expo export asset과 SPA fallback 계약.
- Status: Active
- Context / Problem: 현재 URL 집합과 canonical origin이 모두 고정돼 있어 런타임 route, DB query와 XML serializer는 불필요한 의존성과 실패 경계를 만든다. 동시에 실제 `sitemap.xml` asset이 없으면 browser navigation 요청이 SPA HTML로 fallback할 수 있다.
- Decision Outcome: `apps/app/public/sitemap.xml`을 Expo Web export에 포함하고 기존 Web static asset route로 제공한다. sitemap 전용 Hono handler, configured Local Instance 해석, Profile·Post query와 런타임 XML 직렬화는 사용하지 않는다.
- Alternatives Considered: constant Hono handler와 build-time generator도 세 URL을 출력할 수 있지만 현재 고정 입력에 runtime·script 경계를 추가한다. DB 기반 동적 route는 명시적 제외 범위다.
- Consequences: sitemap 변경에는 새 Web asset 배포가 필요하지만 응답은 DB 가용성과 콘텐츠 상태에 의존하지 않는다.
- Confirmation / Follow-up: source와 Expo export 산출물이 같은 XML인지 확인하고, 배포 후 crawler와 browser navigation 요청이 XML을 받고 SPA HTML을 받지 않는지 검증한다.

### sitemap 전용 테스트 코드는 추가하지 않는다

- Decision Date: 2026-08-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-731`의 sitemap 전용 unit/E2E 테스트 제외 범위와 사용자 PR 리뷰 결정.
- Status: Active
- Context / Problem: 현재 변경은 기존 Expo public asset 제공 경계를 그대로 사용하며 runtime 코드를 추가하지 않는다. 별도 회귀 테스트는 정적 XML 하나만 남기려는 PR 범위를 넓힌다.
- Decision Outcome: `apps/web/src/server/app.test.ts`와 E2E suite에 sitemap 전용 테스트를 추가하지 않는다. source XML 검사, Expo Web export 산출물 비교와 배포 후 production fetch로 검증한다.
- Alternatives Considered: Web static route 단위 테스트나 sitemap E2E를 추가하면 배포 전 route 경계를 자동 검증할 수 있지만 이번 PR의 명시적 제외 범위를 위반한다.
- Consequences: route-level 회귀는 저장소 테스트에서 직접 고정하지 않으며, 기존 static asset 동작과 export·production 검증을 완료 증거로 사용한다.
- Confirmation / Follow-up: 최종 PR 파일 목록에 sitemap 관련 test file 변경이 없고 export 산출물이 source와 같은지 확인한다.

### 현재 URL에는 freshness metadata를 제공하지 않는다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 `lastmod`·`changefreq`·`priority` 범위.
- Status: Active
- Context / Problem: 현재 세 페이지의 실제 마지막 수정 시각을 sitemap에서 신뢰할 수 있는 공통 source가 없다.
- Decision Outcome: 모든 entry에 `loc`만 제공하고 `lastmod`, `changefreq`, `priority`를 생략한다.
- Alternatives Considered: 요청 시각, 배포 시각 또는 임의 값을 사용하면 실제 freshness를 나타내지 않는다.
- Consequences: crawler에 수정 시각 힌트를 제공하지 않지만 부정확한 신호도 만들지 않는다.
- Confirmation / Follow-up: source XML과 Expo export 산출물에서 금지 metadata가 없는지 확인한다.

### 동적 sitemap은 별도 후속 계약으로 확장한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 후속 확장과 제외 범위.
- Status: Active
- Context / Problem: 일반 Profile·Post를 동적으로 포함하려면 공개 eligibility, 삭제·visibility 변경 반영, cache/invalidation, protocol 용량과 sitemap index 전환을 함께 결정해야 한다.
- Decision Outcome: 현재 change는 동적 조회를 구현하지 않는다. 필요 시 별도 Linear 이슈와 OpenSpec change를 먼저 만들고, 해당 계약에서 포함 대상, 갱신 정책, 실패·용량 경계와 rollout을 승인한 뒤 구현한다.
- Alternatives Considered: 현재 change에 비활성 코드나 미래용 abstraction을 남기면 승인되지 않은 범위를 선구현하고 현재 정적 계약을 흐린다.
- Consequences: 동적 확장은 후속 배포가 필요하고, 현재 PR의 loader·serializer를 미래 대비용으로 유지하지 않는다.
- Confirmation / Follow-up: 현재 diff에서 sitemap 전용 DB query와 동적 route가 제거됐는지 검토하고 후속 필요가 생길 때 새 이슈를 생성한다.

### Google과 Naver 제출은 일회성 운영 task로 수행한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 갱신한 `PROD-731`의 Google·Naver 일회성 등록 범위, Google 공식 sitemap 제출 문서 `<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>`, Naver Search Advisor 제출 문서 `<https://searchadvisor.naver.com/guide/request-feed>`.
- Status: Active
- Context / Problem: 구현 완료만으로 production origin의 접근성이나 선정한 검색엔진 도구가 sitemap을 처리하는지 증명할 수 없다. 그러나 관리 도구 제출은 제품이 계속 제공해야 하는 runtime capability가 아니다.
- Decision Outcome: 프로덕션 무인증 응답을 검증한 뒤 canonical `/sitemap.xml`을 Google Search Console과 Naver Search Advisor에 한 번 제출하고, 대상·확인 시각·fetch 또는 처리 상태·오류를 `PROD-731`에 기록한다. 개별 URL 색인 완료는 제출 증거에 포함하지 않는다.
- Alternatives Considered: 한 검색엔진만 제출하면 승인된 Google·Naver 범위를 충족하지 못한다. 반복 자동화는 현재 범위를 넓힌다.
- Consequences: 배포 전에 두 도구의 production property와 제출 권한을 확인해야 한다.
- Confirmation / Follow-up: 제출 UI가 보고한 처리 결과를 비민감한 형태로 이슈에 남기고 실제 색인 여부를 과장하지 않는다.

### `robots.txt` 정책과 Sitemap 지시어는 이 change에서 수정하지 않는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-731`의 sitemap 구현 범위, 관련 이슈 `PROD-736`의 crawler·Cloudflare edge·ActivityPub 안전 경계와 `Sitemap` 지시어 소유 범위.
- Status: Active
- Context / Problem: sitemap 제공과 crawler 허용 정책을 한 변경에 섞으면 `PROD-736`의 보안·ActivityPub 검증 경계를 우회할 수 있다.
- Decision Outcome: 이 change는 `/sitemap.xml` asset·응답·제출 증거만 소유한다. `apps/app/public/robots.txt`, crawler 분류, bot 차단과 `Sitemap` 지시어는 수정하지 않는다.
- Alternatives Considered: 같은 PR에서 robots 지시어까지 추가하면 운영 순서는 단순해지지만 별도 이슈의 crawler 안전 검증을 섞는다.
- Consequences: 검색엔진 제출은 sitemap URL을 직접 사용한다. `PROD-736`은 sitemap 프로덕션 성공을 확인한 뒤 자체 범위와 검증으로 진행한다.
- Confirmation / Follow-up: 구현 diff에서 `robots.txt`가 바뀌지 않았는지 확인한다.

## Remaining Decisions

- 없음. 검색엔진 계정 권한은 구현 선택이 아니라 배포 전 확인할 운영 사실이다.

## Superseded Decisions

### 일반 공개 Profile·Post를 동적으로 포함한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 2026-08-27 이전 `PROD-731` 본문; 같은 날 정적 3-URL 범위로 교체된 최신 본문.
- Status: Superseded
- Superseded By: “현재 sitemap은 세 canonical URL만 포함한다”, “동적 sitemap은 별도 후속 계약으로 확장한다”.
- Outcome: Active Local Profile과 Public Post의 eligibility·canonical URL·Current Content 규칙을 현재 sitemap에 적용하던 결정은 폐기했다.

### Web BFF 동적 route와 runtime DB query를 사용한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: 교체 전 `PROD-731` 범위와 기존 change design; 최신 `PROD-731`의 정적 자산·동적 생성 제외 범위.
- Status: Superseded
- Superseded By: “Expo public asset으로 정적 sitemap을 제공한다”.
- Outcome: configured Local Instance resolver, application visibility helper, sitemap 전용 DB loader·XML serializer·Hono route와 cache/failure 설계는 현재 구현에서 제거한다.

### 동적 URL 수·byte 상한과 sitemap index 조기 전환을 현재 change에서 관리한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: 교체 전 `PROD-731`의 동적 단일 sitemap 범위; 최신 `PROD-731`의 후속 확장 범위.
- Status: Superseded
- Superseded By: “동적 sitemap은 별도 후속 계약으로 확장한다”.
- Outcome: 50,000 URL·50 MB runtime 방어와 45,000 URL·45 MB 후속 전환 gate는 고정 세 URL을 제공하는 현재 change의 요구사항과 task에서 제거한다. 동적 확장 이슈가 생기면 protocol 제약을 새 계약에서 다시 검토한다.

- 2026-08-27: “Google Search Console과 Bing Webmaster Tools 제출을 sitemap capability로 검증한다”는 선택을 폐기했다. Google·Naver 제출은 `PROD-731`의 일회성 운영 task이고 durable spec에는 프로덕션 무인증 접근만 남긴다.
