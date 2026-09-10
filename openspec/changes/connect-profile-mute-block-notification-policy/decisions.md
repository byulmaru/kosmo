## Context

proposal, Notification delta spec와 design을 현재 canonical·Linear에 대조한 결정 기록이다. 각 Active decision은 상위 계약을 재진술하며, design의 helper·query 배치는 비규범적 안내로 남긴다. 2026-09-10 사용자 메시지 `정정안 승인, OpenSpec 작성`은 Domain/Issue Gate 승인이고, 이 OpenSpec 자체의 최종 승인은 별도다.

## Decision Records

### D1. 다섯 source의 공통 정책과 source 기반 Profile 판정

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 Type별 생성 관계·조회 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 적용 source kind·전달 결과·포함 범위.
- Status: Active
- Context / Problem: source별 저장 경로가 실제 Mute·Block capability를 우회할 수 있다.
- Decision Outcome: 다섯 source가 저장 전에 하나의 공통 정책 경계를 통과한다. Recipient와 Related Profile은 원인 객체에서 파생하며, 실제 capability의 조회 경계를 조합한다.
- Alternatives Considered: source별 중복 판정, Account 전체에 적용하는 판정, 조회에서만 숨기는 방식은 각각 공통 경계·Profile 격리·생성 억제 계약을 충족하지 못한다.
- Consequences: 새 정책 저장소와 production 테스트용 evaluator/callback을 만들지 않는다. 신규 source 연결 원칙은 유지하되 Quote·Mention source를 이번 작업에 추가하지 않는다.
- Confirmation / Follow-up: 다섯 source의 allow/deny·진입점·Recipient 격리를 실제 실행 결과로 검증한다.

### D2. 영구 Mute와 독립된 양방향 Notification Block

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile-mute.md`의 상태·관계·제외/보류; `docs/domain/objects/profile-block.md`의 조회 정책; `docs/domain/objects/notification.md`의 pair 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 `Domain / Issue Gate 승인 — 2026-09-10`.
- Status: Active
- Context / Problem: 최신 Block 계약은 콘텐츠 직접 조회를 방향별로 허용하지만 알림은 양방향으로 제한한다. Mute 기간·만료는 v1 범위 밖이다.
- Decision Outcome: Mute는 Recipient→Related 방향의 `expires_at IS NULL` 관계만 적용한다. Block은 두 Profile 사이 어느 방향으로든 존재하면 억제한다. Profile·Post·Media 직접 조회 허용을 알림 허용으로 재사용하지 않는다.
- Alternatives Considered: Mute 양방향 적용, 기간 Mute 활성 판정 추가, 직접 조회 결과만 사용하는 Block 판정은 현재 상위 계약을 바꾸므로 채택하지 않는다.
- Consequences: 같은 Account의 다른 Profile을 오염시키지 않는다. 기간·만료는 PROD-826, Domain Block은 PROD-817의 독립 계약으로 유지한다.
- Confirmation / Follow-up: Mute 역방향·non-null 값·Profile 격리와 Block 양방향·mutual 일부 해제·직접 콘텐츠 조회 허용 상황을 검증한다.

### D3. deny와 평가 오류를 구분하고 source commit을 보존한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 생성 조건; `docs/architecture/core-services.md`의 post-commit effects; [PROD-273](https://linear.app/byulmaru/issue/PROD-273)의 공통 정책·failure boundary; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 fail-closed·source rollback 금지·source lifecycle retry 변경 제외.
- Status: Active
- Context / Problem: 정책 장애를 허용으로 취급하면 알림이 새고, 정상 deny로 삼키면 기존 오류 관찰과 retry를 바꾼다.
- Decision Outcome: deny는 생성 없는 정상 종료다. 평가 오류는 해당 시도에서 생성하지 않고 기존 호출자·Activity 실패 경계로 전달한다. 원본 source commit과 기존 retry·sibling settlement를 유지한다.
- Alternatives Considered: fail-open, 평가 오류를 성공 no-op으로 변환, source rollback 또는 별도 retry queue 도입은 승인된 실패·lifecycle 계약과 맞지 않는다.
- Consequences: 오류 이후 기존 retry는 당시 정책을 다시 적용한다. deny만을 이유로 새 retry나 과거 source replay를 만들지 않는다.
- Confirmation / Follow-up: source별 정책 조회 실패·재시도·삭제된 source·중복 실행에서 source 결과와 Notification 저장 결과를 함께 확인한다.

### D4. 기존 Notification과 cleanup 소유권을 보존한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 조회 정책; `docs/domain/objects/profile-mute.md`의 조회 정책; `docs/domain/objects/profile-block.md`의 행동·조회 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 포함/제외 범위·완료 조건.
- Status: Active
- Context / Problem: 생성 정책에 retroactive cleanup이나 읽음 갱신을 결합하면 기존 알림 lifecycle이 바뀐다.
- Decision Outcome: 새 생성 정책은 기존 Notification·Read State·최초 읽음 시각을 바꾸지 않는다. Block의 Follow 직접 원인 cleanup, 기존 pair 숨김과 unavailable 비동기 cleanup은 기존 담당 계약을 따른다.
- Alternatives Considered: Mute 시 기존 알림 삭제, 정책 해제 시 과거 알림 복원·소급 생성은 이번 전달 범위에 포함되지 않는다.
- Consequences: 새로운 source action에는 최신 관계를 적용하며 기존 source identity·unique contract를 유지한다. 다른 cleanup에 따른 기존 행 삭제까지 막는 보존 보장은 아니다.
- Confirmation / Follow-up: Read/Unread fixture의 값 보존, duplicate·retry와 Mute·Block 해제 후 새 action 결과를 검증한다.

### D5. PROD-327의 독립 완료 책임과 구현 착수 조건

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`의 생성 정책; [PROD-327](https://linear.app/byulmaru/issue/PROD-327)의 `Domain / Issue Gate 승인 — 2026-09-10`; `memory/issue-openspec-workflow.md`의 책임·완료 경계.
- Status: Active
- Context / Problem: 선행 capability 완료와 OpenSpec 작성 가능 시점, 별도 change의 archive 담당자를 구분해야 한다.
- Decision Outcome: OpenSpec은 지금 작성한다. 구현은 PROD-813·814 완료와 실제 capability 반영을 확인한 뒤 시작한다. PROD-327이 이 change 전체의 구현·source별/통합 검증·delta 동기화·strict validation·archive를 소유한다.
- Alternatives Considered: PROD-271에 archive를 넘기거나 이슈의 부모/순서만으로 책임을 배정하지 않는다. 승인된 다섯 source가 같은 공통 정책과 검증 lifecycle을 공유하므로 새 이슈를 형식적으로 분할하지 않는다.
- Consequences: Spec 작성 완료나 개별 PR Ready만으로 archive하지 않는다. PROD-817과 다른 capability의 완료를 이 change의 archive 조건에 추가하지 않는다.
- Confirmation / Follow-up: Spec Gate와 선행 구현 조건을 확인하고 tasks의 전체 완료 증거를 확인한 뒤 PROD-327의 담당 구현 PR에서 archive한다.

### D6. 선행 PR 위 dependent Stack에서의 구현 진행

- Decision Date: 2026-09-10
- Decision Class: Delivery Handoff
- Authority / Provenance: 사용자의 2026-09-10 메시지 `스택으로 쌓아서 구현해`; 현재 `PROD-814` Linear 상태 `In Review`; local `gh stack` 상태 `main → PROD-814-ui → PROD-814-data → PROD-823-follow-action → PROD-327`.
- Context / Problem: D5의 구현 착수 조건인 PROD-814 완료·merge는 아직 충족되지 않았지만, 사용자가 선행 작업 위에 dependent Stack으로 구현을 진행하도록 명시했다.
- Decision Outcome: PROD-327 구현은 선행 layer를 포함한 dependent Stack에서 진행한다. PROD-814가 완료·merge되었다고 간주하거나 보고하지 않으며, PROD-327의 delivery·Ready·archive 판단은 선행 layer의 실제 capability 반영과 전체 검증 결과에 계속 종속된다.
- Consequences: 현재 branch/PR은 선행 layer 위에서만 의미가 있으며, 선행 변경이 rebase·retarget되면 PROD-327도 함께 재검증한다. 이 결정은 Notification 정책 계약이나 PROD-814의 소유 범위를 변경하지 않는다.
- Confirmation / Follow-up: checkpoint commit·push 후 local Stack과 remote PR base/head/stack 상태를 확인하고, 선행 PR merge 전에는 PROD-327 change를 archive하지 않는다.

## Remaining Decisions

- 새 제품 행동이나 `Upstream Change Required`는 없다. 실제 선행 helper·query 위치와 main 반영 상태는 구현 착수 시 재확인할 기술적 조건이다. 현재 다섯 source보다 runtime 범위가 넓어졌다면 Linear 범위를 먼저 정렬한다.
- PROD-826의 기간 Mute, PROD-817의 Domain Block, Quote·Mention source 계약은 이번 change의 미완료 task나 archive blocker가 아니다.

## Superseded Decisions

없음. 이전 local 정정안은 비권위 초안이며, 이 OpenSpec에는 현재 승인된 상위 계약만 기록한다.
