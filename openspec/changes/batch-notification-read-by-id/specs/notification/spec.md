## MODIFIED Requirements

### Requirement: Idempotent Notification Read와 visible Unread count

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-703` — API는 로그인 Account가 지정한 0개 이상의 Notification ID 중 권한이 있는 Recipient Profile의 visible Notification만 멱등적으로 Read로 전환하고, 성공 payload에서 처리 대상 Notification과 영향받은 Recipient Profile의 visible Unread count를 일관되게 반환해야 한다(MUST).

#### Scenario: 지정한 여러 Notification 최초 Read

- **WHEN** membership이 있는 Account가 `markNotificationRead(input: { ids })`로 `readAt = null`인 visible item A와 B의 ID를 전달한다
- **THEN** API는 A와 B의 `readAt`에 최초 Read 시각을 한 번 기록한다
- **AND** 각 Recipient Profile의 visible `unreadNotificationCount`는 실제 전이 결과와 일치한다
- **AND** `MarkNotificationReadPayload.notifications`는 처리 대상 A와 B를, `recipientProfiles`는 영향받은 Profile을 중복 없이 반환한다

#### Scenario: 반복 Read와 중복 입력

- **WHEN** 같은 Account가 같은 visible item ID를 한 입력에 중복해 전달하거나 이미 Read인 visible item ID로 `markNotificationRead`를 다시 호출한다
- **THEN** API는 각 visible item을 결과에 한 번만 포함한 성공한 idempotent 결과를 반환한다
- **AND** 최초 `readAt`과 Unread count를 변경하지 않는다

#### Scenario: 동시 Read

- **WHEN** 같은 Unread item ID를 포함한 둘 이상의 Read 요청이 동시에 도착한다
- **THEN** 시스템은 하나의 Unread-to-Read 전이만 반영한다
- **AND** 모든 성공 응답은 보존된 최초 `readAt`과 일관된 visible Unread count를 관찰한다

#### Scenario: 처리할 수 없는 입력 ID 제외

- **WHEN** 로그인 Account가 존재하지 않거나 Notification이 아니거나 Recipient Profile membership이 없거나 현재 hidden인 ID를 visible Notification ID와 함께 전달한다
- **THEN** API는 처리할 수 없는 ID를 조용히 제외하고 visible Notification만 Read 처리한다
- **AND** payload와 GraphQL error는 제외한 ID의 존재 여부나 제외 이유를 노출하지 않는다
- **AND** 제외한 Notification의 `readAt`과 count는 변경되지 않는다

#### Scenario: 빈 입력과 모든 ID 제외

- **WHEN** 로그인 Account가 빈 `ids`를 전달하거나 모든 입력 ID가 처리 대상에서 제외된다
- **THEN** API는 성공한 no-op으로 빈 `notifications`와 빈 `recipientProfiles`를 반환한다
- **AND** Notification과 Unread count를 변경하지 않는다

#### Scenario: 입력하지 않은 Notification 보존

- **WHEN** 요청에 포함되지 않은 unread Notification이 이미 존재하거나 요청 처리 중 새로 생성된다
- **THEN** API는 해당 Notification을 Read 처리하지 않는다
- **AND** 서버는 입력 ID를 요청 시점의 전체 visible unread 집합으로 확장하지 않는다

#### Scenario: 여러 Recipient Profile 결과

- **WHEN** Account가 membership을 가진 둘 이상의 Recipient Profile에 속한 visible Notification ID를 한 요청에 명시적으로 전달한다
- **THEN** API는 각 visible Notification을 처리하고 영향받은 `recipientProfiles`를 Profile별 한 번씩 반환한다
- **AND** 각 Profile의 `unreadNotificationCount`는 그 Profile의 서버 상태와 일치한다

#### Scenario: 인증되지 않은 Read

- **WHEN** 인증되지 않은 요청이 `markNotificationRead`를 호출한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

#### Scenario: Read 처리 실패의 원자성

- **WHEN** 지정 Notification을 Read로 전환하는 database 처리가 실패한다
- **THEN** API는 오류를 반환하고 입력 목록의 일부 Notification만 변경된 상태를 남기지 않는다

#### Scenario: visible count 계산

- **WHEN** API가 `unreadNotificationCount`를 계산한다
- **THEN** Recipient Profile 자체가 API에 visible하고 kind별 source가 존재하며 source에서 파생한 Recipient가 저장 Recipient와 일치하고, 해당 kind에 필요한 Related Profile과 Related Post의 Recipient 기준 visible predicate와 `read_at IS NULL`을 만족하는 item만 센다
- **AND** connection에서 숨긴 item을 count에 포함하지 않는다

### Requirement: Unavailable Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-703` — 시스템은 Recipient Profile 자체가 API에 노출되지 않거나 kind별 source가 없거나 source에서 파생한 Recipient가 저장 Recipient와 일치하지 않거나, 해당 kind에 필요한 Related Profile 또는 Related Post를 Recipient Profile 기준으로 조회할 수 없는 Notification을 모든 API 표면에서 존재하지 않는 것으로 취급해야 한다(MUST).

#### Scenario: unavailable item connection과 count

- **WHEN** Recipient Profile 자체가 API에 노출되지 않거나 기존 Follow Notification의 source가 없거나 source Followee가 저장 Recipient와 다르거나 Follower Profile을 Recipient가 조회할 수 없다
- **THEN** API는 item을 connection에서 제외하고 Unread여도 `unreadNotificationCount`에 포함하지 않는다
- **AND** filtering은 page limit 전에 SQL에서 적용된다

#### Scenario: unavailable item Node와 Read

- **WHEN** 요청이 unavailable item ID를 Node 또는 `markNotificationRead(input: { ids })`에 전달한다
- **THEN** Node는 `null`을 반환하고 Read mutation은 해당 ID를 결과에서 조용히 제외한다
- **AND** 저장된 `readAt`은 변경되지 않으며 Read 응답은 item의 존재나 제외 이유를 노출하지 않는다

#### Scenario: cleanup 전 저장 상태

- **WHEN** unavailable item의 비동기 cleanup이 아직 실행되지 않았다
- **THEN** database row와 기존 Read 상태는 남을 수 있다
- **AND** cleanup 전에 visibility가 회복되면 item은 기존 Read 상태로 다시 visible해질 수 있다

#### Scenario: generic fallback 금지

- **WHEN** item이 unavailable이다
- **THEN** API와 client는 `profile: null` Follow item, 이름·handle snapshot 또는 type-only generic item을 반환·표시하지 않는다
- **AND** client는 서버가 반환한 page나 count를 unavailable 기준으로 다시 필터링하지 않는다

#### Scenario: 후속 비동기 삭제 경계

- **WHEN** source가 없거나 Recipient와 일치하지 않거나 Related Profile이 Recipient 기준으로 unavailable인 item의 장기 물리 정리를 설계한다
- **THEN** 원인별 event, queue 또는 scan, worker, retry와 허용 지연은 별도 `PROD-328` OpenSpec이 소유한다
- **AND** Recipient Profile 자체의 일시 비활성화·정지가 물리 삭제 원인인지도 `PROD-328`이 결정한다
- **AND** 이번 capability의 구현 task와 archive gate에는 포함하지 않는다

### Requirement: Selected Profile Follow Notification 목록 UI

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/colors.md`, `PROD-277`, `PROD-372`, `PROD-541`, `PROD-680`, `PROD-703` — 클라이언트는 selected Profile의 visible Follow Notification을 모바일과 Web에서 같은 단일 목록으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST).

#### Scenario: 단일 Follow item 표시와 Profile link

- **WHEN** selected Profile의 connection이 Related Profile 한 명을 가진 visible Follow Notification을 반환한다
- **THEN** 목록은 Figma Like 알림 행처럼 왼쪽 28px kind icon과 오른쪽 콘텐츠 column을 같은 상단선에 두고, 콘텐츠 첫 Avatar row에 28px initials Avatar와 상대 시각을 배치한 뒤 `OOO님이 팔로우했습니다` 문구를 그 아래에 표시한다
- **AND** Avatar와 본문은 `Profile.relativeHandle`의 Profile route를 가리키는 link다
- **AND** inline 맞팔로우, 빈 action 영역, snippet, image avatar와 복수 사용자 aggregation을 만들지 않는다

#### Scenario: 알림 화면 header와 단일 목록

- **WHEN** 사용자가 `/notifications` 화면을 연다
- **THEN** 화면은 `알림` 제목을 표시하고 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** `알림 설정 (준비 중)` 또는 같은 의미의 설정 진입 control을 접근성 트리에 button이나 다른 interactive element로 노출하지 않는다
- **AND** 설정 control 없이도 mobile과 Web에서 제목의 정렬과 header 간격을 유지한다
- **AND** `모두`·`멘션` 탭, 단독 `모두` section heading과 날짜별 heading을 표시하지 않는다

#### Scenario: Read와 Unread 표시

- **WHEN** Follow item의 `readAt`이 `null`이다
- **THEN** Web item은 토큰 기반의 분명한 좌측 상태선, 은은한 배경과 접근성 Unread 상태를 제공한다
- **AND** `readAt`이 존재하면 Web item은 Unread 좌측 상태선·배경 강조·접근성 Unread 상태를 제공하지 않는다
- **AND** Web pointer hover 중에는 기존 `surface` 배경을 사용하며 Unread item의 좌측 상태선은 유지한다
- **AND** hover가 없는 native 화면은 Read 상태와 관계없이 `card` 기본 배경을 유지한다

#### Scenario: Profile 이동과 Read side effect 분리

- **WHEN** 사용자가 Follow item의 Avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 Related Profile navigation을 즉시 시작한다
- **AND** Read mutation의 pending, 실패 또는 재시도는 navigation을 지연, 취소 또는 되돌리지 않는다
- **AND** client Read mutation과 Unread count cache 갱신은 `PROD-372`가 소유한다

#### Scenario: 성공 payload 기반 item과 Recipient count 동기화

- **WHEN** Avatar 또는 본문 link activation에서 `{ ids: [id] }`로 시작한 Read mutation이 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** 클라이언트는 payload가 반환한 ID를 기준으로 item의 `readAt`과 정확한 Recipient Profile의 `unreadNotificationCount`를 Relay cache에 정규화한다
- **AND** 성공한 `readAt` 정규화로 item의 Unread 시각·접근성 상태를 제거하고 count가 0이면 기존 전역 알림 인디케이터도 제거한다
- **AND** 현재 selected Profile을 cache target으로 다시 추론하거나 client-side count 산술, optimistic update와 성공 뒤 추가 refetch를 수행하지 않는다
- **AND** 같은 Unread item에 대한 반복 activation 또는 동시 Read의 성공 payload는 서버가 보존한 동일 `readAt`과 일관된 visible Unread count를 반환하며, 어떤 순서로 적용되어도 같은 item/Recipient record로 수렴하고 다른 Profile cache를 변경하지 않는다

#### Scenario: client Read 실패와 수렴

- **WHEN** navigation과 독립적으로 시작한 Read mutation이 pending이거나 실패한다
- **THEN** 클라이언트는 navigation을 유지하고 item 또는 count cache를 보정하지 않는다
- **AND** cached `readAt = null`인 동안 item의 Unread 시각·접근성 상태를 유지한다
- **AND** 앱 수준 자동 retry나 오류 UI를 추가하지 않으며 이후 activation 또는 refetch에서 서버 source of truth로 수렴한다

#### Scenario: Initial loading, error와 empty

- **WHEN** selected Profile 목록의 첫 query가 진행 중이거나 실패하거나 visible edge 없이 성공한다
- **THEN** 화면은 각 상태에 맞는 loading, 안전한 한국어 error와 retry, empty UI를 구분해 표시한다
- **AND** backend error 원문이나 unavailable generic fallback을 표시하지 않는다

#### Scenario: Native refresh와 다음 page

- **WHEN** 사용자가 native pull-to-refresh를 실행한다
- **THEN** 클라이언트는 selected Profile query를 다시 가져온다
- **AND** Web은 별도 in-app refresh control을 표시하지 않고 browser의 표준 document reload를 사용한다
- **AND** 다음 page는 20개 단위 Relay connection으로 요청하고 요청 중 중복 호출을 막는다
- **AND** 다음 page가 실패하면 기존 item을 유지하고 같은 위치에서 재시도할 수 있다
- **AND** route state가 edge를 수동 병합하거나 client-side filtering하지 않는다

#### Scenario: selected Profile 전환

- **WHEN** 사용자가 Recipient Profile A에서 B로 selected Profile을 전환한다
- **THEN** actor별 Relay Environment와 Store가 바뀌고 목록은 Profile B를 target으로 다시 조회한다
- **AND** Profile A의 edge, loading, error 또는 pagination 상태를 Profile B 목록에 재사용하지 않는다

### Requirement: Selected Profile Web Notification Unread 시각 상태

**Authority / Provenance:** `docs/design/colors.md`, `docs/design/accessibility.md`, `PROD-680`, `PROD-703` — 클라이언트는 selected Profile의 Web 알림 목록에서 visible Notification item의 Read와 Unread 상태를 시각·접근성 정보로 일관되게 구분해야 한다(MUST).

#### Scenario: Web Unread 기본 표시

- **WHEN** Web 알림 목록의 visible Notification item이 `readAt = null`이고 pointer hover 중이 아니다
- **THEN** item은 토큰 기반의 분명한 좌측 상태선과 은은한 배경으로 Unread임을 표시한다
- **AND** 기존 접근성 Unread 설명을 함께 제공해 상태를 색만으로 전달하지 않는다
- **AND** 텍스트, icon과 link는 배경 강조와 독립적으로 기존 가독성과 상호작용을 유지한다

#### Scenario: Web Read 기본 표시

- **WHEN** Web 알림 목록의 visible Notification item에 `readAt`이 존재하고 pointer hover 중이 아니다
- **THEN** item은 Unread 좌측 상태선과 배경 강조를 표시하지 않는다
- **AND** 접근성 Unread 설명을 제공하지 않는다
- **AND** Read와 Unread 전환 전후에 item 콘텐츠의 수평 정렬이 움직이지 않는다

#### Scenario: Web pointer hover

- **WHEN** pointer가 Web 알림 목록 item 위에 있다
- **THEN** item은 기존 `surface` hover 배경을 제공한다
- **AND** item이 Unread이면 좌측 상태선을 유지하고 Read이면 Unread 상태선을 표시하지 않는다

#### Scenario: activation Read 성공과 전역 인디케이터 수렴

- **WHEN** 사용자가 Unread item의 link를 활성화하고 `{ ids: [id] }` Read mutation이 갱신된 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** link navigation은 Read 응답과 독립적으로 즉시 진행된다
- **AND** Relay는 payload ID를 기준으로 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** item의 Unread 시각·접근성 상태가 제거되고 count가 0이면 기존 전역 알림 인디케이터도 사라진다

#### Scenario: activation Read pending 또는 실패

- **WHEN** 사용자가 Unread item의 link를 활성화했지만 Read mutation이 pending이거나 실패한다
- **THEN** link navigation은 유지된다
- **AND** client는 item과 count cache를 보정하지 않으며 cached `readAt = null`인 동안 Unread 시각·접근성 상태를 유지한다

## ADDED Requirements

### Requirement: 현재 로드된 Web Notification 일괄 Read action

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/design/page-header.md`, `docs/design/colors.md`, `docs/design/breakpoints.md`, `PROD-703`, `PROD-679` — Web `/notifications`는 현재 Relay connection에 로드된 unread Notification만 지정 ID 일괄 Read로 처리하는 `모두 읽음` action을 제공하고, 서버 payload로 목록과 전역 인디케이터를 수렴시켜야 한다(MUST).

#### Scenario: Web header action 소유권

- **WHEN** 사용자가 Web `/notifications`를 연다
- **THEN** `<768px` 모바일 Web에서는 `UniversalShell` app bar가, compact/full Web에서는 route의 `PageHeader`가 `모두 읽음` trailing text action을 렌더링한다
- **AND** Android/iOS 화면에는 이 action을 렌더링하지 않는다

#### Scenario: action enabled와 pending 상태

- **WHEN** 현재 Relay connection에 loaded unread Notification이 하나 이상 있고 Read 요청이 pending이 아니다
- **THEN** `모두 읽음` action은 활성화된다
- **AND** loaded unread가 없거나 요청 중이면 disabled와 접근성 disabled 상태를 함께 제공하고 중복 요청을 시작하지 않는다

#### Scenario: 현재 로드된 unread ID만 처리

- **WHEN** 사용자가 `모두 읽음`을 활성화한다
- **THEN** 클라이언트는 클릭 시점의 current Relay connection에서 `readAt = null`인 loaded Notification ID만 수집해 `markNotificationRead(input: { ids })`를 한 번 호출한다
- **AND** 아직 로드하지 않았거나 요청 이후 새로 도착한 Notification을 입력에 포함하지 않는다
- **AND** 처리 범위를 넓히기 위한 추가 page fetch나 client의 단건 Read 반복 호출을 수행하지 않는다

#### Scenario: 일괄 Read 성공과 서버 count 수렴

- **WHEN** `모두 읽음` 요청이 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** Relay는 반환된 Node ID를 기준으로 처리된 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** 처리된 item은 목록에 남고 Unread 시각·접근성 강조만 제거된다
- **AND** 아직 처리하지 않은 unread Notification이 있으면 전역 인디케이터는 0이 아닌 서버 count를 계속 표시할 수 있다
- **AND** 현재 loaded unread가 모두 처리됐으면 전역 인디케이터가 남아 있어도 action은 disabled 상태가 될 수 있다

#### Scenario: 일괄 Read pending 또는 실패

- **WHEN** `모두 읽음` 요청이 pending이거나 실패한다
- **THEN** 클라이언트는 item과 count cache를 낙관적으로 보정하지 않는다
- **AND** 실패한 요청 전의 Unread 강조와 전역 인디케이터를 유지하고 사용자가 다시 시도할 수 있게 한다

#### Scenario: Web 상태와 수직 검증

- **WHEN** Web 구현을 독립적으로 검증한다
- **THEN** Storybook은 loaded-unread, loaded-zero, loading과 failure 상태를 구분한다
- **AND** Web E2E는 현재 로드된 복수 unread의 일괄 Read, 목록 유지, 강조 제거, 입력에 없는 Notification 보존과 전역 인디케이터의 서버 count 수렴을 검증한다
