# Discovery 컨텍스트: 검색과 발견

## 목표

Profile이 Profile, Post, 해시태그, 원격 Profile을 찾을 수 있어야 한다. 검색은 Profile이 명시적으로
찾는 기능이고, 발견은 검색 가능한 대상을 만나는 기능이다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Media](./media.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Post List](./post-list.md)
- peer: [Social Graph](./social-graph.md), [Notification](./notification.md)

## DDD 명세

- 컨텍스트 경계: 검색, 원격 Profile lookup, 해시태그를 정의한다. 프로필과 게시의 원본 생명주기는
  소유하지 않는다.
- 보편 언어: Search Query, Search Result, Lookup, Hashtag, Search Index.
- 핵심 모델: Search Index를 aggregate 후보로 둔다.
- 값 객체 후보: Query Text, Result Type, Rank, Hashtag Name, Remote Locator, Search Scope.
- 불변 조건: 검색은 viewer가 볼 수 없는 게시와 차단/정지된 프로필을 노출하면 안 된다. 원격 lookup과
  일반 검색은 실패 사유와 의미를 구분해야 한다.
- 도메인 이벤트 후보: SearchPerformed, RecentSearchSaved, RemoteProfileResolved.
- 정책 후보: 색인 범위, 최근 검색 저장 위치, 원격 lookup 제한.

## 핵심 기능

### Post 검색

- Post Visibility가 공개인 Post를 검색할 수 있다.
- 조용한 공개, 팔로워 공개, 멘션한 프로필만 Post는 검색 결과에 노출하지 않는다.

### 프로필 검색

- display name과 handle로 프로필을 찾을 수 있다.
- 같은 handle이 여러 instance에 있을 수 있으므로 qualified handle을 표시한다.
- 정지, 삭제, 차단된 프로필은 검색에서 제외한다.
- Profile은 원격 프로필 URL, remote URL, `handle@host` 형태로 프로필을 찾을 수 있다.
- WebFinger lookup이 가능한 경우 원격 Profile로 resolve한다.

### 해시태그 검색

- Profile은 해시태그를 검색하고 해당 해시태그 게시 목록으로 이동할 수 있다.
- 해시태그 게시 목록은 Post Visibility가 공개인 원본 Post만 대상으로 한다.
- 해시태그는 대소문자를 구분하지 않는다.

## 검색 권한과 안전

- 차단한 프로필과 나를 차단한 프로필은 검색 결과에서 제외한다.
- 검색별로 차단 관계 적용을 끄는 옵션은 두지 않는다.
- 검색에 적용하도록 설정된 Word Mute 또는 Hashtag Mute에 매치되는 Post는 검색에서 제외한다.
- 민감한 미디어는 검색 결과에서 자동 펼침하지 않는다.
- moderation action으로 제한, 정지, 삭제된 Post와 Profile은 색인에서 제외한다.
- Trust & Safety에서 차단된 원격 도메인의 콘텐츠는 lookup을 제한한다.

## 제외/보류 범위

- 추천 검색어, 인기 해시태그, trend, spelling suggestion은 현재 Discovery 도메인 범위에서 제외한다.
- 해시태그 자동완성은 현재 Discovery 도메인 범위에서 제외한다.
- Custom Post List와 키워드 기반 독립 Post List는 현재 Discovery 범위에서 제외한다.
- Follow Pack은 현재 Discovery 범위에서 제외한다.

## 확정된 용어

- 검색: Search
- 원격 조회: Lookup
- 해시태그: Hashtag
