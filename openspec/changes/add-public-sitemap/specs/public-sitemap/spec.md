## ADDED Requirements

### Requirement: 전용 XML sitemap 응답

**Authority / Provenance:** `PROD-731`의 전달 결과와 `/sitemap.xml` 완료 조건. Web origin은 `/sitemap.xml` GET 요청에 검색엔진이 처리할 수 있는 UTF-8 Sitemap protocol XML을 `application/xml`로 응답해야 한다(MUST). 이 경로는 요청의 browser navigation 여부와 무관하게 Expo SPA HTML이나 다른 representation으로 대체되어서는 안 된다(MUST NOT).

#### Scenario: 검색 crawler가 sitemap을 요청한다

- **WHEN** 검색 crawler가 Web origin의 `/sitemap.xml`을 GET으로 요청한다
- **THEN** 시스템은 성공 상태와 `application/xml` content type을 가진 well-formed sitemap XML을 반환한다
- **AND** 응답 본문은 Expo `index.html`이 아니다

#### Scenario: browser navigation 형식으로 sitemap을 요청한다

- **WHEN** `/sitemap.xml` 요청이 browser navigation header를 포함한다
- **THEN** 시스템은 SPA fallback보다 sitemap route를 우선해 같은 XML 표현을 반환한다

### Requirement: 공개 정적 route allowlist

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 정확한 공개 정적 route 범위와 SSR·페이지별 metadata 전면 개편 제외 범위. Sitemap의 공개 정적 route allowlist는 정확히 `/`와 `/privacy`여야 하며(MUST), 인증 화면, 보호 route, 내부 API, callback, 임시 UI route와 그 밖의 정적 route를 포함해서는 안 된다(MUST NOT). 단순히 Expo Router가 SPA fallback으로 열 수 있다는 사실만으로 route를 sitemap 대상에 추가해서는 안 된다(MUST NOT).

#### Scenario: allowlist의 공개 정적 route를 생성한다

- **WHEN** sitemap이 공개 정적 route entry를 생성한다
- **THEN** canonical Web origin의 `/`와 `/privacy`를 각각 한 번씩 포함한다
- **AND** 그 밖의 정적 route는 포함하지 않는다

#### Scenario: 보호 또는 내부 route가 존재한다

- **WHEN** 인증이 필요한 route, 로그인 callback, GraphQL·health endpoint 또는 그 밖의 내부 route가 Web 애플리케이션에 존재한다
- **THEN** sitemap은 해당 route를 포함하지 않는다

### Requirement: 공개 Local Profile URL 선택

**Authority / Provenance:** `docs/domain/objects/profile.md`의 Profile Origin·Lifecycle·Suspension·공개 조회 정책, `docs/domain/objects/instance.md`의 configured Local Instance 계약, `PROD-731`의 활성 Local Profile 포함 범위. Sitemap은 현재 deployment의 configured Local Instance에 속하며 공개 조회 가능한 Active·Normal Local Profile의 canonical Web URL을 포함해야 한다(MUST). Remote Profile, 다른 Local Instance의 Profile, Deactivated·Deleted·Suspended Profile 또는 사용할 수 없는 Instance의 Profile을 포함해서는 안 된다(MUST NOT).

#### Scenario: 활성 Local Profile이 있다

- **WHEN** Profile이 configured Local Instance에 속하고 Lifecycle State가 Active이며 Suspension State가 Normal이다
- **THEN** sitemap은 canonical origin과 Local Profile의 relative handle route를 결합한 절대 URL을 포함한다

#### Scenario: 공개 대상이 아닌 Profile이 있다

- **WHEN** Profile이 Remote이거나 configured Local Instance 밖에 있거나 공개 조회 정책을 통과하지 못한다
- **THEN** sitemap은 해당 Profile의 Kosmo URL을 포함하지 않는다

### Requirement: 공개 Local Post URL 선택

**Authority / Provenance:** `docs/domain/objects/post.md`의 Post Visibility·Post Eligibility·Post 상세·검색·공유 참조 정책, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0015-post-share-reference.md`, `PROD-731`의 공개 상태인 활성 Local Post 포함 범위와 Remote 원본·비공개·삭제 콘텐츠 제외 범위. Sitemap은 configured Local Instance의 공개 조회 가능한 Active·Normal Author Profile이 작성한 Active·Public·Content 보유 Post 중 Post Eligibility를 통과하는 Post의 canonical Web URL을 포함해야 한다(MUST). Unlisted, Followers Only, Mentioned Profiles, Tombstone, Content 없는 Repost, unavailable Author·Instance의 Post와 Remote 원본 Post를 포함해서는 안 된다(MUST NOT).

#### Scenario: 공개 Local Content Post가 있다

- **WHEN** Local Post가 Active·Public이고 Current Content를 가지며 Author Profile과 Instance가 공개 조회 가능하다
- **THEN** sitemap은 canonical origin과 `/{relativeHandle}/{postId}` canonical Post route를 결합한 절대 URL을 포함한다

#### Scenario: 제한되거나 삭제된 Post가 있다

- **WHEN** Post가 Unlisted·Followers Only·Mentioned Profiles이거나 Tombstone이거나 Post Eligibility를 통과하지 못한다
- **THEN** sitemap은 해당 Post URL을 포함하지 않는다

#### Scenario: Remote 원본 또는 Content 없는 Repost가 있다

- **WHEN** Post의 Author가 configured Local Instance 밖에 있거나 Post가 Content 없는 Repost다
- **THEN** sitemap은 중복 Kosmo URL이나 Repost 자체 URL을 만들지 않는다

#### Scenario: 자체 Content가 있는 Reply 또는 Quote가 있다

- **WHEN** Reply 또는 Quote가 자체 Current Content를 가지고 다른 공개 Local Post와 같은 visibility·state·Author·Instance eligibility를 통과한다
- **THEN** sitemap은 해당 Reply 또는 Quote 자체의 canonical Post URL을 포함한다
- **AND** Reply Parent나 Repost Source가 Tombstone이거나 조회 불가능하다는 사실만으로 해당 Reply 또는 Quote를 제외하지 않는다

### Requirement: canonical URL과 보수적인 metadata

**Authority / Provenance:** `docs/domain/objects/instance.md`의 public origin과 configured Local Instance 계약, `docs/domain/objects/post.md`와 `docs/domain/decisions/0015-post-share-reference.md`의 canonical Web URL 계약, `PROD-731`의 `PUBLIC_ORIGIN`·URL encoding·XML escaping·`lastmod` 규칙과 `changefreq`·`priority` 제외 범위. 모든 `<loc>`은 configured Local Instance의 `PUBLIC_ORIGIN`과 canonical route에서 파생한 중복 없는 절대 HTTP(S) URL이어야 한다(MUST). URL path segment는 URL 문법에 맞게 percent-encode되어야 하고(MUST), 완성된 URL은 XML text로 안전하게 escape되어야 한다(MUST). 실제 페이지 수정 시각을 신뢰할 수 있는 항목에만 W3C datetime 형식의 `<lastmod>`를 제공해야 하며(MUST), 요청 시각·배포 시각·추정 시각을 대신 사용해서는 안 된다(MUST NOT). `<changefreq>`와 `<priority>`는 제공해서는 안 된다(MUST NOT).

#### Scenario: canonical route 값에 URL 예약 문자가 있다

- **WHEN** relative handle 또는 canonical route segment에 URL에서 인코딩해야 하는 문자가 포함된다
- **THEN** sitemap은 각 path segment를 percent-encode한 유효한 절대 URL을 생성한다
- **AND** URL encoding을 XML escaping으로 대신하지 않는다

#### Scenario: URL에 XML 예약 문자가 있다

- **WHEN** canonical URL 문자열에 XML text에서 예약된 문자가 포함된다
- **THEN** sitemap은 의미가 같은 URL로 복원 가능한 escaped `<loc>`을 출력하고 XML 구조를 깨뜨리지 않는다

#### Scenario: Post Current Content 수정 시각을 신뢰할 수 있다

- **WHEN** 포함 대상 Post의 Current Content revision 생성 시각이 현재 공개 페이지의 마지막 실제 콘텐츠 수정 시각을 나타낸다
- **THEN** sitemap은 해당 시각을 `<lastmod>`로 제공할 수 있다

#### Scenario: 신뢰 가능한 수정 시각이 없다

- **WHEN** 정적 route나 Profile처럼 현재 저장 모델에서 실제 마지막 수정 시각을 신뢰할 수 없다
- **THEN** sitemap은 해당 URL의 `<lastmod>`를 생략한다
- **AND** `<changefreq>`와 `<priority>`도 출력하지 않는다

### Requirement: 단일 sitemap의 완전성과 protocol 상한

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 단일 sitemap 범위와 Sitemap protocol `<https://www.sitemaps.org/protocol.html>`. 이 change의 `/sitemap.xml`은 하나의 `urlset`이어야 하며(MUST), sitemap index 또는 child sitemap을 제공해서는 안 된다(MUST NOT). 성공 응답은 모든 eligible URL을 포함하면서 50,000 URL 이하이고 압축하지 않은 UTF-8 XML이 52,428,800 bytes 이하여야 한다(MUST). 시스템은 상한을 맞추기 위해 entry를 조용히 누락하거나 잘라낸 성공 응답을 반환해서는 안 된다(MUST NOT).

#### Scenario: 단일 sitemap이 protocol 상한 안에 있다

- **WHEN** 모든 eligible entry를 직렬화한 결과가 50,000 URL 이하이고 압축하지 않은 UTF-8 XML이 52,428,800 bytes 이하이다
- **THEN** 시스템은 모든 eligible entry를 담은 하나의 `urlset`을 성공 응답으로 반환한다

#### Scenario: 단일 sitemap이 protocol 상한을 넘는다

- **WHEN** 모든 eligible entry의 URL 수 또는 압축하지 않은 UTF-8 XML 크기가 protocol 상한을 넘는다
- **THEN** 시스템은 일부 entry만 담은 성공 응답을 반환하지 않는다
- **AND** sitemap index로 자동 전환하지 않는다
- **AND** 관측 가능한 서버 오류로 요청을 실패시킨다

#### Scenario: sitemap 생성에 필요한 설정 또는 조회가 실패한다

- **WHEN** canonical origin 설정, configured Local Instance 해석, database 조회 또는 XML 직렬화가 실패한다
- **THEN** 시스템은 부분 sitemap이나 SPA HTML을 성공 응답으로 반환하지 않는다
- **AND** 기존 Web 오류 관측 경계를 통해 실패를 드러낸다

### Requirement: 프로덕션 무인증 접근

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 durable production contract. 프로덕션 Web origin의 `/sitemap.xml`은 session cookie, bearer token 또는 그 밖의 인증 자격 증명 없이 가져갈 수 있어야 한다(MUST). 검색엔진 관리 도구 제출과 처리 결과 기록은 이 요구사항의 반복 가능한 capability가 아니라 `PROD-731`의 일회성 운영 task다.

#### Scenario: 인증 정보 없이 프로덕션 sitemap을 요청한다

- **WHEN** 익명 클라이언트가 프로덕션 Web origin의 `/sitemap.xml`을 GET으로 요청한다
- **THEN** 시스템은 인증 challenge나 login redirect 없이 sitemap XML 응답을 반환한다

#### Scenario: 인증 session이 없는 crawler가 요청한다

- **WHEN** 검색 crawler가 cookie나 authorization header 없이 `/sitemap.xml`을 요청한다
- **THEN** 인증 session 유무는 sitemap의 공개 표현을 바꾸지 않는다
