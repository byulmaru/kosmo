## ADDED Requirements

### Requirement: Selected Profile Web Notification Unread 시각 상태

**Authority / Provenance:** `docs/design/colors.md`, `docs/design/accessibility.md`, `PROD-680` — 클라이언트는 selected Profile의 Web 알림 목록에서 visible Notification item의 Read와 Unread 상태를 시각·접근성 정보로 일관되게 구분해야 한다(MUST).

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

- **WHEN** 사용자가 Unread item의 link를 활성화하고 Read mutation이 갱신된 `notification`과 `recipientProfile` payload로 성공한다
- **THEN** link navigation은 Read 응답과 독립적으로 즉시 진행된다
- **AND** Relay는 payload ID를 기준으로 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** item의 Unread 시각·접근성 상태가 제거되고 count가 0이면 기존 전역 알림 인디케이터도 사라진다

#### Scenario: activation Read pending 또는 실패

- **WHEN** 사용자가 Unread item의 link를 활성화했지만 Read mutation이 pending이거나 실패한다
- **THEN** link navigation은 유지된다
- **AND** client는 item과 count cache를 보정하지 않으며 cached `readAt = null`인 동안 Unread 시각·접근성 상태를 유지한다

#### Scenario: Native 표시 유지

- **WHEN** 같은 Read 또는 Unread item을 Android나 iOS 알림 목록에서 표시한다
- **THEN** item은 Read 상태와 관계없이 기존 `card` 기본 배경을 유지한다
- **AND** PROD-680의 Web 좌측 상태선이나 배경 강조를 Native에 추가하지 않는다

## MODIFIED Requirements

### Requirement: Selected Profile Follow Notification 목록 UI

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/colors.md`, `PROD-277`, `PROD-372`, `PROD-541`, `PROD-680` — 클라이언트는 selected Profile의 visible Follow Notification을 모바일과 Web에서 같은 단일 목록으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST).

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

- **WHEN** Avatar 또는 본문 link activation에서 시작한 Read mutation이 `notification`과 `recipientProfile` payload로 성공한다
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
