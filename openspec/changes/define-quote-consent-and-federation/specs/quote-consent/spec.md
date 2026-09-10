## ADDED Requirements

### Requirement: 게시글별 인용 허용 정책과 초기값

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

시스템은 Content가 있는 Local Post마다 `모두`, `팔로워`, `본인만` 중 하나의 인용 허용 정책을 제공해야
한다(MUST). 새 Post와 도입 전의 기존 Post 초기값은 `모두`여야 한다(MUST). `팔로워`는 established
Follower와 Source Author, `본인만`은 Source Author의 요청만 자동 승인해야 한다(MUST). 인용 허용은
Source 조회 권한을 부여해서는 안 된다(MUST NOT).

#### Scenario: 새 글과 기존 글의 최초 정책

- **WHEN** 정책을 처음 도입하거나 새 Content-bearing Local Post를 작성한다
- **THEN** 별도 변경 전 인용 허용 정책은 `모두`다
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
안 된다(MUST NOT). 검증된 승인 후에만 Source를 연결·표시하고 거절·철회·원문 삭제 후에는 자체 Content를
유지한 채 Source를 숨겨야 한다(MUST). 승인 여부와 무관하게 Source 조회·차단 정책을 적용해야 한다(MUST).

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

### Requirement: 차단과 명시적 승인 철회의 구분

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

차단 관계는 당사자의 새 인용 요청·새 승인보다 양방향으로 우선해야 한다(MUST). 기존 승인에 따른 Source
표시는 별도 양방향 제한을 추가하지 않고 viewer별 기존 Post 조회 정책으로 판정해야 한다(MUST). 차단 자체로
기존 승인을 자동 철회하거나 제3자의 Source를 일괄 숨겨서는 안 된다(MUST NOT). 인증된 원문 작성자가 기존
승인을 명시적으로 철회하면 승인에 의존하는 Source를 비노출해야 한다(MUST).

#### Scenario: 차단 뒤 새 요청

- **WHEN** 두 Profile 사이 어느 방향이든 차단 관계가 있는 상태에서 새 QuoteRequest 또는 새 승인을 시도한다
- **THEN** 새 요청·승인을 허용하지 않는다
- **AND** 기존 승인은 자동 철회하지 않는다

#### Scenario: 기존 승인 Source의 방향별 조회

- **WHEN** Viewer가 Source Author를 차단한 방향만 있거나 Source Author가 Viewer를 차단한 역방향·상호 차단이 있다
- **THEN** 전자는 기존 직접 Post 조회 조건을 통과하면 Source를 표시한다
- **AND** 후자와 상호 차단은 Source를 숨기며 Quote 자체 Content는 별도 조회 정책으로 판정한다

#### Scenario: 제3자에게도 인용 원문 숨기기

- **WHEN** Active Account의 Source Author가 해당 Source에 발급한 승인을 명시적으로 철회한다
- **THEN** 승인을 무효로 만들고 제3자에게도 해당 승인에 따른 Source를 표시하지 않는다
- **AND** Quote 작성자의 본문은 유지한다
