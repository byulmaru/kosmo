## ADDED Requirements

### Requirement: Local Note의 인용 정책 광고

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924. 프로토콜 참고:
[FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/).

시스템은 Content가 있는 Local Post의 인용 허용 정책을 Local Note의 `interactionPolicy.canQuote`에 광고해야
한다(MUST). `모두`의 `automaticApproval`은 ActivityStreams Public collection, `팔로워`는 Author의
followers collection과 Author Actor, `본인만`은 Author Actor여야 한다(MUST). 세 정책 모두
`manualApproval`을 제공해서는 안 된다(MUST NOT). 최초 Note projection과 정책 변경 뒤 같은 Note identity의
갱신 표현에 현재 정책을 반영해야 한다(MUST).

#### Scenario: 모두 정책의 최초 Note projection

- **WHEN** `모두` 정책인 Local Post를 ActivityPub Note로 처음 표현한다
- **THEN** `canQuote.automaticApproval`에 ActivityStreams Public collection을 제공한다
- **AND** `manualApproval`은 제공하지 않으며 광고를 개별 QuoteAuthorization으로 취급하지 않는다

#### Scenario: 팔로워와 본인만 정책의 mapping

- **WHEN** Local Post 정책이 `팔로워` 또는 `본인만`이다
- **THEN** `팔로워`는 Author의 followers collection과 Author Actor를 automatic 대상으로 제공한다
- **AND** `본인만`은 Author Actor만 automatic 대상으로 제공하고 두 정책 모두 manual 대상을 제공하지 않는다

#### Scenario: 정책 변경 뒤 Note 갱신

- **WHEN** Author가 Local Post의 인용 허용 정책을 변경한다
- **THEN** 같은 Note identity의 갱신된 `canQuote` projection을 기존 Post audience에 전달한다
- **AND** 이미 발급한 QuoteAuthorization은 변경하거나 철회하지 않는다

### Requirement: FEP Quote 표현과 승인 검증

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`,
PROD-902, PROD-924. 프로토콜 참고: [FEP-044f](https://fediverse.codeberg.page/fep/fep/044f/).

시스템은 FEP-044f의 `quote`와 `QuoteAuthorization`을 정식 인용 표현으로 사용해야 한다(MUST).
자기 인용을 제외하면 원문 작성자가 해당 Quote에 발급한 유효한 승인을 검증해야 한다(MUST).
`interactionPolicy`의 automatic/manual 광고, 전달 성공, 임의의 승인 URI만으로 최종 승인을 인정해서는
안 된다(MUST NOT). `interactionPolicy`는 작성 UI와 예상 eligibility의 사전 힌트로만 사용할 수 있다(MAY).
QuoteAuthorization은 Source를 볼 수 있는 당사자가 역참조할 수 있어야 한다(MUST). 승인 객체는
`interactingObject`를 embed해서는 안 된다(MUST NOT). 요청자의 Source 조회 권한이 없거나 이를 확인할 수
없으면 승인 객체 자체를 제공해서는 안 된다(MUST NOT).

#### Scenario: 승인된 로컬 Quote 발신

- **WHEN** 로컬 Quote의 Source와 유효한 승인 대응을 확인한다
- **THEN** canonical Note identity를 유지하며 FEP Source·승인 표현을 제공한다
- **AND** 기존 Author Instance identity와 Post Visibility audience를 유지한다

#### Scenario: 자기 인용

- **WHEN** Source와 Quote의 작성자가 같은 Profile이다
- **THEN** FEP 자기 인용 조건을 확인하고 기본 Quote를 표현한다
- **AND** QuoteRequest나 별도 QuoteAuthorization을 요구하지 않는다
- **AND** 자기 인용이 Source의 조회 권한을 넓히지 않는다

#### Scenario: 권한 있는 요청자의 승인 객체 역참조

- **WHEN** Source를 조회할 수 있는 당사자가 연결된 QuoteAuthorization을 역참조한다
- **THEN** 시스템은 해당 Quote·Source·원문 작성자에 결속한 승인 객체를 반환한다
- **AND** `interactingObject`는 URI 참조로만 제공하고 embed하지 않는다
- **AND** 요청자의 Source 조회 권한을 확인한 경우에만 `interactionTarget`을 embed할 수 있다

#### Scenario: Source 조회 권한이 없거나 확인할 수 없는 역참조

- **WHEN** QuoteAuthorization 요청자에게 Source 조회 권한이 없거나 그 권한을 확인할 수 없다
- **THEN** 시스템은 QuoteAuthorization 객체를 제공하지 않는다
- **AND** Quote·Source URI, 발급자나 Content를 통해 승인 또는 Source 존재를 우회 노출하지 않는다

### Requirement: Kosmo 원문용 인용 요청의 자동 판정

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

Kosmo 원문에 들어오는 QuoteRequest는 요청 Profile·인용 Post·Source의 대응과 Source 정책·조회·차단
조건을 검증해야 한다(MUST). 허용된 요청에는 해당 Quote·Source에 결속한 QuoteAuthorization과 Accept를
제공하고, 허용하지 않는 요청에는 Reject로 대응해야 한다(MUST). Kosmo 자체의 건별 수동 승인 UI나
수동 승인 정책을 추가해서는 안 된다(MUST NOT).

#### Scenario: 허용된 원격 요청

- **WHEN** 검증된 QuoteRequest가 현재 원문 정책과 조회·차단 조건을 통과한다
- **THEN** 원문 작성자가 해당 Source와 Quote에 대해 발급한 승인을 Accept에 연결한다
- **AND** 다른 Quote나 Source의 승인을 재사용하지 않는다

#### Scenario: 정책 변경 또는 차단 이후 요청

- **WHEN** 새 요청이 현재 정책에 맞지 않거나 두 Profile 사이에 차단이 있다
- **THEN** 승인하지 않고 Reject로 대응한다
- **AND** 이전에 발급한 별개 승인을 자동 철회하지 않는다

#### Scenario: 위조된 요청 대응

- **WHEN** 인증된 요청 주체와 인용 Post 작성자가 일치하지 않거나 요청의 Source 대응이 잘못됐다
- **THEN** 승인을 발급하지 않고 Source 조회 제한을 우회하는 정보를 반환하지 않는다

### Requirement: 원격 승인 대기 중 발신과 승인 후 Update

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

자기 인용이 아닌 원격 타인 원문의 로컬 Quote는 `interactionPolicy`의 automatic/manual 분류나 부재·해석
실패와 관계없이 자체 Content를 먼저 게시하고 일반 federation 전달을 진행해야 한다(MUST). 승인 전 Source를
정상 인용으로 노출하지 않은 채 원문 서버에 별도 QuoteRequest를 보내야 한다(MUST).
해당 요청의 Accept와 유효한 QuoteAuthorization을 확인한 뒤 Source·승인을 연결하고 필요한 Update를
전달해야 한다(MUST). 이 처리에 일반 사용자용 본문 수정 기능을 추가해서는 안 된다(MUST NOT).

#### Scenario: automatic approval 광고가 있는 타인 원문

- **WHEN** 원격 `interactionPolicy`가 현재 작성자를 automatic approval 대상으로 광고한다
- **THEN** 자체 Content를 pending 상태로 게시하고 원문 서버에 QuoteRequest를 보낸다
- **AND** 광고 자체를 승인으로 보거나 유효한 QuoteAuthorization 확인을 생략하지 않는다

#### Scenario: manual approval 광고가 있는 타인 원문

- **WHEN** 로컬 Quote가 원격 수동 승인 요청을 기다린다
- **THEN** 자체 Content는 기존 audience로 전달하고 원문 서버에는 QuoteRequest를 보낸다
- **AND** 일반 Note와 자동 생성 legacy 표현에 승인된 Source 관계를 노출하지 않는다

#### Scenario: interactionPolicy 부재 또는 해석 실패

- **WHEN** 원격 원문의 `interactionPolicy`가 없거나 유효하게 해석되지 않는다
- **THEN** Quote 작성을 거부하지 않고 자체 Content를 pending 상태로 게시한 뒤 QuoteRequest를 보낸다
- **AND** Source 관계와 자동 생성 FEP·legacy·본문 fallback을 정상 인용으로 노출하지 않는다

#### Scenario: 작성자가 어느 승인 대상에도 포함되지 않음

- **WHEN** 유효하게 해석한 `interactionPolicy`에서 현재 작성자가 automatic/manual 어느 쪽에도 명백히 포함되지 않는다
- **THEN** 작성 UI나 eligibility 판단은 승인 가능성이 낮다는 정보를 힌트로 사용할 수 있다
- **AND** 그 정책만으로 Quote가 승인됐다고 보거나 QuoteAuthorization을 대체하지 않는다

#### Scenario: 유효한 Accept

- **WHEN** 요청 대상 원문 작성자의 Accept와 해당 Quote·Source에 대한 유효한 승인을 확인한다
- **THEN** 같은 Quote identity에 Source·승인을 연결하고 갱신된 표현을 전달한다
- **AND** 새 Post나 중복 Content를 만들지 않는다

#### Scenario: 유효하지 않은 Accept 또는 응답 실패

- **WHEN** Accept의 승인 주체·Source·Quote 대응이 틀리거나 요청에 응답이 없다
- **THEN** Source를 승인 상태로 전환하지 않는다
- **AND** 이미 게시한 자체 Content는 유지한다

### Requirement: 거절과 철회 및 삭제 연합

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/objects/profile-block.md`,
`docs/domain/decisions/0029-quote-consent-and-federation.md`, PROD-902, PROD-924.

로컬 Quote에 대한 유효한 Reject 또는 승인 철회는 자체 Content를 유지한 채 Source를 비노출로 수렴시켜야
한다(MUST). Kosmo 원문 작성자의 명시적 철회는 승인을 무효화하고 `Delete(QuoteAuthorization)`를 전달해야
한다(MUST). 수신된 철회는 주체와 대상 승인의 대응을 검증해야 한다(MUST). 수신자가 Quote의 소유 서버라면
검증된 `Delete(QuoteAuthorization)`을 기존 Quote audience에 전달해야 한다(MUST). Source 삭제와 Quote 자체
삭제를 혼동하여 다른 작성자의 Content를 삭제해서는 안 된다(MUST NOT). 발신하거나 전달하는 철회 `Delete`는
`object`와 `target`에 객체를 embed해서는 안 된다(MUST NOT). 두 속성은 URI 참조만 제공해야 한다(MUST).

#### Scenario: 원격 원문의 Reject 또는 승인 철회

- **WHEN** 로컬 Quote에 대응하는 유효한 Reject 또는 Delete(QuoteAuthorization)을 처리한다
- **THEN** 해당 Source·승인을 더 이상 정상 인용으로 노출하지 않는다
- **AND** 자체 Content와 Quote identity를 유지하고 이미 발신한 표현도 필요한 갱신으로 수렴시킨다

#### Scenario: 수신한 승인 철회의 Quote audience 전달

- **WHEN** 로컬 Quote의 소유 서버가 유효한 Delete(QuoteAuthorization)을 수신한다
- **THEN** 해당 Source를 비노출로 전환하고 기존 Quote audience에 철회를 전달한다
- **AND** 전달하는 `Delete`의 `object`와 `target`에는 객체를 embed하지 않고 URI 참조만 제공한다
- **AND** 전달 대상별 실패가 검증된 로컬 철회 상태와 Quote 자체 Content를 되돌리지 않는다

#### Scenario: Kosmo 원문 작성자의 철회

- **WHEN** 원문 작성자가 자신의 Source에 발급한 기존 승인을 철회한다
- **THEN** 해당 승인을 무효화하고 철회 신호를 원격에 전달한다
- **AND** `Delete`의 `object`와 `target`에는 객체를 embed하지 않고 URI 참조만 제공한다
- **AND** 차단만으로 같은 철회 신호를 자동 생성하지 않는다

#### Scenario: Local Source 삭제의 원격 Quote 수렴

- **WHEN** Local Source가 삭제되고 그 Source에 결속된 유효한 QuoteAuthorization이 있다
- **THEN** 각 승인을 철회하고 결속된 Quote Author 또는 Quote 소유 서버의 inbox에 `Delete(QuoteAuthorization)`을 전달한다
- **AND** Quote 소유 서버는 철회를 기존 Quote audience에 전달해 자체 Content를 유지하고 Source를 비노출한다
- **AND** 일반 Source audience에 보내는 `Delete(Note)`만으로 승인 철회 전달을 대신하지 않는다

#### Scenario: 잘못된 철회와 Quote 삭제

- **WHEN** 다른 작성자의 위조된 철회를 받거나 Quote 자체가 이미 삭제된 상태에 과거 Accept가 도착한다
- **THEN** 잘못된 철회를 승인하지 않고 삭제된 Quote나 그 Source 노출을 복원하지 않는다

### Requirement: 재전달과 역순 응답의 수렴

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`,
PROD-902, PROD-924.

중복·동시 요청과 delivery 재시도는 하나의 유효한 승인·Source 결과로 수렴해야 한다(MUST).
뒤늦은 Accept가 더 최신 거절·철회 또는 삭제를 되돌려서는 안 된다(MUST NOT). transient 실패는 영구
거절과 구분하고 재시도 중에도 승인 검증과 Source 비노출 조건을 유지해야 한다(MUST).

#### Scenario: 중복 QuoteRequest 또는 Accept

- **WHEN** 같은 의미의 요청이나 승인이 중복·동시 전달된다
- **THEN** 중복 Post·Content·유효 승인 관계를 만들지 않고 하나의 결과로 수렴한다

#### Scenario: 철회 뒤 늦은 Accept

- **WHEN** 승인이 철회된 뒤 과거 요청에 대한 Accept가 늦게 도착한다
- **THEN** 철회 상태와 Source 비노출을 유지한다

#### Scenario: delivery 일시 실패

- **WHEN** 승인 또는 갱신 전달에 일시적인 오류가 발생한다
- **THEN** 이미 확정된 본문·승인 결과를 되돌리지 않고 재시도 여부와 실패를 관찰할 수 있다
- **AND** 재전달을 이유로 이전 승인 상태로 되돌아가지 않는다

### Requirement: 레거시 상호운용과 승인 우회 방지

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0029-quote-consent-and-federation.md`,
PROD-902, PROD-924. 기존 원격 수신 경계: PROD-792.

시스템은 승인된 Quote의 레거시 발신 호환을 지원해야 한다(MUST). FEP 형식이 존재하지만 유효하지 않은
경우 이를 레거시 인용으로 강등해서는 안 된다(MUST NOT). 승인 전·거절·철회 상태에서는 자동 생성한 호환
표현으로 Source를 정상 인용처럼 노출해서는 안 된다(MUST NOT). 작성자가 직접 쓴 Content는 보존해야 한다(MUST).

승인된 인용에는 `quoteUrl`, `quoteUri`, `_misskey_quote` 호환 속성과 원문 링크의 발신 본문 fallback을
제공해야 한다(MUST). 자동 생성한 발신 표현은 작성자가 직접 작성한 Content와 구분해야 한다(MUST).

#### Scenario: 잘못된 FEP와 legacy 속성의 동시 존재

- **WHEN** FEP Quote가 유효하지 않고 legacy Quote 속성도 존재한다
- **THEN** legacy 속성을 근거로 승인된 Source로 표시하지 않는다

#### Scenario: 승인 전 자동 호환 표현

- **WHEN** Quote의 승인이 대기·거절·철회 상태다
- **THEN** 자동 생성한 legacy Source 속성이나 본문 fallback으로 정상 인용을 우회 노출하지 않는다
- **AND** 작성자가 직접 작성한 링크와 본문을 승인 lifecycle 때문에 삭제하지 않는다

#### Scenario: 승인 후 레거시 인용 표현

- **WHEN** 인용이 승인되어 Source 관계를 발신할 수 있다
- **THEN** FEP 표현과 함께 세 호환 속성이 같은 Source를 가리키고 발신 본문에도 원문 링크를 제공한다
- **AND** 호환 표현 생성 때문에 저장된 작성자 Content를 바꾸지 않는다

#### Scenario: 철회 뒤 자동 생성 fallback 제거

- **WHEN** 승인된 인용이 철회되어 갱신된 표현을 전달한다
- **THEN** 세 호환 속성과 자동 생성한 원문 링크 fallback을 비노출한다
- **AND** 작성자가 직접 쓴 동일한 URL이나 본문은 삭제하지 않는다
