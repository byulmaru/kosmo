## ADDED Requirements

### Requirement: 공통 inbound 실패 분류와 구조화 로그

**Authority / Provenance:** `docs/operations/sentry.md`, `PROD-634`, `PROD-477`. 시스템은 production에 등록된 모든 inbound ActivityPub handler에서 처리된 실패와 관측 가능한 no-op을 Activity 종류, handler, phase, outcome과 안정적인 reason code로 구조화해 기록해야 한다(MUST). Activity 처리 결과, 저장·검증·멱등성 계약을 관측을 위해 변경해서는 안 된다(MUST NOT).

#### Scenario: 정상 보안·정책 거절

- **WHEN** malformed, foreign, mismatched, unauthorized 또는 정책상 허용되지 않는 activity가 검증 경계에서 거절된다
- **THEN** 시스템은 기존 side effect 없이 구조화 로그를 남긴다
- **AND** Sentry event를 생성하지 않는다

#### Scenario: 멱등 no-op

- **WHEN** 이미 처리된 activity, 없는 대상 또는 현재 상태와 맞지 않는 generation이 멱등 경계에서 no-op 처리된다
- **THEN** 시스템은 기존 상태를 유지하고 안정적인 no-op reason code를 구조화 로그에 남긴다
- **AND** Sentry event를 생성하지 않는다

#### Scenario: 처리된 실패 inventory

- **WHEN** handler가 `suppressError`, 예상 오류 catch 또는 post-commit effect catch로 처리를 종료한다
- **THEN** 해당 경계는 공통 관측 분류를 사용해 inventory에서 검색 가능한 로그를 남긴다
- **AND** 새 handler에 ad-hoc silent swallow 경계를 추가하지 않는다

### Requirement: 외부 실패와 내부 오류의 Sentry 경계

**Authority / Provenance:** `docs/operations/sentry.md`, `PROD-634`, `PROD-477`, `PROD-484`, 2026-08-03 사용자 결정. 원격 서버 오류, timeout, DNS/connection, 외부 document lookup, remote actor materialization, protocol 비호환·해석 실패와 외부 delivery 실패는 Sentry에 capture해서는 안 되며(MUST NOT), Kosmo 내부 unexpected 오류와 내부 post-commit/projection/effect 실패만 기존 runtime Sentry reporter로 capture해야 한다(MUST).

#### Scenario: 원격 lookup 또는 protocol 실패

- **WHEN** 외부 document/actor lookup, remote materialization 또는 protocol 해석이 실패해 handler가 처리된 거절 또는 no-op으로 끝난다
- **THEN** 시스템은 외부 실패 reason code와 제한된 context를 구조화 로그에 남긴다
- **AND** Sentry capture를 호출하지 않는다

#### Scenario: 외부 delivery 실패

- **WHEN** inbound 처리 후 외부 서버 delivery가 실패하고 authoritative projection은 이미 commit되었다
- **THEN** 시스템은 delivery phase의 외부 실패를 구조화 로그로 남긴다
- **AND** Sentry capture를 호출하지 않는다

#### Scenario: 내부 unexpected 또는 내부 effect 실패

- **WHEN** DB projection, post-commit 내부 effect 또는 handler 실행 중 Kosmo 내부 unexpected 오류가 발생한다
- **THEN** 시스템은 안정적인 activity/handler/phase/reason metadata와 함께 기존 runtime Sentry reporter로 오류를 capture한다
- **AND** 원래 오류 격리·응답·재throw 동작을 유지한다

#### Scenario: 반복 실패 폭증

- **WHEN** 동일한 내부 오류가 반복 전달된다
- **THEN** 시스템은 앱 내부 rate limiter나 sampler를 추가하지 않고 안정적인 grouping metadata만 제공한다
- **AND** 반복량 제어는 Sentry SDK와 ingest quota 정책에 위임한다

### Requirement: 민감정보와 cardinality 경계

**Authority / Provenance:** `docs/operations/sentry.md`, `PROD-634`, 2026-08-03 사용자 결정. inbound 관측 로그와 Sentry context는 raw Activity JSON, HTTP signature, 공개·개인 키, credential과 불필요한 개인정보를 포함해서는 안 되며(MUST NOT), Activity/actor/object URI는 필요한 제한된 context로만 제공하고 tag·fingerprint에는 고정된 분류값만 사용해야 한다(MUST).

#### Scenario: 안정적인 grouping metadata

- **WHEN** Sentry 대상 내부 오류가 capture된다
- **THEN** event에는 activity type, handler, phase, outcome 또는 reason code처럼 bounded한 분류만 tag/fingerprint로 제공한다
- **AND** URI, query string, raw body와 signature material은 tag/fingerprint에 포함하지 않는다

#### Scenario: 민감정보 없는 로그

- **WHEN** 모든 inbound 관측 경계가 로그 또는 Sentry context를 작성한다
- **THEN** 시스템은 raw payload, key/credential, authorization material과 불필요한 사용자 콘텐츠를 기록하지 않는다
- **AND** 필요한 URI context도 고카디널리티 식별자로 승격하지 않는다

### Requirement: production listener 통합 경계

**Authority / Provenance:** `docs/operations/sentry.md`, `PROD-634`, `PROD-477`. personal/shared inbox에 등록된 production listener는 공통 inbound 관측 경계를 거쳐 대표 activity의 처리된 외부 실패와 내부 오류를 각각 정해진 로그·Sentry 정책으로 전달해야 한다(MUST).

#### Scenario: 대표 handler의 외부 실패

- **WHEN** production listener를 통과한 대표 Accept/Create/Update/Undo 또는 post-commit delivery 경계가 외부 실패를 처리한다
- **THEN** 응답·처리 결과는 기존 계약을 유지하고 외부 실패 로그만 한 번 남긴다
- **AND** Sentry event는 생성하지 않는다

#### Scenario: 대표 handler의 내부 오류

- **WHEN** production listener를 통과한 대표 projection 또는 내부 effect가 unexpected 오류를 던진다
- **THEN** listener 경계는 기존 오류 전달 동작을 유지하면서 Sentry reporter를 한 번 호출한다
- **AND** event metadata는 bounded 분류를 사용한다
