# Notification 컨텍스트: 알림

## 목표

Profile과 Account가 자신과 관련된 상호작용, 관계 변화, 운영 메시지를 놓치지 않게 하되, 과도한 알림과
괴롭힘을 제어할 수 있어야 한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: 없음. Notification은 다른 컨텍스트 이벤트를 Profile/Account 알림함으로 변환한다.
- peer: [Post List](./post-list.md), [Discovery](./discovery.md)

## DDD 명세

- 컨텍스트 경계: 소셜 알림, 운영 알림, 알림함, 읽음 상태, 알림 설정, thread mute를 정의한다.
  원인 행동의 원본 상태 변경과 관계별 새 Post 알림 preference는 각 upstream 컨텍스트가 소유한다.
- 보편 언어: Notification, Notification Event, Inbox, Read State, Mention Notification,
  Follow Request Notification, Operational Notification.
- 핵심 모델: Notification Inbox를 aggregate root 후보로 둔다. Notification Item과 Notification
  Preference는 알림함 안에서 다룬다.
- 값 객체 후보: Notification Type, Read Timestamp, Muted Thread.
- 불변 조건: 공개 범위상 볼 수 없는 게시의 알림은 보내지 않는다. 차단/뮤트 정책은 알림
  생성과 표시 모두에 반영되어야 한다.
- 도메인 이벤트 후보: NotificationCreated, NotificationRead, AllNotificationsRead,
  NotificationSuppressed, NotificationPreferenceChanged.
- 정책 후보: 팔로우하지 않는 Profile의 알림 제한, thread mute 적용, 제한/정지된 Account/Profile의
  알림 억제.

## 핵심 알림

### 멘션

- 누군가 게시 또는 답글에서 나를 멘션하면 알림을 받는다.
- 멘션 대상은 Profile 단위로 판단한다.
- 차단한 Profile, 뮤트한 Profile, 뮤트된 단어가 포함된 게시의 멘션 알림은 제한한다.
- 멘션된 Profile은 Post Visibility 판정에서 접근 대상에 포함되어야 하며, 접근할 수 없는 Post의
  멘션 알림은 보내지 않는다.

### 답글

- 내 게시에 답글이 달리면 알림을 받는다.
- 내가 포함된 thread의 추가 답글 알림은 기본적으로 받는다.
- 내가 뮤트한 thread의 답글 알림은 보내지 않는다.
- 삭제된 답글의 알림은 숨긴다.

### 반응

- 내 게시에 Reaction이 달리면 알림을 받을 수 있다.
- Profile은 반응 알림을 끌 수 있어야 한다.
- 팔로워 공개 또는 멘션한 프로필만 Post의 반응 알림은 Post Visibility를 따라야 한다.

### 재게시

- 내 게시가 Repost되면 알림을 받을 수 있다.
- 작성자가 재게시 알림을 끌 수 있어야 한다.
- 원본 게시가 팔로워 공개 또는 멘션한 프로필만이면 Repost 자체가 제한된다.
- thread mute는 해당 Post/thread에서 발생하는 답글, Reaction, Repost 알림을 끄는 단위로 사용한다.

### 팔로우

- 누군가 나를 팔로우하면 알림을 받는다.
- 승인제 Profile에서는 팔로우 요청 알림을 받는다.
- 승인/거절 후 요청 알림은 처리됨 상태가 된다.

### 특정 프로필 새 게시 알림

- Social Graph의 관계별 새 Post 알림 preference가 켜져 있으면 팔로우한 특정 Profile의 새 Post 알림을
  받을 수 있다.
- Notification은 관계별 새 Post 알림 preference를 소유하지 않고 Social Graph의 설정을 소비한다.

### 운영 알림

- 계정 제한, 보안 경고, 정책 변경, 서버 공지를 알릴 수 있다.
- 신고 처리 결과는 신고자에게 알리지 않는다.
- 운영 알림은 일반 상호작용 알림과 같은 Notification 모델을 사용하되 Account 대상과 Profile 대상을
  구분한다.

## 알림함과 읽음 상태

- Notification Inbox는 Profile 대상 소셜 알림함과 Account 대상 보안/운영 알림함을 구분한다.
- Notification Item은 읽음 상태를 가진다.
- 전체 읽음 처리와 개별 읽음 처리는 별도 도메인 행동이다.
- 알림 항목은 관련 Post, Profile, Follow Request, 운영 메시지 중 하나를 참조할 수 있다.

## 알림 설정

- Profile은 알림 유형별로 켜고 끌 수 있다.
- 팔로우하지 않는 사람의 알림을 제한할 수 있다.
- 새 계정, 프로필 이미지 없음, 이메일 미확인 계정의 알림을 제한할 수 있다.
- 특정 Profile의 새 Post 알림 설정은 Social Graph의 관계별 preference다.
- push와 in-app은 별도 도메인 알림으로 분리하지 않는다.

## 뮤트와 안전

- 차단한 Profile의 알림은 생성하지 않거나 숨긴다.
- 뮤트한 Profile의 알림은 기본적으로 숨긴다.
- muted thread의 새 답글, Reaction, Repost 알림을 보내지 않는다.
- 제한 또는 정지된 Account/Profile에서 발생한 소셜 알림은 별도 요청함으로 분리하지 않고 노출하지
  않는다.
- 신고만으로는 알림 라우팅이나 노출 상태를 바꾸지 않는다.

## 도메인 속성/정책 메모

- 알림은 notification event와 읽음 상태를 분리한다.
- active Profile별 알림함이 필요하다.
- 계정 단위 보안 알림과 프로필 단위 소셜 알림은 대상 scope를 분리한다.
- Block 발생 시 기존 Notification은 삭제한다.

## 제외/보류 범위

- Quote 알림은 현재 Notification 범위에서 제외한다.
- 이메일 알림, grouped notifications, quiet hours, batch summary, 대량 멘션 제한 정책은 현재
  Notification 도메인 범위에서 제외한다.

## 확정된 용어

- 알림: Notification
- 알림함: Inbox
- 읽음: Read
- 알림 억제: Suppress
- thread mute: Muted Thread
