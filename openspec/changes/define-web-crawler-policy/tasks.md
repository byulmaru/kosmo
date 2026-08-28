## 1. PROD-736 저장소 크롤러 정책과 근거 기록

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-736

**Deliverable**

저장소 크롤러 정책이 공개 Profile·Public Post 탐색을 유지하면서 현재 보호·내부 경로를 일반 크롤러에서
제외하고 canonical Sitemap 위치를 게시하며, 정책의 공식 근거·검토일·갱신 책임을 저장소에서 확인할 수 있다.

**Guardrails**

- Profile Lifecycle·Suspension, Post Visibility·Eligibility와 기존 인증·인가는 robots 지시문과 독립적으로
  유지한다.
- ActivityPub discovery·actor·object·collection·inbox 경로와 공개 정적 자산을 차단하지 않는다.
- Cloudflare Managed 에이전트 목록을 저장소에 중복 고정하지 않는다.
- Cloudflare 강제 차단의 동적 에이전트·detection 목록을 저장소 robots 원본이나 test fixture에 중복 고정하지
  않는다.
- PROD-731의 sitemap 구현을 변경하지 않는다.
- 기존 Expo public 정적 원본과 BFF static delivery 경로를 유지한다.

**Verification**

- 구현 시점의 client/server 라우트 구조와 공식 Cloudflare·크롤러 운영사 문서를 다시 대조한다.
- 저장소 robots 문서를 에이전트 그룹·경로 prefix 의미로 검토해 공개·보호·ActivityPub·Sitemap 경계를 확인한다.
- 정책 기록에서 공식 근거, 마지막 검토일과 갱신 책임을 확인한다.

- [x] 1.1 구현 시점의 보호·공개·ActivityPub 라우트와 공식 크롤러 분류를 재검증하고 근거·검토일·갱신 책임을 저장소에 기록한다.
- [x] 1.2 저장소 크롤러 정책에 보호·내부 경로 제외와 `https://kos.moe/sitemap.xml` 지시문을 반영하고 공개 Profile·Public Post·정적 자산·ActivityPub 경로를 허용 상태로 유지한다.
- [x] 1.3 저장소 원본과 검증 절차가 Cloudflare 동적 에이전트·detection 목록을 복제하지 않고 PROD-731 sitemap 구현을 범위에 섞지 않았는지 변경 diff를 검토한다.

## 2. PROD-736 정적 응답과 정책 검증

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-736

**Deliverable**

저장소 크롤러 정책의 공개·보호·ActivityPub 경계를 검토하고, 앱 build 결과에 `/robots.txt` 원본이 그대로
포함되는지 확인한다.

**Guardrails**

- `Accept: text/html` 또는 navigation 요청도 `/robots.txt`를 SPA HTML로 바꾸지 않는다.
- robots 문서 요청을 처리하기 위해 federation, GraphQL, login/logout 또는 일반 SPA 라우트의 우선순위를
  변경하지 않는다.
- 검증 자료는 Cloudflare의 현재 동적 에이전트 목록 전체를 저장소 fixture로 복제하지 않는다.

**Verification**

- 대표 공개 Profile·Public Post·asset, 모든 승인된 보호 prefix, WebFinger·actor/object·inbox 경로와 Sitemap
  지시문을 정책 의미 단위로 검토한다.
- 앱 build 뒤 source와 export된 `/robots.txt`가 일치하는지 확인한다.
- 관련 workspace test·typecheck·lint와 strict OpenSpec validation을 통과시킨다.

- [x] 2.1 저장소 robots 정책의 공개·보호·ActivityPub·Sitemap 의미를 현재 라우트와 대조해 검토한다.
- [x] 2.2 앱 build 뒤 export된 `/robots.txt`와 저장소 원본이 일치하는지 확인한다.
- [x] 2.3 관련 workspace test·typecheck·lint와 `openspec validate define-web-crawler-policy --strict`를 통과시키고 결과를 기록한다.

## 3. PROD-736 Cloudflare 강제 차단과 ActivityPub 최소 예외

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-736

**Deliverable**

Cloudflare edge가 Training behavior 또는 공식 근거상 AI 대량 수집 용도로 확인된 크롤러의 일반 Web 요청을
실제로 차단하고 Search behavior를 함께 가진 Training 크롤러도 포함한다. Search 전용 크롤러와 사용자 요청
기반 Agent는 허용하며, 정상 ActivityPub federation 요청은 AI 크롤러 차단에 한정한 최소 예외를 통해 기존
origin handler에 도달한다.

**Guardrails**

- ActivityPub 예외는 AI 크롤러 차단 규칙의 조건에만 적용하고 `All remaining custom rules`, Managed WAF,
  rate limit 또는 다른 보안 제품을 광범위하게 Skip하지 않는다.
- federation 예외는 canonical host·method·실제 경로 형태·ActivityPub protocol 특성을 조합하며 경로만으로
  열지 않는다.
- signature header 존재를 인증 완료로 취급하지 않고 기존 Fedify signature·activity 검증을 유지한다.
- 검색·사용자 요청용 에이전트를 같은 운영사의 학습 에이전트라는 이유만으로 전체 차단하지 않는다.
- 미식별·위장 크롤러까지 완전히 차단한다고 주장하지 않는다.

**Verification**

- 적용 전후 Cloudflare crawler action, WAF rule order·expression, block response, logging과 Security Events를
  비교한다.
- 대표 Training 크롤러와 Search·Training 복수 behavior 크롤러의 일반 Web 요청이 edge에서 차단되고
  Search/Agent 전용 요청은 이 정책으로 차단되지 않는지 확인한다.
- 실제 federation 특성의 WebFinger·actor/object/collection·inbox 요청이 origin handler에 도달하고 잘못된
  inbox는 origin이 거부하는지 확인한다.
- 예외 요청에도 관련 없는 WAF·rate limit이 계속 평가되는지 Cloudflare trace 또는 동등한 운영 증거로
  확인한다.

- [ ] 3.1 Cloudflare zone 권한, 요금제별 crawler detection capability, 현재 Managed robots·AI crawler action·WAF rule·logging을 확인하고 롤백 가능한 기준 스냅샷을 기록한다.
- [ ] 3.2 공식 근거와 Cloudflare behavior 분류를 대조해 Training 또는 AI 대량 수집 크롤러는 Block하고 Search behavior를 함께 가진 Training 크롤러도 포함하며, Search 전용·사용자 요청 Agent는 Allow가 되도록 edge action을 설정한다.
- [ ] 3.3 AI 크롤러 차단 규칙에만 canonical host·method·실제 federation 경로·ActivityPub protocol 특성을 조합한 최소 예외를 적용하고 다른 보안 검사를 유지한다.
- [ ] 3.4 대표 차단·허용 크롤러와 WebFinger·actor/object/collection·유효하거나 잘못된 inbox 요청으로 edge·origin 경계를 검증하고 Security Events 증거를 기록한다.
- [ ] 3.5 실제 Cloudflare action·rule expression·검증 결과·갱신 책임·롤백 절차를 저장소 운영 기록에 반영한다.

## 4. PROD-736 운영 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-736
- PROD-731

**Deliverable**

배포된 Cloudflare Managed 규칙, edge 강제 차단·ActivityPub 예외와 저장소 규칙이 승인된 검색·학습·
federation 경계를 함께 유지하고, PROD-731 배포 뒤 canonical Sitemap까지 유효한 상태에서 Change를 완료한다.

**Guardrails**

- application의 정상적인 2xx/4xx 응답과 Cloudflare edge block·challenge를 구분한다.
- PROD-731 배포 전에는 Sitemap 통합, required validation, spec responsibility 또는 OpenSpec archive를 완료로
  표시하지 않는다.
- PR readiness와 OpenSpec archive를 별도 완료 경계로 관리한다.

**Verification**

- 운영 `/robots.txt`의 status, Content-Type, Content Signal, Cloudflare 관리형 AI 학습·대량 수집 block,
  검색·사용자 요청 에이전트 허용, 저장소 경로 규칙과 Sitemap 지시문을 확인한다.
- Cloudflare edge의 차단·허용·ActivityPub 예외 증거와 저장소 운영 기록이 일치하는지 확인한다.
- PROD-731 배포 후 `https://kos.moe/sitemap.xml`의 status, Content-Type과 sitemap 유효성을 확인한다.
- 모든 task와 delta spec 정합성 및 strict validation을 확인한 뒤 archive한다.

- [ ] 4.1 배포 후 운영 합성 robots 응답이 Cloudflare 관리 정책과 저장소 경로·Sitemap 정책을 모두 포함하고 검색용 에이전트와 학습·대량 수집·학습 겸용 에이전트를 승인된 대로 구분하는지 증거를 기록한다.
- [ ] 4.2 운영 edge의 대표 Training 및 Search·Training 복수 behavior block, Search/Agent 전용 허용, ActivityPub origin 도달과 잘못된 inbox의 origin 거부가 승인된 Cloudflare 스냅샷과 일치하는지 재검증한다.
- [ ] 4.3 PROD-731 배포 후 canonical Sitemap URL이 유효한 운영 sitemap을 반환하는지 검증한다.
- [ ] 4.4 모든 구현·운영 검증과 spec 정합성을 확인하고 strict validation을 다시 통과시킨 뒤 `define-web-crawler-policy` Change를 archive한다.
