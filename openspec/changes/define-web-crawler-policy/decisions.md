## Context

이 결정 로그는 PROD-736의 승인된 Linear 계약, 공개 Profile·Post와 ActivityPub canonical 문서, 2026-08-27
운영에서 확인한 Cloudflare Managed-only 응답, 기존 Expo 정적 파일 및 federation-first BFF 구조를 반영한다.
제품 행동은 canonical/Linear 권위에서 파생하며, 전달 메커니즘만 승인 범위 안의 구현 선택으로 기록한다.

## Decision Records

### 저장소와 Cloudflare가 크롤러 정책 소유권을 나눈다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-736` (Linear Contract)
- Status: Active
- Context / Problem: 목표 운영 `/robots.txt`는 Cloudflare Managed 규칙과 저장소 정적 문서의 합성이지만,
  2026-08-27 응답에는 Managed 구간만 있고 저장소 원본이 없었다. 한쪽이 다른 쪽의 동적 규칙을 복제하면
  불일치와 충돌이 생긴다. robots 지시문만으로는 비준수 크롤러를 실제 차단할 수 없으므로 Cloudflare edge
  강제 차단의 책임도 구분해야 한다.
- Decision Outcome: 저장소는 일반 크롤러의 보호·내부 경로와 canonical Sitemap 지시문을 소유하고,
  Cloudflare Managed `robots.txt`는 공식 근거에 따른 AI 학습·대량 수집 에이전트 지시문과 Content Signal을
  소유한다. Cloudflare AI Crawl Control/WAF는 Training behavior 또는 공식 근거상 AI 대량 수집 용도로
  확인된 크롤러의 강제 차단과 최소 ActivityPub 예외를 소유한다. Search behavior를 함께 가져도
  Training이면 차단 범위에 포함한다. 저장소는 Cloudflare의 관리 에이전트 목록을 사본으로 고정하지 않고,
  실제 edge 설정 스냅샷·검증·롤백을 운영 기록으로 추적한다.
- Alternatives Considered: 모든 에이전트와 경로를 저장소에서 소유하는 방식은 Cloudflare가 운영 응답 앞에
  계속 덧붙이는 규칙과 중복된다. 모든 정책을 Cloudflare에서 소유하는 방식은 저장소 리뷰와 경로 계약의
  변경 추적을 약화한다. robots 지시문만 적용하는 방식은 승인된 강제 차단 결과를 제공하지 못한다.
- Consequences: 저장소 테스트, 운영 합성 응답과 Cloudflare edge 동작 검증이 모두 필요하다. Cloudflare의 동적
  에이전트 변경은 저장소 파일 변경 없이 반영될 수 있지만 action·예외 불일치는 운영 기록에서 추적해야 한다.
- Confirmation / Follow-up: 구현 시 저장소 원본, 운영 합성 응답, AI 크롤러 action·WAF expression과 Security
  Events를 각각 검사하고 공식 근거·검토일·갱신·롤백 책임을 저장소에 기록한다.

### 크롤러의 운영사가 아니라 용도로 전체 차단 여부를 정한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-736`
  (Linear Contract)
- Status: Active
- Context / Problem: 같은 운영사가 검색, 사용자 요청, AI 학습용 에이전트를 따로 운영하므로 회사 이름만으로
  묶으면 공개 검색 노출까지 손상될 수 있다.
- Decision Outcome: 구현 시점 공식 운영사 문서와 Cloudflare behavior 분류에서 Training 또는 AI 대량 수집
  용도로 확인한 에이전트는 운영 합성 robots 정책과 edge에서 차단한다. Search behavior를 함께 가져도 Training이면
  포함하고, Search 전용·사용자 요청용 에이전트는 같은 운영사의 에이전트라는 이유만으로 전체 차단하지 않는다.
- Alternatives Considered: 모든 AI 관련 운영사 에이전트를 차단하는 방식은 Googlebot, OAI-SearchBot,
  Claude-SearchBot/Claude-User, Amzn-SearchBot, Applebot까지 막을 수 있다. 출처가 불분명한 커뮤니티 목록을 복사하는
  방식은 분류 근거와 갱신 책임을 보장하지 못한다.
- Consequences: 에이전트 목록과 Cloudflare 분류는 시간이 지나면 달라질 수 있어 공식 근거, 검토일과 action
  스냅샷이 필수다. 공개 Profile·Public Post 경로 검증은 대표 검색 에이전트와 차단 에이전트별로 유지해야 한다.
- Confirmation / Follow-up: 구현과 운영 검증에서 대표 검색·사용자 요청 에이전트가 공개 경로에 대해 전체
  차단되지 않고, Cloudflare가 관리하는 Training·AI 대량 수집 에이전트와 Search·Training 복수 behavior
  에이전트가 robots와 edge에서 의도대로 차단되는지 확인한다.

### PROD-736은 ActivityPub 강제 차단을 도입하지 않는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/domain/objects/post.md`, `PROD-736` (Linear Contract)
- Status: Superseded
- Context / Problem: Cloudflare의 봇 강제 차단을 기본값으로 적용하면 정상적인 server-to-server ActivityPub
  요청까지 challenge 또는 block할 수 있다.
- Decision Outcome: 저장소 robots 정책은 WebFinger, actor, object, collection과 inbox 경로를 차단하지 않는다.
  PROD-736은 AI Crawl Control, Bot Fight Mode, WAF 규칙이나 bypass를 생성·변경하지 않는다. 향후 강제 차단은
  별도 권위 이슈에서 AI 크롤러 차단 규칙에 한정한 최소 ActivityPub 예외와 federation 검증을 함께 정의한다.
- Alternatives Considered: ActivityPub 전체 경로에 광범위한 WAF bypass를 적용하면 다른 보안 검사를 불필요하게
  우회한다. ActivityPub을 일반 내부 API와 함께 차단하면 federation 계약을 깨뜨린다.
- Consequences: 이 Change의 robots 정책은 자발적 준수 경계이며 악의적 크롤러를 강제로 차단하지 않는다.
  운영 검증은 HTTP status 자체보다 edge challenge·bot block 없이 기존 federation handler까지 도달하는지를
  구분해야 한다.
- Confirmation / Follow-up: Fediverse server User-Agent로 WebFinger, actor/object와 inbox 대표 요청을 보내
  Cloudflare challenge 또는 봇 차단 403이 아닌 application/federation 응답을 확인한다.

### PROD-736은 Cloudflare 강제 차단과 최소 ActivityPub 예외를 함께 도입한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0017-activitypub-local-post-note.md`,
  `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-736` (Linear Contract)
- Status: Active
- Context / Problem: Managed `robots.txt`의 `ai-train=no`와 `Disallow`는 정책을 표현하지만 크롤러가 지시문을
  무시하면 접근을 막지 못한다. 반대로 일반적인 봇 강제 차단을 그대로 적용하면 정상 server-to-server
  ActivityPub 요청까지 block 또는 challenge할 수 있다.
- Decision Outcome: PROD-736은 공식 근거와 Cloudflare behavior 분류로 확인한 Training 또는 AI 대량 수집
  크롤러의 일반 Web 요청을 Cloudflare AI Crawl Control/WAF에서 강제 차단한다. Search behavior를 함께
  가져도 Training이면 포함한다. Search 전용 크롤러와 사용자
  요청 기반 Agent는 허용한다. WebFinger, actor/object/collection과 개인/shared inbox의 정상 federation 요청은
  AI 크롤러 차단 규칙에 한정한 최소 예외로 origin handler에 전달하며 기존 Fedify 검증을 유지한다.
- Alternatives Considered: robots 지시문만 두는 방식은 실제 차단을 제공하지 않는다. 모든 AI 관련 에이전트를
  차단하는 방식은 검색·사용자 요청 기능을 손상한다. ActivityPub 전체 경로나 WAF 전체를 bypass하는 방식은
  관련 없는 보안 검사를 불필요하게 우회한다.
- Consequences: Cloudflare zone 권한, 요금제별 detection capability, edge 설정 스냅샷·logging·롤백과 실제
  federation 통합 검증이 구현 범위에 추가된다. protocol header는 위조될 수 있으므로 미식별·위장 크롤러의
  완전 차단을 보장하지 않고 origin 보안을 계속 적용한다.
- Confirmation / Follow-up: 대표 Training 크롤러와 Search·Training 복수 behavior 크롤러의 일반 Web 요청은
  edge에서 차단되고, Search/Agent 전용 요청 및 실제 federation 요청은 origin에 도달하며, 잘못된 inbox 요청은
  origin이 거부하는지 확인한다.

### ActivityPub 예외는 AI Crawl Control 차단식 내부의 최소 제외 조건으로 구현한다

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-736`
  (Linear Contract)
- Status: Active
- Context / Problem: Cloudflare custom rule의 `Skip all remaining custom rules`는 AI 크롤러 차단뿐 아니라 뒤의
  관련 없는 custom rule까지 건너뛸 수 있다. 경로 prefix만으로 예외를 열면 크롤러가 ActivityPub endpoint를
  우회 경로로 사용할 수도 있다.
- Decision Outcome: Cloudflare가 생성한 `AI Crawl Control` WAF rule의 차단 조건에 canonical host, HTTP method,
  실제 federation 경로 형태, ActivityPub content negotiation·media type과 적용 가능한 signature header를
  조합한 부정 조건을 추가한다. 예외는 AI 크롤러 차단에만 영향을 주며 다른 WAF·rate limit·origin
  검증을 계속 실행한다.
- Alternatives Considered: 별도 `Skip all remaining custom rules` rule은 범위가 넓고 rule order 변화에
  취약하다. `/ap/*`·`/.well-known/*` 경로만 쓰는 예외는 구분력이 부족하다. 원격 Fediverse 서버 IP
  allowlist는 분산된 federation 구조에서 유지할 수 없다.
- Consequences: 구현 시 실제 Fedify route와 지원 header를 다시 확인하고 Cloudflare expression을 스냅샷으로
  남겨야 한다. signature header 존재는 인증 완료가 아니며 진위 검증은 origin이 소유한다.
- Confirmation / Follow-up: 예외 요청이 AI 크롤러 rule만 제외하고 다른 Cloudflare 보안 단계와 Fedify
  검증을 계속 거치는지 Security Events와 대표 성공·실패 요청으로 확인한다.

### 기존 Expo 정적 원본과 BFF 정적 전달 경로를 유지한다

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-736` (Linear Contract)
- Status: Active
- Context / Problem: 저장소 robots 정책은 현재 Expo public asset으로 export되고 BFF의 정적 파일 route에서
  제공된다. 별도 server route를 추가하면 같은 문서의 원본과 배포 경로가 둘로 갈릴 수 있다.
- Decision Outcome: 저장소 robots 정책은 기존 Expo public 정적 원본과 현재 BFF static delivery를
  유지한다. 명시적인 server route는 static delivery로 spec의 Content-Type·SPA 비간섭을 충족할 수 없는
  증거가 생기지 않는 한 추가하지 않는다.
- Alternatives Considered: Hono에 전용 `/robots.txt` route를 추가하는 방식은 동적 생성 필요가 없는데도 중복
  원본과 route 우선순위를 만든다. Cloudflare Worker만으로 원본까지 생성하는 방식은 저장소가 경로·Sitemap
  정책을 소유한다는 승인 범위를 약화한다.
- Consequences: build/export가 public asset을 포함하는지는 원본과 산출물을 대조해 확인한다. BFF 정적 전달의
  전용 자동 회귀 테스트는 두지 않으며, 새 런타임 service나 dependency도 추가하지 않는다.
- Confirmation / Follow-up: 정적 source의 의미를 검토하고 build/export 산출물이 원본과 일치하는지 확인한다.

### PROD-731 배포가 Sitemap 통합 완료와 Change archive를 게이트한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-736` (Linear Contract), `PROD-731` (Sitemap implementation owner)
- Status: Active
- Context / Problem: PROD-736은 Sitemap 지시문을 먼저 배포할 수 있지만 2026-08-18 현재 운영
  `/sitemap.xml`은 404이며 생성·제공은 PROD-731의 책임이다.
- Decision Outcome: PROD-736의 저장소 구현과 PR 준비는 PROD-731과 독립적으로 진행할 수 있다. 다만
  유효한 운영 sitemap 응답을 확인하기 전에는 Sitemap 통합 task, 전체 required validation, spec responsibility
  완료와 OpenSpec archive를 완료로 표시하지 않는다.
- Alternatives Considered: PROD-736에서 sitemap을 함께 구현하면 이슈 책임을 중복하고 Issue → OpenSpec
  경계를 위반한다. 404 상태에서 Change를 archive하면 승인된 완료 조건을 누락한다.
- Consequences: 구현 PR이 Ready for review 또는 merged 상태가 되어도 OpenSpec Change는 별도로 열려 있을 수
  있다. PROD-731 배포 후 통합 검증과 archive owner는 PROD-736 담당자다.
- Confirmation / Follow-up: PROD-731 배포 후 `https://kos.moe/sitemap.xml`의 유효성을 확인하고 남은 task와
  required validation을 완료한 다음 Change archive를 판단한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `PROD-736은 ActivityPub 강제 차단을 도입하지 않는다`는 2026-08-18 사용자의 “강제 차단까지 포함” 결정과
  갱신된 PROD-736 Linear 계약에 따라 `PROD-736은 Cloudflare 강제 차단과 최소 ActivityPub 예외를 함께
도입한다`로 대체됐다.
