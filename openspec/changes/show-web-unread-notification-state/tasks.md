## 1. PROD-680 Web 알림 미확인 상태 표시

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/accessibility.md`
- `PROD-680`

**Deliverable**

사용자는 selected Profile의 Web 알림 목록에서 모든 visible Notification kind의 미확인 행을 좌측 상태선, 은은한 배경과 접근성 설명으로 구분할 수 있고, item activation의 Read 성공 뒤 행 강조와 전역 알림 인디케이터가 기존 Relay payload에 따라 함께 갱신된다.

**Guardrails**

- 시각 상태는 기존 `readAt`을 source of truth로 사용하고, Read mutation 성공 전에는 제거하지 않는다.
- Web Unread 행은 불투명한 `primary` 좌측 4px 상태선과 `primary` 30% alpha 배경을 하나의 결합 표현으로 사용하며, Read의 일반 배경과 구분되고 Read 전환 전후 콘텐츠 정렬을 유지한다.
- 상태선과 30% alpha 배경 사이에 별도 고대비 edge를 추가하지 않는다.
- Web pointer hover의 기존 `surface` 배경과 Unread 상태선을 함께 유지한다.
- 배경 alpha를 콘텐츠 전체 opacity나 별도 absolute·z-index stacking layer로 구현하지 않는다.
- 기존 접근성 Unread 설명, 즉시 navigation, Relay ID 정규화와 Profile별 cache 격리를 유지한다.
- 목록 진입·가시성 기반 자동 Read, 전체 읽음, Native UI, GraphQL 계약과 앱 전체 컬러 토큰 리팩터링을 포함하지 않는다.

**Verification**

- 현재 지원되는 light Web Storybook에서 Read·Unread 기본 배경과 상태선, hover, 접근성명, Read 성공 및 실패 결과를 확인한다.
- dark는 light와 함께 theme token이 정의되었는지 정적으로 확인하고, dark Storybook runtime은 이번 검증 범위에 포함하지 않는다.
- 기존 Notification Relay unit test에서 item `readAt`, 정확한 Recipient Profile count, 다른 Profile 격리와 실패 시 cache 보존을 확인한다.
- Notification Web E2E에서 activation navigation, Read 수렴과 전역 인디케이터 제거 회귀를 확인한다.
- Relay compiler, app TypeScript check와 strict OpenSpec validation을 통과시키고 Native style branch가 변경되지 않았음을 diff로 확인한다.

- [x] 1.1 컬러 정책 문서와 light/dark theme에 Web Unread 배경용 `primary` 30% alpha 의미를 동기화한다.
- [x] 1.2 모든 Notification kind의 Web 행이 Read·Unread·hover 상태를 공통 계약대로 표시하고 Native 동작은 유지하도록 구현한다.
- [x] 1.3 가장 가까운 Storybook interaction 검증에 상태선·배경·정렬·접근성·Read 성공과 실패 증거를 추가하고 기존 Relay unit 회귀를 확인한다.
- [x] 1.4 관련 Storybook, unit, Web E2E, Relay와 TypeScript 검증을 실행하고 strict OpenSpec validation과 최종 diff 범위 점검을 완료한다.
