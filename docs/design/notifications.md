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

2026-09-08 사용자 승인으로 Reply/Mention의 Figma 표본을 아래 표시 계약으로 갱신했다.
Reply 계약은 로컬 코드·Storybook에 반영했으며 Tailnet은 이전 빌드를 유지한다. Mention의 디자인 승인은
API kind, 알림 생성 또는 runtime 통합의 완료를 의미하지 않는다.

## 표시와 합성

- Follow/FollowRequest/Reaction/Repost는 48px kind rail 안에 32px 아이콘을 표시한다. 원형 배경을
  추가하지 않는다. 아바타는 28px, 겹침은 12px이고 전달된 순서의 최대 3개를 표시한다. 전체 actor 수는
  consumer 입력이며 컴포넌트에서 그룹을 만들지 않는다. invalid count는 전달된 actor 수 이상인 정수로
  정규화한다. Reply는 한 명만 허용한다.
- Follow는 프로필, FollowRequest는 `/follow-requests`가 Target destination이며 inline 수락 버튼은
  없다. 기존 runtime과 notification OpenSpec의 requester-profile 이동은 아직 교체하지 않는다.
  PROD-811에서 navigation 계약과 spec을 함께 정렬해야 한다.
- Follow/FollowRequest/Reaction/Repost 행은 최소 80px이며 긴 이름·문구에 맞춰 높이가 늘어난다.
  Web inset은 좌 12px·우 16px, Native는 좌우 8px, kind/content gap은 12px이다.
  Reply에는 별도 알림 header나 그 header의 최소 높이를 두지 않는다. 게시글 내부 링크와 action의
  플랫폼별 접근성 target은 기존 Post 계약을 유지한다.
- Web Read 배경은 투명, Unread는 Figma가 사용하는 `actionPrimarySubtle`과 4px
  `actionPrimaryBase` rail이다. Hover는 기존 배경 위에 `stateHover`를 얹으며 Unread의 primary 배경을
  지우지 않는다. 따라서 Read와 Unread의 hover 색상이 구분된다. keyboard focus는 `stateFocusRing`이다.
  이는 unread 전용 semantic token 신설이 아니다. Native는 Default 표시를 사용하되 접근 가능한 이름에
  unread 정보를 유지한다.
- Reaction/Repost는 요약 헤더·한 줄 미리보기·썸네일을 하나의 이동 target으로 취급한다.
  hover·읽음 배경과 읽음 rail은 알림 전체에 적용한다. Reply도 게시글 전체를 하나의 알림 surface로
  표시하며 게시글 위에서 전체 hover 배경이 유지된다. 별도 header 이동 링크는 없으며 Post 내부 링크·
  Action Bar는 독립적으로 동작한다. 내부 버튼 클릭이 알림 이동을 함께 실행하지 않는다.
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
- Reply/Mention은 작성자 이름·핸들 → 알림 이유 → 본문·미디어 → Action Bar의 동일한 게시글
  구성을 사용한다. 작성자 아바타·이름과 시각을 별도 알림 header에 중복 표시하지 않는다.
  알림 안의 작성자 이름과 핸들은 한 줄에 배치하며 이름을 우선한다. 공간이 부족하면 핸들이 먼저
  가려지고, 이름도 가용 폭을 넘으면 말줄임한다. 이 계약을 다른 Profile 표시 전체에 확대하지 않는다.
- 둘째 줄은 답글 대상 목록이 아니라 현재 Recipient가 알림을 받은 이유다. Reply는
  `회원님의 게시글에 답글을 남겼습니다`, Future Mention은 `회원님을 멘션했습니다`로 표시한다.
  문장 앞에 16px `MessageCircle`(Reply)·`AtSign`(Future Mention)을 두며 아이콘과 문장 전체를
  `foregroundSecondary`(Figma `color/foreground/secondary`)로 통일한다. Light `#64646F`, Dark
  `#A3A3A3`이며 legacy `textSecondary`는 사용하지 않는다. 알림 작성자 이름은 `foregroundPrimary`,
  핸들과 시각은 `foregroundSecondary`를 사용한다. Info 색상, 단어별 강조나 별도 배경은 두지 않는다.
  아이콘은 장식이며 알림 종류는 문장으로도 전달한다.
  여러 Profile을 멘션한 글도 각 Recipient에게 같은 Mention 문구를 사용하며 본문의 멘션은 유지한다.
- Reply/Mention 알림에는 원글 미리보기나 별도 받는 사람 목록을 추가하지 않는다. 결과 게시글을
  활성화하면 해당 게시글 상세에서 대화 문맥을 확인한다. 이 제한은 Reaction/Repost의 actionless
  미리보기에는 적용하지 않는다. 수신자별 Reply/Mention 중복 정책은
  [Notification 도메인의 Future 계약](../domain/objects/notification.md#replymention-수신자별-분류와-중복-처리-future)을 따른다.
- Reply는 실제 Post 컴포넌트와 기존 Action Bar를 재사용한다. Post action/provider·Relay ref는
  기존 Post 계약을 따르며 action을 알림 이동 링크 안에 중첩하지 않는다. 단일 하단 divider는
  Notification wrapper가 소유한다. Reply wrapper는 `children`과 `unread`만 받으며, 자식은
  `PostListItem`의 `notification="reply"`와 `showDivider={false}`로 합성한다. 게시글 identity와 이동은
  Post가 소유하므로 wrapper에 actor·timestamp·별도 이동 props를 중복 전달하지 않는다.
- Follow/FollowRequest/Reaction/Repost의 pending/disabled는 알림 이동을 차단한다. consumer가 pending
  수명을 소유하며 presentation에서 읽음 mutation·cache 또는 실패 복구 정책을 실행하지 않는다.
  Reply의 이동과 Post action 상태는 해당 Post가 소유한다. 권한 상실로 Post를 숨겨야 하면 consumer가
  전체 item을 제거해야 한다.

## 검증 경계

2026-09-08 Figma에서 Reply의 Light/Dark·긴 이름·읽음/읽지 않음 표본과 Mention의 Light/Dark
표본을 시각 확인했다. 새 Reply Storybook에서 중복 header 제거, 이름·핸들 overflow, 알림 이유 문구,
Reply Parent 미리보기 부재, Action Bar의 독립 동작과 unread/hover 범위를 다시 검증한다.
답글 자체가 Quote를 포함하는 경우 기존 인용 내용은 유지하며 Reply Parent 미리보기와 구분한다.
Web 자동화는 Native 실제 기기의 touch·focus 검증을 대체하지 않는다.

PROD-811 통합 시 [현행 Notification OpenSpec](../../openspec/specs/notification/spec.md)의 기존
Follow 표시 scenario(28px kind icon·image avatar와 복수 사용자 aggregation 없음)와 새 presentation의
차이를 정렬한다. 공통 `Web pointer hover`와 Follow 전용 `Read와 Unread 표시` scenario의 기존
`surface` 배경도 Read/Unread 기본 배경 위에 `stateHover`를 얹는 계약으로 함께 갱신한다.
이 문서의 target 계약만으로 기존 runtime scenario나 완료 task를 변경하지 않는다.

개별 스토리 기본 폭은 실제 앱 중앙 열의 최대 폭과 같은 600px이며 좁은 화면에서는 가용 폭으로 줄어든다.
Controls에서 320·390·600·720px 또는 전체 폭을 선택할 수 있다. LongContent와 ReplyLongName은
320px를 기본값으로 쓴다.
`Screens/Notifications/Presentation`에는 PageHeader와 알림 5종을 조립해 목록 밀도와 읽음 상태를
검토한다. 해당 화면의 모두 읽음은 로컬 표시 상태만 변경하며 실제 mutation 통합을 입증하지 않는다.

Playground는 수동 Controls/Actions, Tests는 activation·pending 중복 실행 차단·Reply 합성·보호된
미리보기를 검증한다. 기존 Notifications screen story는 loading/error/empty와 프로필 접근 상실 등
현재 목록 상태와 Relay mock 검증을 유지한다. 기존 runtime story와 새 Target presentation의 완료 상태를
혼동하지 않는다.

Light/Dark와 모바일 폭은 React Native Web 검증이다. 실제 Web/iOS/Android route·권한·읽음 처리·
grouping 완료를 입증하지 않으며, Tailnet serve 변경은 PROD-884에 포함하지 않는다.
