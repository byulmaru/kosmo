## MODIFIED Requirements

### Requirement: Selected Profile Follow Notification 목록 UI

**Authority / Provenance:** `docs/design/notifications.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/colors.md`, `PROD-277`, `PROD-372`, `PROD-541`, `PROD-680`, `PROD-703`, `PROD-811`, `PROD-884`, `PROD-930`, `DSN-42` — 클라이언트는 selected Profile의 visible Notification을 모든 지원 플랫폼에서 같은 단일 목록과 승인된 공용 Notification presentation으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST).

#### Scenario: 단일 Follow item 표시와 Profile link

- **WHEN** selected Profile의 connection이 Related Profile 한 명을 가진 visible Follow Notification을 반환한다
- **THEN** 목록은 48px kind rail의 32px `UserRoundPlus`, 28px Related Profile Avatar, 상대 시각과 `OOO님이 팔로우했습니다` 문구를 공용 Notification 행에 표시한다
- **AND** 행 전체는 `Profile.relativeHandle`의 Profile route를 가리키는 단일 link다
- **AND** inline 맞팔로우, 빈 action 영역, snippet 또는 client가 만든 복수 사용자 aggregation을 추가하지 않는다

#### Scenario: Follow Request 관리 화면 이동

- **WHEN** selected Profile의 connection이 visible Follow Request Notification을 반환한다
- **THEN** 목록은 Follow와 같은 행 구조에 `OOO님이 팔로우를 요청했습니다`를 표시한다
- **AND** 행 전체는 요청자 Profile이 아니라 `/follow-requests` 관리 화면으로 이동한다
- **AND** inline 수락·거절 control을 추가하지 않는다

#### Scenario: Reaction과 Repost Post 미리보기

- **WHEN** selected Profile의 connection이 visible Reaction 또는 Repost Notification과 조회 가능한 Related Post를 반환한다
- **THEN** 목록은 Related Profile 요약, 상대 시각, Post 본문 한 줄과 허용된 첫 미디어의 64×64 미리보기를 하나의 Post link에 표시한다
- **AND** Content Warning이 있으면 경고만 표시하고 본문과 미디어를 숨기며 sensitive media는 미리보기를 숨긴다
- **AND** client는 작성자 header, Action Bar 또는 새 Post 표시 정책을 추가하지 않는다

#### Scenario: Reply Post presentation

- **WHEN** selected Profile의 connection이 visible Reply Notification과 조회 가능한 결과 Reply Post를 반환한다
- **THEN** 목록은 Reply Author·상대 시각·알림 이유·본문·허용된 Content Warning과 미디어·Quote·공용 Post Action Bar를 하나의 Notification surface에 표시한다
- **AND** 원글 미리보기, 별도 알림 header 또는 받는 사람 목록을 추가하지 않는다
- **AND** Reply의 게시글 identity와 내부 link·control은 공용 Reply Post presentation이 소유하고 Notification wrapper는 unread surface와 divider만 소유한다

#### Scenario: 알림 화면 header와 단일 목록

- **WHEN** 사용자가 `/notifications` 화면을 연다
- **THEN** 화면은 `알림` 제목을 표시하고 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** `알림 설정 (준비 중)` 또는 같은 의미의 설정 진입 control을 접근성 트리에 button이나 다른 interactive element로 노출하지 않는다
- **AND** 설정 control 없이도 mobile과 Web에서 제목의 정렬과 header 간격을 유지한다
- **AND** `모두`·`멘션` 탭, 단독 `모두` section heading과 날짜별 heading을 표시하지 않는다

#### Scenario: Read와 Unread 표시

- **WHEN** visible Notification item의 `readAt`이 `null`이다
- **THEN** 각 지원 플랫폼의 item은 `actionPrimarySubtle` 배경, 4px `actionPrimaryBase` 좌측 상태선과 접근성 Unread 상태를 제공한다
- **AND** `readAt`이 존재하면 각 지원 플랫폼의 item은 Unread 좌측 상태선·배경 강조·접근성 Unread 상태를 제공하지 않는다
- **AND** Web pointer hover는 `stateHover`를 기존 배경 위에 겹쳐 Unread 배경과 좌측 상태선을 보존한다
- **AND** hover가 없는 native 화면도 Read/Unread 기본 표시와 접근성 상태를 유지한다

#### Scenario: Profile 이동과 Read side effect 분리

- **WHEN** 사용자가 Follow item의 단일 link를 활성화한다
- **THEN** 클라이언트는 Related Profile navigation과 `{ ids: [id] }` Best Effort Read를 각각 즉시 시작한다
- **AND** Read mutation의 pending, 실패 또는 재시도는 navigation을 지연, 취소 또는 되돌리지 않는다
- **AND** client Read mutation과 Unread count cache 갱신은 기존 지정 ID Read 계약을 유지한다

#### Scenario: 성공 payload 기반 item과 Recipient count 동기화

- **WHEN** item activation에서 `{ ids: [id] }`로 시작한 Read mutation이 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** 클라이언트는 payload가 반환한 ID를 기준으로 item의 `readAt`과 정확한 Recipient Profile의 `unreadNotificationCount`를 Relay cache에 정규화한다
- **AND** 성공한 `readAt` 정규화로 item의 Unread 시각·접근성 상태를 제거하고 count가 0이면 기존 전역 알림 인디케이터도 제거한다
- **AND** 현재 selected Profile을 cache target으로 다시 추론하거나 client-side count 산술, optimistic update와 성공 뒤 추가 refetch를 수행하지 않는다
- **AND** 같은 Unread item에 대한 반복 activation 또는 동시 Read의 성공 payload는 서버가 보존한 동일 `readAt`과 일관된 visible Unread count로 수렴하고 다른 Profile cache를 변경하지 않는다

#### Scenario: client Read 실패와 수렴

- **WHEN** navigation 또는 media open과 독립적으로 시작한 Read mutation이 pending이거나 실패한다
- **THEN** 클라이언트는 navigation 또는 media viewer를 유지하고 item이나 count cache를 보정하지 않는다
- **AND** cached `readAt = null`인 동안 item의 Unread 시각·접근성 상태를 유지한다
- **AND** 앱 수준 자동 retry나 오류 UI를 추가하지 않으며 이후 activation 또는 refetch에서 서버 source of truth로 수렴한다

#### Scenario: Initial loading, error와 empty

- **WHEN** selected Profile 목록의 첫 query가 진행 중이거나 실패하거나 visible edge 없이 성공한다
- **THEN** 화면은 새 Notification 행의 geometry와 각 상태에 맞는 loading, 안전한 한국어 error와 retry, empty UI를 구분해 표시한다
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
- **AND** Profile A의 edge, loading, error, pagination, Reply composer 또는 media viewer 상태를 Profile B 목록에 재사용하지 않는다

### Requirement: Follow Request Notification 목록과 requester Profile 활성화

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `docs/design/notifications.md`, `docs/design/page-header.md`, `PROD-321`, `PROD-811`, `DSN-42` — 목록은 requester Profile identity를 표시하되 item을 받은 요청 관리 화면의 target으로 활성화해야 한다(MUST).

클라이언트는 selected Profile의 visible `FOLLOW_REQUEST` Notification을 기존 단일 Notification 목록, Relay/cache scope와 서버 제공 Unread badge에 포함해야 하며(MUST), item 활성화는 `/follow-requests` 관리 화면으로 이동해야 한다(MUST).

#### Scenario: 목록 item 표시

- **WHEN** selected Profile이 수신한 visible Follow Request Notification이 목록 connection에 포함된다
- **THEN** 공용 Notification row의 kind 표현·상대 시각·Unread 표시 구조 안에 requester Profile identity와 팔로우 요청 의미를 표시한다
- **AND** requester Profile의 display/handle과 조회 가능한 avatar를 source에서 파생한다
- **AND** 받은 요청 목록의 별도 row, 승인·거절·취소 action 또는 inline 맞팔로우 control을 추가하지 않는다

#### Scenario: 받은 요청 관리 화면으로 활성화

- **WHEN** 사용자가 Follow Request Notification의 단일 item link를 활성화한다
- **THEN** 클라이언트는 `/follow-requests` 관리 화면으로 이동한다
- **AND** requester Profile route로 이동하거나 item 안에 별도 Profile navigation target을 만들지 않는다
- **AND** 기존 목록의 Best Effort Read mutation과 Profile별 Relay cache 갱신을 적용한다

#### Scenario: 목록과 Unread badge 통합

- **WHEN** selected Profile에 Follow Request Notification이 Unread 상태로 존재한다
- **THEN** 서버의 `unreadNotificationCount`가 기존 Notification 목록과 shell badge에 해당 item을 포함한다
- **AND** 클라이언트는 목록 길이나 숨겨진 item을 이용해 count를 임의로 재계산하지 않는다
- **AND** Profile 전환 시 다른 Profile의 item·count·badge가 노출되지 않는다

#### Scenario: 빈 목록 copy 범위

- **WHEN** 목록에 Follow Request Notification을 포함한 visible item이 하나도 없다
- **THEN** 기존 Notification empty state는 요청·팔로우 알림을 포함한 Notification 의미를 설명할 수 있다
- **AND** 받은 요청 관리 화면의 빈 상태나 승인 안내를 대신 표시하지 않는다

### Requirement: Selected Profile Notification Unread 시각 상태

**Authority / Provenance:** `docs/design/notifications.md`, `docs/design/colors.md`, `docs/design/accessibility.md`, `PROD-680`, `PROD-703`, `PROD-811`, `PROD-884`, `PROD-930`, `DSN-42` — 클라이언트는 selected Profile의 알림 목록에서 visible Notification item의 Read와 Unread 상태를 모든 지원 플랫폼에서 시각·접근성 정보로 일관되게 구분해야 한다(MUST).

#### Scenario: Unread 기본 표시

- **WHEN** 알림 목록의 visible Notification item이 `readAt = null`이고 pointer hover 중이 아니다
- **THEN** item은 `actionPrimarySubtle` 배경과 4px `actionPrimaryBase` 좌측 상태선으로 Unread임을 표시한다
- **AND** 접근성 Unread 설명을 함께 제공해 상태를 색만으로 전달하지 않는다
- **AND** 텍스트, icon과 link는 배경 강조와 독립적으로 기존 가독성과 상호작용을 유지한다

#### Scenario: Read 기본 표시

- **WHEN** 알림 목록의 visible Notification item에 `readAt`이 존재하고 pointer hover 중이 아니다
- **THEN** item은 Unread 좌측 상태선과 배경 강조를 표시하지 않는다
- **AND** 접근성 Unread 설명을 제공하지 않는다
- **AND** Read와 Unread 전환 전후에 item 콘텐츠의 수평 정렬이 움직이지 않는다

#### Scenario: Web pointer hover

- **WHEN** pointer가 Web 알림 목록 item 위에 있다
- **THEN** item은 기존 Read 또는 Unread 배경 위에 `stateHover` overlay를 제공한다
- **AND** item이 Unread이면 `actionPrimarySubtle` 배경과 좌측 상태선을 유지하고 Read이면 Unread 상태선을 표시하지 않는다

#### Scenario: activation Read 성공과 전역 인디케이터 수렴

- **WHEN** 사용자가 Unread item의 승인된 navigation 또는 media open target을 활성화하고 `{ ids: [id] }` Read mutation이 갱신된 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** navigation 또는 media open은 Read 응답과 독립적으로 즉시 진행된다
- **AND** Relay는 payload ID를 기준으로 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** item의 Unread 시각·접근성 상태가 제거되고 count가 0이면 기존 전역 알림 인디케이터도 사라진다

#### Scenario: activation Read pending 또는 실패

- **WHEN** 사용자가 Unread item의 승인된 navigation 또는 media open target을 활성화했지만 Read mutation이 pending이거나 실패한다
- **THEN** navigation 또는 media open은 유지된다
- **AND** client는 item과 count cache를 보정하지 않으며 cached `readAt = null`인 동안 Unread 시각·접근성 상태를 유지한다

### Requirement: Reply Notification GraphQL과 inbox 통합

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/design/notifications.md`, `docs/design/accessibility.md`, `docs/domain/objects/post.md`, `PROD-426`, `PROD-703`, `PROD-811`, `PROD-884`, `DSN-42` — API와 클라이언트는 visible Reply Notification을 기존 Notification interface·connection·Unread count·Read·badge/cache·inbox 계약에 통합하고, Recipient가 조회할 수 있는 결과 Reply의 공용 Post presentation을 제공해야 한다(MUST).

#### Scenario: Reply Notification concrete object·Node

- **WHEN** GraphQL schema가 Reply kind Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete `ReplyNotification` object로 resolve한다
- **AND** object는 Reply Author `profile`과 결과 Reply `post`를 제공한다
- **AND** concrete global ID로 Node를 조회할 때 row kind, Recipient membership과 visible predicate를 검증하고, 실패하면 다른 type으로 재시도하지 않고 `null`을 반환한다

#### Scenario: visible Recipient inbox의 Reply content

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox에서 visible Reply Notification을 조회한다
- **THEN** item은 결과 Reply Post의 작성자·상대 시각·알림 이유와 조회 가능한 본문·Content Warning·미디어·Quote를 기존 Post 표시 정책으로 제공한다
- **AND** Content Warning reveal, sensitive media와 media viewer는 공용 Post 정책을 재정의하지 않는다
- **AND** Reply Notification은 기존 connection 정렬·pagination과 Unread count에 포함된다

#### Scenario: Reply navigation과 Read side effect

- **WHEN** 사용자가 Reply item의 작성자 Profile link, 시각 또는 본문 Post link, 혹은 미디어 열기를 활성화한다
- **THEN** 클라이언트는 해당 navigation 또는 media viewer와 `{ ids: [id] }` Best Effort Read를 각각 즉시 시작한다
- **AND** 한 번의 target activation은 Read mutation을 한 번만 시작하며 Read pending·실패·재시도가 target 동작을 지연·취소·되돌리지 않는다
- **AND** Read 성공 payload는 item과 Recipient Profile Unread count를 같은 actor Relay Store에서 갱신한다

#### Scenario: Reply 내부 control의 독립 동작

- **WHEN** 사용자가 Reply item 안에서 Content Warning 공개, Action Bar 또는 열린 composer의 control을 활성화한다
- **THEN** 해당 control은 item navigation이나 Notification Read를 함께 시작하지 않고 자신의 공용 Post 동작만 수행한다
- **AND** control activation이 바깥 Notification target으로 전파돼 navigation 또는 Read를 중복 실행하지 않는다

#### Scenario: 기존 Reply popup composer 재사용

- **WHEN** selected Profile이 있는 사용자가 Reply item의 Action Bar에서 Reply control을 활성화한다
- **THEN** 기존 `owner="list"` Reply surface는 새 Notification 전용 UI 없이 공용 popup modal composer를 연다
- **AND** modal은 기존 focus, 닫기와 작성 취소 lifecycle을 유지한다
- **AND** 이 연결은 Reply 작성 정책·validation·mutation 또는 popup presentation을 재정의하지 않는다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 하나의 Recipient Profile inbox를 조회하거나 읽는다
- **THEN** 시스템은 대상 Profile의 Reply Notification, count, Read와 cache만 반환·갱신한다
- **AND** 다른 selected Profile의 item, badge, Reply composer 또는 Relay Store를 변경하지 않는다

#### Scenario: unavailable item

- **WHEN** source Reply가 없거나 Recipient·Parent·Author 관계가 저장 계약과 다르거나 Recipient 기준 Related Post 또는 Related Profile을 조회할 수 없다
- **THEN** API는 item을 page limit 전 connection과 Unread count에서 제외한다
- **AND** Node는 `null`을 반환하고 `markNotificationRead(input: { ids })`는 해당 ID를 조용히 제외하며 generic Notification 또는 client fallback으로 대신 노출하지 않는다
