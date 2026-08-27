## ADDED Requirements

### Requirement: robots.txt를 정적 크롤러 정책으로 제공한다

**Authority / Provenance:** `PROD-736` (Linear Contract). 시스템은 `GET /robots.txt`에 대해 HTTP 200과 `text/plain` 계열 Content-Type으로 유효한 robots exclusion 문서를 반환해야 한다(SHALL). 이 경로는 Expo SPA HTML이나 일반 not-found 폴백으로 처리되어서는 안 된다(MUST NOT).

#### Scenario: robots.txt 직접 요청

- **WHEN** 클라이언트가 `GET /robots.txt`를 요청한다
- **THEN** 응답은 HTTP 200과 `text/plain` 계열 Content-Type을 가지며 robots 지시문을 포함한다

#### Scenario: SPA 폴백과 구분

- **WHEN** 클라이언트가 `Accept: text/html`을 포함해 `GET /robots.txt`를 요청한다
- **THEN** 시스템은 Expo HTML shell 대신 같은 robots 문서를 반환한다

### Requirement: 공개 탐색과 보호 경로를 구분한다

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-736` (Linear Contract). 저장소가 소유하는 일반 크롤러 정책은 공개 조회 가능한 Active·Normal Profile과 Public Post의 canonical Web 경로 및 그 렌더링에 필요한 공개 정적 자산을 차단해서는 안 된다(MUST NOT). 같은 정책은 현재 인증·개인화·작성·설정 화면인 `/bookmarks`, `/compose`, `/feedback`, `/follow-requests`, `/hashtags/`, `/local`, `/home`, `/notifications`, `/profile-edit`, `/search`, `/settings`와 인증·내부 HTTP 경계인 `/login`, `/logout`, `/graphql`, `/health`를 일반 크롤러 수집 대상에서 제외해야 한다(SHALL). robots 지시문은 Profile Lifecycle·Suspension, Post Visibility·Eligibility 또는 서버 인가를 대신해서는 안 된다(MUST NOT). 공개 조회 자격이 없는 Profile과 Post는 크롤러가 지시문을 무시하더라도 기존 조회 정책으로 보호되어야 한다(SHALL).

#### Scenario: 공개 Profile 탐색

- **WHEN** 일반 검색 크롤러가 공개 조회 가능한 Profile의 canonical Web 경로를 평가한다
- **THEN** 저장소 robots 정책에는 그 경로와 필요한 공개 자산을 차단하는 규칙이 없다

#### Scenario: Public Post 탐색

- **WHEN** 일반 검색 크롤러가 Post Visibility와 Eligibility를 통과하는 Public Post의 canonical Web 경로를 평가한다
- **THEN** 저장소 robots 정책에는 그 경로와 필요한 공개 자산을 차단하는 규칙이 없다

#### Scenario: 보호 화면 제외

- **WHEN** 일반 크롤러가 `/settings/default-post-visibility`처럼 보호 경로 하위 URL을 평가한다
- **THEN** 저장소 robots 정책의 보호 경로 접두 규칙이 해당 URL을 수집 대상에서 제외한다

#### Scenario: robots를 무시하는 클라이언트

- **WHEN** robots 지시문을 따르지 않는 클라이언트가 공개 조회 자격이 없는 Profile, Post 또는 보호 API를 직접 요청한다
- **THEN** 시스템은 robots 정책이 아니라 기존 인증·인가와 Domain 조회 정책으로 응답을 결정한다

### Requirement: canonical sitemap 위치를 게시한다

**Authority / Provenance:** `PROD-736` (Linear Contract), `PROD-731` (Sitemap implementation owner). 저장소 robots 정책은 `Sitemap: https://kos.moe/sitemap.xml` 절대 URL을 게시해야 한다(SHALL). PROD-736의 Sitemap 통합 완료는 PROD-731이 소유하는 URL이 운영 환경에서 유효한 sitemap으로 배포된 뒤에만 인정해야 한다(MUST).

#### Scenario: sitemap 지시문 확인

- **WHEN** 클라이언트가 저장소 robots 문서를 읽는다
- **THEN** 문서에는 `https://kos.moe/sitemap.xml`을 가리키는 Sitemap 지시문이 있다

#### Scenario: 배포 전 의존성

- **WHEN** 저장소 robots 정책은 배포되었지만 운영 `GET /sitemap.xml`이 유효한 sitemap을 반환하지 않는다
- **THEN** PROD-736의 Sitemap 통합 검증은 미완료로 남고 PROD-731의 구현을 이 변경에서 대체하지 않는다

#### Scenario: 배포 후 통합 확인

- **WHEN** PROD-731 배포 후 운영 robots 문서의 Sitemap URL을 요청한다
- **THEN** URL은 검색엔진이 소비할 수 있는 유효한 sitemap 응답을 반환한다

### Requirement: 검색 크롤러와 AI 학습·대량 수집 크롤러를 분리한다

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-736` (Linear Contract). 운영 `robots.txt`는 Cloudflare Managed 규칙과 저장소 규칙을 합성해 검색·사용자 요청용 크롤러와 AI 학습·대량 수집 크롤러에 서로 다른 정책을 제공해야 한다(SHALL). Cloudflare Managed `robots.txt`는 구현 검토일에 각 운영사의 공식 문서로 학습·대량 수집 또는 학습 겸용 용도가 확인된 에이전트의 전체 사이트 차단과 Content Signal을 소유해야 하며(SHALL), 저장소 정책은 Cloudflare가 동적으로 관리하는 에이전트 목록을 근거 없이 중복 고정해서는 안 된다(MUST NOT). Googlebot, OAI-SearchBot, Claude-SearchBot, Claude-User, Amzn-SearchBot, Applebot처럼 검색 노출 또는 사용자가 요청한 조회를 담당하는 에이전트는 별도의 학습 용도가 확인되지 않은 한, 단지 같은 운영사의 AI 에이전트라는 이유로 전체 사이트 차단 대상이 되어서는 안 된다(MUST NOT).

#### Scenario: 운영 합성 응답

- **WHEN** 운영 환경에서 `GET /robots.txt`를 요청한다
- **THEN** 응답에는 Cloudflare가 관리하는 AI 학습·대량 수집 정책과 저장소가 관리하는 경로·Sitemap 정책이 함께 있다

#### Scenario: 학습용 에이전트

- **WHEN** 구현 검토일의 공식 운영사 문서가 에이전트를 AI 학습·대량 수집 또는 학습 겸용으로 분류하고 Cloudflare 관리 정책에 포함한다
- **THEN** 운영 합성 robots 문서는 해당 에이전트에 전체 사이트를 허용하지 않는 지시를 제공한다

#### Scenario: 검색용 에이전트

- **WHEN** 일반 검색 또는 사용자 요청용 에이전트가 운영 합성 robots 문서에서 공개 Profile·Public Post 경로를 평가한다
- **THEN** 해당 에이전트는 AI 학습용 에이전트와 동일하다는 이유만으로 전체 사이트 차단되지 않는다

#### Scenario: Cloudflare 관리 목록 변경

- **WHEN** Cloudflare가 공식 근거에 따라 Managed robots 에이전트 목록을 갱신한다
- **THEN** 저장소 robots 정책은 그 동적 목록의 사본을 요구하지 않고 저장소 소유 경로·Sitemap 계약을 유지한다

### Requirement: AI 학습·대량 수집 크롤러를 Cloudflare edge에서 강제 차단한다

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `PROD-736` (Linear Contract). 운영 Cloudflare edge는 구현 검토일의 공식 운영사 근거와 Cloudflare behavior 분류에서 Training 또는 AI 대량 수집 용도가 확인된 크롤러의 일반 Web 요청을 origin 도달 전에 강제 차단해야 한다(SHALL). 하나의 크롤러가 Search behavior도 함께 가지더라도 Training behavior가 확인되면 강제 차단 대상에서 제외해서는 안 된다(MUST NOT). Search 전용 크롤러와 사용자의 실시간 요청을 수행하는 Agent는 별도의 학습 용도가 확인되지 않은 한 이 AI 학습 차단 정책만으로 차단해서는 안 된다(MUST NOT). 강제 차단 설정에는 관찰 가능한 증거와 롤백 절차가 있어야 하며(SHALL), 미식별·위장 크롤러까지 완전히 차단한다고 취급해서는 안 된다(MUST NOT).

#### Scenario: 확인된 학습 크롤러의 일반 Web 요청

- **WHEN** 확인된 Training 또는 대량 수집 크롤러가 공개 Profile이나 Public Post의 일반 Web 표현을 요청한다
- **THEN** Cloudflare edge는 application origin보다 먼저 해당 요청을 차단한다
- **AND** 차단 결과는 Cloudflare Security Events 또는 AI Crawl Control 증거에서 크롤러와 적용 규칙을 식별할 수 있다

#### Scenario: Search와 Training behavior를 함께 가진 크롤러

- **WHEN** 공식 근거 또는 Cloudflare 분류가 하나의 크롤러에 Search와 Training behavior를 함께 확인한다
- **THEN** 운영 강제 차단 정책은 검색 기능도 제공한다는 이유로 해당 크롤러의 학습 수집 요청을 허용하지 않는다

#### Scenario: 검색 전용 크롤러와 사용자 요청 Agent

- **WHEN** Search 전용 크롤러 또는 사용자가 실시간으로 요청한 조회를 수행하는 Agent가 공개 Web 경로를 요청한다
- **THEN** 별도의 학습 용도가 확인되지 않은 한 AI 학습 강제 차단 정책은 해당 요청을 차단하지 않는다

#### Scenario: 강제 차단 롤백

- **WHEN** 강제 차단이 승인되지 않은 검색 또는 application traffic을 차단하거나 정상 federation을 회귀시킨다
- **THEN** 운영 담당자는 기록된 Cloudflare 설정 스냅샷을 이용해 edge 강제 차단과 그 예외를 이전 상태로 되돌릴 수 있다
- **AND** 저장소 robots 정책과 기존 origin 인증·인가는 롤백과 독립적으로 유지된다

#### Scenario: 식별되지 않은 크롤러

- **WHEN** 크롤러가 알려진 User-Agent나 사용할 수 있는 Cloudflare detection signal로 식별되지 않는다
- **THEN** 시스템은 이 강제 차단만으로 해당 크롤러가 완전히 차단됐다고 간주하지 않는다
- **AND** 기존 WAF·rate limit·origin 인증·인가 경계를 약화하지 않는다

### Requirement: ActivityPub 연합 경로에 간섭하지 않는다

**Authority / Provenance:** `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/domain/objects/post.md`, `PROD-736` (Linear Contract). 저장소 일반 크롤러 정책은 `/.well-known/webfinger`, `/ap/actor/`, `/ap/note/`, `/ap/follow/`, 개인 inbox와 shared `/inbox` 등 ActivityPub discovery·actor·object·collection·inbox 경로를 차단해서는 안 된다(MUST NOT). Cloudflare 강제 차단은 canonical host, HTTP method, 실제 federation 경로 형태와 ActivityPub content negotiation·media type 및 적용 가능한 HTTP signature 특성을 조합해 정상 federation 요청을 AI 크롤러 차단 규칙에서만 제외해야 한다(SHALL). 이 예외는 모든 나머지 custom rule, Managed WAF, rate limit 또는 다른 보안 제품을 광범위하게 우회해서는 안 되며(MUST NOT), origin의 Fedify signature·activity·조회 권한 검증을 대신해서도 안 된다(MUST NOT).

#### Scenario: ActivityPub discovery 경로

- **WHEN** 원격 서버가 canonical host에 `GET /.well-known/webfinger` discovery 요청을 보낸다
- **THEN** 저장소 robots 정책은 해당 경로를 차단하지 않으며 요청은 기존 federation HTTP 경계로 전달될 수 있다
- **AND** 요청이 승인된 discovery 특성을 충족하면 Cloudflare AI 크롤러 차단의 최소 예외가 적용된다

#### Scenario: ActivityPub actor와 object 경로

- **WHEN** 원격 서버가 ActivityPub content negotiation으로 `/ap/actor/{identifier}`, 해당 collection, `/ap/note/{postId}` 또는 `/ap/follow/{id}`를 GET 요청한다
- **THEN** 저장소 robots 정책은 해당 경로를 차단하지 않고 기존 객체 조회 권한이 응답을 결정한다
- **AND** Cloudflare 예외는 AI 크롤러 차단 규칙에만 한정된다

#### Scenario: ActivityPub inbox 경로

- **WHEN** 원격 서버가 ActivityPub media type과 지원되는 HTTP signature 특성을 포함해 개인 inbox 또는 shared `/inbox`로 POST 요청을 보낸다
- **THEN** 요청은 AI 크롤러 차단의 최소 예외를 통과해 기존 inbox handler에 도달할 수 있다
- **AND** Fedify는 edge 예외와 독립적으로 signature와 activity를 검증한다

#### Scenario: 검증되지 않은 inbox 요청

- **WHEN** 개인 또는 shared inbox 요청이 edge의 federation 형태 조건을 충족하지만 signature나 activity 검증에 실패한다
- **THEN** 기존 federation handler는 해당 요청을 거부하고 side effect를 만들지 않는다
- **AND** Cloudflare 예외가 origin 검증 성공으로 취급되지 않는다

#### Scenario: 경로만 흉내 낸 크롤러 요청

- **WHEN** 강제 차단 대상 크롤러가 ActivityPub 경로를 요청하지만 승인된 method·content negotiation·media type 또는 적용 가능한 signature 특성을 충족하지 않는다
- **THEN** 경로만으로 ActivityPub 예외가 적용되지 않고 AI 크롤러 차단 정책이 요청을 평가한다

#### Scenario: 다른 보안 규칙 유지

- **WHEN** 정상 federation 요청이 AI 크롤러 차단 예외와 일치한다
- **THEN** 해당 요청은 나머지 custom rule, Managed WAF, rate limit과 origin 보안 검사를 계속 통과해야 한다
- **AND** 예외 요청은 운영 검증에 필요한 Cloudflare 로그에서 관찰할 수 있다

#### Scenario: 운영 federation 비간섭 확인

- **WHEN** 배포 검증자가 실제 federation 특성을 갖춘 대표 WebFinger·actor/object/collection·inbox 요청을 운영 환경에 보낸다
- **THEN** 응답은 Cloudflare challenge나 봇 차단 403이 아니며 application 또는 federation handler가 응답을 결정한다

### Requirement: 크롤러 정책의 근거와 갱신 책임을 추적한다

**Authority / Provenance:** `PROD-736` (Linear Contract). 저장소는 크롤러 분류에 사용한 공식 운영사·Cloudflare 근거, 마지막 검토일, 갱신 책임자 또는 책임 팀을 함께 기록해야 한다(SHALL). 출처 불명 목록은 정책 근거로 사용할 수 없으며(MUST NOT), 크롤러 용도가 불명확하면 전체 차단 목록에 추측으로 추가해서는 안 된다(MUST NOT).

#### Scenario: 정책 리뷰

- **WHEN** 담당자가 크롤러 정책을 구현하거나 갱신한다
- **THEN** 저장소 기록에서 공식 근거, 마지막 검토일과 갱신 책임을 확인할 수 있다

#### Scenario: 출처가 불명확한 에이전트

- **WHEN** 특정 User-Agent의 용도를 공식 운영사 또는 Cloudflare 문서로 확인할 수 없다
- **THEN** 담당자는 해당 에이전트를 추측으로 전체 차단 목록에 추가하지 않고 미확인 상태를 기록한다
