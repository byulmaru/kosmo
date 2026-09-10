# activitypub-remote-note-resource-budget Specification

## Purpose

원격 Note의 canonical summary와 body에는 문자 수 제한이 없어 과도한 정규화 결과가 저장될 수 있었다. PROD-465는 사용자에게 승인받은 10,000자 수신 기준과 초과 시 원자적 거부를 제공한다. 파싱과 응답 수신 자체의 자원 보호는 별도 후속 작업에서 다룬다.

## Requirements

### Requirement: 원격 Note의 정규화된 10,000자 수신 한계

**Authority / Provenance:** `docs/domain/objects/post-content.md`, PROD-465 현재 계약(2026-09-09). 시스템은 정규화한 canonical summary와 body Plain Text의 UTF-16 `.length` 합계에 10,000자 상한을 적용해야 한다(MUST). 정확히 10,000자는 허용하며 초과 시 Note 전체를 거부해야 한다(MUST). 기존 canonical 줄바꿈은 포함하고 HTML markup·Media·표시용 구분자를 합산해서는 안 된다(MUST NOT).

#### Scenario: 합계 경계

- **WHEN** 기존 수신 조건을 만족하는 Note의 정규화한 summary와 body 합계가 9,999 또는 10,000이다
- **THEN** 길이를 이유로 거부하거나 자르지 않는다
- **AND** 합계가 10,001이면 summary와 body 각각의 길이와 무관하게 전체 Note를 거부한다

#### Scenario: Unicode와 HTML 정규화

- **WHEN** Unicode, HTML entity, hard break와 여러 paragraph를 포함하는 Note를 정규화한다
- **THEN** 기존 Plain Text 결과를 UTF-16 단위로 계산한다
- **AND** 추가 Unicode 정규화나 grapheme 계산을 적용하지 않는다
- **AND** summary가 없으면 길이는 0이며 Media와 Alt Text는 합계에 포함하지 않는다

#### Scenario: Local과 Quote 길이 경계

- **WHEN** Local Post 또는 Local Quote 자체의 작성 내용을 검증한다
- **THEN** 기존 500자 제한을 유지한다
- **AND** 참조한 Remote Post 길이를 Local Quote 작성분에 더하지 않는다
- **AND** 원격 원문은 Quote source 여부와 무관하게 원격 10,000자 기준을 따른다

### Requirement: 초과 Note의 원자적 no-op

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, PROD-465 완료 기준. 시스템은 길이를 초과한 Note를 잘라 저장하지 않고 전체 no-op으로 처리해야 한다(MUST). Post, ActivityPubPost, PostContent, 새 Media 및 해당 생성의 후속 effect를 남겨서는 안 된다(MUST NOT). 기존 저장 데이터와 duplicate의 first-write-wins 계약을 보존해야 한다(MUST).

#### Scenario: embedded와 hydration 이후의 초과

- **WHEN** embedded Note 또는 IRI hydration을 마친 Note의 정규화된 길이가 10,000을 초과한다
- **THEN** 저장과 새 Media 생성 전에 전체 Note를 거부한다
- **AND** attachment가 있어도 새 row나 post-commit effect를 남기지 않는다
- **AND** 이미 저장된 같은 object URI의 Post와 revision은 변경하지 않는다

#### Scenario: 정상 수신 보존

- **WHEN** Note가 길이와 기존 수신 조건을 만족한다
- **THEN** visibility, Reply, identity, Media-only, attachment 순서와 중복 수신 동작을 유지한다
- **AND** 500자를 넘는다는 이유로 원격 Note에 Local validator를 적용하지 않는다

### Requirement: 길이 초과 관측과 내부 오류 구분

**Authority / Provenance:** PROD-465 완료 기준. 시스템은 길이 초과를 고정 reason의 inbound rejection/no-op으로 분류하고 metric과 구조화 로그를 제공해야 한다(MUST). content·summary 원문을 기록하거나 예상하지 못한 내부 오류를 길이 초과로 숨겨서는 안 된다(MUST NOT).

#### Scenario: 제한 초과 관측

- **WHEN** 한 Note 처리에서 길이 초과가 발생한다
- **THEN** 원문 없는 metric과 구조화 로그로 길이 거부임을 확인할 수 있다
- **AND** 같은 실패를 내부 장애나 재시도 대상으로 중복 보고하지 않는다

#### Scenario: 내부 오류 전파

- **WHEN** 길이 제한과 무관한 내부 오류가 발생한다
- **THEN** 정상 no-op으로 삼키지 않고 기존 장애 경계로 전달한다
