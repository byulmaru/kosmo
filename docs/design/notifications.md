# Notification presentation

PROD-884는 `NotificationListItemView`와 `KOSMO/Patterns/Notification List Item` Storybook을
소유한다. 이 컴포넌트는 표시용 입력과 이동 callback을 받고, 기존 Notification runtime은 그대로 둔다.
PROD-811이 실제 목록 연결, Relay projection·그룹 집계, 읽음 처리, 권한과 navigation 통합을 소유한다.

## Canonical source

- [NotificationListItem 조합](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4048-10559)
- [Follow / FollowRequest](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4129-10681)
- [Reaction / Repost thumbnail](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=4327-11389)
- [Private NotificationRow](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1906-1129)

2026-09-07 readback과 DSN-42 최종 결정의 현재 kind는 Follow, FollowRequest, Reaction, Repost,
Reply다. Mention은 Future 표본이므로 public props와 Playground에 노출하지 않는다.

## 표시와 합성

- Follow/FollowRequest/Reaction/Repost는 48px kind rail 안에 32px 아이콘을 표시한다. 원형 배경을
  추가하지 않는다. 아바타는 28px, 겹침은 12px이고 전달된 순서의 최대 3개를 표시한다. 전체 actor 수는
  consumer 입력이며 컴포넌트에서 그룹을 만들지 않는다. invalid count는 전달된 actor 수 이상인 정수로
  정규화한다. Reply는 한 명만 허용한다.
- Follow는 프로필, FollowRequest는 `/follow-requests`가 Target destination이며 inline 수락 버튼은
  없다. 기존 runtime과 notification OpenSpec의 requester-profile 이동은 아직 교체하지 않는다.
  PROD-811에서 navigation 계약과 spec을 함께 정렬해야 한다.
- 일반 행은 최소 80px이며 긴 이름·문구에 맞춰 높이가 늘어난다. Reply header는 Web/iOS에서 44px,
  Android에서는 접근성 기준에 따라 48dp 최소 target을 유지한다. Web inset은 좌 12px·우 16px,
  Native는 좌우 8px, kind/content gap은 12px이다.
- Web Read 배경은 투명, Unread는 Figma가 사용하는 `actionPrimarySubtle`과 4px
  `actionPrimaryBase` rail이다. Hover는 `stateHover`, keyboard focus는 `stateFocusRing`이다.
  이는 unread 전용 semantic token 신설이 아니다. Native는 Default 표시를 사용하되 접근 가능한 이름에
  unread 정보를 유지한다.
- Reaction/Repost는 요약 헤더·한 줄 미리보기·썸네일을 하나의 이동 target으로 취급한다.
  hover·읽음 배경과 읽음 rail은 이 target 전체에 적용한다. Reply는 헤더만 알림 이동 target이며
  아래 PostListItem과 Action Bar는 별도 상호작용 영역을 유지한다.
- Follow에는 `UserRoundPlus`, Repost에는 `Repeat2`를 사용한다. Reaction의 Figma
  `FaceSlightlySmiling`은 설치된 Lucide export에 없으므로 Figma description과 [icons.md](./icons.md)의
  기존 `Smile` fallback을 유지한다.
- Reaction/Repost는 작성자 header·Action Bar 없이 secondary 본문 한 줄과 첫 미디어의 64×64
  미리보기를 표시한다. `PostMediaImage`의 로딩·실패 처리를 재사용한다. CW가 있으면 경고만 표시하고
  본문·썸네일을 숨긴다. sensitive media는 썸네일을 숨긴다. 접근할 수 없는 Post는 `preview=null`로
  전달한다. 표시 영역은 기존 `PostContentPrivacyBoundary`를 사용한다.
- 한 줄 미리보기는 `contentM`의 16px/24px를 사용한다. Figma의 MCP 매칭용 대체 폰트를
  가져오지 않고 프로덕션 UI의 SUIT와 본문의 Pretendard를 유지한다.
- 미리보기의 하단 여백은 썸네일 유무와 무관하게 일반 행과 같은 8px이다.
  2026-09-07 사용자 결정에 따라 Figma Light/Dark 조합 표본과 구현을 함께 정렬했다.
- Reply의 `children`에는 실제 `PostListItem`을 `showDivider={false}`와 필요한 attribution 설정으로
  조합한다. Post action/provider·Relay ref는 기존 Post 계약을 따른다. 자식은 알림 이동 링크의 바깥에
  위치해 action이 알림 이동을 함께 실행하지 않는다. 단일 하단 divider는 Notification wrapper가 소유한다.
- pending/disabled는 알림 이동을 차단한다. consumer가 pending 수명을 소유하며, presentation에서
  읽음 mutation·cache 또는 실패 복구 정책을 실행하지 않는다. Reply Post action의 상태는 해당 Post가
  소유한다. 권한 상실로 Post를 숨겨야 하면 consumer가 전체 item을 제거해야 한다.

## 검증 경계

개별 스토리 기본 폭은 실제 앱 중앙 열의 최대 폭과 같은 600px이며 좁은 화면에서는 가용 폭으로 줄어든다.
Controls에서 320·390·600·720px 또는 전체 폭을 선택할 수 있다. LongContent만 320px를 기본값으로 쓴다.
`Screens/Notifications/Presentation`에는 PageHeader와 알림 5종을 조립해 목록 밀도와 읽음 상태를
검토한다. 해당 화면의 모두 읽음은 로컬 표시 상태만 변경하며 실제 mutation 통합을 입증하지 않는다.

Playground는 수동 Controls/Actions, Tests는 activation·pending 중복 실행 차단·Reply 합성·보호된
미리보기를 검증한다. 기존 Notifications screen story는 loading/error/empty와 프로필 접근 상실 등
현재 목록 상태와 Relay mock 검증을 유지한다. 기존 runtime story와 새 Target presentation의 완료 상태를
혼동하지 않는다.

Light/Dark와 모바일 폭은 React Native Web 검증이다. 실제 Web/iOS/Android route·권한·읽음 처리·
grouping 완료를 입증하지 않으며, Tailnet serve 변경은 PROD-884에 포함하지 않는다.
