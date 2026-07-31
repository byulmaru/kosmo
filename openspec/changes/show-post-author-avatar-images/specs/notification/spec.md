## MODIFIED Requirements

### Requirement: Selected Profile Follow Notification 목록 UI

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 클라이언트는 selected Profile의 visible Follow Notification을 모바일과 Web에서 같은 단일 목록으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST). 각 item의 Related Profile에 공개 Ready avatar URL이 있으면 28px 공용 Avatar로 실제 이미지를 표시하고 URL이 없으면 기존 이니셜 fallback을 표시해야 한다(MUST).

#### Scenario: 단일 Follow item 표시와 Profile link

- **WHEN** selected Profile의 connection이 Related Profile 한 명을 가진 visible Follow Notification을 반환한다
- **THEN** 목록은 Figma Like 알림 행처럼 왼쪽 28px kind icon과 오른쪽 콘텐츠 column을 같은 상단선에 두고, 콘텐츠 첫 Avatar row에 28px 공용 Avatar와 상대 시각을 배치한 뒤 `OOO님이 팔로우했습니다` 문구를 그 아래에 표시한다
- **AND** Avatar와 본문은 `Profile.relativeHandle`의 Profile route를 가리키는 link다
- **AND** inline 맞팔로우, 빈 action 영역, snippet과 복수 사용자 aggregation을 만들지 않는다

#### Scenario: Related Profile avatar image

- **WHEN** Follow Notification의 Related Profile에 공개 URL을 가진 Ready avatar가 있다
- **THEN** item의 28px 공용 Avatar는 해당 Profile의 실제 이미지를 표시한다

#### Scenario: Related Profile avatar initial fallback

- **WHEN** Follow Notification의 Related Profile에 avatar 관계가 없거나 공개 avatar URL을 제공할 수 없다
- **THEN** item의 28px 공용 Avatar는 같은 Profile의 표시 이름 또는 핸들 기반 기존 이니셜 fallback을 표시한다

#### Scenario: 알림 화면 header와 단일 목록

- **WHEN** 사용자가 `/notifications` 화면을 연다
- **THEN** 화면은 `알림` 제목과 최소 44px의 `알림 설정 (준비 중)` disabled control을 표시한다
- **AND** 설정 route가 추가되기 전에는 control이 navigation이나 임시 안내 action을 실행하지 않는다
- **AND** `모두`·`멘션` 탭, 단독 `모두` section heading과 날짜별 heading을 표시하지 않는다

#### Scenario: Read와 Unread 표시

- **WHEN** Follow item의 `readAt`이 `null`이다
- **THEN** item은 `card` 기본 배경과 접근성 Unread 상태를 제공한다
- **AND** `readAt`이 존재하면 같은 `card` 기본 배경을 사용하고 Unread 상태를 제공하지 않는다
- **AND** Web에서는 pointer hover 중인 item만 `surface` 배경으로 강조한다
- **AND** hover가 없는 native 화면은 Read 상태와 관계없이 `card` 기본 배경을 유지한다

#### Scenario: Profile 이동과 Read side effect 분리

- **WHEN** 사용자가 Follow item의 Avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 Related Profile navigation을 즉시 시작한다
- **AND** Read mutation의 pending, 실패 또는 재시도는 navigation을 지연, 취소 또는 되돌리지 않는다
- **AND** client Read mutation과 Unread count cache 갱신은 `PROD-372`가 소유한다

#### Scenario: 성공 payload 기반 item과 Recipient count 동기화

- **WHEN** Avatar 또는 본문 link activation에서 시작한 Read mutation이 `notification`과 `recipientProfile` payload로 성공한다
- **THEN** 클라이언트는 payload가 반환한 ID를 기준으로 item의 `readAt`과 정확한 Recipient Profile의 `unreadNotificationCount`를 Relay cache에 정규화한다
- **AND** 현재 selected Profile을 cache target으로 다시 추론하거나 client-side count 산술, optimistic update와 성공 뒤 추가 refetch를 수행하지 않는다
- **AND** 같은 Unread item에 대한 반복 activation 또는 동시 Read의 성공 payload는 서버가 보존한 동일 `readAt`과 일관된 visible Unread count를 반환하며, 어떤 순서로 적용되어도 같은 item/Recipient record로 수렴하고 다른 Profile cache를 변경하지 않는다

#### Scenario: client Read 실패와 수렴

- **WHEN** navigation과 독립적으로 시작한 Read mutation이 pending이거나 실패한다
- **THEN** 클라이언트는 navigation을 유지하고 item 또는 count cache를 보정하지 않는다
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

## ADDED Requirements

### Requirement: Reaction·Reply·Repost Notification Related Profile avatar presentation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, [PROD-588](https://linear.app/byulmaru/issue/PROD-588) — 클라이언트는 visible Reaction·Reply·Repost Notification item이 나타내는 Related Profile의 공개 Ready avatar URL이 있으면 기존 28px 공용 Avatar로 실제 이미지를 표시하고, URL이 없으면 같은 Profile의 기존 이니셜 fallback을 표시해야 한다(MUST).

#### Scenario: Related Profile avatar image by Notification subtype

- **WHEN** visible Reaction, Reply 또는 Repost Notification의 Related Profile에 공개 URL을 가진 Ready avatar가 있다
- **THEN** 각 item의 28px 공용 Avatar는 해당 item이 나타내는 Related Profile의 실제 이미지를 표시한다
- **AND** 한 Notification의 avatar URL을 다른 item의 Related Profile에 재사용하지 않는다

#### Scenario: Related Profile avatar fallback by Notification subtype

- **WHEN** visible Reaction, Reply 또는 Repost Notification의 Related Profile에 avatar 관계가 없거나 공개 avatar URL을 제공할 수 없다
- **THEN** 각 item의 28px 공용 Avatar는 같은 Profile의 표시 이름 또는 핸들 기반 기존 이니셜 fallback을 표시한다

#### Scenario: Preserve Notification subtype presentation contracts

- **WHEN** Reaction·Reply·Repost item이 실제 avatar 이미지 또는 이니셜 fallback을 표시한다
- **THEN** 기존 28px 크기, kind icon, 문구, Related Post 이동, Read mutation과 actor별 Relay cache 격리 계약을 유지한다
