## ADDED Requirements

### Requirement: Exact hydrated Note identity

**Authority / Provenance:** `docs/domain/objects/post.md`의 ActivityPub Local Note 표현, PROD-509 목적·포함 범위·완료 기준. 시스템은 기존 Fedify vocabulary hydration과 `documentLoader`로 얻은 typed Note만 materialization 입력으로 사용해야 한다(MUST). 요청 IRI와 hydrated `Note.id`는 HTTP(S) identity이며 정확히 일치해야 한다(MUST). 단일 HTTP(S) attribution을 확인해야 하며(MUST), 전달 Actor를 Note 작성자로 대체해서는 안 된다(MUST NOT). 별도 generic fetcher, document-loader wrapper, hydration abstraction이나 수동 HTTP/JSON-LD 구현을 추가해서는 안 된다(MUST NOT).

#### Scenario: Resolve a supported original Note

- **WHEN** 기존 Fedify 경계가 HTTP(S) 원문 IRI를 typed Note로 hydration한다
- **THEN** 시스템은 요청 IRI와 `Note.id.href`가 같은지 검증한다
- **AND** Note의 단일 HTTP(S) `attributedTo` identity를 작성자 조회에 사용한다
- **AND** 전달 Actor가 작성자와 다르다는 사실만으로 신규 원문 materialization을 거부하지 않는다

#### Scenario: Reject identity substitution

- **WHEN** 요청 IRI가 HTTP(S)가 아니거나 typed Note가 아니거나 Note ID가 없거나 요청 IRI와 다르다
- **OR** attribution identity가 없거나 단일하지 않거나 HTTP(S)가 아니다
- **THEN** 시스템은 이번 Note 처리로 작성자 또는 Post row를 생성하지 않는다
- **AND** redirect 결과, URL 별칭 또는 전달 Actor로 불일치를 보정하지 않는다

### Requirement: Verified attributed author reuse and discovery

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`의 Author Profile·Post Eligibility, PROD-509 포함 범위·완료 기준, PROD-248의 identity 충돌·lookup/projection/persistence 정책. 시스템은 attribution의 exact URI로 저장된 사용 가능한 ActivityPub Actor와 Profile을 재사용해야 한다(MUST). 미저장 작성자는 기존 Fedify Actor 조회·projection·identity 충돌·Instance eligibility 정책에 따라 검증한 뒤 저장해야 한다(MUST). 실제 저장할 Actor URI와 Note attribution의 exact 일치를 Actor persistence 전에 검증해야 하며(MUST), 저장 후 불일치 검출에 의존해서는 안 된다(MUST NOT). 반환된 작성자 identity가 attribution과 일치하지 않거나 부적합하면 부분 작성자 또는 Post를 남겨서는 안 된다(MUST NOT).

#### Scenario: Reuse a stored author

- **WHEN** attribution URI에 연결된 사용 가능한 Remote Actor와 Profile이 이미 저장되어 있다
- **THEN** 시스템은 exact URI에 연결된 Profile을 Post 작성자로 사용한다
- **AND** 이번 Note 저장을 이유로 기존 작성자의 refresh나 handle 기반 identity 교체를 수행하지 않는다

#### Scenario: Discover an unknown author

- **WHEN** attribution URI가 미저장이고 기존 Fedify lookup과 Actor projection이 성공한다
- **AND** 검증된 Actor URI가 attribution과 정확히 일치하며 기존 eligibility와 충돌 검증을 통과한다
- **THEN** 시스템은 해당 Profile과 ActivityPub Actor를 작성자로 materialize한다
- **AND** Note는 이 Profile을 직접 참조한다
- **AND** 수동 WebFinger나 Actor의 outbox·object graph 재귀 탐색을 추가하지 않는다

#### Scenario: Reject an unusable or conflicting author

- **WHEN** Actor 조회가 실패하거나 Actor가 아닌 결과를 반환하거나 identity가 다르다
- **OR** 기존 정책상 사용할 수 없는 Profile/Instance이거나 Local identity·다른 Actor의 handle과 충돌한다
- **THEN** 시스템은 다른 작성자로 대체하지 않고 Note 저장을 종료한다
- **AND** 이 실패로 partial Profile, Actor 또는 Post row를 남기지 않는다

### Requirement: Consumer-specific acceptance with existing production helpers

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 Note 최초 materialization·audience, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, PROD-509의 2026-09-09 사용자 확정. 신규 원문 경계는 검증된 PUBLIC/UNLISTED Note를 `inReplyTo` 유무와 관계없이 최초 저장해야 한다(MUST). Followers Only/DIRECT 등 private audience 및 contentless/unsupported Note를 신규 저장해서는 안 된다(MUST NOT). 기존 `projectRemoteNoteContent`, `projectRemoteNoteMedia`, `createPost`를 재사용하고 audience 분류·`inReplyTo` 해석·Parent lookup/fallback 중 실제로 필요한 최소 helper만 추출해야 한다(MUST). 전체 Note projector·두 단계 projection API를 추가해서는 안 된다(MUST NOT). caller callback·evaluator·검증 완료 boolean·임의 strategy로 attribution이나 visibility 검증을 우회해서는 안 된다(MUST NOT).

#### Scenario: Materialize a public or unlisted original

- **WHEN** 신규 원문 조회 결과가 검증된 PUBLIC 또는 UNLISTED Note이고 유효한 본문 또는 하나 이상의 유효한 이미지를 가진다
- **THEN** 기존 helper의 canonical 값을 기존 `createPost` 경로에 연결한다
- **AND** `inReplyTo`가 있다는 이유로 거부하지 않는다
- **AND** 본문·미디어 변환, Public → Unlisted → 검증된 author canonical Followers 분류 및 기존 timestamp 처리를 복제하지 않는다
- **AND** 유효한 extra actor/collection URI로 Mention 관계나 추가 조회 권한을 만들지 않는다

#### Scenario: Reject an original outside this consumer scope

- **WHEN** 신규 원문 Note가 private audience이거나 contentless/unsupported이다
- **THEN** 시스템은 해당 원문을 신규 저장하지 않는다
- **AND** 비공개 Note를 공개로 낮추거나 Parent의 audience로 대체하지 않는다
- **AND** Parent나 followers collection을 추가 fetch하지 않는다

#### Scenario: Keep a Reply Source identity independent of its Parent

- **WHEN** Quote Source로 조회된 검증된 PUBLIC/UNLISTED Reply Note의 Parent와 Source는 작성자 또는 audience가 다르다
- **THEN** 시스템은 Source Note 자체의 identity·author·audience로 Source를 최초 저장한다
- **AND** Parent 또는 Parent 작성자로 Source를 대체하지 않는다
- **AND** Source 저장만으로 Quote 승인이나 viewer의 Source 조회 권한을 부여하지 않는다

#### Scenario: Prevent acceptance override

- **WHEN** caller가 작성자나 visibility 검증에 실패하는 Note를 전달한다
- **THEN** 해당 consumer의 production 검증이 적용된다
- **AND** public callback, evaluator 또는 검증 완료 표식으로 저장 조건을 통과시킬 수 없다

### Requirement: Existing Create uses the common materialization boundary

**Authority / Provenance:** `docs/domain/objects/post.md`의 ActivityPub audience·Reply 관계, `docs/domain/objects/media.md`, PROD-509의 공통 action 첫 production consumer·기존 동작 보존, PROD-509가 흡수한 기존 Create 회귀 책임. 기존 Create는 기존 helper를 조합한 materialization 경계의 첫 production consumer가 되어야 한다(MUST). signature와 delivery actor·object cardinality, 저장된 actor eligibility, actor와 attribution 일치, personal/shared inbox relevance 및 기존 Reply·Followers Only·Media 행동을 보존해야 한다(MUST). 신규 원문 조회의 좁은 허용 범위를 기존 Create에 일괄 적용하거나, 전달 Actor와 작성자가 다른 원문 조회의 허용을 Create attribution 검증 완화로 사용해서는 안 된다(MUST NOT).

#### Scenario: Preserve accepted Create variants

- **WHEN** 기존 계약을 통과하는 Public/Unlisted/Followers Only 또는 Reply·Media Create가 전달된다
- **THEN** Create는 공통 action을 사용하면서 기존 Post, current content, Media, Reply와 timestamp 결과를 보존한다
- **AND** 기존 Followers Only의 established Local Follower relevance를 보존한다
- **AND** 기존 Reply Parent 미해석·부적합 fallback과 예상하지 못한 오류 전파를 유지하며, 신규 PUBLIC/UNLISTED 원문 조회도 같은 Parent 계약을 적용한다

#### Scenario: Preserve rejected Create variants

- **WHEN** Create delivery Actor가 저장되지 않았거나 사용할 수 없거나 attribution과 다르다
- **OR** 기존 envelope·audience·relevance 검증이 실패한다
- **THEN** 기존 Create는 side effect 없이 종료한다
- **AND** 신규 원문 작성자 발견 기능을 이용해 이 Create를 허용하지 않는다

### Requirement: Atomic first-write-wins Post identity

**Authority / Provenance:** `docs/domain/objects/post.md`의 Author Profile·Current Content·remote Tombstone 보존, `docs/architecture/core-services.md`, PROD-509의 원자성·중복·동시 materialization 완료 기준. 시스템은 object URI마다 하나의 Post로 수렴해야 하며(MUST), Post·PostContent·currentContent·ActivityPub Post mapping·첨부 Media·최초 Reply Parent 관계의 저장은 원자적이어야 한다(MUST). 중복 입력은 기존 작성자, content, visibility, timestamp, Reply Parent 또는 Tombstone 상태를 변경해서는 안 된다(MUST NOT). 저장 실패는 해당 작업의 부분 Post 결과를 남겨서는 안 된다(MUST NOT).

#### Scenario: Persist an original once

- **WHEN** 검증된 Note object URI가 아직 저장되지 않았다
- **THEN** 기존 `createPost`가 Post, 첫 PostContent, currentContent 연결과 ActivityPub mapping을 원자적으로 저장한다
- **AND** 하나의 쓰기가 실패하면 부분 Post 결과를 rollback한다

#### Scenario: Converge concurrent originals and Create

- **WHEN** 같은 object URI의 신규 원문 조회와 Create 또는 여러 최초 원문 조회가 동시에 저장을 시도한다
- **THEN** unique object URI 제약에 따라 하나의 Post만 남는다
- **AND** 패배한 저장 시도의 부분 Post와 PostContent는 남지 않는다
- **AND** 기존 mapping을 다른 작성자나 새 revision으로 교체하지 않는다

#### Scenario: Preserve an existing or tombstoned mapping

- **WHEN** object URI에 이미 Post가 매핑되어 있고 중복 Note의 content·작성자·published가 달라졌거나 기존 Post가 Tombstone이다
- **THEN** 시스템은 기존 Post와 mapping을 보존한다
- **AND** 새 revision, 작성자 교체, timestamp 갱신 또는 Tombstone 부활을 수행하지 않는다

### Requirement: Bounded ingestion and post-commit compatibility

**Authority / Provenance:** `docs/architecture/core-services.md`의 transaction·post-commit 경계, `docs/domain/objects/post.md`의 조회 정책, PROD-509 resource budget·기존 저장 경로·제외 범위, PROD-465 포함 범위·완료 기준. 시스템은 PROD-465가 확정한 정규화 summary/body Plain Text 합계 10,000자(UTF-16 `.length`) 수신 한계를 적용해야 한다(MUST). 한도 초과는 정상 rejection/no-op으로 처리하고 부분 Post를 남겨서는 안 된다(MUST NOT). 공통 경계 도입은 기존 post-commit effects와 DB-only 조회·authorization을 보존해야 한다(MUST).

#### Scenario: Reject oversized embedded and hydrated Notes

- **WHEN** embedded 또는 IRI hydration된 Note의 정규화 summary/body Plain Text 합계가 10,000자(UTF-16 `.length`)를 초과한다
- **THEN** 시스템은 projection/storage의 해당 경계에서 거부하고 부분 Post를 남기지 않는다
- **AND** 기존 제한 초과 metric·구조화 로그 정책을 사용하며 원문 content를 로그에 남기지 않는다

#### Scenario: Preserve the budget boundary

- **WHEN** 정상 Note가 PROD-465의 허용 경계 바로 아래 또는 정확한 경계에 있다
- **THEN** 다른 materialization 조건을 충족하면 정상 저장한다
- **AND** 신규 경로만 한도를 생략하거나 임의의 더 큰 값으로 대체하지 않는다

#### Scenario: Start effects only after the final commit

- **WHEN** Post transaction이 성공적으로 commit되었다
- **THEN** 기존 Post 생성 effects 계약에 따라 후속 처리를 시작한다
- **AND** rollback·duplicate 시도에서는 effects를 시작하지 않는다
- **AND** commit 뒤 effects 시작 실패는 저장 결과를 rollback하지 않는다
- **AND** ActivityPub origin의 outbound Create echo를 만들지 않는다

#### Scenario: Keep reads and follow-up lifecycles separate

- **WHEN** 저장 결과를 GraphQL로 조회한다
- **THEN** 기존 Post/Author Profile/Instance visibility와 eligibility를 적용한다
- **AND** 조회가 원격 fetch·refresh·backfill을 시작하지 않는다
- **AND** 이 기능은 Announce Repost/Undo, Quote resolution, signed-fetch identity, Update/Delete 또는 durable fetch retry를 실행하지 않는다

### Requirement: Validate Note content and media before author persistence

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 원문 Media·작성자 저장 경계, `docs/domain/objects/media.md`, PROD-509의 2026-09-09 사용자 확정. 신규 PUBLIC/UNLISTED 경로는 Note identity·attribution·audience·content/media·수신 한계 검증을 신규 author persistence보다 먼저 완료해야 한다(MUST). 기존 Media 후보 선택과 검증을 재사용해야 하며(MUST), 선택된 후보 검증 실패를 본문이나 일부 이미지로 축소 저장해서는 안 된다(MUST NOT). attachment-only Note는 유효한 이미지가 하나 이상 있으면 허용해야 하고(MUST), 본문과 유효 이미지가 모두 없는 Note는 신규 저장해서는 안 된다(MUST NOT). 이 신규 empty 판정을 기존 Create에 일괄 적용해서는 안 된다(MUST NOT).

#### Scenario: Reject invalid content or selected media before author writes

- **WHEN** 미저장 작성자의 Note가 content/media 또는 수신 한계 검증에 실패한다
- **THEN** 시스템은 신규 author persistence를 시작하지 않는다
- **AND** Post·Content·mapping·첨부 Media를 만들지 않는다
- **AND** 본문이나 일부 이미지로 축소해 재시도하지 않는다

#### Scenario: Accept attachment-only originals

- **WHEN** 신규 원문 Note의 본문이 없고 하나 이상의 유효한 이미지가 있다
- **THEN** 나머지 검증을 통과하면 빈 paragraph와 Media node를 가진 PostContent로 저장한다

#### Scenario: Reject completely empty originals

- **WHEN** 신규 원문 Note의 본문과 유효 이미지가 모두 없다
- **THEN** author persistence와 Post 저장을 시작하지 않는다
- **AND** IRI-only 또는 지원하지 않는 attachment는 유효 이미지로 세지 않는다

### Requirement: Independent atomic author and Post persistence

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 원문 Media·작성자 저장 경계, `docs/architecture/core-services.md`, PROD-509의 2026-09-09 사용자 확정. Actor/Profile·Profile 표현과 Post는 각각 독립된 원자적 저장 경계를 유지해야 한다(MUST). 유효한 Actor commit 후 Post 실패·duplicate를 이유로 Actor나 Profile 표현을 보상 삭제해서는 안 된다(MUST NOT). Instance 확보도 기존 독립 경계를 유지하고 Note/Post 실패로 삭제해서는 안 된다(MUST NOT). 전체 author+Post transaction을 위한 서비스 API 재설계는 추가해서는 안 된다(MUST NOT). DB 장애와 예상하지 못한 오류는 전파해야 한다(MUST).

#### Scenario: Reject an exact Actor URI mismatch before persistence

- **WHEN** lookup/projection으로 얻은 실제 Actor URI가 Note의 attribution exact URI와 다르다
- **THEN** 시스템은 Actor persistence 전에 거부한다
- **AND** 잘못된 Profile·Actor·Post를 만들거나 기존 Profile을 재연결하지 않는다
- **AND** 잘못된 Actor를 저장한 뒤 exact URI 재조회로 거부하는 방식에 의존하지 않는다

#### Scenario: Roll back an author persistence failure

- **WHEN** Actor transaction의 Profile·Actor metadata·Profile 표현 저장이 실패한다
- **THEN** 해당 transaction의 부분 변경을 rollback하고 Post 저장을 시작하지 않는다
- **AND** DB 장애와 예상하지 못한 오류는 전파한다
- **AND** 별도 확보된 Instance를 Note 실패 때문에 삭제하지 않는다

#### Scenario: Preserve a committed author after a Post failure

- **WHEN** 유효한 Actor와 Profile 표현이 commit된 뒤 Post DB mutation이 실패한다
- **THEN** Post·Content·currentContent·mapping·첨부 Media·최초 Parent 관계의 부분 저장을 rollback한다
- **AND** commit된 Actor·Profile·Profile 표현과 Instance는 보존한다
- **AND** 오류를 전파하고 Post effects를 시작하지 않는다
- **AND** 재시도는 기존 유효 Actor를 재사용할 수 있다

#### Scenario: Converge duplicate and concurrent materialization

- **WHEN** 같은 Actor 또는 같은 object URI를 여러 요청이 동시에 또는 반복 materialize한다
- **THEN** 기존 uniqueness와 transaction 계약에 따라 Actor URI당 하나의 identity와 object URI당 하나의 Post로 수렴한다
- **AND** duplicate/conflict loser는 기존 Post·Content·Media·Reply Parent를 변경하지 않고 부분 Post row를 남기지 않는다
- **AND** 유효한 Actor를 보상 삭제하지 않고 duplicate Post의 effects를 시작하지 않는다
