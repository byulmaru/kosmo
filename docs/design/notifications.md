# Notification presentation

PROD-884는 `NotificationListItemView`와 `KOSMO/Patterns/Notification List Item` Storybook을
소유한다. 이 컴포넌트는 표시용 입력과 이동 callback을 받고, 기존 Notification runtime은 그대로 둔다.
PROD-811이 실제 목록 연결, Relay projection, 읽음 처리, 권한과 navigation 통합을 소유한다.
PROD-930은 production Notification runtime에서 플랫폼별로 나뉘었던 `모두 읽음` action과 Read/Unread
표시를 Web·iOS·Android에서 같은 계약으로 제공하며, 현재 로드된 ID와 기존 API/Relay 수렴 경계를 유지한다.

## Native pull-to-refresh 읽음 동기화 · PROD-682

Native pull-to-refresh는 현재 목록에 로드된 미확인 알림만 먼저
읽음 처리한 뒤, 성공하면 새 알림을 조회해 목록에 반영한다. 조회 결과의 새 Notification이 unread이면
그 상태를 그대로 표시하며 서버가 계산한 미확인 수에 따라 indicator도 유지할 수 있다.

현재 로드된 unread가 없으면 읽음 mutation 없이 목록 refetch를 바로 실행한다. 읽음 mutation이 실패하면
오류와 다시 시도 action을 표시하고 목록을 refetch하지 않는다. 이후 조회가 실패해도 완료된 읽음 처리는
유지한다. 이 계약은 Native pull-to-refresh에만 적용하며 Web 새로고침, `NotificationReadAllContext`와
`모두 읽음` action의 동작은 변경하지 않는다.

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
알림의 의미를 전달한다. 종류 rail은 별도 목적지를 추가하지 않고 Quote 자체의 canonical 상세를 연다.

알림 본문·시각·종류 rail을 활성화하면 Source가 아닌 Quote 자체의 canonical 상세로 이동한다.
작성자 링크는 해당 Profile로, Source 미리보기는 기존 Source 상세로 이동한다. 기존 Post Action Bar,
CW 공개, 미디어와 composer의 독립 동작을 유지하며 내부 action이 알림 상세 이동까지 함께 실행하지 않는다.

읽음/미확인 배경·rail·hover·focus와 Best Effort Read는 공용 Notification 계약을 재사용한다.
종류 rail·작성자·시각·본문의 link navigation과 미디어 열기는 각각 Best Effort Read를 한 번 시작하고
이동이나 열기가 읽음 결과를 기다리지 않는다. CW 공개·Action Bar·composer control은 자체 동작만 수행한다.
모두 읽음, unread indicator, selected Profile 격리와
조회 불가 알림의 처리도 기존 계약을 따른다.

이 결정은 표시 계약의 확정이며 구현·Figma 반영·Web/iOS/Android runtime 검증 완료를 뜻하지 않는다.

## 반응·재게시 사진의 독립 이동 · PROD-1078

[PROD-1078](https://linear.app/byulmaru/issue/PROD-1078)의 개선 범위와 2026-10-10 사용자 선택에 따라
Reaction/Repost의 사진을 게시글 이동 영역에서 분리한다.

- 표시된 각 사진은 해당 행위자의 프로필로 이동한다. 사진 외의 요약·시각·한 줄 미리보기·썸네일은 기존 대상
  게시글로 이동하며, 한 번의 활성화가 두 목적지로 이동하지 않는다.
- Reaction/Repost 사진은 28px 크기와 전달된 순서의 최대 3개 표시를 유지하고, 12px 겹침을 제거한다.
  각 사진 링크는 Web 28×28 CSS px, iOS 28×28pt, Android 28×28dp의 독립 입력 영역을 가지며,
  actor 링크끼리 간격 없이 맞닿고 겹치지 않는다. 시간 링크는 모든 플랫폼에서 최소 높이 28,
  요약·미리보기 링크는 최소 높이 24를 사용한다. 이 표시 밀도는 Reaction/Repost 알림에만 적용하는
  [접근성 기준](./accessibility.md)의 명시적 예외다. 사진 크기는 확대하지 않는다.
- 각 사진 링크에는 행위자를 구분할 수 있는 접근 가능한 이름과 프로필 이동 의미를 제공한다.
  Web keyboard focus와 Native 보조 기술이 각 사진을 독립적으로 탐색하고 활성화할 수 있어야 한다.
- 사진과 게시글 영역은 같은 알림의 Read/Unread 배경·rail·hover를 공유한다. 각 활성화에서 Best Effort Read를
  한 번 시작하며, 읽음 요청의 지연·실패가 이동을 막지 않는다. 기존 pending/disabled에서는 두 이동을 모두 차단한다.
- Follow/FollowRequest의 사진 겹침과 이동, Reply/Mention/Quote의 게시글 구성, Operational 알림의 이동은 유지한다.

이는 표시·상호작용 계약을 정렬한 기록이며 구현, Figma 반영, Web/iOS/Android runtime 검증 완료를 뜻하지 않는다.

## Reaction 묶음 표시 · PROD-1207

[PROD-1207](https://linear.app/byulmaru/issue/PROD-1207)의 결정으로 인앱 Reaction 목록은 기본으로
묶어서 표시하며 개별/묶음 전환 설정을 추가하지 않는다. 묶음 기준·KST 자정 기준 24시간 범위·미확인 집계·취소와 기존 알림
적용은 [Notification 도메인 정책](../domain/objects/notification.md#reaction-알림-묶음--prod-1207)을 따른다.
다른 알림 유형의 표시·이동·읽음 및 Push·OS 알림은 변경하지 않는다.

- 최근 반응한 서로 다른 Profile의 사진 최대 3개, 대표 이름과 중복 제거한 인원수, 해당 묶음의 이모지별
  반응 수, 최신 반응 시각, 대상 게시글 미리보기를 표시한다. 한 사람이 여러 이모지를 남기면 사람 수는
  1명이고 각 이모지의 반응 수에는 각각 포함한다. 사진의 기존 크기·독립 이동·접근성 계약을 유지한다.
- 이모지가 많으면 한 줄 요약과 더보기로 제한한다. 묶음의 이모지별 수를 게시글 전체 반응 수로 대체하지
  않는다. 한 줄 배치와 더보기의 구체적 상호작용은 PROD-1209에서 이 정보 범위 안에서 정렬한다.
- 사진은 해당 Profile로, 기존 종류 rail·요약·시각·미리보기는 대상 게시글로 이동한다. 개별 내역은 게시글의
  기존 전체 반응 목록을 이용하며 별도 묶음 상세 화면은 추가하지 않는다. 게시글 전체의 현재 반응 목록을
  해당 KST 날짜 묶음만의 내역으로 표시하지 않는다.
- 위 이동 또는 명시적 읽음 처리에서 조회 당시 묶음에 속한 알림 전체를 읽음 처리한다. 대표 사진으로
  표시되지 않은 반응도 포함하며 그 뒤 도착한 반응은 미확인으로 남긴다. 이동은 읽음 요청의 지연·실패를
  기다리지 않는다. 새 개별 읽음 버튼 추가를 요구하지 않으며 목록 진입·스크롤만으로 읽음 처리하지 않는다.
- 모두 읽음은 현재 로드된 묶음의 조회 당시 구성원과 로드된 일반 알림만 대상으로 한다. 미확인 반응이
  하나라도 있는 묶음은 기존 Unread 배경·rail과 접근 가능한 상태 표시를 사용한다.
- 목록 재진입·명시적 새로고침 때 최신 반응 시각순 결과를 반영한다. 새 반응이 포함된 묶음은 다시 미확인으로
  표시한다. 열린 화면의 실시간 자동 갱신·재정렬은 이번 범위에 포함하지 않는다.
- 묶음은 KST 자정부터 다음 자정 전까지인 24시간 구간의 알림 요약이며, UTC 자정은 경계가 아니다. 가까운
  시각의 반응도 KST 자정 경계에서는 나뉠 수 있다. 정확한 현재 반응 내역은 게시글의 기존 반응 목록에서 확인한다.
- 추가 페이지는 조회 당시의 최신 시각순 결과를 받는다. 페이지 사이 반응 추가·취소에 따른 순서 변동과 중복·일시 누락은 허용하며 재진입·새로고침 때 최신 목록을 다시 받는다. 별도 연속 조회 만료나 만료 복구 동작은 두지 않는다. 조회 실패는 기존 재시도 동작을 유지하고 조회만으로 읽음 처리하지 않는다.
- 취소 반응 제외 후 인원·이모지 수·미확인 표시를 갱신하고 빈 묶음을 제거한다. 최신 반응이 취소되면
  남은 최신 반응 시각을 표시한다. 나머지 알림의 읽음 상태와 기존 CW·sensitive·조회 불가 처리를 유지한다.

기존 `NotificationListItemView`, `Patterns/Notification List Item`의 GroupedKinds와
`Screens/Notifications/Presentation`은 사진·요약·게시글 미리보기·이동과 상태 표시의 재사용 기반이다.
이모지별 개수·한 줄 초과 표시와 실제 데이터·읽음·갱신 연결은 PROD-1209의 보완 범위다.
Figma Grouped Reaction은 기존 시안이며 이 정책의 모든 정보·상태가 반영된 완료본으로 간주하지 않는다.
PROD-1208은 서버 계약·검증, PROD-1209는 앱·Storybook 및 필요한 표시 정렬을 소유한다.
이 문서 갱신은 Figma 수정·구현·Web/Native 검증 완료를 의미하지 않는다.

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

- 로그인한 Native 앱은 OS 알림 권한이 미결정이면 권한을 요청한다. 신규 설치에서는 최초 로그인 때 요청하며,
  기존 설치도 다음 로그인된 앱 시작 때 미결정이면 요청한다. Guest, 인증 진행 중, Web에서는 요청하지 않는다.
  이미 허용되거나 거부된 권한은 로그인 때 자동 재요청하지 않는다. 요청이 허용되면 FCM token을 즉시 동기화한다.
  앱 설정의 알림 action은 권한이 미결정이면 OS 권한 요청을 시작하고, 이미 허용되거나 거부된 경우 OS 알림 설정을
  연다. 권한을 허용한 로그인 세션은 로그인·앱 활성화와 token 갱신 때 FCM token을 동기화한다.
- Profile Notification Push의 title/body는 아래 PROD-1061 공통 정보 구성 계약을 사용한다. 줄 수·줄바꿈·자름·
  접힘·펼침은 OS가 소유한다. Operational Notification은 저장된 제목·선택적 본문 계약을 따른다.
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
- 게시글 본문은 Recipient가 조회할 수 있고 sensitive 또는 Content Warning이 아닌 경우에만 Profile Notification
  Push의 title/body 정보에 포함한다. 이 예외는 본문에만 적용하며, 발신자·알림 유형·Recipient Profile 식별은
  유지한다.
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

## Native Push 공통 정보 구성 · PROD-1061

2026-10-14 사용자 승인으로 Android/iOS Profile Notification Push의 title/body를 공통 정보 구성으로 정렬한다.
인앱 알림 목록의 표시 계약에는 적용하지 않는다.

- title/body에는 행위자와 수신 Profile의 이름·핸들, 행동 종류를 포함한다. Reaction은 실제 Reaction emoji를
  사용한다.
- Recipient가 조회할 수 있고 sensitive 또는 Content Warning이 아닌 게시글 본문은 title/body 정보에 포함한다.
  Follow와 FollowRequest처럼 게시글 본문이 없는 알림은 본문을 포함하지 않는다.
- 줄 수·줄바꿈·자름·접힘·펼침은 OS가 소유한다. 플랫폼별 별도 표시, 아바타, 수신자 전용 행, Reaction 배지,
  접힘·펼침에 따른 다른 정보 구성은 요구하지 않는다.
- 묶인 알림의 표시와 집계 기준은 이번 결정 범위에서 제외한다.

행동 종류별 기존 문구는 다음과 같이 title/body 정보에 구성한다.

| 종류          | 행동 요약                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Follow        | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님을 팔로우했습니다.`                  |
| FollowRequest | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님에게 팔로우를 요청했습니다.`         |
| Reaction      | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님에게 {Reaction emoji}를 남겼습니다.` |
| Repost        | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님의 게시글을 재게시했습니다.`         |
| Reply         | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님의 게시글에 답글을 달았습니다.`      |
| Quote         | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님의 게시글을 인용했습니다.`           |
| Mention       | `{행위자명}({행위자핸들}) 님이 {수신자명}({수신자핸들}) 님을 언급했습니다.`                    |

## Web Push 권한과 표시 · PROD-1215

- Web Push는 지원 조건을 충족하는 Android·Desktop browser/PWA와 iOS/iPadOS 홈 화면 앱에서 제공한다.
- Web에서는 앱 시작·로그인 때 권한을 자동 요청하지 않는다. 사용자가 앱 설정의 알림 action을 활성화하거나
  Home 알림 배너의 `켜기`를 누를 때만 OS 권한 요청을 시작한다.
- Home 알림 배너는 로그인한 사용자가 선택된 Profile의 Home을 보고 있고, 브라우저가 Web Push를 지원하며 권한이
  미결정인 경우에만 표시한다. 권한이 허용되거나 거부된 경우, 지원하지 않는 browser와 Native에서는 표시하지 않는다.
- Home 알림 배너를 닫으면 해당 브라우저에서는 다시 표시하지 않으며, reload·로그인·선택 Profile 전환 뒤에도 유지한다.
  앱 설정의 알림 action은 계속 사용할 수 있다.
- Foreground와 background 모두 OS 알림을 표시하며 custom in-app Push banner를 추가하지 않는다. 알림 대상,
  본문 privacy, 만료와 이동은 [Push 정책](../domain/decisions/0029-native-push-notification-policy.md)을 따른다.

## 표시와 합성

- Follow/FollowRequest/Reaction/Repost는 48px kind rail 안에 32px 아이콘을 표시한다. 원형 배경을
  추가하지 않는다. 아바타는 28px이고 전달된 순서의 최대 3개를 표시한다. Follow/FollowRequest의 겹침은
  12px이며 Reaction/Repost는 위 PROD-1078 계약에 따라 겹침 없이 표시한다. 전체 actor 수는
  consumer 입력이며 컴포넌트에서 그룹을 만들지 않는다. invalid count는 전달된 actor 수 이상인 정수로
  정규화한다. Reply는 한 명만 허용한다.
- Follow는 프로필, FollowRequest는 `/follow-requests`가 행 전체의 Target destination이며 inline 수락 버튼은
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
- Reaction/Repost는 사진별 프로필 이동과 사진 외의 게시글 이동 영역을 구분한다.
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
- 대상 게시글을 표시하는 Reply/Mention/Quote/Reaction/Repost의 kind rail은 기존 게시글·미리보기 구성의
  전체 높이로 늘어난 48px 너비의 target이며, 종류 아이콘은 기존 상단 48px × 48px geometry 안에 유지한다.
  아이콘 아래 빈 rail 영역은 해당 알림의 기존 기본 목적지와 같은 경로를 열고 기존 pending/disabled 상태를
  따른다. Reply/Mention은 결과 게시글, Quote는 Quote Post, Reaction/Repost는 대상 게시글로 이동한다. 각
  활성화는 Best Effort Read를 한 번 시작하며, 이동은 읽음 결과를 기다리지 않는다. 이 rail은 기존 행 높이,
  Web/Native inset, kind/content gap과 내부 여백을 바꾸지 않는다. 대상 게시글을 표시하지 않는 정적 일반 문구
  행에는 target을 추가하지 않는다.
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
  Reply/Mention의 이동과 Post action 상태는 해당 Post가 소유한다. Notification 행이 조회되지만 권한 상실 등으로 source를 가져오지 못하면
  consumer는 해당 알림 종류의 일반 문구와 시각을 표시한다. Follow, FollowRequest, Reaction, Reply, Quote,
  Mention, Repost의 일반 문구는 각각 `팔로우 알림`, `팔로우 요청 알림`, `반응 알림`, `답글 알림`,
  `인용 알림`, `멘션 알림`, `재게시 알림`이다. 이 행은 읽음/읽지 않음 상태와 모두 읽음 대상에 남지만
  source 링크나 알림 활성화 동작은 제공하지 않는다. Post의 본문이 없을 때도 Reply/Mention/Quote wrapper를
  비워 두지 않고 같은 일반 문구를 표시한다. source가 있으면 기존 종류별 표시와 이동 동작을 유지한다.
- Reply·Quote·Mention의 Reaction 요약 row에서 새 상세 진입 영역은 마지막 People control 오른쪽의 4px 비대화형 간격을 지난 넓은 여백으로 한정한다. 이 여백을 누르면 해당 Post 상세로 한 번 이동하고 Best Effort Read를 한 번 시작하며, Read 응답의 지연·실패가 이동을 막지 않는다. 반응 칩 사이, 마지막 칩·People control 사이와 People control 오른쪽 4px 간격은 상세 이동이나 Read를 시작하지 않는다. 반응 컨트롤의 기존 독립 동작은 유지하며, 입력 범위는 [Reaction 요약 row 계약](./reactions.md#reaction-요약-row)을 따른다.
- Notification 활성화에 따른 Best Effort Read는 이동이나 열기를 기다리게 하지 않는다.
  Follow/FollowRequest는 기존 행 target 활성화에서, Reaction/Repost는 kind rail·사진별 Profile 또는 게시글
  영역의 활성화에서, Reply/Mention은 kind rail·작성자 Profile·시각·본문의 link navigation과 미디어 열기에서,
  Quote는 kind rail·작성자 Profile·시각·본문의 link navigation과 미디어 열기에서 각각 한 번 시작한다.
  Reply/Mention/Quote의 Content Warning 공개, Action Bar와 열린 composer의 control은 자체 동작만 수행하며
  item navigation이나 Read를 함께 시작하지 않는다.

## Native OTA 다운로드 완료 로컬 알림

Native 기기에서 새 OTA update 다운로드가 완료되면 기존 OS 알림 권한과 foreground 알림 표시를 사용해
로컬 OS 알림을 표시한다. 제목은 `업데이트가 준비되었어요.`, 본문은 `누르면 앱을 재시작해 적용합니다.`이다.
알림을 누르면 대기 중인 update를 적용하도록 앱을 즉시 재시작한다. 이 동작은 진행 중인 앱 사용이나 저장하지
않은 작업을 중단할 수 있으며, 사용자는 이를 허용했다.

기존 OS 알림 설정을 따르며 별도의 권한 요청, 앱 내 알림 설정, 알림 채널 또는 background fetch를 추가하지
않는다. 이 로컬 알림은 서버 FCM이나 broadcast가 아니며 canonical `Notification`, 알림 목록 항목 또는 unread
count를 만들지 않는다. `ON_LOAD` 확인으로 Native 앱이 관찰하는 다운로드 완료이므로 publication 수신을 뜻하지
않으며 앱이 종료된 동안 다운로드를 보장하지 않는다.

Cold launch에서 update가 이미 적용됐거나 알림이 오래되어 일치하는 대기 update가 없으면, 알림을 처리하고
추가 재시작이나 social navigation을 하지 않는다.

## 검증 경계

2026-09-08 Figma에서 Reply의 Light/Dark·긴 이름·읽음/읽지 않음 표본과 Mention의 Light/Dark
표본을 시각 확인했다. Reply/Mention Storybook에서 중복 header와 별도 알림 이유 행 제거, 이름·핸들 overflow,
Reply Parent 미리보기 부재, Action Bar의 독립 동작과 unread/hover 범위를 검증한다.
답글 자체가 Quote를 포함하는 경우 기존 인용 내용은 유지하며 Reply Parent 미리보기와 구분한다.
Mention Storybook은 선택 Profile의 실제 목록 fragment, 공용 읽음 mutation, 원인 게시글 경로와 Post 부재 시
일반 문구를 검증한다. Notification Storybook은 source가 없는 일곱 종류의 문구·읽음 상태·모두 읽음 대상과
비활성 행을 검증한다. Storybook과 Web 자동화는 Native 실제 기기의 touch·focus 검증을 대체하지 않는다.

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
