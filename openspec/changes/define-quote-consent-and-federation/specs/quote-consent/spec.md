## ADDED Requirements

### Requirement: 게시글 인용 정책 GraphQL 계약

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`의 게시글별 정책·정책 변경 Mutation,
`docs/design/post-action-bar.md`, `memory/graphql-style.md`, PROD-902,
PROD-924의 2026-09-09 API 구체화 위임과 2026-09-11 공개 범위 UI 통합·개별 철회 제외 결정.

API는 `PostQuotePolicy`의 `EVERYONE`, `FOLLOWERS`, `AUTHOR`를 각각 모두·팔로워·본인만으로 제공해야
한다(MUST). 조회 가능한 Content 있는 Local Post의 `Post.quotePolicy`는 이 enum을 반환하고, 원격 Post와
Content 없는 Repost에서는 null을 반환해야 한다(MUST). `viewerCanUpdateQuotePolicy: Boolean!`는 현재
selected Profile의 정책 변경 권한을 반영해야 한다(MUST).

`CreatePostInput.quotePolicy: PostQuotePolicy`는 optional이며 생략·null일 때 `EVERYONE`으로 시작해야
한다(MUST). 명시적으로 선택한 값은 Post·Content와 같은 transaction에 저장해야 한다(MUST).
`updatePostQuotePolicy(input: UpdatePostQuotePolicyInput!): UpdatePostQuotePolicyPayload!`는 `id: ID!`와
`quotePolicy: PostQuotePolicy!`를 받아 변경한 `post: Post!`를 반환해야 한다(MUST). ID는 concrete Post
global ID이며 actor는 세션에서 결정해야 한다(MUST).

정책 변경은 Active Account·member인 selected Profile이 해당 Active Local Post의 Author일 때만 허용해야
한다(MUST). mutation은 메뉴용 권한 플래그를 신뢰하지 않고 저장 시 다시 권한을 검증해야 한다(MUST).
조회 불가 대상은 존재를 노출하지 않는 `NotFoundError`, 확인 가능한 대상의 권한 부족은 기존
`PermissionDeniedError`, 잘못된 입력은 기존 `ValidationError`와 GraphQL 입력 검증으로 처리해야 한다(MUST).
사용자용 개별 승인 철회 mutation·권한 필드·UI를 이번 범위에서 제공해서는 안 된다(MUST NOT).

#### Scenario: 새 글에 선택한 정책 저장

- **WHEN** 작성자가 공개·조용한 공개 글의 작성 요청에 `FOLLOWERS` 정책을 함께 제출한다
- **THEN** Post·Content와 같은 transaction에 정책을 저장하고 payload에서 같은 Post의 정책을 조회할 수 있다
- **AND** rollback 시 부분 정책 row를 남기지 않으며 기존 클라이언트의 입력 생략은 `EVERYONE`으로 처리한다

#### Scenario: 정책 변경과 같은 Post readback

- **WHEN** 권한 있는 작성자가 자신의 Post ID와 `AUTHOR`를 제출한다
- **THEN** `updatePostQuotePolicy`는 같은 Post ID와 변경된 `quotePolicy`를 반환한다
- **AND** 기존 승인·Content·visibility는 유지하고 후속 요청만 새 정책으로 판단한다

#### Scenario: 지원 대상과 selected Profile별 정책 조회

- **WHEN** Local content-bearing Post, 원격 Post, Content 없는 Repost를 서로 다른 selected Profile로 조회한다
- **THEN** Local content-bearing Post만 정책 enum을 반환하고 나머지는 null이다
- **AND** 정책 변경 권한은 요청별 actor로 계산하며 다른 actor cache의 권한을 재사용하지 않는다

#### Scenario: 잘못된 ID와 권한 우회

- **WHEN** raw DB UUID·다른 Node type·null 변경 정책을 입력하거나 다른 selected Profile의 권한으로 변경을 시도한다
- **THEN** 정책과 승인·Source 상태를 변경하지 않는다
- **AND** 조회 불가 대상과 그 Source·승인 존재를 오류에 노출하지 않는다

### Requirement: 기존 공개 범위 UI 안의 인용 정책 선택

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/design/post-action-bar.md`, `docs/design/reply-composer.md`,
`docs/domain/objects/post.md`, PROD-924의 2026-09-11 사용자 결정; 계약 owner PROD-902.

기존 게시글 공개 범위 설정 UI를 재사용하고 그 안에 새로운 인용 허용 정책 선택 UI를 추가해야 한다(MUST). 현재 draft가 `PUBLIC` 또는
`UNLISTED`일 때만 모두·팔로워·본인만 선택을 표시하고, 제한 공개에서는 해당 설정을 숨겨야 한다(MUST).
새 draft는 모두로 시작하며 해당 글에서 선택한 값을 저장해야 한다(MUST). Parent/Source의 정책 또는 다른 actor의
정책을 상속해서는 안 된다(MUST NOT). 게시 후 본인 Public·Unlisted 글의 정책 변경은 같은 설정 표현을
재사용하되 기존 visibility는 읽기 전용이며 Post Visibility 편집을 추가해서는 안 된다(MUST NOT).

#### Scenario: 공개·조용한 공개와 제한 공개 전환

- **WHEN** 작성자가 기존 공개 범위 UI에서 공개 또는 조용한 공개를 선택한다
- **THEN** 같은 UI 안에서 인용 허용 값을 선택할 수 있고 두 공개 값 사이 전환은 선택값을 유지한다
- **AND** 팔로워 공개를 선택하면 설정을 숨기며 기존 Source 인용 가능 범위는 바뀌지 않는다

#### Scenario: 게시 후 정책 변경

- **WHEN** 작성자가 게시된 본인 Public·Unlisted 글의 인용 설정을 연다
- **THEN** 기존 공개 범위를 읽기 전용으로 보여 주고 인용 정책만 변경·저장한다
- **AND** 기존 승인에는 소급하지 않는다는 설명을 제공하고 일반 본문·visibility 편집은 제공하지 않는다

#### Scenario: 실패 복구와 요청 수명

- **WHEN** 정책 저장이 실패하거나 pending 중 selected Profile·draft·Environment가 바뀐다
- **THEN** 실패한 현재 입력은 보존해 재시도할 수 있고 pending 중 중복 제출을 막는다
- **AND** 이전 요청의 늦은 응답은 새 draft·다른 actor Store·현재 navigation을 변경하지 않는다

#### Scenario: 키보드와 설정 표시 조건

- **WHEN** 키보드로 공개 범위와 인용 허용 설정을 조작한다
- **THEN** 각 선택 그룹의 이름·현재 값·focus를 구별하고 Escape/dismiss 후 trigger focus를 복구한다
- **AND** 공개 범위를 선택하자마자 메뉴를 닫아 인용 설정에 접근할 수 없게 하지 않는다

### Requirement: 게시글별 인용 허용 정책과 초기값

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

시스템은 Content가 있는 Local Post마다 `모두`, `팔로워`, `본인만` 중 하나의 인용 허용 정책을 제공해야
한다(MUST). 선택하지 않은 새 Post와 도입 전의 기존 Post 기본값은 `모두`여야 한다(MUST). `팔로워`는 established
Follower와 Source Author, `본인만`은 Source Author의 요청만 자동 승인해야 한다(MUST). 인용 허용은
Source 조회 권한을 부여해서는 안 된다(MUST NOT).

#### Scenario: 새 글과 기존 글의 최초 정책

- **WHEN** 정책을 처음 도입하거나 별도 정책 선택 없이 새 Content-bearing Local Post를 작성한다
- **THEN** 인용 허용 정책은 `모두`다
- **AND** 기존 QuoteAuthorization을 변경하거나 재발급하지 않는다

#### Scenario: 팔로워 정책의 자동 승인

- **WHEN** Source 정책이 `팔로워`이고 요청 Profile이 established Follower 또는 Source Author다
- **THEN** 조회·차단·Source 대상 조건을 통과하면 자동 승인한다
- **AND** 단순 Follow Request만 있는 Profile은 Follower로 취급하지 않는다

#### Scenario: 본인만 정책과 타인 요청

- **WHEN** Source 정책이 `본인만`이고 다른 Profile이 인용을 요청한다
- **THEN** 자동 승인하지 않고 요청을 거절한다
- **AND** Kosmo 원문용 건별 수동 승인 대기나 승인 UI를 만들지 않는다

### Requirement: 작성자의 정책 변경과 비소급 적용

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

인증된 Account 요청은 `Account.Active`와 행동 Profile의 `Post.Author` 사실을 확인한 뒤 Content가 있는
Active Local Post의 정책 변경을 허용해야 한다(MUST). 새 정책은 이후 요청·승인 판단에만 적용하고 기존
승인을 자동 철회해서는 안 된다(MUST NOT). 이번 범위에서 Profile 기본값 설정을 제공해서는 안 된다(MUST NOT).

#### Scenario: 모두에서 본인만으로 변경

- **WHEN** 권한이 있는 작성자가 게시글 정책을 `모두`에서 `본인만`으로 변경한다
- **THEN** 이후 타인 요청은 새 정책으로 거절한다
- **AND** 기존에 발급한 승인과 그 승인을 가진 Quote는 일괄 철회하지 않는다

#### Scenario: 다른 Profile의 정책 변경 시도

- **WHEN** 행동 Profile이 대상 Post의 Author가 아니거나 Account가 Active가 아니다
- **THEN** 정책을 변경하지 않는다
- **AND** 다른 selected Profile의 권한이나 설정을 재사용하지 않는다

### Requirement: Quote Source의 인용 가능 범위

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`,
PROD-902, PROD-431, PROD-924.

시스템은 타인의 Local·Remote Source를 Public·Unlisted에 한정하고 Content 존재·조회·인용 정책·차단
조건을 확인해야 한다(MUST). 타인의 Followers Only, Mentioned Profiles와 조회 불가 Source는 인용할 수
없어야 한다(MUST). 자기 Followers Only 인용은 허용하되 Source 접근 범위를 넓혀서는 안 된다(MUST NOT).

#### Scenario: 타인의 공개 Source

- **WHEN** 다른 Profile의 Local 또는 Remote Public·Unlisted Source를 선택하고 모든 요청 조건을 통과한다
- **THEN** Quote 작성 또는 원격 승인 요청을 진행할 수 있다

#### Scenario: 조회 가능한 타인 Followers Only Source

- **WHEN** established Follower가 타인의 Followers Only Source를 조회할 수 있어 인용을 시도한다
- **THEN** Quote 작성을 거부한다
- **AND** Source 조회 권한을 인용 허용으로 간주하지 않는다

#### Scenario: 자기 Followers Only Source

- **WHEN** Source Author가 자기 Followers Only Post를 인용한다
- **THEN** 기존 Source 조회 범위를 유지하는 Quote를 작성할 수 있다
- **AND** Quote를 조회할 수 있다는 사실만으로 Source를 조회하게 하지 않는다

#### Scenario: 삭제되었거나 Content가 없는 Source

- **WHEN** Source가 삭제·조회 불가 상태이거나 Content가 없다
- **THEN** 작성 관계를 만들지 않고 권한 없는 Source 존재를 오류로 노출하지 않는다

### Requirement: 로컬 Quote 작성

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`,
`docs/design/post-action-bar.md`, PROD-902, PROD-431.

시스템은 Reply Parent가 없는 기존 Post에 자체 Content와 인용 대상 정보를 원자적으로 기록해야 한다(MUST).
로컬 Reply+Quote 작성 UI·API를 제공해서는 안 되며(MUST NOT), 별도 Quote Node나 배타적인 Post Kind를
만들어서는 안 된다(MUST NOT). 원격 승인 요청이 허용되는 상태는 최종 승인이 없어도 자체 Content 작성의
거부 조건이 되어서는 안 된다(MUST NOT).

#### Scenario: 기본 Quote 작성

- **WHEN** Profile이 조건을 통과한 Source와 자체 Content를 제출한다
- **THEN** 기존 Post에 자체 Content와 인용 대상 정보를 원자적으로 기록한다
- **AND** Reply Parent를 추가하지 않는다

#### Scenario: 작성 범위를 벗어난 관계 입력

- **WHEN** 로컬 작성 요청이 Source와 Reply Parent를 함께 지정한다
- **THEN** Reply+Quote를 생성하지 않고 입력을 거부한다
- **AND** Post·Content·관계·Media 변경의 부분 결과를 남기지 않는다

#### Scenario: 작성 실패와 재시도

- **WHEN** 작성 transaction이 실패한다
- **THEN** 부분 Post·Content·작성 관계를 남기지 않는다
- **AND** Composer는 입력을 보존하고 오류 복구·재시도를 제공한다

#### Scenario: 작성 성공의 클라이언트 반영

- **WHEN** Quote 작성이 성공한다
- **THEN** 선택한 Profile의 Relay environment와 관련 Post connection에 결과를 반영한다
- **AND** Web과 Native의 기존 메뉴·Composer interaction 경계를 유지한다

### Requirement: 승인 상태와 본문 보존

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-431, PROD-924.

원격 승인 대기 중에도 Quote 자체 Content를 게시해야 하며(MUST), Source는 정상 인용으로 노출해서는
안 된다(MUST NOT). 새 lifecycle에서 검증된 승인 후에만 Source를 연결·표시하고 거절·철회·원문 삭제 후에는 자체 Content를
유지한 채 Source를 숨겨야 한다(MUST). 승인 여부와 무관하게 Source 조회·차단 정책을 적용해야 한다(MUST). 도입 전 Local Quote 2건의 승인 기록 없는 표시는 아래 D15 전환 요구사항을 따라야 한다(MUST).

#### Scenario: 원격 타인 원문의 승인 대기

- **WHEN** 자기 인용이 아닌 원격 원문의 QuoteAuthorization을 아직 확인하지 못했다
- **THEN** 자체 Content는 로컬에 게시되며 게시된 Source 카드는 승인 전까지 숨긴다
- **AND** `interactionPolicy`의 automatic/manual 광고나 부재·해석 실패를 승인 증거로 취급하지 않는다

#### Scenario: 거절 또는 승인 철회

- **WHEN** 해당 Quote의 유효한 거절이나 승인 철회를 처리한다
- **THEN** 자체 Content를 유지하고 Source를 비노출한다
- **AND** 저장된 Source 관계의 존재만으로 정상 Quote 표시를 복원하지 않는다

#### Scenario: 원문 삭제

- **WHEN** Source가 삭제된다
- **THEN** Quote 자체의 조회 정책을 통과하는 본문은 유지한다
- **AND** Source 카드·관계를 숨기며 Quote 전체를 연쇄 삭제하지 않는다

### Requirement: 차단과 연합 승인 철회의 구분

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

차단 관계는 당사자의 새 인용 요청·새 승인보다 양방향으로 우선해야 한다(MUST). 기존 승인에 따른 Source
표시는 별도 양방향 제한을 추가하지 않고 viewer별 기존 Post 조회 정책으로 판정해야 한다(MUST). 차단 자체로
기존 승인을 자동 철회하거나 제3자의 Source를 일괄 숨겨서는 안 된다(MUST NOT). 유효한 원격 승인 철회나
Source 삭제를 처리하면 승인에 의존하는 Source를 비노출해야 한다(MUST). 사용자용 개별 승인 철회는 현재
제공해서는 안 된다(MUST NOT).

#### Scenario: 차단 뒤 새 요청

- **WHEN** 두 Profile 사이 어느 방향이든 차단 관계가 있는 상태에서 새 QuoteRequest 또는 새 승인을 시도한다
- **THEN** 새 요청·승인을 허용하지 않는다
- **AND** 기존 승인은 자동 철회하지 않는다

#### Scenario: 기존 승인 Source의 방향별 조회

- **WHEN** Viewer가 Source Author를 차단한 방향만 있거나 Source Author가 Viewer를 차단한 역방향·상호 차단이 있다
- **THEN** 전자는 기존 직접 Post 조회 조건을 통과하면 Source를 표시한다
- **AND** 후자와 상호 차단은 Source를 숨기며 Quote 자체 Content는 별도 조회 정책으로 판정한다

#### Scenario: 원격 철회와 원문 삭제의 제3자 결과

- **WHEN** 유효한 원격 승인 철회 또는 Local Source 삭제를 처리한다
- **THEN** 승인을 무효로 만들고 제3자에게도 해당 승인에 따른 Source를 표시하지 않는다
- **AND** Quote 작성자의 본문은 유지한다

### Requirement: 도입 전 Local Quote 2건의 무백필과 Source 표시

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-924·PROD-902의 2026-09-17 정정과 D15 Human Decision.

시스템은 도입 전 Local Quote 2건의 존재를 인지한 상태에서 새 승인 상태나 QuoteAuthorization을 backfill해서는
안 된다(MUST NOT). 확인된 두 Quote는 신규 승인으로 간주하지 않는 기존 데이터 예외로 Source 표시를 유지해야
한다(MUST). 승인 기록 부재만으로 대기·거절·철회·승인 완료를 합성해서는 안 된다(MUST NOT).
이 예외도 기존 Source 조회·방향별 차단·삭제 제한을 통과해야 하며 자체 Content는 보존해야 한다(MUST).
정확한 두 identity로 예외를 제한하고 신규 Quote의 승인 누락으로 확대해서는 안 된다(MUST NOT).
기존 Local Post의 정책 초기화와 이미 발급된 승인 보존은 별개로 유지해야 한다(MUST).

#### Scenario: 기존 두 Quote의 migration과 정상 조회

- **WHEN** 확인된 기존 Local Quote 2건을 대상으로 PROD-924를 도입하고 Source가 기존 조회 조건을 통과한다
- **THEN** 새 승인 상태·QuoteAuthorization을 생성하지 않으며 Source 관계와 카드를 계속 표시한다
- **AND** 기존 Quote는 승인 lifecycle 미편입으로 읽고 새 승인이나 원격 pending으로 간주하지 않는다

#### Scenario: 기존 Source 삭제 또는 접근 제한

- **WHEN** 기존 두 Quote 중 하나의 Source가 삭제되거나 viewer별 조회·방향별 차단 조건을 통과하지 못한다
- **THEN** Source를 숨기고 Quote 자체 Content는 그 Post의 조회 정책에 따라 보존한다
- **AND** 기존 데이터 예외로 접근 제한을 우회하지 않는다

#### Scenario: 신규 Quote의 승인 누락

- **WHEN** 확인된 두 identity 밖의 신규 타인 Quote에 승인 상태나 유효한 QuoteAuthorization이 없다
- **THEN** 기존 데이터 예외를 적용하지 않고 Source를 숨긴다
- **AND** Source FK 또는 승인 기록 부재만으로 승인이나 기존 데이터 자격을 추정하지 않는다

#### Scenario: 활성화 대상 확인과 호환 rollback

- **WHEN** 활성화 전 실제 두 Quote identity·Source 결속과 구버전 writer를 점검하거나 호환 빌드로 rollback한다
- **THEN** 확인된 두 Quote의 표시 예외와 신규 Quote의 승인 guard를 함께 유지한다
- **AND** 대상이 확인된 두 건과 다르면 예외를 확대하지 않고 활성화를 보류해 범위를 재확인한다
