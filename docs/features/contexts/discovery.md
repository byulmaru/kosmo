# Discovery 컨텍스트: 검색과 발견

## 목표

Profile이 사람, 게시, 해시태그, 주제, 커뮤니티를 찾을 수 있어야 한다. 검색은 Profile이
명시적으로 찾는 기능이고, 발견은 Profile이 아직 모르는 대상을 만나는 기능이다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: [Identity](./identity.md), [Publishing](./publishing.md), [Media](./media.md)
- policy upstream: [Trust & Safety](./trust-safety.md)
- downstream: [Feed](./feed.md)
- peer: [Social Graph](./social-graph.md), [Notification](./notification.md)

## DDD 명세

- 컨텍스트 경계: 검색, 원격 Profile lookup, 해시태그, 추천, 탐색 탭, Follow Pack, trend를 정의한다.
  프로필과 게시의 원본 생명주기는 소유하지 않는다.
- 보편 언어: Search Query, Search Result, Lookup, Hashtag, Explore, Trend, Follow Pack, Directory.
- 핵심 모델: Search Index, Saved Search, Follow Pack을 aggregate 후보로 둔다.
- 값 객체 후보: Query Text, Result Type, Rank, Hashtag Name, Remote Locator, Search Scope.
- 불변 조건: 검색은 viewer가 볼 수 없는 게시와 차단/정지된 프로필을 노출하면 안 된다. 원격 lookup과
  일반 검색은 실패 사유와 의미를 구분해야 한다.
- 도메인 이벤트 후보: SearchPerformed, RecentSearchSaved, RemoteProfileResolved, FollowPackPresented,
  StarterPackApplied, TrendApproved.
- 정책 후보: 색인 범위, 최근 검색 저장 위치, trend 승인 모델, 추천 사유 표시, 원격 lookup 제한.

## 핵심 기능

### Post 검색

- Post Visibility가 공개인 Post를 검색할 수 있다.
- 조용한 공개, 팔로워 공개, 멘션한 프로필만 Post는 검색 결과에 노출하지 않는다.

### 프로필 검색

- display name, handle, bio 일부로 프로필을 찾을 수 있다.
- handle exact match를 우선 제공한다.
- 같은 handle이 여러 instance에 있을 수 있으므로 full handle을 표시한다.
- 정지/삭제/차단된 프로필은 검색에서 제외하거나 제한 표시한다.
- Profile은 원격 프로필 URL, remote URL, `handle@host` 형태로 프로필을 찾을 수 있다.
- WebFinger lookup이 가능한 경우 원격 Profile로 resolve한다.

### 해시태그 검색

- Profile은 해시태그를 검색하고 해당 해시태그 피드로 이동할 수 있다.
- 해시태그 자동완성을 제공할 수 있다.
- 해시태그 피드는 Post Visibility가 공개인 Post만 대상으로 한다.
- 해시태그는 대소문자를 구분하지 않는다.

## 검색 권한과 안전

- 차단한 프로필과 나를 차단한 프로필은 검색 결과에서 제외한다.
- 뮤트한 단어가 포함된 게시는 검색에서 제외한다.
- 민감한 미디어는 검색 결과에서 자동 펼침하지 않는다.
- 신고/정지된 콘텐츠는 색인에서 제외한다.
- 차단된 instance의 원격 콘텐츠는 lookup을 제한한다.

## 상태와 에러

상태와 에러의 구체적인 화면 표현은 디자인 문서로 이관한다.

- 검색어 없음: 최근 검색, 추천 검색어, 인기 해시태그.
- 결과 없음: spelling suggestion, 원격 lookup 제안.

## 탐색 탭과 초기 범위 후보

탐색 탭의 화면 구성은 디자인 문서로 이관한다.

- 검색 화면은 인기, 최신, 미디어, 사람 같은 탭을 가질 수 있다.
- 초기 활성 탭은 사람 검색으로 둘 수 있다.
- 첫 검색 범위는 활성 프로필의 handle 정확 일치 검색으로 좁게 시작할 수 있다.
- 최근 검색어는 최대 8개 정도를 저장하는 정책을 후보로 두되, 기기 저장인지 계정 동기화인지
  개인정보 정책으로 정한다.
- 인기/최신/미디어 탭, 게시 검색, 해시태그 검색, 원격 Profile lookup, 프로필 디렉터리는 발견
  기능 범위가 정해진 뒤 순차적으로 도입한다.
- Custom Feed와 키워드 기반 독립 Feed는 현재 Discovery 범위에서 제외한다.

## 미결정 네이밍

- 검색: Search, Explore Search
- 탐색: Explore, Discover
- 트렌드: Trend, Trending
- 팔로우팩: Follow Pack, Onboarding Pack
- 저장 검색: Saved Search, Watch
