## Context

현재 `apps/app/public/robots.txt`는 `User-agent: *`에 빈 `Disallow`만 두어 모든 경로를 허용한다. Expo Web
export 결과는 `apps/web/src/server/routes/static.ts`가 정적 파일을 먼저 제공하고 탐색 요청에는 SPA
폴백을 제공한다. BFF의 `apps/web/src/server/app.ts`는 그보다 앞에서 모든 요청을 Fedify federation router에
보내므로, `/robots.txt` 변경은 정적 파일 계약과 federation-first routing을 함께 보존해야 한다.

Cloudflare 공식 Managed `robots.txt` 계약은 기존 원본 앞에 관리 내용을 추가한다. 그러나 2026-08-27
`https://kos.moe/robots.txt` 운영 확인에서는 HTTP 200 `text/plain`과 Managed Content Signal·AI 크롤러
지시문만 반환됐고 저장소 원본의 `User-agent: *` 구간은 없었다. 같은 시점의
`https://kos.moe/sitemap.xml`은 404였다. 따라서 저장소 원본뿐 아니라 export·BFF 전달과 최종 운영 합성도
각각 검증해야 한다. Managed 지시문은 크롤러의 자발적 준수에 의존하므로 최신 PROD-736 Linear 계약은
Training behavior 또는 공식 근거상 AI 대량 수집 용도로 확인된 크롤러를 Cloudflare edge에서
강제 차단하고, 정상 ActivityPub 요청에는 그 AI 차단 규칙에 한정한 최소 예외를 함께 적용한다. Search와
Training을 겸하면 차단 범위에 포함하되 Search 전용·사용자 요청 Agent는 허용한다. 저장소 정책 구현과
PROD-731 이후 Sitemap 통합 완료는 계속 분리한다.

주요 이해관계자는 공개 검색 유입을 원하는 제품 운영자, 공개 Profile·Post 작성자, ActivityPub 원격 서버,
Cloudflare 운영 담당자와 크롤러 정책 갱신 담당자다.

## Goals / Non-Goals

**Goals:**

- 저장소와 Cloudflare Managed `robots.txt`의 소유 경계를 분명히 한다.
- 공개 Profile·Public Post 탐색은 유지하고 현재 보호·내부 경로는 일반 크롤러에서 제외한다.
- 검색·사용자 요청용 에이전트와 AI 학습·대량 수집 에이전트를 분리한다.
- Training behavior 또는 공식 근거상 AI 대량 수집 용도로 확인된 크롤러의 일반 Web 요청을 Cloudflare
  edge에서 강제 차단하고, Search를 겸하더라도 Training이 확인되면 포함한다.
- ActivityPub discovery·object·inbox 경로와 federation-first routing을 AI 차단 규칙의 최소 예외로 보호한다.
- 로컬 정적 정책, BFF 응답, 운영 합성 응답, edge 차단·예외와 PROD-731 이후 sitemap을 각각 검증할 수 있게
  한다.
- 공식 근거, 검토일과 갱신 책임을 저장소에서 추적한다.

**Non-Goals:**

- PROD-731이 소유하는 sitemap 생성·콘텐츠 선정·검색엔진 등록을 구현하지 않는다.
- ActivityPub과 무관한 일반 WAF·rate limit·악성 봇 정책을 재설계하지 않는다.
- 미식별·위장 크롤러까지 완전히 차단한다고 보장하지 않는다.
- robots 지시문을 인증·인가, rate limit 또는 법률적 동의 경계로 사용하지 않는다.
- Cloudflare가 관리하는 동적 User-Agent 목록을 저장소에 복제하지 않는다.

## Implementation Guidance

### Current Constraints

- 정적 원본은 `apps/app/public/robots.txt`이고 목표 운영 응답은 Cloudflare 관리 prefix와 해당 원본의
  합성이다. 2026-08-27 운영 응답에는 저장소 원본이 없었으므로 파일 내용만 검증해서는 export·정적 전달 실패나
  Cloudflare 합성 불일치를 발견할 수 없다.
- `serveStatic`은 파일이 export root에 존재할 때 SPA 폴백보다 먼저 응답한다. 테스트 fixture에 robots 파일이
  없거나 build 산출물 복사를 확인하지 않으면 원본 파일만 맞고 BFF 응답은 회귀할 수 있다.
- Fedify router가 BFF와 정적 라우트보다 먼저 요청을 처리한다. `/ap`, `/.well-known`, `/inbox`를 일반적인
  “내부 API”로 묶어 차단하면 승인된 ActivityPub 경계를 위반한다.
- robots exclusion은 User-Agent별로 가장 구체적인 그룹과 경로 prefix를 평가한다. 단순 문자열 포함 검사만으로는
  공개 에이전트가 Cloudflare의 전체 차단 그룹에 들어가는지 판별하기 어렵다.
- Cloudflare Managed `robots.txt`는 정책을 표현하지만 크롤러를 기술적으로 막지 않는다. 강제 차단은 AI Crawl
  Control이 관리하는 WAF custom rule 또는 동등한 Cloudflare edge 규칙에서 별도로 검증해야 한다.
- Cloudflare의 2026-07-01 이후 분류 체계는 봇 하나에 Search·Agent·Training 등 여러 behavior를 부여할 수
  있다. `AI Search` 같은 legacy category 문자열만 보거나 단일 category로 환원하면 Search와 Training을 겸하는
  크롤러를 놓칠 수 있으므로 실제 behavior·UI·요금제와 생성된 규칙을 스냅샷으로 남겨야 한다.
- AI Crawl Control WAF rule은 다른 custom rule과 순서 영향을 주고, 앞선 `Skip` rule은 뒤의 관련 없는 custom
  rule까지 건너뛸 수 있다. Cloudflare가 경로 예외를 지원하더라도 예외 범위를 직접 검토해야 한다.
- 저장소와 확인 가능한 Kubernetes checkout에는 Cloudflare zone AI/WAF 설정을 소유하는 Terraform resource가
  없다. 현재 범위의 edge 변경은 권한 있는 운영자가 Cloudflare dashboard/API에서 적용하고 저장소에는
  근거·설정 스냅샷·검증·롤백 절차를 기록해야 한다.
- 현재 사용자 역할에 Bot Management/AI Crawl Control 또는 WAF custom rule 편집 권한이 없을 수 있으므로
  적용 전에 zone 권한을 확인해야 한다.
- PROD-731이 배포되기 전에는 Sitemap 지시문을 추가할 수 있어도 운영 URL의 유효성 검증은 완료할 수 없다.

### Recommended Approach

1. 저장소 robots 원본에는 일반 크롤러 그룹 하나를 두고, 현재 보호 클라이언트 라우트와 `/login`, `/logout`,
   `/graphql`, `/health`만 명시적으로 `Disallow`한다. 공개 Profile·Post·정적 자산과 ActivityPub 경로에는 별도
   차단 규칙을 추가하지 않는다.
2. 같은 원본에 `Sitemap: https://kos.moe/sitemap.xml`을 추가한다. Sitemap 생성 로직은 건드리지 않고,
   PROD-731 배포 전후 검증 결과를 구분한다.
3. Cloudflare Managed `robots.txt`의 `search=yes`, `ai-train=no`와 동적 학습 크롤러 지시문을 유지한다.
   구현 시점의 공식 근거와 Cloudflare behavior 분류에서 Training 또는 AI 대량 수집 용도로 확인된 크롤러는
   AI Crawl Control에서 Block으로 설정한다. Search behavior를 함께 가져도 Training이 확인되면 Block하고,
   Search 전용 크롤러와 사용자 요청 기반 Agent는 Allow한다. block response와 logging 상태를 함께 기록한다.
4. Cloudflare가 생성한 `AI Crawl Control` WAF custom rule을 기준으로, 별도 광역 `Skip` rule 대신 차단식 내부에
   `AND NOT <federation request predicate>` 형태의 최소 예외를 둔다. 이 조건은 canonical host와 다음 요청
   특성을 조합한다.
   - WebFinger: `GET /.well-known/webfinger`와 유효한 discovery query
   - actor/object/collection: `GET`과 실제 `/ap/actor/`, `/ap/note/`, `/ap/follow/` 경로 형태 및 ActivityPub
     content negotiation
   - inbox: `POST /inbox` 또는 actor-scoped inbox 경로, ActivityPub media type과 Fedify가 지원하는 HTTP
     signature header 존재
     헤더가 있다고 인증이 완료되는 것은 아니므로 signature와 activity의 진위는 기존 Fedify handler가 계속 검증한다.
5. `docs/operations` 아래의 크롤러 정책 기록에 저장소/Cloudflare 책임, 공식 운영사 자료, 검토일, 실제
   crawler action·WAF 예외 스냅샷, 적용 권한, 갱신 책임과 롤백 절차를 남긴다. 설정 화면의 명칭이나
   기본값보다 실제 적용된 action과 rule expression을 근거로 기록한다.
6. 저장소 문서를 에이전트·경로 기준으로 검토해 보호 prefix, 공개 경로, 검색용·학습용 에이전트와
   ActivityPub 예외를 확인한다. 앱을 build한 뒤 원본과 export 산출물이 일치하는지도 확인한다.
7. edge 변경 전후의 Security Events와 origin 도달 여부를 비교한다. 대표 Training 크롤러와 Search·Training
   behavior를 함께 가진 크롤러의 일반 Web 요청은 edge block, Search/Agent 전용 요청은 비차단, 실제 연합
   특성의 WebFinger·actor/object·collection·inbox 요청은 origin handler 도달을 확인한다. 형식만 갖췄을 뿐
   signature가 잘못된 inbox 요청은 origin이 거부하며, 관련 없는 WAF·rate limit이 계속 평가되는지도 확인한다.
8. 배포 후 최종 운영 robots 응답에서 Cloudflare 관리 block/Content Signal과 저장소 경로·Sitemap 지시문을
   확인한다. PROD-731 배포 뒤 sitemap까지 검증한 다음 전체 Change 완료를 판단한다.

이 접근은 현재 정적 파일과 federation-first BFF 구조를 바꾸지 않으면서 Cloudflare의 동적 목록·edge 강제
차단과 저장소의 안정적인 경로 계약을 독립적으로 갱신한다. ActivityPub 예외는 AI 크롤러 차단 규칙 밖으로
확장되지 않으므로 관련 없는 보안 경계도 유지된다.

### Allowed Alternatives

- 정적 원본의 robots 의미를 검증할 때 작은 전용 parser를 테스트 안에 두거나 검증된 parser 패키지를 사용할 수
  있다. 어느 방식을 택해도 User-Agent 그룹과 경로 prefix 의미를 실제로 평가하고, 새 런타임 의존성을 추가하지
  않으며, spec의 에이전트 분리 시나리오를 보존해야 한다.
- 정책 기록 파일의 정확한 이름은 기존 `docs/operations` 문서 구조에 맞게 선택할 수 있다. 다만 공식 근거,
  검토일, 실제 Cloudflare action·예외 스냅샷, 롤백, 갱신 책임과 두 계층의 소유 경계가 한곳에서
  발견 가능해야 한다.
- AI Crawl Control이 구현 시점의 요금제에서 필요한 분류 또는 예외를 제공하지 않으면 공식 Cloudflare bot
  detection ID나 공식 User-Agent 근거를 사용하는 WAF custom rule로 같은 결과를 구현할 수 있다. 이 경우에도
  Training 또는 공식 근거상 AI 대량 수집 용도만 차단하고 Search/Agent 전용 요청을 허용하며, ActivityPub
  예외와 logging·롤백 계약을 동일하게 지켜야 한다.

### Known Traps

- `User-agent: *` 전체 차단 뒤에 공개 경로 `Allow`를 몇 개 나열하면 구현체별 경로 우선순위 차이와 새 공개
  라우트 누락 위험이 커진다.
- GPTBot과 OAI-SearchBot, ClaudeBot과 Claude-SearchBot/Claude-User, Google-Extended와 Googlebot처럼 같은
  운영사의 에이전트를 하나로 취급하면 검색 노출 또는 사용자 요청 기능까지 차단할 수 있다.
- 저장소에 현재 Cloudflare 관리 에이전트 목록을 그대로 복사하면 두 목록이 서로 어긋날 수 있다.
- legacy category나 단일 `AI bot` 토글만 보고 봇별 복수 behavior를 확인하지 않으면 Search와 Training을 함께
  가진 크롤러의 차단 요구를 빠뜨릴 수 있다.
- ActivityPub 경로 prefix만으로 `Skip all remaining custom rules`를 적용하면 AI 차단뿐 아니라 관련 없는 WAF나
  rate limit까지 우회할 수 있다.
- `Accept`, `Content-Type` 또는 signature header가 있다는 사실을 유효한 federation 인증으로 간주하면 spoofed
  요청이 origin 보안을 우회할 수 있다. edge 조건은 routing 예외일 뿐이며 Fedify 검증은 그대로 유지해야 한다.
- AI Crawl Control dashboard의 Allow 표시만 확인하고 실제 WAF custom rule 순서·expression과 Security Events를
  확인하지 않으면 설정 충돌을 놓칠 수 있다.
- 운영 `robots.txt` 200만 확인하고 실제 그룹·경로 의미, Content-Type, sitemap 응답, edge 차단과 federation
  origin 도달을 확인하지 않으면 완료 조건을 충족하지 못한다.

## Risks / Trade-offs

- [Cloudflare 관리 정책이 별도 변경되어 저장소 가정과 달라질 수 있음] → 배포 시 합성 응답을 에이전트·경로별로
  검증하고 실제 crawler action·WAF expression 스냅샷과 정책 기록의 검토일을 갱신한다.
- [보호 경로 prefix가 새 공개 라우트와 충돌할 수 있음] → 현재 라우트 구조를 구현 시 다시 대조하고 공개
  Profile·Post·asset 경계가 유지되는지 검토한다.
- [Cloudflare 식별이 자체 선언 User-Agent나 요금제별 detection에 의존해 위장 크롤러를 놓칠 수 있음] → 적용
  가능한 verified detection을 우선하고 한계를 정책 기록에 명시하며 기존 WAF·origin 보안을 유지한다.
- [Training 차단이 정상 federation을 오탐할 수 있음] → 차단 활성화 전에 최소 federation 조건과 logging을
  적용하고 대표 원격 서버 요청으로 origin 도달을 검증한다.
- [ActivityPub 예외를 Training 크롤러가 protocol header로 흉내 낼 수 있음] → 경로만으로 예외를 열지 않고
  method·content negotiation·media type·signature 특성을 조합하며, robots 거부와 origin 검증을 계속 적용한다.
- [Cloudflare 권한이나 요금제가 필요한 설정을 제공하지 않을 수 있음] → 적용 전에 zone role과 사용할 수 있는
  detection·custom rule 기능을 확인하고 충족되지 않으면 강제 차단 task를 완료로 표시하지 않는다.
- [검색엔진이 robots 변경을 캐시해 반영이 늦을 수 있음] → 배포 직후 원본·합성 응답 증거를 보존하고 실제
  검색 반영 지연을 코드 회귀로 오인하지 않는다.
- [PROD-731 전에는 Sitemap URL이 404임] → 저장소 구현과 검증은 진행하되 Sitemap 운영 통합 체크와
  OpenSpec 전체 완료·archive는 유효한 배포 증거가 생길 때까지 남겨 둔다.

## Migration Plan

1. 현재 Managed robots, AI crawler action, WAF custom rule 순서·expression, Security Events와 적용 권한을
   기준 스냅샷으로 남긴다.
2. 저장소 robots 원본과 정책 기록을 같은 저장소 구현 범위에서 추가하고 build/export 산출물과 원본의
   일치를 확인한다.
3. Cloudflare 강제 차단을 활성화하기 전에 AI Crawl Control rule에 최소 ActivityPub 예외와 logging을
   적용하고 Search/Agent·federation 대표 요청이 origin에 도달하는지 확인한다.
4. Training 또는 공식 근거상 AI 대량 수집 용도의 크롤러를 강제 차단하고, Search behavior를 함께 가진
   Training 크롤러도 포함한다. 일반 Web 요청의 edge block, 실제 federation 요청의 origin 도달, 잘못된
   inbox의 origin 거부와 관련 없는 보안 검사 유지를 검증한다.
5. 운영 합성 robots 응답과 Cloudflare 설정 스냅샷·검증 결과·롤백 절차를 저장소 운영 기록에
   반영한다.
6. PROD-731 배포 후 `https://kos.moe/sitemap.xml`의 status, Content-Type과 유효성을 확인해 남은 통합 task를
   완료한다.
7. federation 또는 검색 회귀가 발견되면 먼저 AI crawler block action과 예외를 기준 스냅샷으로
   되돌린다. 저장소 robots 변경 자체가 원인이면 별도로 이전 원본으로 복구하며 두 롤백을 독립적으로
   검증한다.

## Open Questions

없음. PROD-731의 배포 시점은 미확정이지만 요구사항 선택이 아니라 명시된 통합 완료 의존성으로 관리한다.
