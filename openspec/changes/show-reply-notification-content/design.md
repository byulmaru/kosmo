## Context

PROD-884는 표시 전용 `NotificationListItemView`와 Relay 기반 `ReplyNotificationPost` 및 Storybook 계약을 만들었지만 Production 목록은 종류별 Relay adapter가 private legacy 행을 렌더링한다. Production 연결은 기존 Notification pagination·Read mutation·actor Store, Post content/privacy 정책과 Post action/reply/media provider 수명을 유지해야 한다.

## Goals / Non-Goals

**Goals:**

- 종류별 Notification fragment와 기존 서버 정책을 유지하면서 승인된 공용 presentation을 실제 목록에 연결한다.
- Reply Post의 본문·Content Warning·미디어·Quote·Action Bar와 목록용 popup Reply composer를 기존 Post 경계로 재사용한다.
- navigation/media open과 Best Effort Read를 결속하고 내부 control의 중복 navigation·Read를 막는다.
- loading과 실제 Production Storybook을 새 동적 행 구조에 맞춘다.

**Non-Goals:**

- Notification grouping, 생성 lifecycle, API/schema, database 또는 unavailable 정책 변경
- 새 Notification 전용 composer·media viewer·Content Warning 정책이나 popup lifecycle
- Mention 또는 다른 Future Notification kind

## Implementation Guidance

### Current Constraints

- `NotificationListItem.tsx`의 다섯 adapter가 종류별 Relay fragment와 단건 Read mutation의 실제 연결 경계다. private `NotificationRow`만 legacy 28px filled kind icon·분리된 Avatar/body link를 소유한다.
- `NotificationListItemView`는 표시 전용이며 grouping, mutation과 Relay cache를 소유하지 않는다. Reply variant는 `children`과 `unread`만 받아 바깥 Link를 만들지 않는다.
- `ReplyNotificationPost`는 `PostBody`, `PostSourcePreview`, `PostActionSurface`, `usePostReplySurface`를 사용하므로 Post action 인증, selected Profile 기반 목록 Reply coordinator와 media viewer host가 필요하다. 현재 Notification 목록 상위에는 이 provider 묶음이 없다.
- Reply 내부에는 Profile link, Post detail link, body navigation, media viewer, Content Warning과 Action Bar가 공존한다. 바깥 capture handler나 Link wrapper는 nested navigation과 Read 중복을 만든다.
- API는 Reply·Reaction·Repost의 visible Post를 이미 제공하고 unavailable item을 page limit 전에 숨긴다. client fallback이나 새 API field로 이 정책을 다시 구현할 필요가 없다.

### Recommended Approach

종류별 Relay adapter와 list dispatcher는 유지하고 각 adapter가 공용 presentation에 필요한 한 명의 actor, target과 Post preview를 투영하게 한다. 단건 Read commit은 같은 connected 경계에 남겨 non-Reply의 단일 target callback과 Reply의 명시적인 Profile/detail/body/media activation callback에서 호출한다.

Reply adapter는 `NotificationListItemView kind="reply"` 안에 `ReplyNotificationPost`를 합성한다. Reply Post에는 현재 consumer가 필요한 하나의 activation callback만 추가하고 Profile/detail/body/media open에서 호출하되 Content Warning·Action Bar·composer에는 연결하지 않는다. 바깥 event capture나 Notification Link wrapper는 추가하지 않는다.

Notification 목록의 selected Profile fragment에 기존 Reply composer Profile fragment를 spread하고, Post 목록이 사용하는 action authentication, `owner="list"` Reply coordinator와 media viewer host 조합을 목록 수명에 둔다. 이 조합은 Reply action을 기존 popup modal로 연결하므로 새 composer 구현이 필요 없다.

Reaction·Repost adapter는 기존 Post fragment에서 body text, Content Warning document와 media를 조회해 공용 preview 입력으로 전달한다. grouping은 서버 입력이 없으므로 각 item에 한 actor만 전달한다. loading skeleton과 `KOSMO/Screens/Notifications/Catalog`의 실제 Relay fixture·interaction assertion을 새 geometry와 observable behavior에 맞춘다.

### Allowed Alternatives

- 단건 Read commit의 재사용은 같은 파일의 작은 hook 또는 connected wrapper로 둘 수 있다. presentation component가 Relay mutation을 소유하지 않고 한 target activation당 한 번만 실행되면 된다.
- Post provider 묶음은 selected Profile과 Notification 목록의 수명이 일치하는 가장 가까운 route 또는 list 경계에 둘 수 있다. 앱 전역 provider로 넓히지 않는다.

### Known Traps

- 종류별 adapter를 제거하면 fragment colocation, target URL과 Read cache 수렴 책임까지 잃는다.
- Reply 전체를 Link로 감싸거나 pointer event를 capture하면 Content Warning·media·Action Bar가 item navigation과 Read를 중복 실행한다.
- `ReplyNotificationPost` 대신 `PostListItem`을 사용하면 Notification reason·배치와 원글 미리보기 제외 계약이 깨진다.
- client에서 actor를 합치거나 unavailable Post용 generic 행을 만들면 현재 grouping 제외 범위와 서버 visibility 정책을 위반한다.
- target presentation Storybook만 통과해도 실제 `NotificationList`의 Relay·route·provider 연결은 증명되지 않는다.

## Risks / Trade-offs

- [Reply Post와 media로 행 높이·렌더 비용이 증가한다] → 기존 Post presentation과 `ScrollView` pagination을 유지하고 실제 Catalog 및 지원 runtime에서 긴 본문·미디어 목록을 확인한다.
- [명시적인 activation callback을 빠뜨리거나 두 번 호출할 수 있다] → 실제 navigation/media target별 interaction에서 mutation 요청 수와 target 동작을 함께 검증한다.
- [selected Profile 전환 뒤 modal/viewer 상태가 남을 수 있다] → provider 수명을 actor별 Notification 목록에 결속하고 전환 검증을 유지한다.
- [기존 active Notification spec의 legacy Follow 시각 계약과 충돌한다] → 이 change의 full modified requirement를 archive 시 active spec에 동기화한다.

## Migration Plan

1. 공용 presentation을 종류별 connected adapter와 Notification 목록 provider에 연결한다.
2. loading과 실제 Production Storybook fixture·interaction을 갱신하고 Relay compiler, typecheck, 관련 unit/Storybook test와 Web 시각 QA를 수행한다.
3. 지원 가능한 Web·iOS·Android runtime 증거를 각각 기록한다. 실행하지 못한 플랫폼은 완료로 일반화하지 않는다.
4. 문제가 생기면 API나 저장 데이터를 되돌리지 않고 Notification consumer 연결만 이전 legacy 행으로 복구할 수 있다.

## Open Questions

없음.
