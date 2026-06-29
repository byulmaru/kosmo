# Trust & Safety 컨텍스트: 안전과 모더레이션

## 목표

Profile 단위 제어와 운영자 Account의 moderation action, 서버/Domain moderation 정책을 정의한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- reference upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Media](./media.md)
- policy downstream: [Publishing](./publishing.md), [Media](./media.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md), [Post List](./post-list.md), [Discovery](./discovery.md),
  [Notification](./notification.md)
- peer: 없음. 정책 적용 범위가 넓은 cross-cutting 컨텍스트다.

## DDD 명세

- 컨텍스트 경계: 뮤트, 차단, 단어/해시태그 뮤트, 신고, 운영자 조치, 서버/도메인 moderation을
  정의한다. 게시와 프로필의 원본 작성은 소유하지 않지만 표시와 접근 가능성에 영향을 준다.
- 보편 언어: Mute, Block, Word Mute, Hashtag Mute, Report, Moderation Case, Moderation Action, Domain Limit,
  Domain Block, Server Rule, Audit Log.
- 핵심 모델: Moderation Case, Profile Safety Rule, Domain Moderation Rule을 aggregate 후보로 둔다.
- 값 객체 후보: Report Reason, Moderation Scope, Action Type, Expiration, Mute Context, Domain,
  Domain Moderation Action.
- 불변 조건: block은 follow와 engagement보다 우선한다. 운영자 조치는 감사 가능해야 한다. 삭제와
  숨김은 구분되어야 한다.
- 도메인 이벤트 후보: ProfileMuted, ProfileBlocked, WordMuted, HashtagMuted, ReportSubmitted,
  ModerationActionApplied, DomainBlocked, ServerRuleChanged.
- 정책 후보: 차단 시 기존 follow와 engagement 삭제, 도메인 차단 공개 여부, Domain moderation action,
  제한/정지 단계,
  운영자 action 감사, 신고 남용 방지.

Trust & Safety의 서버/도메인 moderation 중 Domain Block과 Post, Profile, Account 대상 moderation
결과는 Publishing의 Post Eligibility 정책에 반영되는 선행 정책 결과다. Domain Limit은 전역 Post
Eligibility를 false로 만들지 않고 Hashtag Post List 같은 공개 탐색 성격의 Post List와 Discovery 후보
제한으로 적용한다. Post List는 moderation 원본 정책을 재해석하지 않고 Trust & Safety와 Publishing이
제공한 정책 결과를 소비한다.

## Profile 제어

### 뮤트

- Profile은 특정 프로필을 뮤트할 수 있다.
- 뮤트된 프로필의 게시는 숨기거나 접고, 알림은 숨기거나 억제한다.
- 뮤트는 기존 Notification을 삭제하거나 상태를 바꾸지 않는다.
- 뮤트 기간을 영구/기간제 중에서 선택할 수 있다.
- 뮤트한 사실은 상대에게 알리지 않는다.
- 뮤트는 팔로우 관계를 자동으로 끊지 않는다.

### 차단

- Profile은 특정 프로필을 차단할 수 있다.
- 차단된 Profile은 차단한 Profile의 Post, Profile, 팔로우 목록, 상호작용 접근이 제한된다.
- 차단 시 기존 follow, Reaction, Repost, Bookmark는 삭제한다.
- 차단은 기존 Notification을 삭제하거나 상태를 바꾸지 않는다.
- 차단한 사실을 직접 알리지 않는다.

### 단어와 해시태그 뮤트

- Profile은 단어, 문구, 해시태그를 뮤트할 수 있다.
- 단어/해시태그 뮤트는 Home Post List, 알림, Hashtag Post List, 검색, Profile Post List 중 적용
  위치를 가질 수 있다.
- 뮤트된 콘텐츠는 완전히 숨기거나 경고로 접을 수 있다.
- 단어/해시태그 뮤트에는 만료 시간을 둘 수 있다.
- 단어/해시태그 뮤트는 대소문자를 구분하지 않고, 단어 경계 없이 글자 단위 부분 문자열로 매치한다.

### 민감한 콘텐츠 제어

- Profile은 Post가 가진 민감한 미디어 상태를 기본으로 숨길 수 있다.
- Content Warning이 붙은 Post를 자동으로 접을 수 있다.
- 서버 정책상 특정 카테고리는 항상 접힌 상태로 표시할 수 있다.

## 신고

### 게시 신고

- Account는 특정 게시를 신고할 수 있다.
- 신고 사유, 추가 설명, 관련 게시 묶음을 제출할 수 있다.
- 신고는 남용 방지 정책의 대상이다.
- 신고 제출만으로 대상 Post, Profile, Account의 노출이나 알림 상태는 바뀌지 않는다.

### 프로필 신고

- Account는 해당 Account와 역할 관계가 없는 Profile을 신고할 수 있다.
- 신고 시 최근 게시 일부를 함께 첨부할 수 있다.

### 신고 처리

- 운영자 Account는 신고를 검토하고 dismiss, warn, limit, suspend, remove content 같은 조치를 할 수
  있다.
- limit은 특정 기능이나 도달 범위를 제한하는 조치이고, suspend는 Account 또는 Profile의 사용과 표시를
  정지하는 조치다.
- 신고 처리 기록은 감사 로그로 남겨야 한다.
- 신고자에게 처리 결과와 처리 상태 목록을 제공하지 않는다.
- 제한 또는 정지된 Account/Profile에서 발생한 소셜 알림은 별도 알림함으로 분리하지 않고 노출하지
  않는다.

## 서버와 도메인 모더레이션

### 서버 차단

- 운영자 Account는 특정 원격 도메인을 제한하거나 차단할 수 있다.
- 도메인 차단은 원격 Profile, Post, Media, 새 Notification, 관계 후보에 영향을 준다.
- 차단 이유와 범위는 Audit Log 대상이다.
- 공개 차단 목록은 제공하지 않는다.

### Domain Moderation Action

Domain moderation action은 운영자 Account가 원격 Domain 전체에 적용하는 moderation action이다. Profile
제어의 mute/block과 다르며, Trust & Safety가 원본 정책을 소유하고 각 downstream 컨텍스트는 그 결과를
소비한다.

| Action       | 의미                               | 도메인 효과                                                                                                               |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Domain Limit | 원격 Domain의 도달 범위를 제한한다 | Hashtag Post List 같은 공개 탐색 성격의 Post List와 Discovery 후보에서 제외하고, Media 접근 결과에도 제한 정책을 반영한다 |
| Domain Block | 원격 Domain을 없는 것처럼 취급한다 | 원격 Profile, Post, Media, 관계 후보를 노출하지 않고 새 Notification을 만들지 않는다                                      |

- Domain Limit은 원격 Domain을 완전히 차단하지 않는다. 직접 접근 가능한 맥락에서 보이는지 여부는
  Publishing의 Post Visibility와 Post Eligibility가 판단하고, Trust & Safety 결과는 Media 접근 결과에
  반영한다.
- Domain Block은 원격 Domain의 콘텐츠와 관계 후보를 viewer에게 없는 것처럼 취급한다.
- Domain moderation action은 기존 Notification을 삭제하거나 읽음 상태를 바꾸지 않는다.
- Domain moderation action의 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로
  분리한다.

### Profile 도메인 차단

- Profile은 특정 원격 도메인을 개인적으로 차단할 수 있다.
- 개인 도메인 차단은 서버 전체 차단과 다르며 viewer Profile 기준 뮤트/차단 정책으로 적용한다.
- 검색, 원격 lookup, 게시 목록, 알림에서 같은 도메인 차단 정책을 동일하게 적용해야 한다.
- 서버 차단 또는 Profile 도메인 차단에 걸린 콘텐츠는 없는 것처럼 취급한다.

### 서버 규칙

- 서버는 커뮤니티 규칙을 공개해야 한다.
- 신고 사유와 moderation action은 서버 규칙과 연결되어야 한다.
- 규칙 변경 시 대상 Account/Profile에게 알려야 한다.

## 도메인 속성/정책 메모

- Profile 제어는 viewer Profile 기준이다.
- 운영자 action은 계정, 프로필, 게시, 도메인 단위로 나뉜다.
- Domain moderation action은 Domain Limit과 Domain Block을 가진다.
- moderation action은 감사 가능해야 하며 삭제와 숨김을 구분해야 한다.
- 신고 제출만으로는 대상의 노출, 알림, 라우팅이 바뀌지 않는다.
- 서버 차단 콘텐츠는 접근 판정에서 정책 차단 사유를 공개하지 않고 없는 콘텐츠처럼 취급한다.

## 제외/보류 범위

- Labeler와 stackable moderation은 현재 Trust & Safety 도메인 범위에서 제외한다.
- 커뮤니티 모더레이션은 현재 Trust & Safety 도메인 범위에서 제외한다.
- 신고 제출 후 신고 내용을 수정하는 기능은 제공하지 않는다.
- 연합 delivery 실패, 원격 서버 전달 실패, 원격 서버 삭제/정지 신호 적용 순서는 구현/연합 스펙으로
  분리하고 현재 도메인 명세에서 제외한다.

## 확정된 용어

- 뮤트: Mute
- 차단: Block
- 단어 뮤트: Word Mute
- 해시태그 뮤트: Hashtag Mute
- 신고: Report
- 제한: Limit
- 정지: Suspend
