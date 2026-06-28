# Notification 컨텍스트: 알림

## 목표

Profile과 Account가 자신과 관련된 상호작용, 관계 변화, 운영 메시지를 놓치지 않게 하되, 과도한 알림과
괴롭힘을 제어할 수 있어야 한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md), [Messaging](./messaging.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: 없음. Notification은 다른 컨텍스트 이벤트를 Profile/Account 알림함으로 변환한다.
- peer: [Feed](./feed.md), [Discovery](./discovery.md)

## DDD 명세

- 컨텍스트 경계: 소셜 알림, 운영 알림, 알림함, 읽음 상태, 알림 설정을 정의한다. 원인 행동의 원본
  상태 변경은 각 upstream 컨텍스트가 소유한다.
- 보편 언어: Notification, Notification Event, Inbox, Read State, Mention Notification,
  Follow Request Notification, Operational Notification.
- 핵심 모델: Notification Inbox를 aggregate root 후보로 둔다. Notification Item과 Notification
  Preference는 알림함 안에서 다룬다.
- 값 객체 후보: Notification Type, Delivery Channel, Read Timestamp, Grouping Key.
- 불변 조건: 공개 범위상 볼 수 없는 게시의 알림은 보내지 않는다. 차단/뮤트/필터 정책은 알림
  생성과 표시 모두에 반영되어야 한다.
- 도메인 이벤트 후보: NotificationCreated, NotificationRead, AllNotificationsRead,
  NotificationSuppressed, NotificationPreferenceChanged.
- 정책 후보: grouped notifications, push/email 채널, 요청함 분리, quiet hours, 팔로우하지 않는
  사람의 알림 제한.

## 핵심 알림

### 멘션

- 누군가 게시 또는 답글에서 나를 멘션하면 알림을 받는다.
- 멘션 대상은 Profile 단위로 판단한다.
- 차단한 Profile, 뮤트한 Profile, 필터된 단어가 포함된 게시의 멘션 알림은 제한한다.
- 공개 범위상 내가 볼 수 없는 게시의 멘션은 알림을 보내지 않는다.

### 답글

- 내 게시에 답글이 달리면 알림을 받는다.
- thread 참여자가 추가 답글 알림을 받을지 정책으로 정한다.
- 내가 뮤트한 thread의 답글 알림은 보내지 않는다.
- 삭제된 답글의 알림은 숨기거나 tombstone 상태로 처리한다.

### 반응

- 내 게시에 Reaction이 달리면 알림을 받을 수 있다.
- 여러 Reaction을 묶어서 summary 알림으로 표시할 수 있다.
- Profile은 반응 알림을 끌 수 있어야 한다.
- 팔로워 공개 또는 멘션한 프로필만 Post의 반응 알림은 Post Visibility를 따라야 한다.

### 재게시

- 내 게시가 Repost되면 알림을 받을 수 있다.
- 작성자가 재게시 알림을 끌 수 있어야 한다.
- 원본 게시가 팔로워 공개 또는 멘션한 프로필만이면 Repost 자체가 제한된다.
- 인용 알림은 별도 정책이 필요하다.

### 팔로우

- 누군가 나를 팔로우하면 알림을 받는다.
- 승인제 프로필에서는 팔로우 요청 알림을 받는다.
- 승인/거절 후 요청 알림은 처리됨 상태가 된다.
- spam follow 방지를 위해 rate limit과 batch summary가 필요할 수 있다.

### 특정 프로필 새 게시 알림

- Profile은 팔로우한 특정 프로필이 새 게시를 올릴 때 알림을 받을 수 있다.
- 이 설정은 전체 게시 알림 설정과 분리된 관계별 설정이다.
- Repost 수신 여부, 언어 필터와 함께 팔로우 관리 화면에서 다룰 수 있다.
- 원격 프로필의 새 게시 delivery 지연이나 실패를 어떻게 보일지 정해야 한다.

### 운영 알림

- 신고 처리 결과, 계정 제한, 보안 경고, 정책 변경, 서버 공지를 알릴 수 있다.
- 운영 알림은 일반 상호작용 알림과 분리하는 편이 좋다.
- 중요한 보안 알림은 이메일/push 같은 외부 채널과 연결될 수 있다.

## 알림 화면

- 모든 알림 탭: 전체 알림을 최신순으로 보여준다.
- 멘션 탭: 멘션과 답글 중심으로 보여준다.
- 요청 탭: 팔로우 요청, DM 요청, 운영 처리 대기 항목을 보여줄 수 있다.
- 읽음 상태: 전체 읽음 처리와 개별 읽음 처리를 제공할 수 있다.
- 알림 항목은 관련 게시/프로필/요청 화면으로 이동한다.
- 같은 타입과 같은 대상의 알림을 서버에서 묶어 반환할 수 있다.
- grouped notifications는 Reaction, follow, Repost, follow request 같은 반복 알림의 중복 렌더링과
  payload 크기를 줄이는 데 유용하다.

## 알림 설정

- Profile은 알림 유형별로 켜고 끌 수 있다.
- 팔로우하지 않는 사람의 알림을 제한할 수 있다.
- 새 계정, 프로필 이미지 없음, 이메일 미확인 계정의 알림을 제한할 수 있다.
- push/email/in-app 채널별 설정을 둘 수 있다.
- quiet hours 또는 일시 중지 기능의 포함 여부는 제품 결정이 필요하다.

## 필터와 안전

- 차단한 Profile의 알림은 생성하지 않거나 숨긴다.
- 뮤트한 Profile의 알림은 기본적으로 숨긴다.
- muted conversation의 새 답글 알림을 보내지 않는다.
- 신고된 계정 또는 제한된 계정의 알림을 별도 요청함으로 보낼 수 있다.
- 대량 멘션, quote pile-on, spam Reaction을 제한하는 운영 정책이 필요하다.

## 상태와 에러

- 최초 로딩: 알림 목록 skeleton.
- 알림 없음: 팔로우, 게시 작성, 프로필 완성 같은 다음 행동 제안.
- 읽음 처리 실패: 목록은 유지하고 재시도 제공.
- 관련 게시 삭제됨: 알림 항목에서 삭제 상태를 보여준다.
- 관련 프로필 정지됨: 프로필로 이동하지 않고 제한 안내를 보여준다.

## 도메인 속성/정책 메모

- 알림은 notification event와 읽음 상태를 분리한다.
- active profile별 알림함이 필요하다.
- 계정 단위 보안 알림과 프로필 단위 소셜 알림은 별도 모델일 수 있다.
- 원격 Profile 상호작용은 delivery 지연과 중복 수신을 고려해야 한다.
- 알림 생성과 push/email 발송은 별도 큐로 분리하는 편이 안전하다.

## 초기 범위 후보

- 초기 알림함은 in-app 알림 목록과 읽음 처리부터 시작할 수 있다.
- 알림 항목은 관련 게시, 프로필, 팔로우 요청, 운영 메시지 중 하나로 이동할 수 있어야 한다.
- 멘션, 답글, 반응, 재게시, 팔로우, 팔로우 요청은 기본 알림 후보로 둔다.
- push/email 알림, grouped notifications, 요청함 분리는 알림 이벤트 모델이 안정화된 뒤 도입한다.

## 미결정 네이밍

- 알림: Notification, Alert
- 멘션 탭: Mentions, Replies
- 요청 탭: Requests, Pending
- 읽음: Read, Seen
- 알림 제한: Filter, Mute, Suppress
