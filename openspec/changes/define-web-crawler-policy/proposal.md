## Why

현재 Kosmo의 저장소 `robots.txt`는 모든 크롤러에 모든 경로를 허용한다. Cloudflare Managed `robots.txt`는
원본 앞에 관리 규칙을 합성해야 하지만, 2026-08-27 운영 응답에는 Managed 구간만 있고 저장소 원본이 없었다.
PROD-736은 공개 검색 노출과 보호 경로 정책을 복구·명시하고, 확인된 AI 학습·대량 수집 크롤러를 Cloudflare
edge에서 실제로 차단한다. 정상 ActivityPub 연합 요청은 해당 AI 차단 규칙에만 적용되는 최소 예외로
보호한다.

## What Changes

- 저장소 `robots.txt`가 공개 프로필·공개 게시물과 정적 자산은 검색할 수 있게 두고, 인증 후 개인화·작성·설정
  등 검색 대상이 아닌 경로는 일반 크롤러에 수집하지 않도록 안내한다.
- 저장소 응답에 canonical sitemap URL인 `https://kos.moe/sitemap.xml`을 게시하고, PROD-731이 제공할 배포된
  sitemap과의 통합을 검증한다.
- Cloudflare Managed `robots.txt`는 동적으로 관리되는 AI 학습·대량 수집 에이전트 차단과 Content Signal을
  소유하고, 저장소는 그 에이전트 목록을 중복 소유하지 않는다.
- 일반 검색 및 사용자가 요청한 조회용 크롤러는 허용하고, AI 학습·대량 수집 크롤러는 운영에서 합성되는
  Cloudflare Managed `robots.txt`와 edge 강제 차단으로 거부한다. 학습과 검색을 겸하는 크롤러도 학습
  용도가 확인되면 강제 차단 범위에 포함한다.
- Cloudflare AI Crawl Control/WAF가 Training behavior 또는 공식 운영사 근거상 AI 대량 수집 용도로 확인된
  크롤러의 일반 Web 요청을 차단한다. Search behavior를 함께 가진 크롤러도 Training이 확인되면 포함하고,
  Search 전용 크롤러와 사용자 요청 기반 Agent는 허용한다.
- ActivityPub discovery·actor·object·collection·inbox 경로는 일반 크롤러 규칙으로 차단하지 않는다. 정상
  연합 요청은 AI 크롤러 차단 규칙의 호스트·메서드·경로·프로토콜 특성에 한정한 예외로 통과시키되, 다른
  WAF·rate limit·보안 검사를 광범위하게 우회하지 않는다.
- 배포 후 최종 합성 `robots.txt`의 Content-Type, 저장소 규칙, Cloudflare 관리 규칙, Sitemap 선언과 edge의
  차단·ActivityPub 예외를 함께 검증하고 Cloudflare 설정 롤백 절차를 기록한다.
- `robots.txt`는 정책을 표명하고 Cloudflare edge 규칙은 알려진 크롤러를 강제로 통제한다. 미식별·위장
  크롤러까지 완전히 차단한다고 주장하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-profile-search-staged-visibility.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-736
- Linear Implementations: PROD-736이 저장소 정책·자동 검증, Cloudflare 강제 차단·최소 ActivityPub 예외,
  운영 합성 응답과 edge 검증, 롤백, OpenSpec 정합성 및 archive를 소유한다. PROD-731은 sitemap
  생성·제공을 소유하며, PROD-736 구현은 먼저 진행할 수 있지만 운영 완료 검증은 PROD-731 배포 결과가
  필요하다.

## Capabilities

### New Capabilities

- `web-crawler-policy`: 검색 크롤러 노출 범위, 보호 경로 수집 제한, Cloudflare 관리 정책과의 합성·강제 차단,
  최소 ActivityPub 예외 및 sitemap 게시 계약을 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/app/public/robots.txt`: 저장소가 소유하는 일반 크롤러 경로 정책과 sitemap 선언
- `apps/web`: `/robots.txt` 정적 파일 제공과 SPA 폴백·federation-first routing 회귀 검증
- Cloudflare: Managed `robots.txt`/Content Signal, AI Crawl Control/WAF 강제 차단, 최소 ActivityPub 예외,
  Security Events 관찰과 롤백
- ActivityPub: WebFinger, actor, object, collection, inbox 요청이 AI 크롤러 강제 차단을 통과하면서도 기존
  federation 검증을 유지하는지 확인
- PROD-731: 배포된 `https://kos.moe/sitemap.xml`을 이용한 최종 통합 검증 의존성
