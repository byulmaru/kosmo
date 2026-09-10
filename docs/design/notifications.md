# Notification presentation

PROD-884는 `NotificationListItemView`와 `KOSMO/Patterns/Notification List Item` Storybook을
소유한다. 이 컴포넌트는 표시용 입력과 이동 callback을 받고, 기존 Notification runtime은 그대로 둔다.
PROD-811이 실제 목록 연결, Relay projection, 읽음 처리, 권한과 navigation 통합을 소유한다.
PROD-930은 production Notification runtime에서 플랫폼별로 나뉘었던 `모두 읽음` action과 Read/Unread
표시를 Web·iOS·Android에서 같은 계약으로 제공하며, 현재 로드된 ID와 기존 API/Relay 수렴 경계를 유지한다.

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

## Native FCM push 권한 요청과 잠금 화면 미리보기 · PROD-875

- Android·iOS native 앱은 로그인된 상태의 첫 앱 실행에서 Push 알림 권한 안내를 표시한다. 새 로그인
  완료 직후 또는 이미 로그인된 상태에서 앱을 실행하는 경우를 포함할 수 있으며, 안내를 위해
  로그아웃·재로그인을 요구하지 않는다. 안내를 표시하는 것과 OS 권한 대화상자를 여는 것은 별개의
  단계다.
- OS 권한 요청은 앱 시작·로그인 완료 시 자동으로 실행하지 않고, 사용자가 안내의 `알림 받기` action을
  명시적으로 활성화한 경우에만 시작한다.
- 기본 잠금 화면 FCM Push에는 발신자, 알림 유형과 게시글 본문 미리보기를 포함한다.
- Follow와 FollowRequest처럼 게시글 본문이 없는 알림은 본문 미리보기를 생략한다.
- Push transport는 canonical Notification이 저장 성공한 결과를 받는 공통 전달 flow를 소유한다. 현재
  Notification runtime의 Follow, FollowRequest, Reaction, Repost, Reply는 이 flow의 현재 integration inventory로
  같은 수신 대상 fan-out, 권한·visibility 억제, preview privacy, 24시간 expiry, no-backlog, retry·dedup와
  원본 실패 격리를 적용한다. 이 inventory는 닫힌 type whitelist가 아니다.
- 향후 canonical Notification type도 해당 도메인 owner가 생성 권한·source semantics·유형별 표시와 필요한
  target 정보를 공통 flow에 연결한 저장 성공 결과로 같은 공통 Push flow를 거치며, 새 type 추가 때 Push
  transport 전체나 source workflow별 전달 lifecycle을 복제하지 않는다. 미래 generator 자체의 구현·통합은 이
  문서 범위가 아니다.
- 현재 Account는 자신에게 속한 모든 Profile의 Push를 받으며, 각 Push는 어느 Recipient Profile의
  알림인지 식별할 수 있어야 한다. selected Profile만을 기준으로 Push 수신 범위를 줄이지 않는다.
- 현재 Account에 로그인되어 있고 OS 알림을 허용한 모든 앱 설치를 Push 대상으로 한다. 가장 최근 설치 하나만
  대상으로 선택하지 않는다.
- Active installation만 opaque FCM token을 보관한다. 사용자가 설치를 해제하거나 해당 Session이 로그아웃·
  폐기되거나 Account가 삭제되면 installation row와 token을 즉시 삭제한다. Provider의 invalid·unregistered
  결과는 Account, installation ID와 현재 token이 모두 일치할 때만 row와 token을 즉시 삭제하며, 늦은 이전
  token 결과는 갱신된 token을 삭제하지 않는다.
- 삭제 뒤 재등록은 새 수신 시작 시각을 기록하고 삭제 전 registration epoch나 unread Notification을 재사용하지
  않는다. 새 registration 시각 이전에 생성된 Notification은 Push backlog로 전달하지 않는다.
- 같은 Account의 다른 installation ID가 active token을 재등록하면 기존 중복 row를 원자적으로 정리한 뒤 새
  installation을 등록한다. 다른 Account가 소유한 active token은 등록하거나 삭제하지 않는다.
- 첫 릴리스에는 전역·알림 유형별·Profile별 in-app Push enable/disable control이나 preference API를
  두지 않는다. Push 수신 여부는 OS 알림 설정만으로 제어하며, 기존 Notification의 Mute·Block·visibility
  억제 정책은 계속 적용한다.
- 잠금 화면 본문 미리보기는 sensitive 또는 Content Warning인 경우 가린다. 이 예외는 본문에만 적용하며,
  발신자·알림 유형·Recipient Profile 식별은 유지한다. 그 외에는 Recipient가 조회 권한을 가진 비공개
  본문을 미리보기에 포함한다.
- 앱이 foreground인 경우에도 OS 알림 배너를 표시한다. 별도의 custom in-app Push banner를 추가하지
  않는다.
- 같은 설치에서 안내를 닫거나 OS 권한을 거부한 뒤에는 안내를 자동으로 다시 표시하지 않는다. 일반적인 앱
  업데이트 뒤에도 안내를 자동으로 다시 표시하지 않는다.
- 앱 설정에서 OS 알림 설정으로 이동하는 action을 제공한다. Push 탭 시에는 현재 Account가 Recipient Profile에
  접근할 수 있는지 다시 확인한 뒤,
  접근할 수 있으면 해당 Profile로 전환해 target을 연다. target이 삭제되었거나 접근할 수 없으면 접근 가능한
  알림 목록만 열고 별도 toast·message를 표시하지 않는다. 로그인되지 않은 상태에서 Push를 탭하면 원래
  target을 버리고 일반 로그인 흐름을 따르며, 로그인 뒤 Push target으로 자동 복귀하지 않는다.
- Notification 생성 시각부터 24시간이 지나면 해당 Push의 전달을 시도하지 않는다. 이 24시간은 최초
  Notification 생성 시각을 기준으로 하며, 재시도나 token refresh로 연장하거나 다시 시작하지 않는다. 이
  만료는 원래 인앱 Notification lifecycle을 변경하지 않는다.
- 최초 registration·새 device·OS 권한 허용으로 전달 대상을 등록할 때 registration을 받은 시점 이후에
  생성된 Notification만 전달한다. 이미 생성된 unread Notification을 새 설치나 권한 허용 뒤에 backlog로
  재생하지 않는다. OS 상태 변화의 정확한 감지 시점은 이 문서에서 고정하지 않으며, client는 관찰 가능한
  OS 상태를 동기화한다.
- Notification이 현재 읽음 상태라는 이유만으로 Push 전송·재시도를 제외하거나 취소하지 않는다. 다른 표면에서
  읽어도 Push를 취소하지 않으며, 최초 Notification 생성 시각부터 24시간인 만료는 그대로 유지한다. Push
  전달 자체는 canonical read state를 변경하지 않는다.
- Provider의 accepted 응답은 기기 도착을 증명하지 않으며, Provider에 큐잉된 Push를 절대적으로 회수할 수
  있다는 보장도 없다. 이는 Provider·플랫폼의 관찰 가능한 경계다.
- 이 결정은 공통 Push flow가 canonical Notification 저장 성공 결과부터 수신 대상 fan-out과 전달 lifecycle을
  소유한다는 경계와, 권한 안내 시점, 현재 integration inventory, 기본 표시 구성과 foreground OS 배너, 안내
  반복 억제, OS 설정 이동, cross-profile target 처리, Push 만료와 read state 독립성을 확정한다. 미리보기
  excerpt 길이와 PROD-911이 소유하는 향후 Mention 생성·통합 및 유형별 source·표시 계약은 별도 범위로 남지만,
  해당 type이 canonical Notification으로 저장되면 같은 공통 Push flow를 사용한다.

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
- Read 배경은 투명, Unread는 Figma가 사용하는 `actionPrimarySubtle`과 4px
  `actionPrimaryBase` rail이다. 모든 플랫폼에서 이 Read/Unread 기본 표시와 접근 가능한 Unread 상태를
  유지한다. Web hover는 기존 배경 위에 `stateHover`를 얹으며 Unread의 primary 배경을 지우지 않는다.
  따라서 Read와 Unread의 hover 색상이 구분된다. keyboard focus는 `stateFocusRing`이다. 이는 unread
  전용 semantic token 신설이 아니다.
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
- Reply 알림은 `ReplyNotificationPost`가 작성자·시각·알림 이유와 게시글 내용을 조립한다.
  `PostBody`·`PostSourcePreview`·`PostActionSurface`를 재사용하고, Reply 버튼·composer·focus 연결은
  `usePostReplySurface`를 게시글 목록과 공유한다. Reply 버튼은 `owner="list"`인 기존 Reply composer의
  popup modal을 열며 Notification 전용 composer나 별도 popup lifecycle을 만들지 않는다. `PostListItem`은
  알림 종류·문구·배치를 소유하지 않는다.
  기존 Post action/provider·Relay ref 계약을 따르며 action을 알림 이동 링크 안에 중첩하지 않는다.
  단일 하단 divider는 Notification wrapper가 소유한다. Reply wrapper는 `children`과 `unread`만 받고
  자식으로 `ReplyNotificationPost`를 합성한다. 게시글 identity와 이동은 이 자식이 소유하므로 wrapper에
  actor·timestamp·별도 이동 props를 중복 전달하지 않는다.
- Follow/FollowRequest/Reaction/Repost의 pending/disabled는 알림 이동을 차단한다. consumer가 pending
  수명을 소유하며 presentation에서 읽음 mutation·cache 또는 실패 복구 정책을 실행하지 않는다.
  Reply의 이동과 Post action 상태는 해당 Post가 소유한다. 권한 상실로 Post를 숨겨야 하면 consumer가
  전체 item을 제거해야 한다.
- Notification 활성화에 따른 Best Effort Read는 이동이나 열기를 기다리게 하지 않는다.
  Follow/FollowRequest/Reaction/Repost는 단일 item target 활성화에서, Reply는 작성자 Profile·시각·본문의
  link navigation과 미디어 열기에서 각각 한 번 시작한다. Reply의 Content Warning 공개, Action Bar와 열린
  composer의 control은 자체 동작만 수행하며 item navigation이나 Read를 함께 시작하지 않는다.

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
