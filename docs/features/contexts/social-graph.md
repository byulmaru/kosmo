# Social Graph 컨텍스트: 관계와 소셜 그래프

## 목표

Profile 간 Follow Relationship과 관계 기반 권한, 관계 기반 게시 목록 후보를 정의한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Publishing](./publishing.md), [Post List](./post-list.md), [Notification](./notification.md),
  [Discovery](./discovery.md)
- peer: [Engagement](./engagement.md)

## DDD 명세

- 컨텍스트 경계: 팔로우, 언팔로우, 팔로우 요청, 팔로워/팔로잉 목록, 관계별 개인 설정을 정의한다.
  게시 생성, Profile의 팔로우 승인 정책, 팔로워/팔로잉 목록 공개 범위, 알림 전달은 소유하지 않는다.
- 보편 언어: Follow, Follower, Followee, Follow Request, Relationship, Relationship Preference.
- 핵심 모델: Follow Relationship을 aggregate root 후보로 둔다. Follow Request는 별도 entity가 아니라
  Follow Relationship의 요청 대기 상태다. Relationship Preference는 관계 생명주기 안에서 다룬다.
- 값 객체 후보: Follow State, Relationship List Access, Language Preference, Relationship Notification
  Preference.
- 불변 조건: 자기 자신은 팔로우할 수 없다. block은 follow보다 우선한다. 승인 전에는 팔로워 공개
  게시 접근 권한을 얻지 못한다.
- 도메인 이벤트 후보: FollowRequested, FollowAccepted, FollowRejected, FollowRemoved,
  RelationshipPreferenceChanged.
- 정책 후보: 재요청 가능 여부, 관계별 새 Post 알림 preference.

## 핵심 기능

### 팔로우

- Profile은 다른 프로필을 팔로우할 수 있다.
- 수락된 Follow Relationship은 Home Post List 후보 계산에 사용된다.
- 자기 자신은 팔로우할 수 없다.
- 차단한 프로필 또는 나를 차단한 프로필은 팔로우할 수 없다.

### 언팔로우

- Profile은 팔로우를 해제할 수 있다.
- 언팔로우 후 해당 Profile의 새 Post와 Repost는 Home Post List 후보가 아니다.
- 이미 받은 알림은 삭제하지 않는다.
- 과거 Home Post List 후보였던 Post와 Repost는 더 이상 후보가 아니다.

### 팔로우 요청

- Identity의 Profile 팔로우 승인 정책이 승인제이면 Follow Relationship은 즉시 수락되지 않고 요청
  대기 상태가 된다.
- 대상 Profile은 요청을 승인하거나 거절할 수 있다.
- 요청자는 대기 상태를 볼 수 있고 취소할 수 있다.
- 승인 전에는 팔로워 공개 게시를 볼 수 없다.

### 관계별 개인 설정

- Profile은 특정 팔로우 대상이 새 게시를 올릴 때 알림을 받을지 선택할 수 있다.
- 새 Post 알림 preference는 팔로우 자체와 분리된 관계 메타데이터로 다룬다.
- Notification은 이 preference를 소비해 새 Post 알림을 생성한다.

### 팔로워 목록

- 팔로워 목록은 대상 Profile을 수락된 상태로 팔로우하는 Profile 집합이다.
- 목록 공개 범위는 Identity가 소유한 Profile의 팔로워 목록 공개 범위를 따른다.
- 목록은 cursor pagination을 제공한다.
- 관계 판정은 현재 active Profile 기준으로 계산한다.

### 팔로잉 목록

- 팔로잉 목록은 대상 Profile이 수락된 상태로 팔로우하는 Profile 집합이다.
- 목록 공개 범위는 Identity가 소유한 Profile의 팔로잉 목록 공개 범위를 따른다.
- cursor pagination을 제공한다.

## 보류 범위

- 팔로우 가져오기와 내보내기, 계정 이동, 서버 이전, 백업은 현재 Social Graph 도메인 범위에서
  제외한다.
- List, 추천 팔로우, Followed Hashtag, 가까운 친구 또는 서클은 현재 Social Graph 도메인 범위에서
  제외한다.
- 특정 팔로우 대상의 Repost 수신 끄기와 언어 제한 설정은 현재 Social Graph 도메인 범위에서 제외한다.
- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리하고 현재 도메인 명세에서
  제외한다.

## 도메인 속성/정책 메모

- 팔로우 관계는 viewer Profile 기준이다. 로그인 Account 기준과 혼동하면 안 된다.
- Account가 여러 Profile을 가질 수 있으므로 관계 행동은 active Profile 기준으로 수행한다.
- Follow Request는 Follow Relationship의 요청 대기 상태로 모델링한다.
- block은 follow보다 우선한다. 차단 시 기존 follow는 삭제한다.

## 관계 상태와 접근 원칙

- 팔로우 관계는 요청 대기, 수락, 거절 상태를 가질 수 있다.
- Identity의 Profile 팔로우 승인 정책은 자유와 승인제로 나뉜다.
- 팔로우 행동은 active Profile 기준으로 수행되며 자기 자신을 팔로우할 수 없다.
- 자유 Profile의 새 팔로우는 즉시 수락될 수 있고, 승인제 Profile의 새 팔로우는 요청 대기
  상태가 된다.
- 거절된 요청은 다시 보낼 수 있다.
- 팔로워/팔로잉 수는 수락된 관계와 활성 프로필을 기준으로 계산한다.
- 팔로워/팔로잉 목록 접근은 viewer가 관계 당사자인지, Identity가 소유한 목록 공개 범위가 허용하는지에
  따라 제한한다.

## 확정된 용어

- 팔로우: Follow
- 팔로워: Followers
- 팔로잉: Following
- 팔로우 요청: Follow Request
- 관계별 설정: Relationship Preference
