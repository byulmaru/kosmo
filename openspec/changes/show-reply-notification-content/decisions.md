## Context

이 기록은 PROD-811의 Production Notification 연결을 위해 `docs/domain/objects/notification.md`, `docs/design/notifications.md`, 현재 Linear 계약과 승인된 DSN-42/PROD-884 presentation을 대조해 확정한 사용자 노출 동작을 담는다. 내부 파일·helper 선택은 `design.md`의 비규범적 지침으로 남긴다.

## Decision Records

### Reply는 공용 Post Action과 목록용 popup composer를 그대로 사용한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/notifications.md`, [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다), [DSN-42](https://linear.app/byulmaru/issue/DSN-42/figma-notificationpost-presentation을-시각-리디자인한다), [PROD-884](https://linear.app/byulmaru/issue/PROD-884/dsn-42-notification-presentation을-공용-ui와-storybook으로-이관한다)
- Status: Active
- Context / Problem: 승인된 Reply Notification presentation에는 공용 Post Action Bar가 있지만 PROD-811은 Notification 전용 직접 답글 기능과 Reply UI 재설계를 제외한다.
- Decision Outcome: Reply Action Bar는 기존 Post action을 표시하고 Reply control은 기존 목록용 popup modal composer를 연다. Notification 전용 composer, popup lifecycle 또는 Reply 정책은 추가하지 않는다.
- Alternatives Considered: Reply Action을 숨기면 승인된 Post presentation과 달라진다. Notification 전용 composer를 만들면 PROD-811의 제외 범위와 공용화 원칙을 위반한다. 기존 composer를 후속 작업까지 연결하지 않으면 이미 제공되는 목록용 popup 동작을 불필요하게 지연한다.
- Consequences: Notification 목록은 기존 Post action 인증과 selected Profile 기반 Reply coordinator를 제공해야 한다. popup의 validation·mutation·focus lifecycle은 기존 Post 계약을 유지한다.
- Confirmation / Follow-up: 실제 Production 목록 Storybook에서 Reply control이 popup dialog를 열고 닫은 뒤 trigger focus가 복귀하는지 검증한다.

### Follow Request Notification은 관리 화면으로 이동한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/notifications.md`, [DSN-42](https://linear.app/byulmaru/issue/DSN-42/figma-notificationpost-presentation을-시각-리디자인한다), [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다)
- Status: Active
- Context / Problem: 승인된 Notification presentation은 Follow Request의 목적지를 요청 관리 화면으로 정했지만 legacy Production 행은 요청자 Profile로 이동한다.
- Decision Outcome: Follow Request Notification의 단일 target은 `/follow-requests`로 이동한다.
- Alternatives Considered: 요청자 Profile 이동을 유지하면 관리가 필요한 Notification의 canonical target과 어긋난다. inline 수락·거절 control은 현재 표시 계약에 없다.
- Consequences: 이 결정은 active Notification spec의 `Follow Request Notification 목록과 requester Profile 활성화` requirement 중 requester Profile destination을 대체한다. 종류별 connected adapter의 target만 정렬하며 Follow Request mutation이나 관리 화면 동작은 변경하지 않는다.
- Confirmation / Follow-up: Production 목록 interaction에서 행 activation의 route와 단건 Read 요청을 함께 검증한다.

### Reply Read는 명시적인 이동과 미디어 열기에만 결속한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/design/notifications.md`, [PROD-372](https://linear.app/byulmaru/issue/PROD-372/알림-항목-읽음-상태를-best-effort로-동기화한다), [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다)
- Status: Active
- Context / Problem: Reply surface에는 여러 link와 Content Warning·Action Bar·composer control이 있어 바깥 item handler를 사용하면 navigation과 Read가 중복 실행될 수 있다.
- Decision Outcome: Reply의 작성자 Profile, 시각과 본문 Post navigation 및 미디어 열기는 각각 한 번의 Best Effort Read를 시작한다. Content Warning 공개, Action Bar와 열린 composer의 control은 Notification navigation이나 Read를 시작하지 않는다. Read 결과는 target 동작을 지연하거나 되돌리지 않는다.
- Alternatives Considered: 모든 pointer/press를 바깥에서 capture하면 내부 control까지 Read·navigation을 실행한다. Action Bar나 Content Warning까지 Read trigger로 취급하면 사용자가 승인한 독립 동작 경계보다 범위가 넓어진다. Reply 전체를 단일 Link로 만들면 nested interactive element가 된다.
- Consequences: connected Notification 경계는 명시적인 activation seam으로 단건 Read를 전달해야 하며 반복 activation의 최종 상태는 기존 서버 멱등성에 맡긴다.
- Confirmation / Follow-up: Profile/detail/body/media target은 activation당 Read 한 번과 원래 동작을, Content Warning·Action Bar·composer는 Read와 item navigation이 없음을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
