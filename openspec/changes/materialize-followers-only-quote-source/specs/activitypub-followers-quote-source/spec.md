## ADDED Requirements

### Requirement: 검증된 Source 작성자 정보로 조회를 시작한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Source 작성자 신뢰 경계 확정」·「실행 자격」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「공통 Note 처리와 목록 기능의 책임」. 시스템은 미저장 Followers Only Quote Source를 조회하기 전에 인증된 선행 처리에서 검증한 Source URI와 expected author Actor의 대응을 받아야 한다(SHALL). expected author는 DB에 저장된 Remote ActivityPub Actor여야 하며, Quote resolution의 대상 URI와 같은 Source를 가리켜야 한다(SHALL). Quote 작성자, delivery actor, URI의 host·경로 또는 검증되지 않은 attribution으로 이 대응을 대신 만들어서는 안 된다(MUST NOT).

#### Scenario: 검증된 대응과 저장된 작성자가 있다

- **WHEN** 현재 Quote target과 같은 Source URI의 검증된 작성자 정보가 있고 해당 Remote Actor가 저장되어 있다
- **THEN** 시스템은 그 Actor에 대한 Local Follower 조회 자격을 평가한다

#### Scenario: Source URI만 전달되었다

- **WHEN** Quote target URI는 있지만 검증된 Source 작성자 대응이 없다
- **THEN** 시스템은 이 경로의 Source fetch와 materialization을 시작하지 않는다
- **AND** outer Quote의 기존 본문을 유지한다

#### Scenario: 작성자 정보가 부적합하다

- **WHEN** 대응이 다른 Source를 가리키거나 검증되지 않았거나 expected author가 미저장 Actor이다
- **THEN** 시스템은 Source fetch, 새 Remote Profile·Actor 생성, Source 저장을 수행하지 않는다

### Requirement: 자격이 있는 Local Follower 하나를 결정적으로 선택한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」·Followers Only inbound relevance; `docs/domain/objects/follow-relationship.md` 「상태」·「조회 정책」; `docs/domain/objects/profile.md` 「상태」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「실행 자격」; [PROD-360](https://linear.app/byulmaru/issue/PROD-360). 시스템은 Source 작성자와 현재 established Follow Relationship을 가지며 기존 Followers Only local 수신 자격을 만족하는 Active Local Profile 하나를 선택해야 한다(SHALL). 같은 후보 집합에는 항상 같은 identity를 선택하는 결정적 규칙을 적용해야 한다(SHALL). Pending·rejected Follow Request, 제거된 Follow, 비활성 Profile 또는 기존 local Profile·Instance eligibility를 통과하지 못한 후보를 사용해서는 안 된다(MUST NOT).

#### Scenario: 적합한 Follower가 하나 있다

- **WHEN** Source 작성자를 팔로우하는 적합한 Active Local Profile이 하나 있다
- **THEN** 시스템은 해당 Profile을 이 Source 조회의 signer로 선택한다

#### Scenario: 적합한 Follower가 여러 명이다

- **WHEN** 동일한 후보 집합을 서로 다른 조회 순서와 반복 실행으로 평가한다
- **THEN** 시스템은 항상 동일한 Local Profile identity 하나를 선택한다

#### Scenario: 적합한 Follower가 없다

- **WHEN** 후보가 없거나 Pending·rejected Request, 제거된 Follow 또는 비활성 Profile·Instance만 있다
- **THEN** 시스템은 Source fetch와 Source 관련 저장을 수행하지 않는다

### Requirement: 선택한 identity의 authenticated document loader를 사용한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「인증된 원문 조회」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) 기존 Fedify document loader·vocabulary 재사용 계약. 시스템은 선택한 Local Profile identity의 Fedify authenticated document loader와 vocabulary hydration으로 요청한 Source URI를 조회해야 한다(SHALL). 다른 로컬 프로필, 서버 공용 identity, 서명 없는 generic fetch 또는 수동 HTTP/JSON-LD 구현을 사용해서는 안 된다(MUST NOT). 한 조회 시도의 fetch와 저장 전 검증은 같은 Local Profile identity를 대상으로 해야 한다(SHALL).

#### Scenario: 정상 signed fetch

- **WHEN** 자격이 있는 Local Profile을 선택해 Source URI를 조회한다
- **THEN** 원격 서버가 확인하는 서명 identity는 선택한 Profile의 canonical Actor이다
- **AND** 시스템은 같은 identity로 얻은 typed Note를 다음 검증에 전달한다

#### Scenario: 선택한 signer를 사용할 수 없다

- **WHEN** 선택한 identity로 인증된 요청을 만들거나 수행할 수 없다
- **THEN** 시스템은 임의 Profile·공용 identity·unsigned fetch로 대체하지 않는다
- **AND** 성공한 Source materialization 또는 Quote 연결로 기록하지 않는다

### Requirement: 조회한 Note와 동일한 Follower 권한을 저장 직전에 재검증한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」·ActivityPub audience 분류; `docs/domain/objects/follow-relationship.md` 「조회 정책」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「저장 직전 재검증」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) typed Note·exact identity·attribution 검증. 시스템은 네트워크 조회 후 materialization transaction 직전에 typed Note의 ID가 요청한 Quote target URI와 정확히 일치하고, 작성자가 예상한 저장된 Remote Actor이며, audience가 작성자의 canonical followers collection을 포함하는 Followers Only인지 다시 검증해야 한다(SHALL). 같은 선택 Profile이 여전히 Active이고 established Follow 및 기존 local 수신 자격을 유지하는지도 다시 검증해야 한다(SHALL). 어느 검증이든 실패하면 해당 시도는 Source Post·PostContent·Media·ActivityPub mapping과 Quote 연결·상태를 생성하거나 변경해서는 안 된다(MUST NOT).

#### Scenario: 모든 재검증이 성공한다

- **WHEN** exact ID·작성자·Followers Only audience와 같은 Profile·Follow 자격이 저장 직전에도 유효하다
- **THEN** 시스템은 검증한 Note만 Source materialization에 전달한다

#### Scenario: 원문 identity 또는 작성자가 다르다

- **WHEN** 응답이 typed Note가 아니거나 Note ID가 target과 다르거나 단일 attributed author가 expected author와 다르다
- **THEN** 시스템은 Source 및 Quote 관련 상태를 변경하지 않는다

#### Scenario: Followers Only audience가 아니다

- **WHEN** canonical author followers marker가 없거나 Public marker가 있어 Public·Unlisted로 분류되거나 지원하지 않는 Direct audience이다
- **THEN** 시스템은 이 Followers Only admission 경로로 저장하지 않는다

#### Scenario: 정상 audience에 다른 유효한 addressee가 함께 있다

- **WHEN** Public marker가 없고 canonical author followers marker와 추가적인 구문상 유효한 actor·collection URI가 함께 있다
- **THEN** 시스템은 기존 audience 분류대로 Followers Only로 판정한다
- **AND** 추가 URI로 viewer 권한이나 Mention 관계를 만들지 않는다

#### Scenario: fetch 도중 Profile이 비활성화되었다

- **WHEN** 요청을 서명한 Profile이 네트워크 조회 중 비활성화되었다
- **THEN** 저장 전 재검증이 실패하고 Source 및 Quote 관련 상태는 바뀌지 않는다

#### Scenario: fetch 도중 Follow가 해제되었다

- **WHEN** 선택한 Profile과 Source 작성자의 established Follow가 네트워크 조회 중 제거되었다
- **THEN** 저장 전 재검증이 실패하고 Source 및 Quote 관련 상태는 바뀌지 않는다
- **AND** 다른 Follower의 권한으로 그 응답을 저장하지 않는다

### Requirement: 검증한 private Source만 공용 저장 경계에 연결한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「미저장 Followers Only Quote Source 조회」; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「기존 기반 재사용과 추가 책임」·「Quote resolution 연결」; [PROD-509](https://linear.app/byulmaru/issue/PROD-509) 원자성·중복 처리·private 제외 계약; PROD-509의 2026-09-09 최소 helper 재사용 결정. 시스템은 이 경로의 private admission 검증을 통과한 Note에만 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost` 및 PROD-509의 materializer에서 필요한 최소 helper와 Post 저장을 적용해야 한다(SHALL). Source의 Post·PostContent·currentContent·ActivityPub Post mapping 등 저장 결과는 기존 원자성·object URI uniqueness 계약을 유지해야 한다(SHALL). PROD-509의 일반 신규 조회 경로에 Followers Only를 무조건 허용하거나, 공개 callback·evaluator로 attribution·visibility 검증을 우회하게 해서는 안 된다(MUST NOT).

#### Scenario: 정상 Source 저장

- **WHEN** private admission을 통과한 미저장 Source를 materialize한다
- **THEN** canonical content·media와 Followers Only visibility를 가진 Source Post 및 필요한 관계가 원자적으로 저장된다

#### Scenario: 저장 중 실패한다

- **WHEN** Source 저장 transaction이 실패한다
- **THEN** 실패한 시도가 만든 partial Post·PostContent·Media·mapping 또는 Source 연결을 남기지 않는다

#### Scenario: 일반 materializer에서 private Note를 요청한다

- **WHEN** 이 Source별 admission 없이 PROD-509의 일반 신규 조회 경로에 Followers Only Note를 전달한다
- **THEN** 그 경로의 기존 private 제외 정책이 유지된다

#### Scenario: 기존 Media 검증이 실패한다

- **WHEN** private admission을 통과했지만 기존 Media 계약에서 선택된 attachment의 필수 검증이 실패한다
- **THEN** 시스템은 실패한 Source를 본문 또는 일부 Media만으로 축소 저장하지 않는다
- **AND** 기존 작성자와 Instance를 보상 삭제하지 않고 실패한 시도의 partial Source 관련 row를 남기지 않는다

### Requirement: Quote revision과 멱등하게 수렴한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「관계」·「미저장 Followers Only Quote Source 조회」; `docs/domain/decisions/0014-post-structure-relations.md`; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Quote resolution 연결」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「저장과 조회」·「Quote resolution Workflow」. 시스템은 materialize한 Source를 PROD-792의 현재 Quote resolution revision과 `Posts.repostSourceId`에 멱등하게 반영해야 한다(SHALL). 기존 `activitypubQuoteResolutionWorkflow`, `activitypub-quote-resolution:{postId}:{revision}` identity, transient 오류만 최대 10회 재시도하는 정책을 유지해야 한다(SHALL). stale revision과 영구 검증 실패는 멱등 no-op이어야 하며, duplicate·concurrent 실행과 transient 재시도는 object URI마다 하나의 Source Post와 현재 revision의 Quote 상태로 수렴해야 한다(SHALL). Source 저장을 Quote 승인으로 간주해서는 안 된다(MUST NOT).

#### Scenario: 현재 revision에 Source가 연결된다

- **WHEN** Source 검증·저장이 성공하고 Quote target과 revision이 여전히 현재 값이다
- **THEN** Source는 기존 `Posts.repostSourceId`로 연결되고 Quote 승인 상태는 기존 승인 검증 결과를 유지한다

#### Scenario: 늦게 도착한 이전 revision이다

- **WHEN** fetch가 진행되는 동안 Quote target 또는 resolution revision이 바뀐다
- **THEN** 이전 시도는 현재 Quote의 target·Source 연결·승인 상태를 덮어쓰지 않는다
- **AND** stale 시도는 기존 resolution 정책에 따라 멱등 no-op으로 종료한다

#### Scenario: 일시적인 조회 오류가 발생한다

- **WHEN** Source 조회에서 transient 오류가 발생한다
- **THEN** Workflow는 기존 최대 10회 정책 안에서 재시도하며 매 시도에 필요한 identity·권한 검증을 유지한다
- **AND** 재시도를 소진하면 성공한 Source 연결로 기록하지 않고 기존 Workflow 실패 관찰 경로에 남긴다

#### Scenario: duplicate와 concurrent 실행이 겹친다

- **WHEN** 같은 Source URI 또는 Quote revision의 실행이 중복되거나 동시에 저장을 시도한다
- **THEN** Source Post는 URI마다 하나로 수렴하고 현재 Quote revision은 하나의 일관된 Source 연결과 승인 상태를 가진다

### Requirement: Source fetch 권한과 viewer 조회 권한을 분리한다

**Authority / Provenance:** `docs/domain/objects/post.md` 「Post Visibility」·「Post Eligibility」·「미저장 Followers Only Quote Source 조회」; `docs/design/post-action-bar.md` 기존 Quote Source presentation; [PROD-793](https://linear.app/byulmaru/issue/PROD-793) 「Quote resolution 연결」·「검증」; [PROD-792](https://linear.app/byulmaru/issue/PROD-792) 「기존 조회·표시 경로 재사용」·「저장과 조회」. 시스템은 기존 Quote 승인 상태와 현재 viewer별 Source Post 조회 정책을 모두 통과할 때만 기존 GraphQL Source와 Quote 카드를 제공해야 한다(SHALL). fetch에 사용한 Local Follower의 권한을 viewer에게 이전해서는 안 된다(MUST NOT). Source가 조회 불가·미승인·철회 상태여도 outer Quote 자체가 조회 정책을 통과하면 그 본문은 유지해야 한다(SHALL). 새 GraphQL 타입이나 프론트 화면을 추가하지 않아야 한다(SHALL).

#### Scenario: 승인된 Quote를 권한 있는 viewer가 조회한다

- **WHEN** Quote가 승인 상태이고 viewer가 Source의 기존 Followers Only visibility와 eligibility를 통과한다
- **THEN** 목록과 상세의 기존 Quote 카드에 Source가 표시된다

#### Scenario: Source 권한이 없는 viewer가 조회한다

- **WHEN** outer Quote는 조회 가능하지만 viewer가 Source 조회 정책을 통과하지 못한다
- **THEN** GraphQL은 Source를 반환하지 않고 기존 UI는 outer Quote 본문만 표시한다

#### Scenario: 저장된 Source의 Quote 승인이 없거나 철회되었다

- **WHEN** Source는 저장되어 있지만 Quote가 미승인 또는 철회 상태이다
- **THEN** Source 카드만 숨기고 조회 가능한 outer Quote 본문은 유지한다

#### Scenario: materialization 이후 viewer의 Follow가 해제되었다

- **WHEN** Source를 볼 수 있던 viewer가 작성자 Follow를 해제하고 다른 조회 자격도 없다
- **THEN** 이후 조회에는 현재 권한을 적용해 Source를 숨기며 과거 fetch 성공을 접근 근거로 사용하지 않는다

#### Scenario: viewer의 Profile Block 방향에 따라 Source를 조회한다

- **WHEN** Quote가 승인 상태이고 viewer가 Source의 다른 조회 조건을 만족하며 viewer와 Source 작성자 사이에 Profile Block이 있다
- **THEN** viewer가 Block Owner이고 역방향 Block이 없으면 기존 조회 정책에 따라 Source를 반환한다
- **AND** viewer가 Block Target이거나 양방향 Block이면 Source를 반환하지 않으며 조회 가능한 outer Quote 본문은 유지한다

### Requirement: Reply Source의 identity를 독립적으로 검증한다

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 Note 최초 materialization과 미저장 Followers Only Quote Source 조회, PROD-793의 2026-09-09 사용자 확정. Source가 Reply여도 Source Note 자체의 identity·author·audience로 기존 private admission을 검증해야 한다(SHALL). Parent나 Parent 작성자로 Source를 대체해서는 안 된다(MUST NOT). 전체 Note projector나 두 단계 projection API를 추가해서는 안 된다(MUST NOT).

#### Scenario: Reply Source 작성자를 Parent로 대체하지 않는다

- **WHEN** Source Note가 `inReplyTo`를 갖고 Parent와 작성자 또는 audience가 다르다
- **THEN** Source 자체의 요청 URI·expected author·canonical Followers audience와 선택한 Local Follower 권한을 재검증한다
- **AND** Parent 또는 Parent 작성자를 기준으로 조회 자격을 얻거나 Source 검증을 통과시키지 않는다
- **AND** Source 저장 성공만으로 Quote 승인 또는 viewer의 Source 조회 권한을 부여하지 않는다

#### Scenario: Reply Source의 Parent가 저장되어 있거나 없다

- **WHEN** 유효한 Reply Source의 Parent가 DB에 저장되어 있거나 미해석·미저장·기존 계약상 부적합하다
- **THEN** 시스템은 기존 Parent DB lookup과 허용된 null fallback을 적용해 Source 자체를 처리한다
- **AND** Parent 원격 fetch·재귀 materialization·기존 null Parent의 update/backfill을 시작하지 않는다

#### Scenario: Parent 조회에서 DB 장애가 발생한다

- **WHEN** Parent 처리에서 예상된 부재·부적합 조건이 아닌 DB 장애 또는 예상하지 못한 오류가 발생한다
- **THEN** 시스템은 이를 null fallback 성공으로 바꾸지 않고 오류를 전파한다
- **AND** 실패한 시도의 partial Source 저장을 남기지 않는다
