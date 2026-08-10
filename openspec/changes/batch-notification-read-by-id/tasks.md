## 1. PROD-703 지정 Notification ID 일괄 Read API

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-703`

**Deliverable**

로그인 Account가 기존 `markNotificationRead`에 지정한 0개 이상의 Notification ID 중 접근 가능한 visible Notification만 한 요청으로 멱등적으로 Read 처리하고, 처리 대상 Notification과 영향받은 Recipient Profile의 서버 권위 상태를 배열 payload로 받을 수 있다. 기존 단건 활성화 소비자는 같은 계약에 단일 ID 배열을 전달한다.

**Guardrails**

- 기존 mutation 이름은 유지하고 scalar `id` 입력과 단일 객체 payload를 병행하는 compatibility path를 추가하지 않는다.
- Notification이 아닌 ID, missing, membership이 없는 Profile의 ID와 hidden ID는 존재나 제외 이유를 노출하지 않고 조용히 제외한다.
- 빈 입력과 모든 ID가 제외된 입력은 성공한 no-op이며, 중복·반복·동시 요청은 최초 `readAt`을 보존한다.
- 입력하지 않은 Notification을 처리 대상으로 확장하지 않고, database 실패 시 일부 write만 남기지 않는다.
- 목록·Node·Unread count와 같은 concrete Notification type, membership 및 source visibility 경계를 적용하고 count는 서버 상태로 계산한다.
- DB schema·migration·저장 counter·새 dependency·Fedify 동작은 변경하지 않는다.

**Verification**

- 지정한 복수 visible ID, 중복·반복·동시 요청, 여러 Recipient Profile, empty/all-excluded no-op, wrong typename·missing·membership 없음·hidden 제외, 입력 밖 보존, 최초 `readAt`, 원자성과 visible Unread count를 API 통합 수준에서 확인한다.
- 공개 GraphQL schema와 runtime resolver가 일치하고 repository의 기존 직접 호출자와 단건 활성화 흐름이 `{ ids: [id] }`, `notifications`, `recipientProfiles` 계약을 사용하는지 확인한다.
- Relay compiler, 관련 app 단위 검증, API schema lint와 대상 API 통합 검증을 통과시킨다.
- 테스트 코드 범위: `apps/api/tests/integration/graphql/notification.test.ts`의 batch Read 계약과 기존 Notification Read 직접 호출 테스트, `NotificationListItem` 단건 활성화의 배열 input·payload 수렴을 직접 검증하는 최소 기존 테스트 영역.
- 테스트 필요성: 권한·visibility 정보 비노출, input 밖 보존, 멱등성·동시성·원자성, 최초 `readAt` 및 Profile별 서버 count와 breaking schema/consumer 정합성을 증명해야 한다.
- 테스트 제외 범위: 관련 없는 Notification 생성·전달·cleanup 조합, coverage 확대, 새 범용 fixture/helper/harness, 광범위한 snapshot·Storybook interaction test와 테스트 인프라 변경.

- [x] 1.1 `markNotificationRead`의 공개 input과 payload를 지정 ID 배열 계약으로 바꾸고 visible 대상의 원자적·멱등적 Read 및 서버 권위 Profile count 결과를 구현한다.
- [x] 1.2 기존 단건 활성화와 repository의 직접 GraphQL 호출자를 `{ ids: [id] }` 및 배열 payload 계약으로 정렬하고 Relay 생성 결과를 갱신한다.
- [x] 1.3 지정 ID 처리·조용한 제외·no-op·입력 밖 보존·멱등성·동시성·원자성·Profile별 count를 직접 증명하는 최소 API 및 client 회귀 검증을 추가한다.
- [x] 1.4 schema/runtime 정합성, Relay 생성, 대상 API 통합 테스트, 관련 app 검증과 repository consumer inventory를 통과시키고, PROD-703 구현 변경과 공유 PROD-679 canonical 계약 선반영이 구분되는지 확인한다.

## 2. PROD-679 Web 현재 로드된 Notification 모두 읽음

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/design/page-header.md`
- `docs/design/colors.md`
- `docs/design/breakpoints.md`
- `PROD-679`
- `PROD-703`

**Deliverable**

Web `/notifications` 사용자는 `모두 읽음` action으로 클릭 시점에 현재 Relay connection에 로드된 unread Notification만 한 번에 Read 처리하고, 목록을 유지한 채 처리된 item의 강조와 전역 인디케이터를 서버 payload에 맞게 수렴시킬 수 있다.

**Guardrails**

- `<768px` 모바일 Web에서는 `UniversalShell` app bar가, compact/full Web에서는 route `PageHeader`가 action을 소유하며 Android/iOS에는 추가하지 않는다.
- action 문구는 `모두 읽음`을 유지하고, current connection의 loaded unread가 없거나 요청 중이면 disabled 상태와 접근성 상태를 함께 제공한다.
- 추가 page를 선행 fetch하거나 서버 전체 unread로 범위를 확장하거나 단건 mutation을 반복 호출하지 않는다.
- 성공 payload의 Notification·Recipient Profile Node를 정규화하고, client-side count 산술·optimistic update·성공 뒤 추가 refetch를 사용하지 않는다.
- 처리한 item은 목록에 남으며, loaded unread가 모두 처리돼도 아직 로드하지 않은 unread가 있으면 서버 count와 전역 인디케이터가 0이 아닐 수 있다.
- PROD-682의 Android/iOS pull-to-refresh 연결은 이 task group에 포함하지 않는다.

**Verification**

- Storybook에서 loaded-unread, loaded-zero, loading과 failure 상태의 action, pending·disabled·접근성 상태와 레이아웃 소유권을 확인한다.
- Web E2E에서 현재 로드된 복수 unread의 단일 batch 요청, 목록 유지, 강조 제거, 입력에 없는 Notification 보존, 재시도와 서버 count·전역 인디케이터 수렴을 확인한다.
- PROD-703·PROD-679 두 slice의 완료 뒤 canonical 문서, delta spec, active decision과 구현이 일치하고 전체 OpenSpec strict validation이 통과하는지 확인한다.
- 테스트 코드 범위: 기존 React Native Web Storybook의 `모두 읽음` 상태 fixture와 `apps/web/e2e/notifications.e2e.ts`의 current-loaded batch Read 사용자 흐름.
- 테스트 필요성: 페이지에 보이는 현재 unread만 처리한다는 입력 경계, 중복 요청 방지, 실패 시 기존 상태 보존, 목록 유지와 non-zero일 수 있는 서버 count 수렴을 실제 Web 흐름에서 증명해야 한다.
- 테스트 제외 범위: Android/iOS runtime QA, PROD-682 pull-to-refresh, 추가 pagination 조합, 관련 없는 Notification 종류별 시각 snapshot, 새 E2E harness와 테스트 인프라 변경.

- [ ] 2.1 Web `/notifications`의 shell·header 소유권에 맞춰 current connection의 loaded unread만 처리하는 `모두 읽음` action과 pending·disabled·접근성 상태를 구현한다.
- [ ] 2.2 성공 payload로 item과 Recipient Profile을 정규화하고 실패 시 기존 상태를 유지해 목록 강조와 전역 인디케이터가 서버 상태로 수렴하게 한다.
- [ ] 2.3 loaded-unread, loaded-zero, loading과 failure Storybook 상태를 추가하고 Web 레이아웃·접근성 계약을 확인한다.
- [ ] 2.4 현재 로드된 복수 unread 처리, 입력 밖 Notification 보존, 목록 유지, 실패·재시도와 서버 count 수렴을 Web E2E로 검증한다.
- [ ] 2.5 두 구현 slice와 canonical·Linear·OpenSpec 정합성 및 전체 검증 결과를 확인하고, 모든 task가 완료된 뒤 PROD-679 책임으로 change를 archive한다.
