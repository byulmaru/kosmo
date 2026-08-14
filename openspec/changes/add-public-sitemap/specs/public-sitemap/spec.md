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

**Authority / Provenance:** `PROD-731`의 검색 노출 가치가 있는 공개 정적 페이지 포함 범위와 SSR·페이지별 metadata 전면 개편 제외 범위. Sitemap은 현재 검색 노출 대상으로 명시한 공개 정적 route allowlist를 포함해야 하며(MUST), 인증 화면, 보호 route, 내부 API, callback과 임시 UI route를 포함해서는 안 된다(MUST NOT). 단순히 Expo Router가 SPA fallback으로 열 수 있다는 사실만으로 route를 sitemap 대상에 추가해서는 안 된다(MUST NOT).

#### Scenario: allowlist의 공개 정적 route를 생성한다

- **WHEN** sitemap이 현재 명시적 공개 정적 route allowlist를 생성한다
- **THEN** 각 allowlist route를 canonical Web origin의 절대 URL로 한 번씩 포함한다

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

### Requirement: canonical URL과 보수적인 metadata

**Authority / Provenance:** `docs/domain/objects/instance.md`의 public origin과 configured Local Instance 계약, `docs/domain/objects/post.md`와 `docs/domain/decisions/0015-post-share-reference.md`의 canonical Web URL 계약, `PROD-731`의 `PUBLIC_ORIGIN`·URL escaping·`lastmod` 규칙과 `changefreq`·`priority` 제외 범위. 모든 `<loc>`은 configured Local Instance의 `PUBLIC_ORIGIN`과 canonical route에서 파생한 중복 없는 절대 HTTP(S) URL이어야 하고(MUST), XML text로 안전하게 escape되어야 한다(MUST). 실제 페이지 수정 시각을 신뢰할 수 있는 항목에만 W3C datetime 형식의 `<lastmod>`를 제공해야 하며(MUST), 요청 시각·배포 시각·추정 시각을 대신 사용해서는 안 된다(MUST NOT). `<changefreq>`와 `<priority>`는 제공해서는 안 된다(MUST NOT).

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

### Requirement: 프로덕션 검색엔진 제출과 증거

**Authority / Provenance:** `PROD-731`의 운영 환경 응답 확인·검색엔진 sitemap 제출 포함 범위와 완료 조건. 프로덕션 배포 뒤 운영자는 공개 `/sitemap.xml`을 인증 없이 가져와 protocol·content type·대표 포함·제외 URL을 검증하고, 선정된 검색엔진 관리 도구에 제출해야 한다(MUST). 각 도구의 fetch 또는 처리 결과와 확인 시각을 `PROD-731`에 기록해야 하며(MUST), 제출 성공을 개별 URL의 색인 완료로 일반화해서는 안 된다(MUST NOT).

#### Scenario: 프로덕션 sitemap을 제출한다

- **WHEN** sitemap 구현이 프로덕션 Web origin에 배포되고 운영자가 선정된 검색엔진 관리 도구에 제출한다
- **THEN** 도구는 공개 `/sitemap.xml`을 가져갈 수 있다
- **AND** 운영자는 제출 대상, 확인 시각, 처리 상태와 오류가 있으면 그 내용을 `PROD-731`에 기록한다

#### Scenario: 제출은 성공했지만 일부 URL이 색인되지 않는다

- **WHEN** 검색엔진이 sitemap을 성공적으로 처리했지만 개별 URL의 색인 여부가 아직 확인되지 않는다
- **THEN** 완료 증거는 sitemap fetch·처리 성공으로 제한하고 개별 URL의 검색 노출 완료를 주장하지 않는다
