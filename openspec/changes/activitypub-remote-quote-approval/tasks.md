## 1. PROD-792 선행 확인과 Fedify compatibility

**Authority / Provenance**

`docs/domain/decisions/0027-activitypub-remote-quote-approval.md`의 Dependency 결정과 결과·책임;
PROD-792의 Fedify dependency 채택 조건·Reply Source와 재사용 경계 정렬.

**Deliverable**

정확한 후보 버전·lockfile과 실행 증거로 채택 가능 여부를 판정한다. 이후 기능 작업은 이 그룹 통과 뒤 진행한다.

**Guardrails**

D4의 조건부 채택 방침을 지킨다. 설치 성공만으로 채택하지 않고 실패 시 후보를 채택하거나 기능 구현을
강행하지 않는다. Spec Gate 승인을 확인한 새 구현 세션에서 수행한다.

**Verification**

관련 `@fedify/*` exact version·dependency/peer 정합성 및 frozen lockfile 재현성, 기존 ActivityPub 수신·발신
경로, vocabulary hydration/serialization, 실제 helper의 자기 인용·승인서 진본/불일치/부재/철회 입력을
검증한다. mock 승인 결과만으로 helper 검증을 대체하지 않는다. 후보별 manifest·lockfile과 실행 명령·결과를 남긴다.

- [ ] 1.1 최신 canonical·Linear, PROD-509 공개 계약·구현·검증과 실제 Stack 부모를 확인한다.
- [ ] 1.2 호환되는 Fedify 2.4 prerelease 후보 세트를 pnpm CLI로 명시적으로 pin하고 패키지·peer·lockfile을 검증한다.
- [ ] 1.3 기존 ActivityPub와 vocabulary hydration/serialization의 실행 회귀를 검증한다.
- [ ] 1.4 실제 interaction-controls와 최소 계약 fixture로 Quote/QuoteAuthorization·invalid FEP fallback 금지·Source 노출 조건을 검증한다.
- [ ] 1.5 모든 compatibility 결과를 기록하고 통과 후보만 채택한다. 실패 후보는 제거·복원하고 기능 작업을 중단한다.

## 2. PROD-792 입력 판정과 상태 보존

**Authority / Provenance**

`docs/domain/objects/post.md`의 Remote Quote Approval·원격 인용 정보 반영;
PROD-792의 Quote 형식과 승인 검증·저장과 조회.

**Deliverable**

인증된 원격 Quote의 형식·대상·승인 정보·revision과 본문이 일관되게 보존된다.

**Guardrails**

그룹 1 통과가 선행한다. D1·D2를 따른다. FEP 우선·invalid fallback 금지, 레거시 승인서 면제,
수동 승인 검증기 금지, 본문 보존을 유지한다. DB 변경은 additive하게 준비한다.

**Verification**

세 레거시 입력과 FEP 동시 입력, identity/author 불일치, 승인서 부재·정상·위조·다른 대상, duplicate/concurrent
persistence를 실행해 상태와 저장 결과를 검증한다. 신규 migration 적용 후 기존 Post 조회도 확인한다.

- [ ] 2.1 Quote 메타데이터 저장과 additive migration을 구현하고 기존 데이터 보존을 검증한다.
- [ ] 2.2 인증된 수신에서 FEP·레거시 판정과 승인 입력 저장을 연결한다.
- [ ] 2.3 자기 인용·정상·부재·잘못된 승인·레거시 호환의 현재 상태 판정과 저장 실패 경로를 검증한다.

## 3. PROD-792 Source 확보와 resolution

**Authority / Provenance**

`docs/domain/objects/post.md`의 원격 인용 정보 반영·원격 Quote Source 표시;
PROD-792의 저장과 조회·Quote resolution Workflow·Reply Source와 재사용 경계 정렬;
PROD-509의 Media와 작성자/Post 경계 확정·필수 테스트와 Spec 상태.

**Deliverable**

공개 Source와 기존 private Source를 허용 범위 안에서 연결하고 revision별 처리가 하나의 현재 결과로 수렴한다.

**Guardrails**

그룹 2가 선행한다. D2·D3를 따른다. PROD-509 경계를 재사용하며 Parent fetch·미저장 private Source 수집을
추가하지 않는다. 지정 Workflow type/ID와 transient 최대 10회 재시도, stale·영구 실패 no-op을 유지한다.

**Verification**

기존 Source, 미저장 Public/Unlisted, 저장·미저장 Followers Only, Reply Parent 유무·작성자/audience 차이·DB
장애, 선택 Media 실패와 Actor/Post 독립 commit, transient 상한·영구 실패·중복·동시·stale 결과를 검증한다.

PROD-509의 아래 증거를 계약 항목별로 연결한다. 각 항목에 검증한 commit SHA, 테스트 이름·실행 명령·결과와
PROD-792가 재사용하는 production 경로를 기록한다. 현재 연결과 채택한 Fedify 후보에서도 유효한 증거는 재사용하고,
변경된 경로나 증거가 없는 부분만 PROD-792 통합 검증으로 보완한다. 선행 테스트 전체를 복제하거나 과거 통과를
현재 호환성 통과로 간주하지 않는다.

| 계약 항목           | 재사용 증거 또는 필요한 PROD-792 통합 검증의 관찰 결과                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10,000자 경계       | Source의 정규화 summary/body Plain Text 합계가 UTF-16 `.length` 기준 10,000이면 나머지 조건 충족 시 허용하고 10,001이면 전체 Source Note 저장을 거부한다. 한계 초과에 따른 거부는 신규 Actor 저장 전에 끝나며 outer Quote 본문은 유지한다.                                |
| Note·Actor identity | 요청 URI와 Note ID 불일치, 부적합 attribution, `attributedTo`와 실제 Actor exact URI 불일치에서 신규 Actor/Post가 생기지 않고 기존 Profile 재연결도 없다. Note 검증 실패는 신규 author persistence를 시작하지 않는다.                                                     |
| Media 선택·fetch    | embedded Image·지원 image Document를 원래 순서로 앞 4개 선택한다. IRI-only·비지원·초과 attachment를 추가 fetch하지 않는다. 같은 URL별 독립 Media identity와 nullable metadata를 보존한다.                                                                                 |
| Media·저장 실패     | 선택 Media 필수 검증 실패는 전체 Source Note 거부이며 일부 이미지·본문만 저장하지 않는다. attachment-only 성공과 완전 empty 거부를 보존한다. 검증 실패는 신규 Actor 저장 전에 끝나며, 유효 Actor commit 뒤 Post 실패에서는 Actor/Profile·Instance를 보상 삭제하지 않는다. |

- [ ] 3.1 기존 Source와 PROD-509 공개 materializer를 승인 여부와 독립적으로 연결한다.
- [ ] 3.2 지정 Workflow·Activity 실행 경로와 revision 조건을 연결하고 commit 후 시작을 확인한다.
- [ ] 3.3 위 증거 표를 채워 10,000자·Note/Actor identity·Media 선택/추가 fetch·저장 경계의 PROD-509 증거를 연결하고, PROD-792의 Source 경로에서 필요한 공백만 통합 검증한다. Reply 실패와 private Source 무수집도 검증한다.
- [ ] 3.4 transient 재시도 상한, 영구 실패 반복, duplicate/concurrent delivery와 stale Workflow를 검증한다.

## 4. PROD-792 승인 변경과 철회

**Authority / Provenance**

`docs/domain/objects/post.md`의 원격 인용 정보 반영·원격 인용 승인 철회 반영;
PROD-792의 변경·철회 lifecycle·Quote resolution Workflow.

**Deliverable**

승인 정보 Update와 유효한 승인서 Delete가 현재 상태를 변경하고 늦은 결과가 이를 되돌리지 않는다.

**Guardrails**

그룹 3이 선행한다. D3를 따른다. 인용 작성자와 Source Author의 권한을 구분하고 일반 Note 수정·대상 변경,
IRI-only Note fetch·hydration과 authorization-only Update 표현을
추가하지 않는다. 본문과 Source 관계를 보존한다.

**Verification**

embedded Note의 승인 추가·교체·제거, IRI-only·authorization-only 표현의 no-op, 정상·잘못된 발급자/대상 Delete, 중복 철회, 진행 중 resolution과 Update/Delete 경쟁을
실행해 승인·revision·관계 결과를 검증한다. 승인 참조 추가·교체·제거에서 FEP 타인 인용의 필요한 승인 대기와
자기 인용·승인서 면제 legacy의 불필요한 대기 없음, 각 경우에 적용되는 viewer 조회 조건을 구분해 검증한다.

- [ ] 4.1 Quote 승인 정보에 한정한 인증된 Update와 revision 변경을 구현·검증한다.
- [ ] 4.2 Source Author의 유효한 승인서 Delete와 철회 보존을 구현·검증한다.
- [ ] 4.3 늦은 승인 결과와 중복 철회가 현재 상태·관계를 되돌리지 않는지 검증한다.

## 5. PROD-792 조회·기존 카드와 전체 통합

**Authority / Provenance**

`docs/domain/objects/post.md`의 원격 Quote Source 표시·Post Eligibility; `docs/design/post-action-bar.md`;
PROD-792의 기존 조회·표시 경로 재사용·검증·Quote Notification 계약 정렬.

**Deliverable**

목록·상세의 Source가 승인과 viewer 정책을 모두 따르며 수신부터 철회까지 기존 카드와 본문이 일관되게 표시된다.

**Guardrails**

그룹 2~4가 선행한다. D2·D5를 따른다. 새 API 타입·화면·재귀 표시·본문 재작성을 추가하지 않는다.
PROD-926의 알림 lifecycle을 구현하거나 재처리를 새 알림 원인으로 만들지 않는다.

**Verification**

승인 상태 × Source 존재/visibility/lifecycle/방향별 Block 조합의 API 통합, 목록·상세 카드 표시와 본문 보존,
Local Quote·일반 Post·Reply·Repost·한 단계 preview 회귀를 검증한다. 수신→확보→승인→Update→철회의 전체
흐름을 실제 상태 변화로 확인한다.

- [ ] 5.1 기존 Source 조회 경로에 승인과 viewer별 조건을 함께 적용하고 우회 경로를 검증한다. `specs/post/spec.md`의 MODIFIED 조회 scenario를 포함해 Source가 조회 가능해도 미승인이면 null이고, 승인돼도 viewer 정책 실패면 null인지 확인한다.
- [ ] 5.2 목록·상세에서 승인된 Source 카드와 미승인·철회·조회 불가 시 본문 보존을 검증한다.
- [ ] 5.3 기존 Local Quote·Post·Reply·Repost 회귀와 PROD-792 전체 통합 흐름을 검증한다.

## 6. PROD-792 rollout 검증과 change 완료

**Authority / Provenance**

`docs/domain/decisions/0027-activitypub-remote-quote-approval.md`의 결과와 책임;
PROD-792의 Domain Gate 및 Issue Gate 승인·검증·Fedify dependency 채택 조건.

**Deliverable**

이 change 전체의 scenario·통합·배포 증거와 canonical/Linear 정합성이 확인되고 delta sync·archive가 완료된다.

**Guardrails**

그룹 1~5가 선행한다. PROD-792가 통합·archive 책임을 소유한다. 개별 PR 완료로 전체 change를 archive하지
않는다. 승인 gating을 잃는 구버전 reader rollback이나 검증되지 않은 APPROVED backfill을 하지 않는다.

**Verification**

additive migration·reader/worker/writer 배포 순서와 rollback에서 Source 비노출·본문/메타데이터 보존을
확인한다. 모든 scenario 증거, 최종 compatibility와 lockfile, 최신 상위 계약 대조, strict validation 및
archive 후 validation을 확인한다.

- [ ] 6.1 배포·rollback에서 승인 gating과 기존 데이터가 보존되는지 검증한다.
- [ ] 6.2 최신 canonical·Linear 및 구현·spec 전체 정합성과 요구 scenario별 실행 증거를 확인한다.
- [ ] 6.3 전체 완료 조건 충족 후 delta specs를 동기화하고 archive 및 archive 후 validation을 수행한다.

## Follow-up candidates

Draft PR correctness blocker가 아닌 후속 hardening으로 GraphQL Quote 상태 DataLoader/N+1 최적화,
`approvalUri` index/unique, `resolutionRevision` DB CHECK를 기록한다. 이 change에서 기능 범위를 넓히지 않는다.
