# Social Graph 컨텍스트: 관계와 소셜 그래프

## 목표

Profile이 관심 있는 프로필을 팔로우하고, 팔로우 관계를 관리하고, 관계 기반 게시 목록과 권한을
예측 가능하게 사용할 수 있어야 한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Publishing](./publishing.md), [Post List](./post-list.md), [Notification](./notification.md),
  [Discovery](./discovery.md)
- peer: [Engagement](./engagement.md)

## DDD 명세

- 컨텍스트 경계: 팔로우, 언팔로우, 팔로우 요청, 팔로워/팔로잉 목록, 관계별 개인 설정을 정의한다.
  게시 생성, Profile의 팔로우 승인 정책, 알림 전달은 소유하지 않는다.
- 보편 언어: Follow, Follower, Followee, Follow Request, Relationship, Relationship Preference.
- 핵심 모델: Follow Relationship을 aggregate root 후보로 둔다. Follow Request와 Relationship
  Preference는 관계 생명주기 안에서 다룬다.
- 값 객체 후보: Follow State, Relationship List Access, Language Preference, Relationship Notification
  Preference.
- 불변 조건: 자기 자신은 팔로우할 수 없다. block은 follow보다 우선한다. 승인 전에는 팔로워 공개
  게시 접근 권한을 얻지 못한다.
- 도메인 이벤트 후보: FollowRequested, FollowAccepted, FollowRejected, FollowRemoved,
  RelationshipPreferenceChanged.
- 정책 후보: 재요청 가능 여부, 팔로워/팔로잉 목록 공개 범위, 관계별 새 Post 알림 preference.

## 핵심 기능

### 팔로우

- Profile은 다른 프로필을 팔로우할 수 있다.
- 팔로우한 프로필의 Post는 홈 게시 목록에 나타난다.
- 자기 자신은 팔로우할 수 없다.
- 차단한 프로필 또는 나를 차단한 프로필은 팔로우할 수 없다.

### 언팔로우

- Profile은 팔로우를 해제할 수 있다.
- 언팔로우 후 해당 프로필의 새 Post와 Repost는 홈 게시 목록에 들어오지 않는다.
- 이미 받은 알림은 삭제하지 않는다.
- 과거 홈 게시 목록 항목은 더 이상 후보가 아니므로 목록에서 사라진다.

### 팔로우 요청

- Identity의 Profile 팔로우 승인 정책이 승인제이면 즉시 팔로우가 아니라 요청 상태가 된다.
- 대상 Profile은 요청을 승인하거나 거절할 수 있다.
- 요청자는 대기 상태를 볼 수 있고 취소할 수 있다.
- 승인 전에는 팔로워 공개 게시를 볼 수 없다.

### 관계별 개인 설정

- Profile은 특정 팔로우 대상이 새 게시를 올릴 때 알림을 받을지 선택할 수 있다.
- 새 Post 알림 preference는 팔로우 자체와 분리된 관계 메타데이터로 다룬다.
- Notification은 이 preference를 소비해 새 Post 알림을 생성한다.

### 팔로워 목록

- 프로필을 팔로우하는 프로필 목록을 보여준다.
- 목록 공개 범위는 프로필 공개 정책을 따른다.
- 목록은 cursor pagination을 제공한다.
- 관계 판정은 현재 active Profile 기준으로 계산한다.

### 팔로잉 목록

- 프로필이 팔로우하는 프로필 목록을 보여준다.
- 목록 공개 범위는 팔로워 목록과 별도로 정할 수 있다.
- cursor pagination을 제공한다.

## 보류 범위

### 팔로우 가져오기와 내보내기

- 계정 이동, 서버 이전, 백업과 연결된다.
- 원격 프로필 identity 안정성이 먼저 필요하다.

- List, 추천 팔로우, Followed Hashtag, 가까운 친구 또는 서클은 현재 Social Graph 도메인 범위에서
  제외한다.
- 특정 팔로우 대상의 Repost 수신 끄기와 언어 제한 설정은 현재 Social Graph 도메인 범위에서 제외한다.
- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리하고 현재 도메인 명세에서
  제외한다.

## 도메인 속성/정책 메모

- 팔로우 관계는 viewer Profile 기준이다. 로그인 Account 기준과 혼동하면 안 된다.
- Account가 여러 Profile을 가질 수 있으므로 관계 행동은 active Profile 기준으로 수행한다.
- Follow Request와 Follow Relationship은 별도 상태로 모델링한다.
- block은 follow보다 우선한다. 차단 시 기존 follow는 삭제한다.

## 관계 상태와 접근 원칙

- 팔로우 관계는 요청 대기, 수락, 거절 상태를 가질 수 있다.
- Identity의 Profile 팔로우 승인 정책은 자유와 승인제로 나뉜다.
- 팔로우 행동은 active Profile 기준으로 수행되며 자기 자신을 팔로우할 수 없다.
- 자유 Profile의 새 팔로우는 즉시 수락될 수 있고, 승인제 Profile의 새 팔로우는 요청 대기
  상태가 된다.
- 거절된 요청은 다시 보낼 수 있다.
- 팔로워/팔로잉 수는 수락된 관계와 활성 프로필을 기준으로 계산한다.
- 팔로워/팔로잉 목록 접근은 viewer가 관계 당사자인지, 양쪽 프로필이 목록을 공개할 수 있는
  상태인지에 따라 제한한다.

## 확정된 용어

- 팔로우: Follow
- 팔로워: Followers
- 팔로잉: Following
- 팔로우 요청: Follow Request
- 관계별 설정: Relationship Preference
