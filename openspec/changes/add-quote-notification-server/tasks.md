## 1. PROD-926 최초 판단 저장과 additive 도입

**Authority / Provenance**

`docs/domain/objects/notification.md`의 Quote 최초 판단·비소급·재생성 금지, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-903, PROD-926의 승인된 포함 범위와 기술적 질문. 모든 group의 구현·검증 owner는 PROD-926/정혜주다.

**Deliverable**

같은 Quote·Recipient의 최초 판단이 알림 물리 삭제 이후에도 유지되며 도입 전 Quote는 소급 생성되지 않는다.

**Guardrails**

D2·D4·D7: 판단과 알림은 원자적으로 확정한다. 승인 대기·DB 실패를 확정된 정책 억제로 바꾸지 않는다. T0를 재배포로 이동하지 않으며 destructive migration·Notification backfill을 추가하지 않는다.

**Verification**

실제 PostgreSQL에서 migration 전후 기존 read/write, concurrent 확정, 실패 rollback, commit 응답 유실, 알림 삭제 후 재처리 및 T0 이전·동일·이후를 검증한다. T0 이전에 시작해 이후 commit하려는 transaction drain, DB 정밀도·timezone, 오래된 Remote published와 새로운 materialization, restart 후 같은 T0도 확인한다. schema 모양을 문자열로 검사하는 테스트로 대체하지 않는다.

- [ ] 1.1 Quote Type과 독립적인 최초 판단·대표 선택을 보존하는 additive 저장 계약을 구현한다.
- [ ] 1.2 판단·알림 원자성과 같은 identity의 재처리·재승인·물리 삭제 후 단일 결과를 검증한다.
- [ ] 1.3 고정된 도입 기준과 prelaunch 제외·새 Remote 최초 승인 구분을 구현하고 경계 사례를 검증한다.

## 2. PROD-926 승인 후 생성과 공통 정책 연결

**Authority / Provenance**

`docs/domain/objects/notification.md`의 Type별 생성 관계·Quote Notification, `docs/domain/objects/post.md`의 인용 승인·조회, `docs/domain/objects/profile-mute.md`, `docs/domain/objects/profile-block.md`; PROD-926, PROD-431/792/924의 승인 결과 책임, PROD-327의 공통 생성 정책.

**Deliverable**

Local/Remote 승인 결과가 최초 생성 판단에 연결되고 허용된 Local Recipient에게만 Quote 알림이 생성된다.

**Guardrails**

D1·D2: 승인 FK·정책 광고를 승인 근거로 추정하지 않는다. Quote Author·direct Source Author mapping, Profile 단위 self 억제, 두 Post 조회와 공통 Profile Mute·양방향 Block을 적용한다. 세 Mute의 기반·Quote 연결을 구현하지 않는다. Notification 실패는 commit된 원본을 되돌리지 않는다.

**Verification**

승인 대기→최초 승인, 거절·철회·stale 이벤트, self/동일 Account의 다른 Profile, Local/Remote Recipient, DB 시각 기준 활성 Mute, 양방향 Block, Quote·Source 비가용, 정책 평가 실패 및 Activity 저장 실패를 검증한다. design의 실패 matrix별 최종 판단·Notification·원본 Post 상태, retry와 오류 관측 결과를 대조한다. fixture 결과와 group 6의 실제 lifecycle 증거를 구분한다.

- [ ] 2.1 실제 승인 저장 결과를 소비하는 transport-neutral 생성 경계를 연결한다.
- [ ] 2.2 PROD-327 공통 정책과 source·recipient 조건을 적용하고 성공·억제·fail-closed 결과를 검증한다.
- [ ] 2.3 post-commit effect와 유한 retry·관측 경계를 연결하고 원본 결과 보존 및 판단 상태를 검증한다.

## 3. PROD-926 교차 Type 단일 결과와 읽음 보존

**Authority / Provenance**

`docs/domain/objects/notification.md`의 Reply/Mention 수신자별 분류·Quote Notification, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-926 및 PROD-911의 교차 Type 책임 정렬.

**Deliverable**

같은 Quote Post·Recipient의 동시 후보는 우선순위에 따라 하나로 수렴하고, 먼저 생성된 Reply/Mention은 늦은 승인에도 유지된다.

**Guardrails**

D3: Source FK 연결 전의 승인 대기 인용 관계도 포함해 대상 Reply/Quote/Mention writer 모두 같은 조정 경계를 사용한다. Type별 현재 범위 조건을 먼저 적용한다. 선생성 ID·Type·Read State를 바꾸지 않으며 대표 삭제 뒤에도 Quote를 대신 생성하지 않는다. 다른 Recipient·Followee Post는 독립이고 Local Mention·Local Reply+Quote 작성은 제외다.

**Verification**

서로 다른 DB connection에서 동시에 실행한 R/Q/M, 판정 snapshot 전·후의 승인 commit, 후보 탈락 후 우선순위, pending 중 Mention 선생성→Read→승인, Reply 선생성, 대표 cleanup→승인, 다른 Recipient, 기존/Remote Reply+Quote 조합을 검증한다. 조정 기록 없이 기존 Reply/Mention이 함께 남은 비정상 입력에서도 새 Quote를 만들거나 기존 행·읽음 상태를 변경하지 않는지 확인한다.

- [ ] 3.1 같은 snapshot의 후보 판정·대표 선택을 모든 대상 writer에 연결한다.
- [ ] 3.2 기존 Reply/Mention의 ID·읽음 상태와 삭제 이후 대표 선택을 보존한다.
- [ ] 3.3 실제 DB 경합·재시도 및 수신자 격리 회귀를 검증한다.

## 4. PROD-926 Quote API·Node·읽음과 가용성

**Authority / Provenance**

`docs/domain/objects/notification.md`의 관계·권한·지정 읽음·조회 정책·Quote Notification, `docs/domain/objects/profile-block.md`; PROD-926의 GraphQL 포함 범위.

**Deliverable**

권한이 있는 Account가 Quote 알림을 목록·Node·unread·지정 읽음 API로 일관되게 조회·처리한다.

**Guardrails**

D5·D6: `QuoteNotification`의 post는 Quote 자체이고 profile은 Quote Author다. concrete ID·kind·membership·현재 승인과 두 Post 조회를 검증한다. 기존 root field·payload·ID cursor·최초 읽음 시각을 보존한다. source field 조회가 앞선 가용성 판정을 우회하지 않는다. UI·Relay presentation 작업은 포함하지 않는다.

**Verification**

실제 GraphQL operation으로 정상·없는 Node·typename/kind 위조·membership 실패·선택 Profile 차이·pagination 경계·unread·중복 ID·동시 Read·빈 입력·숨긴 입력·부분 실패 원자성을 검증한다. Source가 제한되는 동일 상태를 모든 표면에 적용한다. schema 동기화는 `lint:schema`로 검증한다.

- [x] 4.1 Quote의 공통 가용성 판정을 API의 목록·count·Node·읽음에 연결한다.
- [x] 4.2 concrete object·field·ID routing과 SDL을 동기화한다.
- [x] 4.3 API 권한·읽음·pagination·source snapshot 일관성을 실행 검증한다.

## 5. PROD-926 unavailable cleanup과 도입·rollback 검증

**Authority / Provenance**

`docs/domain/objects/notification.md`의 조회 정책·Quote 정리, `docs/domain/decisions/0028-quote-notification-policy.md`; PROD-926, PROD-328. Migration 제약은 `memory/database/migrations/workflow.md`를 따른다.

**Deliverable**

비가용 Quote 알림이 즉시 숨겨지고 기존 Best Effort 정리로 수렴하며, 생성 중지·재개에도 중복과 권한 계약이 유지된다.

**Guardrails**

D2·D4·D6·D7: 삭제 직전 availability를 재확인하고 최초 판단은 삭제하지 않는다. Recipient 자체 비활성화 예외를 유지한다. Quote 전용 보존 SLA·새 cleanup 스케줄을 추가하지 않는다. rollback 시 T0·판단·Quote-aware reader와 대상 writer를 유지한다.

**Verification**

cleanup 성공·실패·retry, 선택 뒤 가용성 회복, Recipient-only 비활성화, 철회·Quote/Source 삭제, 삭제 후 재승인을 검증한다. migration과 old/new workload·생성 비활성화·in-flight drain·재개의 실제 실행 결과를 남긴다. design의 배포 검증 항목에 맞춰 image·DB revision, 활성화 상태, drain 실패 시 중지, restart 뒤 판단·T0 보존 증거를 기록한다.

- [x] 5.1 기존 bounded cleanup에 Quote를 연결하고 즉시 숨김과 물리 삭제의 독립성을 검증한다.
- [ ] 5.2 삭제·복구·Recipient 예외 및 최초 판단 보존을 검증한다.
- [ ] 5.3 additive migration·활성화·호환 rollback·동일 T0 재개 절차를 검증하고 실행 증거를 남긴다.

## 6. PROD-926 실제 upstream 서버 통합

**Authority / Provenance**

`docs/domain/objects/notification.md`의 Quote lifecycle, `docs/domain/objects/post.md`의 작성·승인 결과; PROD-926의 2026-09-16 승인 및 PROD-431/792/924/911/327의 결과 제공 범위.

**Deliverable**

실제 Local/Remote 작성·승인부터 Notification API·읽음·정리까지, inbound Mention과 공통 정책을 포함하는 서버 통합 증거가 완성된다.

**Guardrails**

D8: upstream은 OpenSpec 작성·착수 blocker가 아니다. 각 실제 결과가 필요한 task만 준비까지 미완료로 둔다. fixture·stub·가정·upstream 상태 이름을 최종 증거로 대체하지 않는다. 실제 provider/network 입력 fixture를 사용하는 테스트도 내부 승인·생성·정책·API 경계를 우회하지 않아야 한다. upstream 전체 이슈의 UI·FCM·archive는 요구하지 않는다.

**Verification**

각 실행 기록에 source/승인 경로, 실제 사용한 upstream revision, DB·Worker·API 결과, 성공·실패 경로와 미실행 사유를 적는다. 기존 Reply·Repost·Mention 회귀도 실행한다. 해당 upstream 결과가 미준비면 이 group과 전체 서버 완료는 미완료다.

- [ ] 6.1 PROD-431/924 Local 작성·승인 대기·최초 승인·철회에서 Notification API까지 통합 검증한다.
- [ ] 6.2 PROD-792/924 실제 Remote 수신·승인 검증·재전달·철회에서 Notification API까지 통합 검증한다.
- [ ] 6.3 PROD-911 inbound Mention의 실제 서버 결과로 동시 후보·선생성·읽음·늦은 승인·정리 조합을 통합 검증한다.
- [ ] 6.4 PROD-327 실제 정책 경계의 Mute·Block·실패 억제와 기존 Reply·Repost·Mention 회귀를 검증한다.

## 7. PROD-926 전체 서버 완료·인계·archive

**Authority / Provenance**

PROD-926의 승인된 검증·완료 책임과 PROD-953의 별도 UI 책임; `docs/domain/objects/notification.md`, `docs/domain/decisions/0028-quote-notification-policy.md`. 완료 절차는 `memory/issue-openspec-workflow.md`를 따른다.

**Deliverable**

전체 서버 scope의 검증·문서 정합성과 client 소비 계약이 기록되고 PROD-926이 자신의 change를 sync·archive한다.

**Guardrails**

D1·D8: 부분 PR·fixture 검증만으로 archive하지 않는다. UI·세 Mute·FCM은 완료 조건에서 제외한다. 별도 원격 쓰기·구현·완료 gate 승인을 현재 Spec 작성 승인으로 대신하지 않는다. 이 task를 이번 문서 작성에서 체크하지 않는다.

**Verification**

group 1–6 완료와 spec scenario 증거, canonical·Linear·실제 구현 정합성을 확인한다. 표준 lint·타입·schema 및 change strict validation을 통과하고 delta sync·archive 후 validation을 확인한다. PROD-953에는 확정된 API shape·가용성·읽음 계약과 서버 증거를 인계한다.

- [ ] 7.1 서버 검증 matrix와 필요한 client 소비 계약을 정리하고 전체 requirement·task의 완료 증거를 대조한다.
- [ ] 7.2 관련 표준 검증·strict validation과 canonical·Linear·OpenSpec 정합성 확인을 완료한다.
- [ ] 7.3 별도 완료 절차에 따라 delta를 sync하고 이 change를 archive한 뒤 validation·이슈 완료 증거를 기록한다.

## Current delivery boundary (2026-09-18)

이 기록은 OpenSpec change를 완료·archive하기 위한 체크가 아니라, PROD-926의 현재 delivery gate와 upstream 통합 gate를 분리하기 위한 세션 인계 기록이다. 1–3 및 5의 기존 checkbox는 Remote/Mention/최종 정책 통합까지 포함한 혼합 task이므로, 아래 독립 slice가 끝났다는 이유로 전체 task를 완료 처리하지 않는다.

### 1. PROD-792와 독립적으로 구현 완료

- Quote 최초 판단·대표 선택을 Quote Type별 Notification unique와 분리된 additive `NotificationQuoteJudgments` 경계로 저장하고, 물리 Notification 삭제 뒤에도 판단을 재생성하지 않도록 했다.
- Local-to-Local Quote의 source/recipient·Post visibility·Profile Mute·양방향 Profile Block 판정, post-commit Quote Activity, 기존 bounded cleanup 연결을 production code로 구현했다.
- Reply → Quote 후보 조정의 현재 생산 경계와 같은 Recipient의 단일 결과·다른 Recipient 격리를 연결했다. 실제 Mention writer는 PROD-911 소유이므로 이 change가 임의로 복제하지 않는다.
- Quote GraphQL concrete object와 Post/Profile visibility를 기존 loader·membership·unread/read 경계에 연결했다. `80c8626f`에서 보강한 Quote `post` loader 재검증과 기존 concrete notification nullable SDL 정렬도 이 독립 slice에 포함한다.
- T0/`EXCLUDED_PRELAUNCH`, disabled rollout, additive migration, restart/retry 호환 경계를 구현했다. Remote relation만으로 승인·판단을 소비하지 않는 fail-safe guard도 production code에 남아 있다.

### 2. PROD-792와 독립적으로 검증 완료

2026-09-18 현재 branch에서 mock 결과를 최종 증거로 삼지 않고 실제 PostgreSQL·Temporal·GraphQL 실행으로 다음을 통과했다.

- API Notification integration: 31/31 — 목록·count·Node·unread/read·visibility와 Quote Post loader 재검증 포함.
- Core Quote/Notification service DB tests: 34/34 — 최초 판단, 삭제 후 보존, Local 정책, T0 경계, Remote relation-only no-op, Reply 우선순위 포함.
- Worker Activity/cleanup DB tests: 16/16 — Quote Activity 멱등성, R/Q 경합·Recipient 격리, Quote cleanup·Recipient-only 예외 포함.
- Worker Temporal workflow suite: 24/24 — post-commit effect, retry, terminal failure, restart/history 경계 포함.
- Core migration smoke: blank replay, non-linear history no-op, disabled/T0 보존 및 migration privilege 경계를 통과했다.
- 기존 API schema/type 및 OpenSpec strict 검증은 checkpoint 재검증에서 통과했다.

### 3. upstream 산출물 없이는 구현 자체를 확정할 수 없는 범위

- **실제 Remote Quote lifecycle adapter:** PROD-792/924가 제공하는 실제 inbound Remote Quote materialization 경계, canonical Quote/Post·direct Source identity, 유효 approval state/version과 withdrawal·redelivery·reapproval·adoption semantics가 필요하다. 현재 PROD-926은 Remote FK/instance relation만 보고 승인으로 승격하지 않는 guard까지만 구현한다. 이 산출물 없이 Remote 승인 소비·재전달 상태 전이를 PROD-926에서 새로 구현하거나 추정하지 않는다.
- **실제 inbound Mention writer:** PROD-911의 production Activity/저장 결과와 동일 Quote Post·Recipient coordination key가 필요하다. 현재 Mention writer를 복제해 구현하지 않는다.
- **최종 공통 정책 배포 계약:** PROD-327/924가 제공하는 실제 Profile Mute·양방향 Block·fail-closed 결과와 배포 revision이 필요하다. 현재 확정된 공통 policy interface에 연결한 code와 그 계약의 독립 회귀만 검증한다.

### 4. 구현은 완료됐지만 upstream 때문에 실제 통합 검증만 deferred

- **Local/924 full approval lifecycle (6.1):** 현재 Local-to-Local creation/notification boundary와 정책·API·cleanup은 검증했다. 실제 approval-pending → first approval → withdrawal 경로가 PROD-431/924 산출물로 제공되면 동일 Post identity와 승인 version을 통해 end-to-end를 재검증한다.
- **Remote (6.2):** Remote relation-only no-op와 fail-safe guard는 검증했지만 실제 Remote inbound lifecycle은 deferred다. 관계 row fixture를 Remote 승인 통합 증거로 승격하지 않는다.
- **Mention/cross-Type (3.1–3.3, 6.3):** 현재 R/Q coordination, Reply priority, read-state·Recipient isolation은 검증했다. PROD-911의 실제 Mention writer가 연결되기 전에는 R/Q/M 전체 경합·선생성 Mention·늦은 승인 통합을 완료 처리하지 않는다.
- **최종 policy/release (6.4, 5.3의 배포 실행 부분):** 현재 policy contract 경계와 migration/T0/retry는 검증했지만 PROD-327의 실제 revision·배포·old/new drain 결과는 deferred다.

### 5. deferred 재개 조건과 재검증 시나리오

- **PROD-792/924 준비 조건:** 실제 upstream revision/adapter, persisted canonical Quote·Source identity, approval state/version, withdrawal/redelivery/reapproval/adoption event contract와 실행 가능한 integration harness를 제공한다. 준비 후 Remote Quote를 pending → first valid approval → reject/withdraw → redelivery/reapproval 순서로 실제 ingestion부터 검증하고, relation-only 입력은 판단을 만들지 않는지, 첫 판단·T0·Notification unique·삭제 후 no-recreation·API visibility/unread/read/cleanup이 같은 identity로 수렴하는지 확인한다.
- **PROD-911 준비 조건:** 실제 inbound Mention Activity와 persisted Mention notification 결과를 제공한다. 같은 Post/Recipient에서 Reply·Quote·Mention을 서로 다른 DB connection/Worker로 동시에 실행하고, pending Mention 선생성 → read → 늦은 Quote approval, representative cleanup → late approval, 다른 Recipient 격리를 실제 DB로 재검증한다.
- **PROD-327/924 준비 조건:** 적용 revision과 실제 Mute/양방향 Block/fail-closed 결과 및 배포·drain 기록을 제공한다. allow/suppress/failure 각각에서 원본 Post·승인 결과 보존, 대표 Type·readAt 불변, API·unread·cleanup 일관성, 기존 Reply/Repost/Mention 회귀를 확인한다.
- **재개 후 공통 gate:** upstream revision, DB migration revision, API/Worker image, rollout enabled/T0, in-flight drain 결과를 기록하고 실제 provider/network 입력이 내부 approval·policy·API 경계를 우회하지 않는지 확인한다. 그 전까지 `DELIVERY_GATE`는 현재 독립 slice에 대해 통과로 취급하고, `FINAL_UPSTREAM_INTEGRATION_GATE`만 deferred로 유지한다.

OpenSpec 7.1–7.3은 위 deferred evidence가 채워질 때까지 체크하거나 archive하지 않는다.
