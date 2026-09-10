## 1. PROD-811 Reply Notification content Production 연결

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/design/notifications.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다)
- [DSN-42](https://linear.app/byulmaru/issue/DSN-42/figma-notificationpost-presentation을-시각-리디자인한다)

**Deliverable**

Selected Profile의 실제 Notification 목록이 승인된 공용 presentation으로 Follow·FollowRequest·Reaction·Repost를 표시하고, Reply의 조회 가능한 본문·Content Warning·미디어·Quote·Action Bar와 기존 목록용 popup Reply composer를 제공한다. 승인된 이동·열기는 Best Effort Read와 독립적으로 함께 시작하고 내부 control은 item navigation·Read를 중복 실행하지 않는다.

PROD-811 구현 PR이 이 change의 client 구현, GraphQL/Relay·Web E2E·지원 플랫폼 통합 검증, canonical·active spec 최종 동기화와 archive를 소유한다.

**Guardrails**

- 종류별 Notification의 기존 Relay fragment, pagination, actor Store, 지정 ID Read와 unavailable filtering을 유지한다.
- FollowRequest target은 `/follow-requests`이며 client grouping이나 inline 수락·거절 control을 추가하지 않는다.
- Reply 전체를 바깥 Link나 event capture handler로 감싸지 않는다.
- Reply의 Content Warning·Action Bar·composer control은 Notification navigation·Read를 시작하지 않는다.
- 새 API/schema, dependency, Notification 전용 composer·media viewer·Content Warning 정책과 Future kind를 추가하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 `apps/app/src/stories/screens/Notifications.stories.tsx`의 Production Relay 목록 interaction과 `apps/web/e2e/notifications.e2e.ts`의 실제 route/Read 흐름 중 PROD-811 동작을 직접 증명하는 최소 시나리오. 기존 `apps/app/src/components/notification/NotificationListItem.test.ts`의 Relay Read normalization은 변경 없이 실행한다.
- 테스트 필요성: FollowRequest destination, Reply 본문·보호 상태·popup composer, Profile/detail/body/media activation당 Read 1회, Content Warning·Action Bar·composer의 navigation·Read 비실행, unread/hover와 dynamic height 회귀를 관찰 가능한 UI·GraphQL 요청으로 검증한다.
- 테스트 제외 범위: target presentation Storybook의 중복 시나리오, API/DB lifecycle coverage 확대, 새 fixture helper·test harness·snapshot·의존성, Notification grouping과 Future kind.
- 기존 API GraphQL integration test에서 Reply Notification의 visible `post`, unavailable filtering과 Read 제외가 유지되는지 확인하고, Relay compiler 결과로 Production query가 기존 Post fragment를 소비함을 검증한다. Server schema·resolver 동작을 바꾸지 않으므로 같은 동작의 새 API 테스트는 추가하지 않는다.
- Relay compiler, app check/test, Storybook static build와 실제 Web light/dark·compact/wide browser QA를 수행한다.
- iOS와 Android의 실제 `/notifications`에서 긴 Reply 본문·Content Warning·미디어 행이 clipping/overlap 없이 동적으로 늘어나고, Unread 접근성 label/state, Reply popup의 focus·dismiss, 첫 20개 목록 scroll과 단일 query가 유지되는지 플랫폼별로 확인한다. 실행하지 못한 플랫폼은 미검증으로 남기고 Web 결과로 대체하지 않는다.

- [x] 1.1 실제 Notification 목록에 공용 kind별 presentation과 승인된 target·Post preview를 연결하고 기존 pagination·Read·unavailable 결과를 유지한다.
- [x] 1.2 Reply Notification에 결과 Post content와 기존 Post action·media·목록용 popup composer를 연결하고 승인된 activation별 Read 및 내부 control 독립 동작을 구현한다.
- [x] 1.3 loading/error/empty와 selected Profile 전환 상태가 새 동적 Notification 행과 provider 수명에 맞게 동작하도록 정렬한다.
- [x] 1.4 기존 Production Notification Storybook과 Web E2E의 최소 interaction을 갱신해 Deliverable과 Guardrails를 직접 검증한다.
- [ ] 1.5 기존 GraphQL integration, Relay compiler, app check/test, Storybook static build와 Web browser 시각·상호작용 검증을 통과하고 iOS·Android의 dynamic height·접근성·popup·목록 성능 결과와 미검증 항목을 플랫폼별로 기록한다.
- [ ] 1.6 PROD-811 구현 PR에서 canonical 문서·Linear·delta spec과 구현 결과를 최종 대조하고 전체 완료 증거가 충족되면 active Notification spec 동기화와 change archive를 수행한다.

### 검증 기록 (2026-09-10)

- Web: Notification Story 27개, Notification Relay normalization unit 6개, 실제 Notifications E2E 3개, Notification GraphQL integration 28개, Relay compiler, app TypeScript, Storybook static build를 통과했다. Light/Dark wide와 390×844 compact에서 동적 행·CW·Reply popup·취소 후 focus 복귀를 실제 브라우저로 확인했다.
- iOS: 현재 환경에서 실제 `/notifications`를 실행하지 못했다. dynamic height·Unread 접근성·popup focus/dismiss·첫 20개 scroll/단일 query는 미검증이다.
- Android: 현재 환경에서 실제 `/notifications`를 실행하지 못했다. dynamic height·Unread 접근성·popup focus/dismiss·첫 20개 scroll/단일 query는 미검증이다.
