## ADDED Requirements

### Requirement: 검증을 통과한 Fedify 후보만 채택

**Authority / Provenance:** `docs/domain/decisions/0027-activitypub-remote-quote-approval.md`의 Dependency 결정과 승인 경계; PROD-792의 Fedify dependency 채택 조건. 아래 요구사항을 준수해야 한다(MUST).

구현자는 관련 `@fedify/*`의 호환되는 2.4 prerelease 버전 세트를 명시적으로 pin하고 dependency·peer 정합성과
lockfile 고정을 확인해야 한다(SHALL). 기존 ActivityPub 경로, vocabulary hydration/serialization 및 실제
`@fedify/interaction-controls`의 Quote/QuoteAuthorization 계약 검증을 모두 통과한 경우에만 채택해야 한다(SHALL).
설치 성공이나 이 명세의 승인만으로 채택 완료로 간주해서는 안 된다(MUST NOT).

#### Scenario: 후보 검증 성공

- **WHEN** 명시적으로 pin한 후보가 버전·lockfile 검사와 기존 경로·vocabulary·Quote 계약 검증을 모두 통과한다
- **THEN** 검증한 manifest·lockfile과 실행 결과를 증거로 남기고 해당 후보의 채택을 기록한다

#### Scenario: 후보 검증 실패

- **WHEN** compatibility validation 중 하나라도 실패한다
- **THEN** 해당 후보를 채택하지 않고 PROD-792 기능 구현을 강행하지 않는다
- **AND** 후보를 변경하면 변경된 버전 세트 전체로 다시 검증한다

### Requirement: 인증된 Quote 입력과 형식 우선순위

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 인용 정보 반영; PROD-792의 Quote 형식과 승인 검증. 아래 요구사항을 준수해야 한다(MUST).

시스템은 수신 actor, Note identity와 attribution을 검증한 뒤 인용 정보를 처리해야 한다(SHALL).
FEP `quote`가 있으면 이를 우선하며 잘못된 FEP 입력을 레거시로 강등해서는 안 된다(MUST NOT).
FEP `quote`가 없을 때만 Fedify vocabulary로 `quoteUrl`, `quoteUri`, `_misskey_quote`를 해석해야 한다(SHALL).

#### Scenario: 잘못된 FEP와 유효한 레거시가 함께 존재

- **WHEN** 잘못된 FEP `quote`와 유효한 레거시 참조를 함께 받는다
- **THEN** FEP 검증 실패로 처리하고 레거시 참조로 승인하거나 Source를 표시하지 않는다

#### Scenario: 레거시 각 형식 수신

- **WHEN** FEP `quote` 없이 `quoteUrl`, `quoteUri`, `_misskey_quote` 중 하나를 수신한다
- **THEN** vocabulary로 대상 URI를 해석하고 레거시 검증 경로에 전달한다

#### Scenario: 발신 주체 불일치

- **WHEN** 수신 actor와 Note attribution 또는 저장된 Note identity의 작성자가 일치하지 않는다
- **THEN** 해당 입력으로 기존 Quote 승인 상태나 Source 관계를 변경하지 않는다

### Requirement: FEP 승인과 레거시 호환 판정

**Authority / Provenance:** `docs/domain/objects/post.md`의 Remote Quote Approval 및 원격 인용 정보 반영; PROD-792의 Quote 형식과 승인 검증; ADR `0027-activitypub-remote-quote-approval.md`의 레거시 결정. 아래 요구사항을 준수해야 한다(MUST).

시스템은 Fedify vocabulary와 `@fedify/interaction-controls`의 `quoteInteraction`을 사용해야 하며 수동 승인
검증기로 대체해서는 안 된다(MUST NOT). FEP는 검증된 Source Author와 인용 작성자가 같거나, 해당 인용·직접
Source·Source Author에 정확히 대응하는 진본 QuoteAuthorization을 검증한 경우에만 APPROVED로 판정해야
한다(SHALL). 필요한 승인서가 없으면 PENDING, 영구적인 참조·승인 검증 실패면 INVALID로 판정해야 한다(SHALL).
레거시는 FEP가 없고 유효한 Source를 확인하면 승인서 없이 APPROVED로 판정하되 명시적 동의나 조회 권한을
부여한 것으로 해석해서는 안 된다(MUST NOT).

#### Scenario: FEP 자기 인용

- **WHEN** 유효한 Source의 작성자와 인용 작성자가 같다
- **THEN** 별도 승인서 없이 FEP 자기 인용으로 승인한다

#### Scenario: 정상 승인서

- **WHEN** 진본 승인서가 현재 인용과 직접 Source 및 Source Author에 정확히 대응한다
- **THEN** 해당 revision을 APPROVED로 판정한다

#### Scenario: 승인서 부재

- **WHEN** 타인의 FEP Source를 인용하면서 필요한 승인서를 제공하지 않는다
- **THEN** PENDING을 유지하고 Source를 표시하지 않는다

#### Scenario: 다른 대상 또는 위조 승인서

- **WHEN** 승인서의 인용·Source·발급자가 다르거나 진본 검증이 영구적으로 실패한다
- **THEN** INVALID로 판정하고 Source를 표시하지 않는다

#### Scenario: 승인서 없는 레거시

- **WHEN** FEP가 없고 레거시가 가리킨 Source의 검증을 통과한다
- **THEN** 승인서 없이 APPROVED로 판정하고 viewer 권한은 별도로 적용한다

### Requirement: 승인 메타데이터와 Source 관계 보존

**Authority / Provenance:** `docs/domain/objects/post.md`의 Remote Quote Approval, 원격 인용 정보 반영 및 원격 인용 승인 철회 반영; PROD-792의 저장과 조회. 아래 요구사항을 준수해야 한다(MUST).

시스템은 `activitypub_post_quote`에 대상 URI, FEP/레거시 형식, `PENDING | APPROVED | REVOKED | INVALID`,
승인 URI와 resolution revision을 보존해야 한다(SHALL). 유효하게 materialize된 Source는 승인 여부와 별개로
`Posts.repostSourceId`에 연결해야 한다(SHALL). Source를 확보하지 못하거나 승인되지 않은 경우에도 인용
작성자의 Content를 보존해야 한다(SHALL).

#### Scenario: 승인되지 않은 저장된 Source

- **WHEN** Source를 확보했으나 Quote가 PENDING 또는 INVALID다
- **THEN** 저장된 Source 관계와 승인 메타데이터를 유지하면서 Source 노출을 막고 인용 본문을 보존한다

#### Scenario: 아직 확보하지 못한 Source

- **WHEN** Quote 대상 URI는 있지만 Source가 아직 없다
- **THEN** 대상과 현재 상태·revision을 보존하고 인용 본문을 조회할 수 있게 한다

### Requirement: Source 확보의 공개 범위와 Reply 재사용

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 Quote Source 표시; PROD-792의 저장과 조회 및 Reply Source와 재사용 경계 정렬; 선행 PROD-509의 materialization 계약. 아래 요구사항을 준수해야 한다(MUST).

시스템은 기존 Source를 재사용하고 미저장 Public·Unlisted Source는 PROD-509의 materializer와 기존
content/media helper·core `createPost`를 재사용해야 한다(SHALL). Followers Only는 이미 저장된 경우에만
연결하며 미저장 private Source를 새로 수집·저장해서는 안 된다(MUST NOT).
Reply Source도 자신의 identity·author·audience로 검증해야 한다(SHALL). Parent는 DB lookup만 사용하고
부재·부적합일 때만 null fallback하며 DB 장애를 fallback으로 숨겨서는 안 된다(MUST NOT).

#### Scenario: Public 또는 Unlisted 신규 Source

- **WHEN** 유효한 미저장 Public 또는 Unlisted Source를 확보한다
- **THEN** PROD-509의 Note·Media·작성자 저장 경계로 materialize하고 결과를 연결한다
- **AND** Source 저장 성공만으로 Quote 승인이나 viewer 권한을 부여하지 않는다

#### Scenario: 저장된 Followers Only

- **WHEN** Followers Only Source가 이미 DB에 있다
- **THEN** Source 관계를 연결하되 현재 viewer의 권한을 조회 때 적용한다

#### Scenario: 미저장 private Source

- **WHEN** Followers Only 또는 DIRECT Source가 DB에 없다
- **THEN** 이 경로에서 신규 저장하거나 PROD-793 signed fetch를 추정한 작성자 정보로 시작하지 않는다

#### Scenario: Reply Source와 Parent 차이

- **WHEN** Source가 Reply이고 Parent의 작성자·audience가 다르거나 Parent가 없다
- **THEN** Source 자신의 identity·author·audience로 저장·승인을 판정한다
- **AND** 저장된 적격 Parent만 연결하고 미해석·부적합 Parent는 null로 처리하며 원격 fetch·backfill하지 않는다

#### Scenario: Parent 조회 장애

- **WHEN** Parent DB lookup이 장애로 실패한다
- **THEN** 오류를 전파하고 Parent 부재로 간주하지 않는다

### Requirement: revision별 resolution과 멱등성

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 인용 정보 반영 및 원격 인용 승인 철회 반영; PROD-792의 Quote resolution Workflow. 아래 요구사항을 준수해야 한다(MUST).

시스템은 `activitypubQuoteResolutionWorkflow`를 Workflow ID
`activitypub-quote-resolution:{postId}:{revision}`으로 실행해야 한다(SHALL). transient 오류만 최대 10회
재시도하고 stale revision과 영구 검증 실패는 재시도하지 않는 멱등 no-op으로 처리해야 한다(SHALL).
영구 실패의 현재 승인 판정은 INVALID로 보존하고 같은 실패를 반복해 새 상태·부수 효과를 만들지 않아야
한다(SHALL). 중복·동시 수신은 하나의 현재 저장 상태로 수렴하며 늦은 결과는 현재 승인과 Source 관계를
되돌려서는 안 된다(MUST NOT).

#### Scenario: transient 오류와 상한

- **WHEN** 현재 revision의 원격 조회가 transient 오류로 실패한다
- **THEN** 최대 10회 재시도하며 성공 전 승인된 것으로 노출하지 않는다
- **AND** 상한 뒤에는 무한 재시도를 만들지 않는다

#### Scenario: 영구 실패 반복

- **WHEN** 동일 revision의 영구 검증 실패가 반복된다
- **THEN** INVALID 판정을 보존하고 추가 재시도·상태 전이·부수 효과 없이 끝낸다

#### Scenario: duplicate 또는 concurrent delivery

- **WHEN** 같은 Quote 정보를 중복 또는 동시에 처리한다
- **THEN** 중복 Post·Source 관계·resolution 효과 없이 하나의 현재 상태로 수렴한다

#### Scenario: stale Workflow

- **WHEN** 이전 revision의 검증이 최신 Update 또는 철회 이후 끝난다
- **THEN** 현재 승인 상태·승인 URI·Source 관계를 변경하지 않는다

### Requirement: Quote 승인 정보 Update

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 인용 정보 반영; PROD-792의 변경·철회 lifecycle. 아래 요구사항을 준수해야 한다(MUST).

시스템은 검증된 인용 작성자의 embedded `Update(Note)`에서 승인 정보의 추가·교체·제거를 반영하고 revision을 갱신해야
한다(SHALL). QuoteAuthorization 검증이 필요한 FEP 타인 인용은 새 승인 검증 전이나 승인서 제거 후
Source를 숨겨야 한다(SHALL). 유효한 Source의 자기 인용과 승인서 면제 조건을 충족한 legacy Quote에는
승인 참조의 추가·교체·제거만으로 불필요한 승인 대기를 적용해서는 안 된다(MUST NOT). 기존 승인 조건과
현재 viewer별 Source 조회 정책은 계속 적용해야 한다(SHALL).
이 동작으로 일반 Note의 Content·Media·Visibility 또는 인용 대상을 변경해서는 안 된다(MUST NOT).
IRI-only `Update(Note)`를 받은 뒤 원격 Note를 추가 fetch·hydrate하거나 authorization-only Update 표현을
처리해서는 안 된다(MUST NOT).

#### Scenario: 승인 정보 추가 또는 교체

- **WHEN** QuoteAuthorization 검증이 필요한 FEP 타인 인용에서 인용 작성자의 검증된 Update가 승인 참조를 추가하거나 교체한다
- **THEN** 새로운 revision에서 승인 검증을 수행하고 검증 전에는 Source를 표시하지 않는다

#### Scenario: 필요한 승인서 제거

- **WHEN** 인용 작성자의 검증된 Update가 타인 FEP 인용의 승인 정보를 제거한다
- **THEN** Source를 숨기고 본문과 저장된 Source 관계를 유지한다
- **AND** 이전 revision의 성공 결과가 승인을 복구하지 않는다

#### Scenario: 자기 인용의 승인 참조 변경

- **WHEN** 유효한 Source의 FEP 자기 인용에서 검증된 Update가 승인 참조를 추가·교체·제거하고 자기 인용 조건은 유지된다
- **THEN** 승인서 검증 대기를 새로 적용하지 않고 자기 인용 승인 조건으로 판정한다
- **AND** Source는 기존 viewer별 조회 정책을 통과할 때만 표시한다

#### Scenario: legacy의 승인 참조 변경

- **WHEN** FEP `quote`가 없고 유효한 Source를 확인한 legacy Quote에서 검증된 Update가 승인 참조를 추가·교체·제거한다
- **THEN** 승인서 면제 조건으로 판정하며 승인서 검증 대기를 새로 적용하지 않는다
- **AND** Source는 기존 viewer별 조회 정책을 통과할 때만 표시한다

#### Scenario: 범위 밖 Update 표현

- **WHEN** Quote Note를 IRI로만 가리키는 `Update(Note)` 또는 authorization-only Update 표현을 수신한다
- **THEN** 원격 Note를 추가 fetch·hydrate하거나 Quote 승인 상태를 변경하지 않는다

### Requirement: 승인서 Delete와 철회 보존

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 인용 승인 철회 반영; PROD-792의 변경·철회 lifecycle. 아래 요구사항을 준수해야 한다(MUST).

시스템은 저장된 승인 참조에 대한 Source Author의 유효한 `Delete(QuoteAuthorization)`을 검증한 경우
REVOKED로 전이하고 Source를 숨겨야 한다(SHALL). 본문과 Source 관계는 보존하며 중복 철회·늦은 검증으로
철회를 취소해서는 안 된다(MUST NOT).

#### Scenario: 유효한 철회

- **WHEN** Source Author가 현재 인용의 저장된 승인서를 유효하게 삭제한다
- **THEN** REVOKED로 전이하고 Source 카드만 숨기며 본문과 관계는 보존한다

#### Scenario: 다른 승인 또는 작성자의 Delete

- **WHEN** Delete가 다른 인용·Source·발급자의 승인서를 가리킨다
- **THEN** 현재 Quote 승인을 철회하지 않는다

#### Scenario: 중복 철회와 늦은 승인

- **WHEN** 같은 Delete가 재수신되거나 철회 전 검증이 뒤늦게 성공한다
- **THEN** REVOKED 상태를 유지하고 중복 효과를 만들지 않는다

### Requirement: 승인과 viewer 권한을 함께 적용하는 기존 표시

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 Quote Source 표시 및 Post Eligibility; `docs/design/post-action-bar.md`의 기존 Quote 표시; PROD-792의 기존 조회·표시 경로 재사용 및 Quote Notification 계약 정렬. 아래 요구사항을 준수해야 한다(MUST).

GraphQL은 Quote가 APPROVED이고 viewer가 현재 Source Visibility·Eligibility를 통과할 때만 기존 Source를
반환해야 한다(SHALL). Source가 없거나 PENDING·INVALID·REVOKED 또는 조회 불가이면 Source 카드만 숨기고
인용 본문과 자체 Post/Reply 조회 조건을 독립적으로 유지해야 한다(SHALL). 기존 목록·상세 카드와 직접 Source
표시를 재사용하고 재귀 인용·본문 재작성·새 GraphQL 타입·화면을 추가해서는 안 된다(MUST NOT).
알림 생성·조회·보존·정리는 PROD-926이 소유하며 재처리·재승인을 새 알림 원인으로 정의해서는 안 된다(MUST NOT).

#### Scenario: 승인되고 조회 가능한 Source

- **WHEN** Quote가 APPROVED이고 viewer가 Source 조회 정책을 통과한다
- **THEN** 목록·상세에서 기존 Quote 카드로 직접 Source를 표시한다

#### Scenario: 승인과 조회 권한의 독립성

- **WHEN** Quote가 APPROVED여도 viewer가 Source의 visibility·차단·lifecycle 정책을 통과하지 못한다
- **THEN** Source를 반환하지 않고 인용 본문을 보존한다

#### Scenario: 승인되지 않은 Source와 바깥 Reply

- **WHEN** Source가 PENDING·INVALID·REVOKED 또는 미확보 상태이며 인용 자체가 조회 가능한 Reply다
- **THEN** Source 카드만 숨기고 인용 본문과 독립적인 Reply Parent 표시 정책을 유지한다

#### Scenario: 기존 표시 회귀 방지

- **WHEN** Local Quote, 일반 Post, Reply, Repost 또는 순수 Repost의 Quote Source preview를 조회한다
- **THEN** 기존 관계·방향별 조회 권한·한 단계 preview 계약을 유지하고 원격 승인 조건은 해당 원격 Source에 독립 적용한다

#### Scenario: 재처리 결과의 알림 경계

- **WHEN** 동일 Quote를 재처리하거나 재승인한다
- **THEN** 그 처리만으로 새 알림 발생 원인을 만들지 않고 PROD-926이 소비할 현재 결과를 유지한다
