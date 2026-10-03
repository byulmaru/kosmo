## Context

승인된 Post 계약과 PROD-792의 구현 계약을 proposal·specs·design에 반영했다. Domain Gate와 Issue Gate는
2026-09-10 사용자 승인으로 통과했다. 아래 Active는 상위 계약에서 파생한 결정의 유효 상태이며 새 OpenSpec의
Spec Gate 승인이나 dependency 후보 채택 완료를 뜻하지 않는다.

## Decision Records

### D1. FEP 우선과 레거시 승인서 면제

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 원격 인용 정보 반영; `docs/domain/decisions/0027-activitypub-remote-quote-approval.md`; PROD-792의 Quote 형식과 승인 검증.
- Status: Active
- Context / Problem: 레거시 호환이 잘못된 FEP 승인 입력의 우회로가 될 수 있다.
- Decision Outcome: FEP가 있으면 자기 인용 또는 진본 QuoteAuthorization을 검증한다. FEP가 없고 Source가 유효한 레거시는 승인서 없이 호환 승인한다. Fedify vocabulary와 `quoteInteraction`을 사용한다.
- Alternatives Considered: 모든 레거시에 승인서를 요구하면 승인된 호환 정책에 맞지 않는다. invalid FEP를 레거시로 처리하거나 수동 승인 검증기를 쓰는 방식도 배제한다.
- Consequences: 레거시 APPROVED는 원문 작성자의 명시적 동의 증거가 아니며 viewer 권한은 별도로 적용한다. 승인 참조 변경 시 검증 대기는 QuoteAuthorization이 필요한 FEP 타인 인용에 적용한다. 자기 인용·승인서 면제 legacy에는 불필요한 대기를 추가하지 않는다.
- Confirmation / Follow-up: 실제 helper로 자기 인용·정상·부재·불일치·위조 승인서와 레거시 3종, invalid FEP 동시 입력을 검증한다.

### D2. 승인·Source 관계·조회 권한 분리

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 Remote Quote Approval 및 원격 Quote Source 표시; PROD-792의 저장과 조회·기존 조회·표시 경로 재사용.
- Status: Active
- Context / Problem: 관계 저장이나 승인을 조회 권한으로 사용하면 Source가 노출된다.
- Decision Outcome: `activitypub_post_quote`에 대상·형식·상태·승인 URI·revision을 보존하고 materialize된 Source는 승인과 별개로 `Posts.repostSourceId`에 연결한다. APPROVED와 viewer 정책을 모두 통과할 때만 기존 Source를 반환한다.
- Alternatives Considered: 미승인 Source 관계 삭제는 추적·재검증과 관계 보존 계약에 어긋난다. 새 Quote 객체·GraphQL 타입·화면은 범위 밖이다.
- Consequences: 본문과 바깥 Reply는 유지한다. 공개 Source는 PROD-509를 재사용하고 미저장 private Source는 수집하지 않는다. Reply Source는 자신의 identity·author·audience로 판정한다.
- Confirmation / Follow-up: API 목록·상세·preview에서 승인과 viewer 조합을 검증하고 Local Quote·일반 Post·Reply·Repost 회귀를 확인한다.

### D3. revision별 resolution과 철회 무효화

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`의 원격 인용 정보 반영·원격 인용 승인 철회 반영; PROD-792의 Quote resolution Workflow·변경·철회 lifecycle.
- Status: Active
- Context / Problem: 중복 수신과 늦은 검증이 최신 승인 또는 철회를 덮을 수 있다.
- Decision Outcome: `activitypubQuoteResolutionWorkflow`와 `activitypub-quote-resolution:{postId}:{revision}`을 사용한다. transient만 최대 10회 재시도하고 stale·영구 실패는 멱등 no-op으로 끝낸다. 인증된 embedded `Update(Note)`의 승인 정보와 Source Author의 유효한 승인서 Delete를 반영한다. IRI-only Note fetch·hydration과 authorization-only Update 표현은 지원하지 않는다.
- Alternatives Considered: revision 없는 Post 단위 실행과 무제한 재시도는 현재성·상한 계약을 충족하지 않는다. 일반 Note 수정이나 대상 변경을 함께 구현하지 않는다.
- Consequences: 영구 실패의 INVALID 판정은 보존하며 반복 처리는 효과를 추가하지 않는다. 철회 뒤 본문·관계는 남기고 이전 결과는 반영하지 않는다.
- Confirmation / Follow-up: 동시 수신, 중복 Delete, Update/철회와 진행 중 Workflow의 경쟁, transient 상한을 실행된 상태 변화로 검증한다.

### D4. Fedify prerelease의 조건부 채택

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0027-activitypub-remote-quote-approval.md`의 Dependency 결정과 승인 경계; PROD-792의 Fedify dependency 채택 조건 및 2026-09-10 사용자 결정.
- Status: Active
- Context / Problem: 설치 가능한 prerelease가 기존 federation 또는 PROD-792 승인 계약과 호환된다는 보장은 없다.
- Decision Outcome: 호환되는 2.4 prerelease 세트를 명시적으로 pin하고 관련 패키지·peer·lockfile 정합성, 기존 ActivityPub·vocabulary hydration/serialization, 실제 interaction-controls의 Quote/QuoteAuthorization 검증을 모두 통과한 후보만 채택한다.
- Alternatives Considered: 설치 성공만으로 채택하거나 수동 검증기로 우회하는 방식은 승인되지 않았다. 과거 개발 태그를 검증 없이 선택하지 않는다.
- Consequences: 실패 후보는 채택하지 않고 기능 구현을 강행하지 않는다. 후보 변경 시 재검증한다. 현재 후보 미선정·검증 미실행·채택 미완료이며 Domain/Issue Gate 승인과 별개다.
- Confirmation / Follow-up: 정확한 manifest·lockfile, 실행 명령·결과를 후보별로 보존한다. 실패 결과를 통과로 바꾸거나 건너뛰지 않는다.

### D5. PROD-792의 완료 책임과 후속 경계

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0027-activitypub-remote-quote-approval.md`의 결과와 책임; PROD-792의 Domain Gate 및 Issue Gate 승인·Reply Source와 재사용 경계 정렬·제외 범위·Quote Notification 계약 정렬.
- Status: Active
- Context / Problem: 선행·후속 이슈나 개별 PR 순서에서 change 완료 책임을 추론하면 범위가 달라진다.
- Decision Outcome: PROD-792가 이 change의 구현·테스트·전체 통합 검증·정합성 확인·delta sync·archive를 소유한다. PROD-509를 선행으로 유지하며 PROD-661의 별도 projector를 요구하지 않는다.
- Alternatives Considered: 일반 Note, private Source, 알림 전체를 이 change에 합치거나 마지막 PR이라는 이유만으로 완료 책임을 넘기는 방식은 배제한다.
- Consequences: PROD-793의 검증된 Source-author 공급·signed fetch, PROD-926의 알림 lifecycle은 별도다. 재처리·재승인은 새 알림 원인이 아니다. 개별 PR Ready/merge와 change archive는 별도로 판정한다.
- Confirmation / Follow-up: 전체 task와 scenario 증거를 대조하고 최신 canonical·Linear 정합성 및 archive 후 validation을 확인한다.

## 2026-09-11 검토 수정 이력

P0는 D1의 기존 승인서 면제와 Update 조건을 requirement·scenario·검증에 일치시켰다. P1은 기존 `post`
requirement 전체의 MODIFIED delta로 D2의 승인·viewer 이중 조건을 정렬했다. P2는 PROD-509의 승인된
10,000자·identity·Media·저장 경계를 tasks의 증거 표에 연결했다. 새로운 Decision Class나 제품 정책은 추가하지
않았으며 D1~D5의 원천 계약과 책임을 유지한다. 이 수정은 Spec Gate 승인이 아니다.

## Remaining Decisions

제품 계약의 미결정은 없다. 정확한 prerelease 후보와 실제 compatibility 결과, 선행 구현의 최종 API·배포 순서는
실행 결과로 확인할 기술 항목이다. 실패 후보의 채택이나 범위 변경을 승인한 것으로 해석하지 않는다.
새 OpenSpec의 Spec Gate 승인은 아직 받지 않았다.

## Superseded Decisions

없음.
