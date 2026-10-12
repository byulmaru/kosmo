## ADDED Requirements

### Requirement: 공유 미리보기는 기존 공유 대상과 일치한다

시스템은 제목·작성자·본문·이미지·canonical URL이 모두 같은 공유 대상을 가리키게 해야 한다(SHALL). Content가 있는 Post·Reply·Quote는 자체 Content를 대표하고 순수 Repost는 조회 가능한 직접 Source를 대표한다.

**Source Context:** Linear PROD-1107의 전달 범위, `docs/domain/objects/post.md`의 Post 공유 참조·외부 공유
미리보기, ADR 0015.

#### Scenario: Reply 또는 Quote를 공유한다

- **WHEN** guest가 조회 가능한 Content가 있는 Post·Reply·Quote의 기존 공유 URL을 요청한다
- **THEN** 제목·본문·이미지는 해당 Post 자체에서 나온다
- **AND** Parent 또는 Quote Source의 정보로 자동 대체하지 않는다

#### Scenario: Quote를 재게시한 순수 Repost를 조회한다

- **WHEN** Content와 Reply Parent가 없는 Repost의 직접 Source가 guest에게 조회 가능한 Quote다
- **THEN** 그 Quote 자체의 작성자·본문·이미지와 canonical 공유 URL을 제공한다
- **AND** Quote 아래 Source까지 평탄화하지 않는다

#### Scenario: canonical 공유 참조를 제공한다

- **WHEN** 지원하는 Post URL을 query 또는 오래된 표시용 핸들과 함께 요청한다
- **THEN** 실제 공유 대상의 현재 표시용 핸들과 Post 식별자로 canonical URL을 제공한다
- **AND** 유효한 deployment Web origin을 사용하며 query·hash·API origin·native deep link를 포함하지 않는다

### Requirement: 미리보기는 작성자와 현재 본문을 읽을 수 있게 제공한다

시스템은 조회 가능한 작성자의 닉네임과 표시용 핸들을 함께 식별할 수 있는 제목과 현재 Content의 Plain Text를 제공해야 한다(SHALL). 본문에는 마크업·내부 ID·과거 revision·첨부 내부 정보가 섞여서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 표시 계약, `docs/domain/objects/post-content.md`의 Plain Text·현재 revision·Mention 정책.

#### Scenario: Local 또는 Remote 작성자의 본문을 제공한다

- **WHEN** CW가 없고 본문에 한글·이모지·줄바꿈·링크가 있는 Post를 공유한다
- **THEN** 작성자의 닉네임과 핸들, 읽을 수 있는 본문 표현을 제공한다
- **AND** 닉네임이 없으면 핸들로 식별하고 Remote 핸들의 domain 구분을 유지한다

#### Scenario: 현재 revision의 Mention을 표시한다

- **WHEN** 본문에 같은 revision의 관계로 확인할 수 있는 Mention과 조회 불가 Mention이 있다
- **THEN** 조회 가능한 Mention은 해당 Profile의 표시용 핸들로 제공한다
- **AND** 관계가 없거나 조회 불가한 Mention은 기존 `@알 수 없는 사용자` 표현을 사용한다
- **AND** 다른 revision의 관계나 원격 fetch로 표시 정보를 보충하지 않는다

### Requirement: CW와 Sensitive Media는 모든 응답 정보에서 보호한다

시스템은 CW가 있으면 본문 대신 경고문만 제공해야 한다(SHALL). CW 또는 Sensitive Media로 가린 이미지의 원본 URL과 Alt Text를 응답에 포함해서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 표시 표·공개 범위, `docs/domain/objects/post.md`의 외부 공유 미리보기.

#### Scenario: CW가 있는 Post를 공유한다

- **WHEN** 조회 가능한 Post에 CW와 본문·첨부 이미지가 있다
- **THEN** 조회 가능한 작성자 정보, CW 경고문과 사이트 기본 이미지를 제공한다
- **AND** 가려진 본문·이미지 URL·Alt Text는 일반 description·OG·Twitter Card·HTML 부가 데이터에도 없다

#### Scenario: CW 없이 민감한 이미지가 있다

- **WHEN** Post에 CW는 없고 Sensitive Media가 있다
- **THEN** 작성자와 현재 본문을 제공하고 이미지는 사이트 기본 자산으로 대체한다
- **AND** 민감 이미지의 URL·Alt Text는 응답 전체에 없다

### Requirement: guest 공개 범위와 조회 불가 fallback을 유지한다

시스템은 현재 guest Post·Author Profile·Instance·Media 조회 정책만으로 미리보기를 결정해야 한다(SHALL). 로그인 상태·selected Profile·User-Agent로 공개 범위가 넓어져서는 안 된다(MUST NOT). Domain Block 모델과 공통 조회 정책 도입은 이번 범위 밖이며 최종 정책의 구현·검증 완료로 주장하지 않는다.

**Source Context:** Linear PROD-1107의 공개 범위와 2026-10-12 확정 범위, `docs/domain/objects/post.md`·`profile.md`·`media.md`.

#### Scenario: 공개 범위를 바꾸는 요청 정보가 전달된다

- **WHEN** 같은 Public·Unlisted 또는 Followers Only·Mentioned Profiles URL을 쿠키·selected Profile·봇 User-Agent를 달리해 요청한다
- **THEN** 현재 guest 정책이 허용한 공개 정보만 제공한다
- **AND** Unlisted 직접 조회를 검색·발견 범위 확대로 사용하지 않는다

#### Scenario: 대상 또는 직접 Source가 조회 불가다

- **WHEN** Post가 없거나 비공개·삭제·작성자 또는 Instance 상태로 조회 불가하거나 순수 Repost의 직접 Source가 조회 불가다
- **THEN** 개별 작성자·본문·CW·Media 정보를 덧붙이지 않은 일반 안내와 기본 이미지를 제공한다
- **AND** crawler 요청으로 원격 Post/Profile을 새로 수집하거나 갱신하지 않는다

### Requirement: 공개 이미지의 순서와 사실에 맞는 속성을 제공한다

시스템은 현재 Content에서 공개 가능한 이미지 정보를 순서대로 제공하고 첫 이미지를 대표 후보로 두어야 한다(SHALL). 이미지 MIME·크기는 확인 가능한 실제 값만 제공하며 확인되지 않은 크기를 만들어서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 이미지 표시 계약, `docs/domain/objects/post-content.md`의 Media projection,
`docs/design/logo.md`, [Open Graph structured properties](https://ogp.me/#structured).

#### Scenario: 여러 공개 이미지가 있다

- **WHEN** 현재 Content에 순서가 있는 공개 이미지가 여러 장 있다
- **THEN** 그 순서대로 `og:image`를 반복하고 각 이미지의 속성을 해당 이미지 바로 뒤에 제공한다
- **AND** 공개 이미지 URL은 세션 쿠키나 인증 헤더 없이 조회할 수 있다

#### Scenario: 이미지가 없거나 Media projection이 불완전하다

- **WHEN** 이미지가 없거나 현재 Media projection을 제공할 수 없다
- **THEN** 기존 1200×630 사이트 기본 이미지를 제공한다
- **AND** 본문 또는 CW 규칙을 유지하며 본문도 없으면 중립적인 안내를 제공한다
- **AND** Media projection의 불완전함만으로 Post 자체를 조회 불가로 바꾸지 않는다

#### Scenario: 콘텐츠 이미지의 크기를 알 수 없다

- **WHEN** 공개 이미지 URL은 있지만 실제 width·height를 확인할 수 없다
- **THEN** 알 수 없는 크기 속성을 생략하며 기본 이미지 크기로 대신하지 않는다

### Requirement: 초기 HTML은 일관된 안전한 메타데이터를 제공한다

시스템은 초기 HTML에서 `og:title/type/url/image/description/site_name`, 일반 title·description과 기존 Twitter Card 정보를 같은 공개·CW 정책으로 제공해야 한다(SHALL). 기본값 중복 때문에 다른 콘텐츠가 선택되거나 사용자 입력이 HTML 요소·속성을 탈출해서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 Open Graph·출력 인코딩 계약, [Open Graph Protocol](https://ogp.me/),
[OWASP 출력 인코딩](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#output-encoding-for-html-attribute-contexts).

#### Scenario: 일반 crawler가 문서를 요청한다

- **WHEN** 지원 Post URL에 `text/html`, `*/*` 또는 Accept 생략으로 GET을 보내며 JS·navigation 헤더·로그인이 없다
- **THEN** 초기 HTML에서 콘텐츠별 메타데이터를 읽을 수 있다
- **AND** 일반 title·description과 OG·Twitter Card가 일치하며 기본 태그와 중복되지 않는다

#### Scenario: 특수문자가 있는 정보를 제공한다

- **WHEN** 작성자명·본문·CW·Alt Text에 따옴표·앰퍼샌드·태그 또는 script 종료 문자열이 있다
- **THEN** HTML parser로 읽은 값은 의도한 문자열이며 추가 요소·속성·실행 코드가 생성되지 않는다
- **AND** 이미지·canonical URL에는 안전한 공개 URL만 사용한다

### Requirement: 기존 응답과 실패 경계를 보존한다

시스템은 사람의 기존 앱 상세 진입과 ActivityPub content negotiation·인증·오류, GraphQL·로그인·정적 자산 응답을 유지해야 한다(SHALL). HEAD는 해당 표현의 헤더를 제공하되 본문을 보내서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 응답·장애 보장, `docs/domain/objects/post.md`, [RFC 9110 HEAD](https://www.rfc-editor.org/rfc/rfc9110.html#name-head).

#### Scenario: HEAD 또는 ActivityPub 요청을 처리한다

- **WHEN** 지원 URL에 HEAD 또는 명시적인 ActivityPub Accept 요청을 보낸다
- **THEN** HEAD는 해당 표현의 헤더와 빈 본문을 반환한다
- **AND** ActivityPub 요청은 기존 표현·인증·오류 경로를 유지하며 공유 HTML로 덮이지 않는다

#### Scenario: 잘못된 URL 또는 일시적인 미리보기 실패가 발생한다

- **WHEN** 잘못된 ID·다른 객체 타입·없는 경로를 요청하거나 미리보기 DB 조회가 실패한다
- **THEN** 다른 Post 정보나 제한된 정보가 응답에 포함되지 않는다
- **AND** 잘못된 경로를 일괄 성공 Post HTML로 취급하지 않으며 일시적인 미리보기 실패가 기존 앱 진입을 불필요하게 막지 않는다

### Requirement: 응답 최신성과 외부 소비 결과를 구분한다

시스템은 새로 생성하거나 재검증하는 응답에 현재 조회 가능한 정보만 제공해야 한다(SHALL). 다른 Post·deployment· HTML/ActivityPub 표현이 섞이거나 잘못된 `304`로 과거 비공개 정보가 재사용되어서는 안 된다(MUST NOT).

**Source Context:** Linear PROD-1107의 최신성 보장과 완료 기준, `docs/domain/objects/post.md`의 외부 공유 미리보기.

#### Scenario: 삭제 또는 조회 불가 전환 후 재검증한다

- **WHEN** 미리보기 생성 뒤 Post가 삭제되거나 조회 불가가 되고 이전 validator를 포함해 다시 요청한다
- **THEN** 이전 작성자·본문·이미지를 재사용하지 않고 현재 guest 결과를 제공한다
- **AND** 현재 Content·작성자·Media 정보가 바뀐 경우에도 새로 생성하거나 재검증한 응답이 현재 값을 반영한다

#### Scenario: 대표 서비스의 카드를 확인한다

- **WHEN** 허용된 테스트 공간에서 검증용 공개 URL로 Slack·카카오톡·X의 카드 결과를 확인한다
- **THEN** 각 서비스의 실제 결과와 표시 차이·접근 제한을 각각 기록한다
- **AND** HTML 테스트만으로 실제 카드 렌더링을 완료했다고 주장하지 않는다
- **AND** 외부 서비스의 이미지 선택·본문 잘림과 이미 저장된 카드의 즉시 철회는 KOSMO 응답 갱신 보장과 구분한다
