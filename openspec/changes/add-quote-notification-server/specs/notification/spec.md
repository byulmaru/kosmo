## ADDED Requirements

### Requirement: 승인된 Quote의 서버 알림 생성과 원인 관계

**Authority / Provenance:** `docs/domain/objects/notification.md`의 관계·Type별 생성 관계·Quote Notification, `docs/domain/objects/post.md`의 인용 승인·조회 정책, `docs/domain/decisions/0028-quote-notification-policy.md`의 결정; PROD-903, PROD-926의 2026-09-16 승인된 포함 범위, PROD-431/792/924의 승인 결과 제공 책임. 시스템은 Local 작성과 Remote 수신에서 인용 관계가 승인되고 Source를 정상 표시할 수 있는 Quote의 최초 알림 생성을 판단해야 한다(MUST). 별도 Quote Type의 원인과 Related Post는 Quote 자체, Related Profile은 Quote Author, Recipient는 direct Repost Source Author Profile이어야 한다(MUST). 원문을 Notification 전용 Post 관계로 복제하거나 승인 프로토콜을 다시 구현해서는 안 된다(MUST NOT).

#### Scenario: Local Quote 승인 후 생성

- **WHEN** Local Quote의 승인 결과가 commit되고 현재 범위의 생성 조건을 통과한다
- **THEN** direct Source Author인 Local Recipient에게 Unread Quote Notification 한 건을 생성한다
- **AND** Related Post는 Source가 아닌 Quote 자체이고 Related Profile은 Quote Author다

#### Scenario: Remote Quote 승인 후 생성

- **WHEN** PROD-792/924의 실제 검증 경계가 Remote Quote의 최초 유효한 승인을 확정한다
- **THEN** 적용 대상 Quote의 Local Recipient에게 같은 생성 계약을 적용한다
- **AND** 수신 payload의 승인 주장이나 Source FK 존재만으로 생성하지 않는다

#### Scenario: 승인 대기와 거절

- **WHEN** 인용 관계가 승인 대기·거절·무효·철회 상태이거나 Source 표시의 승인 근거가 없다
- **THEN** Quote Notification을 생성하지 않는다
- **AND** 승인 대기만으로 최초 승인 이후의 판단 기회를 소진하지 않는다
- **AND** 자동 승인 정책 광고·응답 부재·레거시 fallback으로 승인을 추정하지 않는다

#### Scenario: 순수 Repost와 수신자 경계

- **WHEN** 원인이 Content와 Reply Parent가 없는 순수 Repost이거나 Quote의 Recipient가 Remote Profile이다
- **THEN** 전자는 기존 Repost 계약을 따르고 후자는 Local inbox Quote Notification을 만들지 않는다
- **AND** 이 서버 change는 ActivityPub 알림 전송이나 FCM을 추가하지 않는다

### Requirement: Quote 최초 판단의 영구 멱등성과 비소급 생성

**Authority / Provenance:** `docs/domain/objects/notification.md`의 Quote Notification, `docs/domain/decisions/0028-quote-notification-policy.md`의 최초 생성·재승인·정리 결정; PROD-903, PROD-926의 최초 판단·비소급·영구 중복 방지 범위. 시스템은 같은 Quote·Recipient의 최종 최초 판단을 Notification 행과 독립적으로 유지해야 한다(MUST). 최초 정책 억제, 기존 대표 알림의 존재 또는 이미 생성된 Quote 알림을 재처리·재승인·물리 삭제 뒤 새 생성으로 바꾸어서는 안 된다(MUST NOT). 기능 도입 전에 존재한 Quote에는 소급 알림을 만들지 않아야 한다(MUST). 적용 대상 Remote Quote의 최초 승인은 최초 판단 시점으로 인정해야 한다(MUST).

#### Scenario: 중복 전달과 재승인

- **WHEN** 같은 Quote·Recipient를 동시에 처리하거나 같은 승인 결과를 재전달하거나 철회 후 재승인한다
- **THEN** 최초로 확정한 결과만 유지하고 새 Quote 알림을 추가하지 않는다
- **AND** 기존 Notification ID·생성 시각·읽음 시각을 갱신하지 않는다

#### Scenario: 최초 억제 후 조건 회복

- **WHEN** 최초 판단에서 Profile Mute·Block·조회 권한 등 현재 생성 정책으로 억제된 뒤 조건이 풀린다
- **THEN** 해당 Quote·Recipient에 소급 생성하지 않는다
- **AND** 이후 다른 Quote의 새 판단에는 그 시점의 정책을 적용한다

#### Scenario: 물리 정리 뒤 재처리

- **WHEN** 생성된 Notification이 물리 삭제된 뒤 같은 Quote·Recipient의 effect가 다시 실행된다
- **THEN** 저장된 최초 판단 때문에 알림·Read State를 재생성하거나 복원하지 않는다
- **AND** Notification cleanup은 이 판단 기록을 함께 삭제하지 않는다

#### Scenario: 기능 도입 전 Quote

- **WHEN** 도입 전 존재한 Quote를 재처리하거나 도입 후 처음 승인한다
- **THEN** 과거 Quote에 알림을 backfill하지 않는다
- **AND** 적용 대상인 새 Remote Quote가 승인 대기 후 처음 승인되는 경우와 구분한다

#### Scenario: 저장 transaction 실패와 응답 유실

- **WHEN** 최초 판단과 Notification 저장 transaction이 실패하거나 commit 후 응답이 유실된다
- **THEN** 실패한 transaction은 판단만 확정된 부분 결과를 남기지 않는다
- **AND** commit 후 재시도는 저장된 결과를 소비해 한 건만 유지한다

### Requirement: 현재 범위의 Quote 생성 억제와 기존 알림 보존

**Authority / Provenance:** `docs/domain/objects/notification.md`의 조회 정책·Quote Notification, `docs/domain/objects/profile-mute.md`의 새 Notification 억제, `docs/domain/objects/profile-block.md`의 Notification pair 정책; PROD-327의 2026-09-10 활성 Mute·fail-closed 정정, PROD-926의 2026-09-16 범위 승인. 시스템은 Quote Author와 Recipient의 Profile identity, 두 Post의 Recipient 기준 조회 권한, 원인 관계·Recipient 일치·Related Profile 가용성을 검사해야 한다(MUST). PROD-327의 공통 Profile Mute·양방향 Notification Block 경계를 소비하고 정책 실패 시 생성하지 않아야 한다(MUST). Word Mute·Hashtag Mute·Post Notification Mute의 기반 구현·Quote 연결을 이 change의 구현·완료 조건으로 요구해서는 안 된다(MUST NOT). 이 delivery 제외를 장기 제품 정책의 폐기로 해석해서는 안 된다(MUST NOT).

#### Scenario: Profile 단위 자기 인용

- **WHEN** Quote Author와 Recipient가 같은 Profile이다
- **THEN** Quote Notification을 생성하지 않는다
- **AND** 같은 Account의 서로 다른 두 Profile인 경우에는 다른 생성 조건을 통과하면 생성한다

#### Scenario: 활성 Profile Mute

- **WHEN** Recipient가 Quote Author를 뮤트했고 공통 정책이 해당 관계를 활성으로 판단한다
- **THEN** 생성하지 않는다
- **AND** PROD-327의 DB 현재 시각 기준 NULL·미래 만료는 억제, 과거·동일 시각은 Mute 억제 해제라는 경계를 재사용한다
- **AND** 만료 preset·관리 UI·Post List 기간 정책을 이 change에서 추가하지 않는다

#### Scenario: Block pair와 정책 평가 실패

- **WHEN** Recipient·Quote Author 어느 방향에든 Block이 있거나 공통 정책 평가가 실패한다
- **THEN** Quote Notification을 생성하지 않는다
- **AND** Quote 작성·승인 등 이미 commit된 원본 결과를 rollback하지 않는다
- **AND** 평가 실패를 allow로 바꾸거나 제외한 세 Mute의 임시 evaluator를 만들지 않는다

#### Scenario: Quote 또는 Source 비가용

- **WHEN** Recipient가 Quote나 direct Source 중 하나를 조회할 수 없거나 필수 관계·Recipient mapping이 맞지 않는다
- **THEN** Quote Notification을 생성하지 않는다
- **AND** Source를 볼 수 없어도 Quote 자체 Content를 유지하는 Post 정책은 변경하지 않는다

#### Scenario: 생성 이후 Profile Mute

- **WHEN** 정상 생성된 알림의 Quote Author에 대해 나중에 Profile Mute를 추가한다
- **THEN** 그 이유만으로 기존 알림을 숨기거나 삭제하거나 Read State를 바꾸지 않는다
- **AND** 이후 Block·승인 철회·조회 불가의 숨김과 정리는 각각의 정책을 따른다

### Requirement: Quote와 Reply·Mention의 수신자별 단일 결과

**Authority / Provenance:** `docs/domain/objects/notification.md`의 Reply/Mention 수신자별 분류·Quote Notification, `docs/domain/decisions/0028-quote-notification-policy.md`의 동시 후보·선생성 보존; PROD-903, PROD-926, PROD-911의 교차 Type 책임 정렬. 시스템은 같은 원인 Post·Recipient의 현재 범위에 해당하는 Type별 조건을 먼저 적용한 뒤 Reply → Quote → Mention 순서로 동시 후보 중 한 건만 제공해야 한다(MUST). 기존 Reply 또는 Mention이 먼저 생성됐다면 이후 Quote 승인으로 추가 생성·Type 교체·Read State 변경을 해서는 안 된다(MUST NOT). 이 선택은 서로 다른 Recipient나 Followee Post에 확대해서는 안 된다(MUST NOT).

#### Scenario: 유효한 동시 후보

- **WHEN** 같은 Post·Recipient에 Reply·Quote·Mention이 함께 생성 가능하다
- **THEN** Reply 한 건만 생성한다
- **AND** Reply가 조건을 통과하지 못하고 Quote·Mention이 남으면 Quote 한 건을 생성한다
- **AND** Quote도 조건을 통과하지 못하면 유효한 Mention 후보를 처리한다

#### Scenario: Mention 또는 Reply 선생성과 늦은 승인

- **WHEN** 승인 대기 중 Mention 또는 Reply가 먼저 저장되고 읽음 처리된 뒤 Quote가 승인된다
- **THEN** Quote를 추가하거나 기존 Type을 교체하지 않는다
- **AND** 기존 ID·Read State·최초 읽음 시각을 유지한다
- **AND** 이후 기존 Type 자체의 조회 불가·정리 정책은 그대로 적용한다

#### Scenario: 선생성 대표 알림의 물리 삭제

- **WHEN** 이 change의 단일 결과 경계가 기록한 선생성 Reply/Mention이 cleanup된 후 Quote가 승인된다
- **THEN** 삭제된 대표 알림을 대신할 새 Quote Notification을 만들지 않는다
- **AND** 물리 삭제 이전의 대표 선택 결과를 사용한다

#### Scenario: 교차 Type 동시 처리

- **WHEN** Reply·Quote·Mention effect가 서로 다른 Worker에서 동시에 실행된다
- **THEN** 개별 Type의 unique key와 호출 도착 순서만으로 대표를 정하지 않는다
- **AND** 같은 저장 판정 시점에 확정된 유효한 후보 집합에 우선순위를 적용하고 하나의 결과만 commit한다

#### Scenario: 다른 Recipient와 Followee Post

- **WHEN** 같은 Quote가 Source Author A에게 Quote이고 다른 Profile B를 Mention한다
- **THEN** A와 B를 각각 평가하고 허용된 결과를 서로 제거하지 않는다
- **AND** Followee Post는 기존 독립 정책을 유지한다

#### Scenario: Local 작성의 범위

- **WHEN** 기존 저장 또는 Remote 수신의 유효한 Reply+Quote 조합을 검증한다
- **THEN** 두 관계를 유지한 채 중복 정책을 적용한다
- **AND** 이를 위해 Local Reply+Quote 작성 API나 Local Mention 신규 생성을 추가하지 않는다

### Requirement: Quote Notification GraphQL과 지정 읽음

**Authority / Provenance:** `docs/domain/objects/notification.md`의 관계·권한·지정 읽음·Quote Notification; PROD-926의 GraphQL 포함 범위와 PROD-953 분리 책임. 구체 field 선택은 기존 Notification 공개 계약을 따르는 구현 선택이다. API는 Quote를 `Notification`과 `Node`를 구현하는 `QuoteNotification`으로 제공해야 한다(MUST). 공통 `id`, `createdAt`, nullable `readAt`, Quote 자체인 non-null `post: Post!`, Quote Author인 non-null `profile: Profile!`을 제공해야 한다(MUST). 기존 membership·pagination·unread·지정 읽음 계약을 재사용하고 raw kind·source ID·판단 기록을 노출해서는 안 된다(MUST NOT).

#### Scenario: concrete object와 Node identity

- **WHEN** 권한이 있는 요청이 현재 visible인 Quote 알림을 조회한다
- **THEN** Quote의 Post와 Author Profile 및 `QuoteNotification` concrete global ID를 반환한다
- **AND** Node loader는 typename·row kind·membership·가용성을 모두 검사하고 불일치 시 다른 Type으로 fallback하지 않고 null을 반환한다

#### Scenario: 목록과 unread

- **WHEN** Recipient membership이 있는 Account가 Profile의 목록과 unread를 조회한다
- **THEN** Quote를 기존 ID 기반 cursor 순서에 포함하고 filtering을 page limit 전에 적용한다
- **AND** 현재 visible이고 `readAt`이 null인 Quote만 unread에 포함한다
- **AND** selected Profile이 달라도 target membership 계약을 유지하며 다른 Recipient 데이터는 노출하지 않는다

#### Scenario: 지정 읽음과 최초 시각

- **WHEN** Quote ID를 중복·이미 읽은 ID와 함께 `markNotificationRead(input: { ids })`에 전달한다
- **THEN** 처리 가능한 항목만 원자적으로 읽음 처리하고 최초 `readAt`을 보존한다
- **AND** 입력하지 않은 알림과 처리 중 새로 도착한 알림은 변경하지 않는다

#### Scenario: 접근 불가 ID와 빈 입력

- **WHEN** 삭제·숨김·kind 불일치·membership 없는 Quote ID를 전달하거나 입력이 비어 있다
- **THEN** 해당 항목을 조용히 제외하고 모두 제외돼도 성공한 no-op을 반환한다
- **AND** 존재나 제외 이유를 노출하지 않으며 처리 실패 시 부분 Read 결과를 남기지 않는다

### Requirement: Quote 알림의 즉시 숨김과 Best Effort 정리

**Authority / Provenance:** `docs/domain/objects/notification.md`의 조회 정책·Quote Notification, `docs/domain/decisions/0028-quote-notification-policy.md`의 2026-09-09 정리 결정; PROD-328, PROD-903, PROD-926. 시스템은 Quote·direct Source의 현재 조회 불가, 유효 승인 상실, 삭제, 필수 관계·Recipient 불일치를 목록·unread·Node·읽음에서 즉시 숨겨야 한다(MUST). 기존 bounded unavailable cleanup으로 Best Effort 삭제를 시도하고 삭제 직전 가용성을 다시 확인해야 한다(MUST). 보존·복원이나 삭제 시점·성공을 보장해서는 안 된다(MUST NOT). Recipient 자체의 복구 가능한 일시 비활성화·정지만으로 물리 삭제해서는 안 된다(MUST NOT).

#### Scenario: Source 제한과 cleanup 실패

- **WHEN** Quote 자체는 보이지만 direct Source를 조회할 수 없고 cleanup이 지연되거나 실패한다
- **THEN** 목록·unread에서 제외하고 Node는 null, 읽음은 제외한다
- **AND** 저장 행이 남아 있다는 이유로 API가 노출하거나 기존 Post 정책을 완화하지 않는다

#### Scenario: 승인 철회와 삭제

- **WHEN** upstream이 승인을 철회하거나 Quote 또는 Source를 삭제한다
- **THEN** 같은 가용성 경계로 즉시 숨기고 기존 cleanup의 삭제 후보로 처리한다
- **AND** Source가 hidden일 때 Quote 자체 본문을 제거하는 새 동작을 만들지 않는다

#### Scenario: 삭제 전 회복과 삭제 후 재승인

- **WHEN** 삭제 직전 제한이 풀리거나 물리 삭제 후 다시 승인된다
- **THEN** 삭제 직전 현재 available인 행은 삭제하지 않고 남아 있는 알림만 다시 보일 수 있다
- **AND** 이미 삭제된 알림과 읽음 상태는 복원·재생성하지 않는다

#### Scenario: Recipient 일시 비활성화

- **WHEN** 다른 원인은 유효하고 Recipient 자체만 일시 비활성화·정지 상태다
- **THEN** API에서는 숨기되 그 상태만으로 cleanup하지 않는다
- **AND** 이 예외를 Quote·Source·Related Profile의 일반 조회 불가로 확대하지 않는다

### Requirement: Quote 서버 계약의 독립 완료와 실제 통합 증거

**Authority / Provenance:** PROD-926의 2026-09-16 Issue Gate 및 OpenSpec 작성 진행 승인, PROD-953의 별도 완료 책임; `docs/domain/objects/notification.md`의 Quote lifecycle. PROD-926은 전체 서버 task·실제 upstream 통합·문서 정합성·strict validation·delta sync를 검증한 뒤 자신의 change를 완료·archive해야 한다(MUST). PROD-953 완료, 제외한 세 Mute의 구현·연결, FCM 완료를 조건으로 삼아서는 안 된다(MUST NOT). PROD-792/924/911/327의 미완료를 OpenSpec 작성·착수 blocker로 삼거나, 실제 결과가 준비되지 않았는데 fixture·가정으로 최종 증거를 대신해서는 안 된다(MUST NOT).

#### Scenario: upstream 결과 미준비

- **WHEN** 단위·DB·API fixture 검증은 통과했지만 실제 승인 lifecycle·inbound Mention·공통 정책 연결이 준비되지 않았다
- **THEN** 독립 구현·검증은 진행하되 해당 서버 통합 task와 최종 완료를 미완료로 남긴다
- **AND** 검증 기록에 미실행 경로·제공 이슈·필요 결과를 명시한다

#### Scenario: UI와 독립한 서버 완료

- **WHEN** 승인된 전체 서버 범위와 실제 통합 증거가 완료되고 PROD-953은 진행 중이다
- **THEN** PROD-926은 자신의 sync·validation·archive를 완료할 수 있다
- **AND** UI 출시·클라이언트 통합 완료까지 증명했다고 표현하지 않는다
