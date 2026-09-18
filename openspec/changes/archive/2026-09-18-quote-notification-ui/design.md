<!-- 이번 세션의 작업 메모. 확정된 제품 계약이나 영구 구현 지침이 아니다. -->

## Current Constraints

- `NotificationListItemView`는 읽음·hover 배경과 divider를 소유한다. Reply의 작성자·시각·게시글 내용은
  자식이 소유해 wrapper에 같은 정보를 중복 전달하지 않는다.
- main schema에는 공용 `Notification`의 `id`·`readAt`과 `Post`가 있지만 Quote concrete type은 없다.
  PR #921은 2026-09-18 확인 시 open이며 base는 PROD-327이다. 이 변경을 PROD-953에 가져오지 않는다.
- 기존 `ReplyNotificationPost`는 24px 작성자, 게시글 본문·Source preview·Action Bar,
  미디어 viewer와 Reply composer를 조합한다. 이 책임을 Quote에서 불필요하게 복제하지 않는다.

## Practical Approach

2026-09-18 사용자가 확정한 표시 계약은 `docs/design/notifications.md`의 Quote 절에 기록했다.
이 작업 메모는 해당 계약을 요약하며, 구현 방식은 별도 Implement 세션에서 현재 코드에 맞춰 정한다.

1. 공용 kind rail의 Quote 종류 아이콘.
2. 24px 아바타와 작성자 이름·핸들·시각을 한 번만 표시하는 행.
3. 작성자 이름을 반복하지 않는 `회원님의 게시글을 인용했습니다` 이유 문구.
4. Quote 본문과 기존 Source preview, Quote에 대한 기존 Post Action Bar.

본문·시각의 주 이동 대상은 Quote 자체 canonical 상세다. 작성자 링크는 작성자 Profile로,
Source preview는 기존 Source 상세로 이동한다. 기존 CW 공개·Post action·composer control은 알림
이동이나 Read를 함께 실행하지 않는다. 이유 문구는 추가 이동 target으로 만들지 않는다.

UI 준비는 기존 `Notification`과 `Post` fragment를 받는 경계에서 할 수 있다. Storybook의 기존 Relay
mock network가 두 ref를 공급하고 실제 공용 읽음 mutation과 normalized store 변화를 검증하는 방안이다.
구체적인 서버 type과 관계 field를 흉내 낸 production schema는 추가하지 않는다. 실제 목록의 concrete
fragment 연결은 main의 서버 schema가 준비된 뒤 현재 계약에 맞춰 마무리한다.

## Alternatives and Traps

- [Mastodon 공식 문서](https://docs.joinmastodon.org/client/quotes/#new-notification-types)는 `quote`를
  별도 notification type으로 정의하고 `status`가 인용글을 가리킨다고 설명한다.
  [공식 Web 코드 snapshot](https://github.com/mastodon/mastodon/blob/4a7ad772cc9a47264c6aea79b74b0778baf1dc0d/app/javascript/mastodon/features/notifications_v2/components/notification_quote.tsx)은
  Quote 아이콘과 `{name} quoted your post` label을 사용한다. 이는 명시적인 이유 표시를 지지하는 비교 근거다.
- [X 공식 FAQ](https://help.x.com/en/using-x/repost-faqs)는 Quote의 Notifications 노출을 설명하지만
  현재 Quote 전용 문구·레이아웃을 확정할 근거로는 부족하다. 이전에 본 2021년 화면을 현재 계약으로 삼지 않는다.
- Reply에서 이유 문구가 제거됐다는 사실만으로 Quote에서도 이유를 제거하지 않는다.
- 작성자를 reason header와 Post header에 각각 표시하면 중복된다. 한 작성자 행과 이름 없는 이유 문구로
  구성하면 Quote가 수신된 이유와 누가 썼는지를 모두 전달할 수 있다.
- Source가 조회 불가인 알림을 클라이언트가 독자적으로 복원하거나 다른 알림 유형으로 분류하지 않는다.

## Risks / Limits

- mock 입력의 알림·게시글 연결은 fixture 경계다. 실제 서버의 Quote type, 알림 목록 조회,
  unavailable 판정과 Read 응답을 검증한 것으로 표현하지 않는다.
- Profile 전환의 기존 actor Environment를 재사용한다. 별도 stale-response 상태 기계를 추가하지 않는다.
- Light/Dark·모바일 폭·Storybook a11y는 Web 증거다. iOS/Android runtime과 Figma 반영은 별도다.
- 현행 CLI strict validator는 delta spec이 없는 change를 거부한다. 현재 저장소 schema는 specs를
  선택 사항으로 두므로, 검사를 통과시키기 위한 의미 없는 delta를 만들지 않고 archive에서
  `--skip-specs`를 사용한다. 실제 API 통합과 플랫폼별 runtime 증거는 Linear·PR의 남은 제한으로 보존한다.

## Open Questions

- 표시 계약의 미결정 사항은 없다. 확정한 이유 문구·배치·이동 대상을 다시 승인 질문으로 돌리지 않는다.
- OpenSpec lifecycle의 미결정 사항은 없다. 선택적 specs 정책에 따라 `--skip-specs`로 archive한다.
