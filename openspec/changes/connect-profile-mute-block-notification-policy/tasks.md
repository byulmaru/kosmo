## 1. PROD-327 구현 착수 근거와 capability 연결

**Authority / Provenance**

- `docs/domain/objects/notification.md`의 생성·조회 정책, `docs/domain/objects/profile-mute.md`의 Mute, `docs/domain/objects/profile-block.md`의 Notification pair 정책.
- [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 `Domain / Issue Gate 승인 — 2026-09-10`과 선행 [PROD-813](https://linear.app/byulmaru/issue/PROD-813)·[PROD-814](https://linear.app/byulmaru/issue/PROD-814)·[PROD-822](https://linear.app/byulmaru/issue/PROD-822).

**Deliverable**

승인된 Spec Gate와 완료된 실제 capability를 기준으로 다섯 source에 적용할 동일한 생성 판정이 준비된다. 이 그룹은 이후 그룹의 선행 조건이다.

**Guardrails**

- D1·D2·D5를 최신 canonical·Linear와 독립 대조한다. PROD-813·814 완료와 실제 코드 반영 전 구현을 시작하지 않는다.
- source 범위를 임의 확장하거나 capability 자체를 대신 구현하지 않는다. 관계·정책 저장소와 production 테스트용 evaluator/callback을 추가하지 않는다.

**Verification**

- Spec 승인 근거, 선행 이슈 상태·merge/runtime 반영, 기존 source 목록과 capability 조회 API를 기록한다.
- 실제 관계를 사용해 Recipient→Related Mute의 NULL·미래·과거·정확한 DB 현재 시각 경계, 반대 방향 Mute 허용, 양방향·mutual Block을 실행 검증한다.

- [ ] 1.1 최신 authority·Spec 승인·선행 완료·실제 capability와 source 목록을 확인하고 작성 시점 대비 차이를 정렬한다.
- [x] 1.2 실제 capability를 소비하는 공통 Notification 생성 판정을 구현하고 활성 Mute·양방향 Block의 실행 결과를 검증한다.

## 2. PROD-327 다섯 source 연결과 Recipient 격리

**Authority / Provenance**

- `docs/domain/objects/notification.md`의 Type별 생성 관계·조회 정책, `docs/domain/objects/profile-mute.md`와 `docs/domain/objects/profile-block.md`의 조회 정책.
- [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 적용 source kind·공통 경계·Profile 격리·완료 조건.

**Deliverable**

그룹 1의 실제 정책이 모든 현재 생성 경로에 연결되어, 올바른 Recipient만 알림을 받고 Mute·Block 대상의 새 알림은 저장되지 않는다.

**Guardrails**

- D1·D2를 따른다. Recipient·Related Profile을 source에서 파생하며 Account나 selected Profile을 대신 사용하지 않는다.
- source별 self·Local Recipient·lifecycle·조회 조건을 유지한다. 직접 콘텐츠 조회가 허용돼도 Block pair 판정은 생략하지 않는다.

**Verification**

- 다섯 종류 각각에서 allow, 활성 Mute(NULL·미래) deny, 만료·정확한 경계 allow, Block 양방향 deny와 올바른 source·Recipient correlation을 검증한다.
- 같은 Account의 A1·A2 중 한 Profile에만 Mute를 적용해 격리를 검증한다. 실제 제공되는 Local/Remote ingress가 같은 core 생성 정책을 사용하는지 확인한다.
- Block 전에 source가 commit되고 effect 실행 전에 Block이 생기는 순서, 콘텐츠 직접 조회 허용 방향에서도 알림이 억제되는 순서를 검증한다.

- [x] 2.1 Follow·Follow Request를 공통 판정에 연결하고 두 source의 allow/deny·원인 관계·Recipient 격리를 검증한다.
- [x] 2.2 Reply를 공통 판정에 연결하고 Parent Author/Reply Author mapping 및 allow/deny·Recipient 격리를 검증한다.
- [x] 2.3 Reaction·Repost를 공통 판정에 연결하고 두 source의 mapping·allow/deny·Recipient 격리를 검증한다.
- [ ] 2.4 기존 Local/Remote ingress와 source commit 후 Block·콘텐츠 직접 조회 허용 상황에서 정책 우회가 없는지 통합 검증한다.

## 3. PROD-327 실패 격리·retry·관계 변경 회귀

**Authority / Provenance**

- `docs/domain/objects/notification.md`의 생성·기존 Notification 보존 정책, `docs/domain/objects/profile-mute.md`의 조회 정책, `docs/domain/objects/profile-block.md`의 행동·조회 정책, `docs/architecture/core-services.md`의 post-commit effects.
- [PROD-273](https://linear.app/byulmaru/issue/PROD-273)의 기존 failure boundary와 [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 fail-closed·source rollback 금지·retry/cleanup 제외·해제 후 최신 정책.

**Deliverable**

그룹 2의 각 생성 경로에서 정책 장애가 원본 행동을 되돌리지 않고, 중복·재시도·해제 후 새 행동에서도 기존 알림 lifecycle이 유지된다.

**Guardrails**

- D3·D4를 따른다. deny는 정상 종료, 평가 오류는 기존 실패 경계로 전파하며 기존 retry·sibling settlement를 유지한다.
- 기존 Notification·Read State·최초 읽음 시각을 생성 정책으로 변경하지 않는다. Block cleanup·unavailable 정리를 중복 수행하거나 해제 시 과거 source를 재생하지 않는다.
- 테스트는 실제 동작을 실행한다. source/config 문자열 검사나 production 테스트용 callback으로 계약을 대신하지 않는다.

**Verification**

- 실제 Mute/Block 정책 조회 실패를 유발하고 각 source의 commit 보존·Notification 미생성·오류 관찰을 함께 확인한다.
- 오류 후 allow/deny 재시도, 삭제·terminal source, duplicate, 이미 Read인 Notification의 값 보존을 검증한다.
- Mute 해제·마지막 Block 해제 뒤 새 행동과 mutual 한쪽 해제의 지속 억제를 검증한다. Mute 생성 전 Read/Unread snapshot 보존은 `packages/core/services/profile-mute.test.ts`의 기존 회귀가 소유한다.

- [x] 3.1 다섯 source의 정책 평가 실패에서 Notification 미생성과 source commit 보존·오류 전파를 검증한다.
- [x] 3.2 기존 Activity retry·sibling settlement와 source 삭제/terminal·duplicate 멱등성 회귀를 검증한다.
- [x] 3.3 Mute·Block 해제 뒤 새 행동, mutual 일부 해제와 기존 Read/Unread 보존을 검증한다.

## 4. PROD-327 전체 통합 검증·명세 동기화·완료

**Authority / Provenance**

- `docs/domain/objects/notification.md`, `docs/domain/objects/profile-mute.md`, `docs/domain/objects/profile-block.md`의 해당 생성·조회·lifecycle 계약.
- [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 완료 조건·`Domain / Issue Gate 승인 — 2026-09-10`, `memory/issue-openspec-workflow.md`의 Completion Gate.

**Deliverable**

그룹 1~3의 source별 결과가 실제 Core/API/Worker 통합에서 검증되고, PROD-327이 소유한 이 change 전체를 정합성 확인·동기화·archive한다.

**Guardrails**

- D5를 따른다. 이슈·PR 순서에서 archive 책임을 추론하지 않으며, 전체 범위의 구현·검증 완료 전 archive하지 않는다.
- schema·GraphQL shape·UI·source retry 변경과 소급 생성은 포함하지 않는다. 미실행 검증은 완료로 표시하지 않는다.

**Verification**

- 기존 Core `test:services`, Worker `test:database`·`test:workflow` 및 영향받은 API 통합 테스트를 해당 package의 `pnpm` 명령으로 실행한다. fixture/격리 환경은 기존 script를 사용하고 실제 명령·결과·미실행을 기록한다.
- API에서 억제된 알림이 item·count에 추가되지 않고 허용된 source correlation과 기존 Read 동작이 유지되는지 확인한다.
- 최신 canonical·Linear와 최종 diff를 독립 대조하고 `openspec validate connect-profile-mute-block-notification-policy --strict`를 통과시킨다. delta 동기화·archive 뒤에도 관련 OpenSpec validation을 수행한다.

- [ ] 4.1 관련 Core/API/Worker 통합·회귀와 정적 검증을 실행하고 source별 검증 결과·환경·남은 제한을 기록한다.
- [ ] 4.2 최종 구현·canonical·Linear·OpenSpec을 정렬하고 strict validation 및 기존 배포·rollback 확인 근거를 기록한다.
- [ ] 4.3 모든 선행 task와 전체 검증 완료를 확인한 PROD-327 담당 구현 PR에서 delta spec을 동기화하고 archive한 뒤 validation을 완료한다. 이번 리뷰 대응에서는 archive를 수행하지 않는다.
