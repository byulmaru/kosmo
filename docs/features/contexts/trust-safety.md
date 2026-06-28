# Trust & Safety 컨텍스트: 안전과 모더레이션

## 목표

Profile이 원하지 않는 사람과 콘텐츠를 제어하고, 운영자 Account가 서버와 커뮤니티를 보호할 수 있어야
한다. Profile 제어와 서버 단위 moderation을 모두 명확한 정책으로 둔다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- reference upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Media](./media.md)
- policy downstream: [Publishing](./publishing.md), [Media](./media.md), [Social Graph](./social-graph.md),
  [Engagement](./engagement.md), [Feed](./feed.md), [Discovery](./discovery.md),
  [Notification](./notification.md), [Messaging](./messaging.md)
- peer: 없음. 정책 적용 범위가 넓은 cross-cutting 컨텍스트다.

## DDD 명세

- 컨텍스트 경계: 뮤트, 차단, 필터, 신고, 운영자 조치, 서버/도메인 moderation을 정의한다. 게시와
  프로필의 원본 작성은 소유하지 않지만 표시와 접근 가능성에 영향을 준다.
- 보편 언어: Mute, Block, Filter, Report, Moderation Case, Moderation Action, Domain Block,
  Server Rule, Audit Log.
- 핵심 모델: Moderation Case, Profile Safety Rule, Domain Moderation Rule을 aggregate 후보로 둔다.
- 값 객체 후보: Report Reason, Moderation Scope, Action Type, Expiration, Filter Context, Domain.
- 불변 조건: block은 follow와 engagement보다 우선한다. 운영자 조치는 감사 가능해야 한다. 삭제와
  숨김은 구분되어야 한다.
- 도메인 이벤트 후보: ProfileMuted, ProfileBlocked, FilterCreated, ReportSubmitted,
  ModerationActionApplied, DomainBlocked, ServerRuleChanged.
- 정책 후보: 차단 시 기존 follow 처리, 신고 결과 통지 범위, 도메인 차단 공개 여부, 제한/정지 단계,
  labeler 도입 여부.

Trust & Safety의 서버/도메인 moderation 결과는 Feed의 선택 control이 아니라 Publishing이 관리하는
Post Eligibility에 반영되는 선행 상태다. Feed는 moderation 원본 정책을 재해석하지 않고 이미 계산된
Post Eligibility를 소비한다.

## Profile 제어

### 뮤트

- Profile은 특정 프로필을 뮤트할 수 있다.
- 뮤트된 프로필의 게시와 알림은 숨기거나 접는다.
- 뮤트 기간을 영구/기간제 중에서 선택할 수 있다.
- 뮤트한 사실은 상대에게 알리지 않는다.
- 뮤트는 팔로우 관계를 자동으로 끊지 않는다.

### 차단

- Profile은 특정 프로필을 차단할 수 있다.
- 차단된 프로필은 내 게시, 프로필, 팔로우 목록, 상호작용에 접근이 제한된다.
- 차단 시 기존 팔로우 관계를 해제할지 정책이 필요하다.
- 차단한 사실을 직접 알리지는 않지만 기능적으로 추론될 수 있다.
- 원격 Profile 차단은 로컬 서버에서의 표시와 delivery 정책을 함께 다룬다.

### 단어와 해시태그 필터

- Profile은 단어, 문구, 해시태그를 필터링할 수 있다.
- 필터는 홈 피드, 알림, 공개 피드, 검색, 프로필 중 적용 위치를 가질 수 있다.
- 필터된 콘텐츠는 완전히 숨기거나 경고로 접을 수 있다.
- 필터에는 만료 시간을 둘 수 있다.
- 대소문자, 단어 경계, 언어별 분절 정책이 필요하다.

### 대화 뮤트

- Profile은 특정 thread의 추가 알림을 끌 수 있다.
- 대화 뮤트는 thread 자체를 삭제하거나 숨기는 기능이 아니다.
- 내가 작성한 게시의 답글 알림만 끄는 옵션과 전체 thread 알림을 끄는 옵션을 구분할 수 있다.

### 민감 콘텐츠 제어

- Profile은 민감 미디어를 기본으로 숨길 수 있다.
- content warning이 붙은 게시를 자동으로 접을 수 있다.
- 서버 정책상 특정 카테고리는 항상 접힌 상태로 표시할 수 있다.

## 신고

### 게시 신고

- Profile은 특정 게시를 신고할 수 있다.
- 신고 사유, 추가 설명, 관련 게시 묶음을 제출할 수 있다.
- 신고자는 처리 결과 알림을 받을 수 있다.
- 허위 신고와 남용 방지를 위한 rate limit이 필요하다.

### 프로필 신고

- Profile은 프로필을 신고할 수 있다.
- 신고 시 최근 게시 일부를 함께 첨부할 수 있다.
- 원격 프로필 신고는 로컬 운영자 처리와 원격 서버 전달 여부를 분리한다.

### 신고 처리

- 운영자 Account는 신고를 검토하고 dismiss, warn, limit, suspend, remove content 같은 조치를 할 수
  있다.
- 신고 처리 기록은 감사 로그로 남겨야 한다.
- 신고 대상에게 어떤 내용을 통지할지 정책이 필요하다.
- 신고자에게 처리 결과를 어느 수준까지 알려줄지 정해야 한다.

## 서버와 도메인 모더레이션

### 서버 차단

- 운영자 Account는 특정 원격 도메인을 제한하거나 차단할 수 있다.
- 도메인 차단은 원격 프로필, 게시, 미디어, 알림, follow delivery에 영향을 준다.
- 차단 이유와 범위를 내부적으로 기록해야 한다.
- 공개 차단 목록 제공 여부는 운영 정책으로 정한다.

### Profile 도메인 차단

- Profile은 특정 원격 도메인을 개인적으로 차단할 수 있다.
- 개인 도메인 차단은 서버 전체 차단과 다르며 viewer Profile 기준 필터로 적용한다.
- 검색, 원격 lookup, 피드, 알림, 추천에서 같은 도메인 차단 정책을 동일하게 적용해야 한다.
- 서버 차단과 Profile 차단이 동시에 적용될 때 어떤 사유를 노출할지 정해야 한다.

### 제한 또는 샌드박스

- 특정 원격 서버의 콘텐츠를 공개 피드에서 제외할 수 있다.
- 미디어만 프록시하거나 민감 처리할 수 있다.
- 신규 계정의 도달 범위를 제한할 수 있다.
- 완전 차단보다 낮은 단계의 moderation action으로 사용한다.

### 서버 규칙

- 서버는 커뮤니티 규칙을 공개해야 한다.
- 신고 사유와 moderation action은 서버 규칙과 연결되어야 한다.
- 규칙 변경 시 대상 Account/Profile에게 알려야 한다.

## 선택 기능

### Labeler와 stackable moderation

- 외부 또는 커뮤니티 moderation label을 콘텐츠에 붙일 수 있다.
- Profile은 어떤 label source를 신뢰할지 선택할 수 있다.
- 복잡도가 높으므로 운영자 label부터 시작할지 제품 결정이 필요하다.

### 커뮤니티 모더레이션

- 커뮤니티별 관리자, 규칙, 차단, 게시 삭제 권한을 둘 수 있다.
- 전체 서버 moderation과 커뮤니티 moderation의 적용 순서가 필요하다.
- 커뮤니티 기능을 도입할 때 별도 스펙으로 분리한다.

## 상태와 에러

- 뮤트/차단 처리 성공 후 관련 UI가 즉시 갱신되어야 한다.
- 신고 제출 후 신고 내용을 수정할 수 있는지 정해야 한다.
- 신고 처리 상태는 신고자에게 제한적으로만 보여줄 수 있다.
- 서버 차단 콘텐츠를 열려고 할 때 단순 404와 정책 차단을 어떻게 구분할지 정해야 한다.

## 도메인 속성/정책 메모

- Profile 제어는 viewer Profile 기준이다.
- 운영자 action은 계정, 프로필, 게시, 도메인 단위로 나뉜다.
- moderation action은 감사 가능해야 하며 삭제와 숨김을 구분해야 한다.
- 연합 서버에서 들어온 삭제/정지 신호와 로컬 moderation action의 적용 순서가 필요하다.

## 미결정 네이밍

- 뮤트: Mute, Hide
- 차단: Block
- 필터: Filter, Word Filter
- 신고: Report
- 제한: Limit, Silence, Restrict
- 정지: Suspend
