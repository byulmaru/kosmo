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

2026-09-07 readback과 DSN-42 최종 결정 당시 kind는 Follow, FollowRequest, Reaction, Repost,
Reply였다. Mention은 Future 표본이므로 public props와 Playground에 노출하지 않았다.

2026-09-08 사용자 승인으로 Reply/Mention의 Figma 표본을 아래 표시 계약으로 갱신했다.
Reply 계약은 로컬 코드·Storybook에 반영했으며 Tailnet은 이전 빌드를 유지한다. Mention의 디자인 승인만으로
API kind, 알림 생성 또는 runtime 통합이 완료된 것은 아니었다. 2026-10-02 PROD-911은
`MentionNotification`을 선택 Profile의 알림 목록에 연결하고, Reply와 공유하는 게시글 구성·읽음 처리·원인
게시글 이동을 제공한다. Storybook 검증은 React Native Web 근거이며 실제 Web/iOS/Android 경로나 기기 동작을
증명하지 않는다. 현재 typed Mention 관계를 공급하는 입력 경로는 ActivityPub 수신이며, Local 작성의 Mention
입력·해석은 미구현이다. 알림 생성은 저장된 유효 Mention 관계에 대해 출처 종류를 제한하지 않는다.

2026-09-14 PROD-951 사용자 결정으로 Reply는 별도의 알림 이유 문장을 제거하고 24px Avatar와 inline
작성자 행을 사용하며, Web의 Notification·PostListItem inset을 왼쪽 12px·오른쪽 24px로 정렬했다.
이 후속 변경은 기존 알림 이유 행을 전제로 한 PROD-950을 대체한다.

## Quote 표시 계약 · PROD-953

2026-09-18 사용자 결정으로 Quote는 아래 구성을 사용한다. Reply의 이유 문구 제거와 별개로,
수신자의 게시글이 인용됐다는 이유를 명시한다.

1. Quote 종류 아이콘.
2. 24px 작성자 아바타와 작성자 이름·핸들·시각.
3. 작성자 행 아래의 `회원님의 게시글을 인용했습니다` 이유 문구.
4. Quote Post 본문.
5. 기존 Source Post 미리보기.
6. Quote에 대한 기존 Post Action Bar.

Quote 작성자 정보는 한 번만 표시한다. 이유 문구에 이름을 반복하거나 별도의 Post 작성자 header를
덧붙이지 않는다. Source 미리보기 안의 기존 작성자 정보는 유지한다. 종류 아이콘과 이유 문구는
알림의 의미를 전달하며, 별도 이동 target을 추가하지 않는다.

알림 본문·시각을 활성화하면 Source가 아닌 Quote 자체의 canonical 상세로 이동한다.
작성자 링크는 해당 Profile로, Source 미리보기는 기존 Source 상세로 이동한다. 기존 Post Action Bar,
CW 공개, 미디어와 composer의 독립 동작을 유지하며 내부 action이 알림 상세 이동까지 함께 실행하지 않는다.

읽음/미확인 배경·rail·hover·focus와 Best Effort Read는 공용 Notification 계약을 재사용한다.
작성자·시각·본문의 link navigation과 미디어 열기에서 기존 읽음 처리를 시작하며, CW 공개·Action Bar·
composer control은 자체 동작만 수행한다. 모두 읽음, unread indicator, selected Profile 격리와
조회 불가 알림의 처리도 기존 계약을 따른다.

이 결정은 표시 계약의 확정이며 구현·Figma 반영·Web/iOS/Android runtime 검증 완료를 뜻하지 않는다.

## Account Operational Notification 표시 · PROD-1056

- ACTIVE Account의 선택된 Profile 목록은 해당 Profile의 조회 가능한 social 알림과 Account의 Operational 알림을
  하나의 순서 있는 목록으로 표시하고, unread count도 같은 범위를 사용한다. Profile을 전환하면 social 알림은
  Profile 기준으로 바뀌고 Account Operational 알림은 유지된다. 선택된 Profile이 없으면 기존 Profile 필수 화면
  경계를 따르며 Account 알림 저장과 Push 전달은 Profile 선택에 의존하지 않는다.
- Operational 알림은 actor 없는 전체 폭 링크 행으로 표시한다. 저장된 제목, 제공된 경우의 본문, 시각을 보여주며
  읽지 않은 행에는 기존의 subtle surface와 rail을 사용한다.
- 링크의 접근 가능한 이름은 제목, 선택적 본문, 시각, 읽지 않은 경우 `읽지 않은 알림`, `알림 열기` 순으로
  구성한다. 링크 역할, 표준 키보드 활성화와 기존 focus ring을 제공한다.
- 링크 활성화는 내부 앱 경로를 앱 내에서 열고 HTTP(S) 외부 링크를 브라우저로 연다. 활성화 직후 Best Effort
  Read를 시작하며 이동이 Read 결과를 기다리게 하지 않는다. Push tap은 동일한 목적지 규칙을 따르지만 Read
  State를 변경하지 않는다.

## Native FCM push 권한 요청과 잠금 화면 미리보기 · PROD-875

- 앱 시작이나 로그인 완료 때 OS 권한을 자동 요청하지 않는다. 앱 설정의 알림 action은 OS 권한이 미결정이면
  OS 권한 요청을 시작하고, 이미 허용되거나 거부된 경우 OS 알림 설정을 연다. 허용된 로그인 세션은 로그인·앱
  활성화 때 FCM token을 자동 동기화하고, 권한 요청이 허용된 직후에도 token을 즉시 동기화한다.
- 기본 잠금 화면 FCM Push에는 발신자와 알림 유형을 포함한다. PROD-1061의 후속 표시 결정에 따라
  접힌 알림은 수신 Profile을 포함한 행동 요약만 표시하고, 게시글 본문은 펼친 알림에서 표시한다.
- Follow와 FollowRequest처럼 게시글 본문이 없는 알림은 본문 미리보기를 생략한다.
- Push transport는 canonical Notification이 저장 성공한 결과를 받는 공통 전달 flow를 소유한다. 현재
  Notification runtime의 Follow, FollowRequest, Reaction, Repost, Reply와 inbound ActivityPub Mention은 이 flow의
  현재 integration inventory로 같은 수신 대상 fan-out, 권한·visibility 억제, preview privacy, 24시간 expiry,
  no-backlog, retry·dedup와 원본 실패 격리를 적용한다. 이 inventory는 닫힌 type whitelist가 아니다.
- 향후 canonical Notification type도 해당 도메인 owner가 생성 권한·source semantics·유형별 표시와 필요한
  target 정보를 공통 flow에 연결한 저장 성공 결과로 같은 공통 Push flow를 거치며, 새 type 추가 때 Push
  transport 전체나 source workflow별 전달 lifecycle을 복제하지 않는다. 미래 generator 자체의 구현·통합은 이
  문서 범위가 아니다.
- 현재 Account는 자신에게 속한 모든 Profile의 Push를 받으며, 각 Push는 어느 Recipient Profile의
  알림인지 식별할 수 있어야 한다. selected Profile만을 기준으로 Push 수신 범위를 줄이지 않는다.
- 현재 Account에 로그인되어 있고 OS 알림을 허용한 모든 앱 설치를 Push 대상으로 한다. 가장 최근 설치 하나만
  대상으로 선택하지 않는다.
- Active installation만 opaque FCM token을 보관한다. 최초 등록은 외부 installation ID를 받지 않고 서버가 새
  installation row ID를 발급해 반환한다. 갱신은 반환된 row ID와 인증된 현재 Account 소유권만 확인하며,
  알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를 노출하지 않는 동일한
  `PERMISSION_DENIED`(`Push installation is unavailable.`)로 실패한다. 명시적 해제는 반환된 row ID와 현재
  Account 소유권만 확인해 해당 row를 삭제하며, 알 수 없거나 삭제된 ID와 다른 Account 소유 ID는 row 존재 여부를
  노출하지 않고 `{ completed: true }`로 멱등 완료한다. 등록 당시 연결된 `sessionId`는 lifecycle association으로
  유지하며 현재 인증 Session과 비교하거나 요청 Session으로 재바인딩하지 않는다. 따라서 같은 Account의 다른
  Session도 해당 row를 관리할 수 있지만, 등록 당시 연결된 Session의 로그아웃·폐기와 Account 삭제에 따른 기존
  cleanup은 유지한다. Provider의 invalid·unregistered 결과는 Account, row ID와 현재 token이 모두 일치할 때만 row와
  token을 즉시 삭제하며, 늦은 이전 token 결과는 갱신된 token을 삭제하지 않는다.
- 삭제 뒤 재등록은 이전 ID를 재사용하지 않고 새 row ID를 사용한다. 늦게 도착한 이전 ID의 unregister가 새
  registration row를 삭제하지 않는다. registration과 Notification 생성 시각의 엄격한 cut-off나 epoch recovery는
  요구하지 않으며, 신규 수신은 일반 전달 flow에서 best-effort로 시작한다. 이미 생성된 unread Notification은
  별도 Push backlog로 재생하지 않는다.
- 같은 Account가 새 registration으로 현재 active token을 다시 등록하면 기존 중복 row를 원자적으로 정리한 뒤
  새 row ID로 등록한다. 다른 Account가 소유한 active token은 등록하거나 삭제하지 않는다.
- 첫 릴리스에는 전역·알림 유형별·Profile별 in-app Push enable/disable control이나 preference API를
  두지 않는다. Push 수신 여부는 OS 알림 설정으로 제어하며, 기존 Notification의 Mute·Block·visibility
  억제 정책은 계속 적용한다.
- 펼친 알림의 게시글 본문은 sensitive 또는 Content Warning인 경우 가린다. 이 예외는 본문에만 적용하며,
  발신자·알림 유형·Recipient Profile 식별은 유지한다. 그 외에는 Recipient가 조회 권한을 가진 비공개
  본문을 미리보기에 포함한다.
- 앱이 foreground인 경우에도 OS 알림 배너를 표시한다. 별도의 custom in-app Push banner를 추가하지
  않는다.
- Profile Notification Push payload는 `notificationId`, `recipientProfileId`, 내부 앱 경로 문자열 `href`를
  route data로 제공한다. Push를 탭하면 native client가 `href`가 현재 Profile 경로(하위 경로 포함)와
  `/follow-requests` 중 하나의 내부 경로인지 검증한다. `href`가 없거나 유효하지 않으면 Profile을 전환하지 않고
  일반 알림 목록을 연다. 유효하면 현재 선택된 Profile이 `recipientProfileId`와 다를 때 기존 Profile 전환
  흐름에서 현재 Account의 Profile membership를 확인해 전환한 뒤 `href`로 직접 이동한다.
  `notificationId`로 목적지를 조회하지 않는다. 실제 목적지가 없거나 삭제됐거나 접근할 수 없는 경우는 해당 화면의
  기존 처리를 따른다.
- Operational Notification Push는 저장된 `href`로 직접 이동한다. 내부 앱 경로는 앱에서 열고 HTTP(S) 외부 링크는
  브라우저에서 열며 Profile을 전환하지 않는다. 주소가 없거나 안전한 목적지 형식이 아니면 Profile을 전환하지 않고
  일반 알림 목록을 연다. 로그인되지 않은 상태에서 Push를 탭하면 원래 target을 버리고 일반 로그인 흐름을 따르며,
  로그인 뒤 Push target으로 자동 복귀하지 않는다. Push tap은 canonical Read State를 바꾸지 않는다.
- Notification 생성 시각부터 24시간이 지나면 해당 Push의 전달을 시도하지 않는다. 이 24시간은 최초
  Notification 생성 시각을 기준으로 하며, 재시도나 token refresh로 연장하거나 다시 시작하지 않는다. 이
  만료는 원래 인앱 Notification lifecycle을 변경하지 않는다.
- 최초 registration·새 device·OS 권한 허용 뒤 신규 Notification 전달은 일반 flow에서 best-effort로 시작한다.
  registration 시각과 Notification 생성 시각의 엄격한 cut-off는 요구하지 않으며, 이미 생성된 unread Notification을
  별도 backlog로 재생하지 않는다. OS 상태 변화의 정확한 감지 시점은 이 문서에서 고정하지 않으며, client는
  관찰 가능한 OS 상태를 동기화한다.
- Notification이 현재 읽음 상태라는 이유만으로 Push 전송·재시도를 제외하거나 취소하지 않는다. 다른 표면에서
  읽어도 Push를 취소하지 않으며, 최초 Notification 생성 시각부터 24시간인 만료는 그대로 유지한다. Push
  전달 자체는 canonical read state를 변경하지 않는다.
- Provider의 accepted 응답은 기기 도착을 증명하지 않으며, Provider에 큐잉된 Push를 절대적으로 회수할 수
  있다는 보장도 없다. 이는 Provider·플랫폼의 관찰 가능한 경계다.
- 이 결정은 공통 Worker Notification Activity가 저장된 Notification ID를 기존 Push delivery Workflow에
  연결하고, Push flow가 이후 수신 대상 fan-out과 전달 lifecycle을 소유한다는 경계와 앱 설정의 권한 상태별 동작,
  현재 integration inventory, 기본 표시 구성과 foreground OS 배너, OS 설정 이동과 token 동기화, cross-profile
  target 처리, Push 만료와 read state 독립성을 확정한다.
- 저장된 Mention Notification은 같은 공통 Push flow를 사용하며, 이 연결은 FCM Provider의 수락이나
  기기 도착을 입증하지 않는다.

## Native Push 공통 표시 · PROD-1061

2026-10-08 사용자 결정으로 Android/iOS OS Push의 단일 알림은 아래 표시 기준을 사용한다.
인앱 알림 목록의 표시 계약에는 적용하지 않는다.

- Follow, FollowRequest, Reaction, Repost, Reply, Quote, Mention 모두 행위자 아바타를 주요 이미지로
  표시한다. 시스템 앱 아이콘과 OS 헤더·외곽은 플랫폼이 소유한다.
- 멀티프로필 수신 대상을 구분할 수 있도록 수신 Profile의 이름과 핸들을 함께 표시한다. 일반적인
  `회원님` 표현으로 수신 Profile을 대체하지 않는다.
- 접힌 알림에는 행위자와 수신 Profile을 포함한 행동 요약만 표시한다. 게시글 본문 미리보기는 두지 않는다.
- 펼친 알림에서도 아바타를 접힌 알림보다 키우지 않는다. 행위자 이름과 핸들은 같은 줄에 표시하고,
  다음 줄에는 `{사용자명} {핸들}에게` 형식으로 수신 Profile을 표시한다.
- Repost는 재게시된 게시글, Reply는 답글, Quote는 인용한 게시글, Mention은 언급이 담긴 게시글의
  허용된 본문을 펼친 알림에서 표시한다. Follow와 FollowRequest에는 게시글 본문을 추가하지 않는다.
- 묶인 알림의 표시와 집계 기준은 이번 결정 범위에서 제외한다. 묶인 알림을 다룰 때 별도로 결정하며,
  단일 알림 시안을 근거로 복수 행위자 아바타·요약 문구·집계 방식을 미리 확정하지 않는다.

Reaction을 제외한 접힌 알림의 문구는 다음과 같다.

| 종류          | 행동 요약                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| Follow        | `{행위자} 님이 {수신자명}({수신자핸들}) 님을 팔로우했습니다.`             |
| FollowRequest | `{행위자} 님이 {수신자명}({수신자핸들}) 님에게 팔로우를 요청했습니다.`    |
| Repost        | `{행위자} 님이 {수신자명}({수신자핸들}) 님의 게시글을 재게시했습니다.`    |
| Reply         | `{행위자} 님이 {수신자명}({수신자핸들}) 님의 게시글에 답글을 달았습니다.` |
| Quote         | `{행위자} 님이 {수신자명}({수신자핸들}) 님의 게시글을 인용했습니다.`      |
| Mention       | `{행위자} 님이 {수신자명}({수신자핸들}) 님을 언급했습니다.`               |

기존 sensitive/CW 본문 숨김과 조회 권한 계약을 유지한다. Android와 iOS의 펼친 콘텐츠는 각각 승인된
Native 표시 surface에서 제공한다. iOS 접힘 상태는 시스템 앱 아이콘을 유지하고, 펼침 상태에서만
행위자 아바타와 독립 Reaction 배지를 제공한다. iOS category를 등록하지 못해도 기존 token 등록과
알림 수신은 계속되어야 하며, category를 모르는 구버전 앱은 시스템 기본 표시를 사용한다. 실제 FCM
수신·탭·접힘/펼침 결과의 실기기 검증은 별도다.

### Reaction 표시

- 이 표시 결정의 범위는 Android/iOS OS Reaction Push이며, 인앱 `NotificationListItemView`에는 적용하지
  않는다.
- 접힌 알림은 `{반응한사람} 님이 {반응받은프로필} 님에게 {반응 종류}를 남겼습니다.` 형식으로 표시한다.
  `{반응받은프로필}`에는 이름과 핸들을 함께 넣는다. 예를 들어
  `혜주 님이 예은(@yeeun) 님에게 😂를 남겼습니다.`처럼 실제 Reaction emoji를 사용하며, 하트를 고정한
  대표 아이콘으로 대체하지 않는다. 발신자 아바타가 주요 이미지인 방향은 유지한다.
- 펼친 알림의 상단에는 반응한 사람의 아바타·같은 줄의 이름과 핸들, 수신자 `{사용자명} {핸들}에게`를 표시한다. 예시는
  `예은 @yeeun에게`이다. 실제 Reaction은 아바타 모서리에 별도 배지 요소로 걸쳐 표시하며 이미지에
  합성하지 않는다. 그 아래에는 반응 대상 게시글의 허용된 본문만 표시한다. `혜주님이 😂 반응했어요.`
  설명이나 `반응한 게시글` label, 중복 작성자 행과 가로 구분선은 두지 않는다.
- 기존 sensitive/CW 본문 숨김, 수신 Profile 식별과 조회 권한 계약은 유지한다. 별도의 숨김 문구·fallback·
  미디어·액션은 이 결정에서 새로 확정하지 않는다.
- 시스템 앱 아이콘과 OS 헤더·외곽은 OS 영역이다. iOS 기본 접힌 배너에 독립 Reaction 배지를 추가한다고
  약속하지 않는다. Android 커스텀 펼친 콘텐츠와 iOS 펼친 Notification Content Extension은 이 계약에
  맞춰 제공하며, 실제 기기에서의 플랫폼·유형 적합성 검증은 남아 있다.
- 실제 Reaction 종류 전달, 표시 데이터 정렬, 플랫폼별 펼친 UI와 개인정보 경계, 실기기 검증은 후속 구현
  범위다. 현재 결정은 설계 확정이며 구현·Figma 반영·Native 검증 완료를 뜻하지 않는다. Reaction의
  모서리 배지와 본문 구성은 다른 알림 종류에 일반화하지 않는다.

## 표시와 합성

- Follow/FollowRequest/Reaction/Repost는 48px kind rail 안에 32px 아이콘을 표시한다. 원형 배경을
  추가하지 않는다. 아바타는 28px, 겹침은 12px이고 전달된 순서의 최대 3개를 표시한다. 전체 actor 수는
  consumer 입력이며 컴포넌트에서 그룹을 만들지 않는다. invalid count는 전달된 actor 수 이상인 정수로
  정규화한다. Reply는 한 명만 허용한다.
- Follow는 프로필, FollowRequest는 `/follow-requests`가 Target destination이며 inline 수락 버튼은
  없다. 기존 runtime과 notification OpenSpec의 requester-profile 이동은 아직 교체하지 않는다.
  PROD-811에서 navigation 계약과 spec을 함께 정렬해야 한다.
- Follow/FollowRequest/Reaction/Repost 행은 최소 80px이며 긴 이름·문구에 맞춰 높이가 늘어난다.
  Web inset은 좌 12px·우 24px, Native는 좌우 8px, kind/content gap은 12px이다.
  알림 본문은 `UI/Copy/L`(16/24), 날짜는 게시글과 같은 공통 `UI/Copy/M`(14/20)을 사용한다.
  Reply와 `PostListItem`도 같은 Web 좌 12px·우 24px, Native 좌우 8px inset을 사용한다. Reply의 inset은
  알림 wrapper가 소유하며 내부 게시글 조합에는 별도 좌우 padding을 두지 않는다. Reply 내부의 세로
  여백은 위 16px·아래 8px이다. 게시글 내부 링크와 action의
  플랫폼별 접근성 target은 기존 Post 계약을 유지한다.
- Read 배경은 투명, Unread는 Figma가 사용하는 `actionPrimarySubtle`과 4px
  `actionPrimaryBase` rail이다. 모든 플랫폼에서 이 Read/Unread 기본 표시와 접근 가능한 Unread 상태를
  유지한다. Web hover는 기존 배경 위에 `stateHover`를 얹으며 Unread의 primary 배경을 지우지 않는다.
  따라서 Read와 Unread의 hover 색상이 구분된다. keyboard focus는 `stateFocusRing`이다. 이는 unread
  전용 semantic token 신설이 아니다.
- Reaction/Repost는 요약 헤더·한 줄 미리보기·썸네일을 하나의 이동 target으로 취급한다.
  hover·읽음 배경과 읽음 rail은 알림 전체에 적용한다. Reply/Mention도 게시글 전체를 하나의 알림 surface로
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
- Reply/Mention은 종류 아이콘 → 작성자 이름·핸들·시각 → 본문·미디어 → Action Bar의
  동일한 게시글 구성을 사용한다. 48px kind rail 안에 32px `MessageCircle`(Reply)·`AtSign`(Mention)을
  `foregroundSecondary`로 표시한다. 작성자 행은 24px Avatar와 `ProfileNameBlock`의
  `inline` variant를 사용한다. 이름과 핸들은 한 줄에 배치하며 이름을 우선한다. 공간이 부족하면 핸들이 먼저
  가려지고, 이름도 가용 폭을 넘으면 말줄임한다. 이 계약을 다른 Profile 표시 전체에 확대하지 않는다.
- Reply/Mention에는 별도의 알림 이유 문장을 표시하지 않는다. 이 결정은 Quote의 이유 문구를 정하지 않는다.
  알림 작성자 이름은 `foregroundPrimary`, 종류 아이콘·핸들·시각은
  `foregroundSecondary`를 사용한다. Light `#64646F`, Dark `#A3A3A3`이며 legacy `textSecondary`, Info 색상,
  단어별 강조나 별도 배경은 두지 않는다. 아이콘은 장식으로 숨기고 접근성에는 짧은 알림 종류를 별도로 전달한다.
- Reply/Mention 알림에는 원글 미리보기나 별도 받는 사람 목록을 추가하지 않는다. 결과 게시글을
  활성화하면 해당 게시글 상세에서 대화 문맥을 확인한다. 이 제한은 Reaction/Repost의 actionless
  미리보기에는 적용하지 않는다. 수신자별 Reply/Mention 중복 정책은
  [Notification 도메인의 Reply/Mention 분류 계약](../domain/objects/notification.md#replymention-수신자별-분류와-중복-처리)을 따른다.
- Reply/Mention 알림은 각 `ReplyNotificationPost`·`MentionNotificationPost` wrapper가 공용 게시글 구성을
  사용해 kind rail·작성자·시각과 게시글 내용을 조립한다.
  `PostBody`·`PostSourcePreview`·`PostActionSurface`를 재사용하고, Reply 버튼·composer·focus 연결은
  `usePostReplySurface`를 게시글 목록과 공유한다. Reply 버튼은 `owner="list"`인 기존 Reply composer의
  popup modal을 열며 Notification 전용 composer나 별도 popup lifecycle을 만들지 않는다. `PostListItem`은
  알림 종류·문구·배치를 소유하지 않는다.
  기존 Post action/provider·Relay ref 계약을 따르며 action을 알림 이동 링크 안에 중첩하지 않는다. 단일 하단
  divider는 Notification wrapper가 소유한다. Reply/Mention wrapper는 `children`과 `unread`만 받고 해당 종류의
  게시글 자식을 합성한다. 게시글 identity와 이동은 자식이 소유하므로 wrapper에 actor·timestamp·별도 이동 props를
  중복 전달하지 않는다.
- Follow/FollowRequest/Reaction/Repost의 pending/disabled는 알림 이동을 차단한다. consumer가 pending
  수명을 소유하며 presentation에서 읽음 mutation·cache 또는 실패 복구 정책을 실행하지 않는다.
  Reply/Mention의 이동과 Post action 상태는 해당 Post가 소유한다. 권한 상실로 Post를 숨겨야 하면 consumer가
  전체 item을 제거해야 한다.
- Notification 활성화에 따른 Best Effort Read는 이동이나 열기를 기다리게 하지 않는다.
  Follow/FollowRequest/Reaction/Repost는 단일 item target 활성화에서, Reply/Mention은 작성자 Profile·시각·본문의
  link navigation과 미디어 열기에서 각각 한 번 시작한다. Reply/Mention의 Content Warning 공개, Action Bar와 열린
  composer의 control은 자체 동작만 수행하며 item navigation이나 Read를 함께 시작하지 않는다.

## 검증 경계

2026-09-08 Figma에서 Reply의 Light/Dark·긴 이름·읽음/읽지 않음 표본과 Mention의 Light/Dark
표본을 시각 확인했다. Reply/Mention Storybook에서 중복 header와 별도 알림 이유 행 제거, 이름·핸들 overflow,
Reply Parent 미리보기 부재, Action Bar의 독립 동작과 unread/hover 범위를 검증한다.
답글 자체가 Quote를 포함하는 경우 기존 인용 내용은 유지하며 Reply Parent 미리보기와 구분한다.
Mention Storybook은 선택 Profile의 실제 목록 fragment, 공용 읽음 mutation, 원인 게시글 경로와 Post 부재 시 숨김도
검증한다. Storybook과 Web 자동화는 Native 실제 기기의 touch·focus 검증을 대체하지 않는다.

PROD-811 통합 시 [현행 Notification OpenSpec](../../openspec/specs/notification/spec.md)의 기존
Follow 표시 scenario(28px kind icon·image avatar와 복수 사용자 aggregation 없음)와 새 presentation의
차이를 정렬한다. 공통 `Web pointer hover`와 Follow 전용 `Read와 Unread 표시` scenario의 기존
`surface` 배경도 Read/Unread 기본 배경 위에 `stateHover`를 얹는 계약으로 함께 갱신한다.
이 문서의 target 계약만으로 기존 runtime scenario나 완료 task를 변경하지 않는다.

개별 스토리 기본 폭은 실제 앱 중앙 열의 최대 폭과 같은 600px이며 좁은 화면에서는 가용 폭으로 줄어든다.
Controls에서 320·390·600·720px 또는 전체 폭을 선택할 수 있다. LongContent와 ReplyLongName은
320px를 기본값으로 쓴다.
`Screens/Notifications/Presentation`에는 PageHeader와 다섯 가지 수동 표시 예시를 조립해 목록 밀도와 읽음
상태를 검토한다. 선택 Profile 화면 Storybook은 Mention을 포함한 runtime 목록 통합을 검증한다. Presentation
화면의 모두 읽음은 로컬 표시 상태만 변경하며 실제 mutation 통합을 입증하지 않는다.

Playground는 수동 Controls/Actions, Tests는 activation·pending 중복 실행 차단·Reply 합성·보호된
미리보기를 검증한다. 기존 Notifications screen story는 loading/error/empty와 프로필 접근 상실 등
현재 목록 상태와 Relay mock 검증을 유지한다. 기존 runtime story와 새 Target presentation의 완료 상태를
혼동하지 않는다.

Light/Dark와 모바일 폭은 React Native Web 검증이다. 실제 Web/iOS/Android route·권한·읽음 처리·
grouping 완료를 입증하지 않으며, Tailnet serve 변경은 PROD-884에 포함하지 않는다.
