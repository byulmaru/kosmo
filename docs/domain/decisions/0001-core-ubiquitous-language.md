# ADR 0001: Core Ubiquitous Language

## 상태

Accepted

## 날짜

2026-06-28

[ADR 0014](./0014-post-structure-relations.md)가 Repost와 Quote의 Kind 기반 정의를 관계 조합 정의로
대체했다. 나머지 결정은 유지한다.

## 결정

Kosmo 도메인의 핵심 보편 언어를 다음처럼 확정한다.

| 개념             | 확정 용어       | 의미                                                                 |
| ---------------- | --------------- | -------------------------------------------------------------------- |
| 짧은 게시 단위   | Post            | Profile이 작성하고 배포하는 단문 콘텐츠                              |
| 공개 소셜 정체성 | Profile         | 게시, 팔로우, 상호작용, 알림의 기본 행동 주체                        |
| 로그인 주체      | Account         | 인증과 Profile Owner/Member 관계의 주체                              |
| 게시 접근 범위   | Post Visibility | Post를 볼 수 있는 Profile 관계를 정하는 상태 차원                    |
| 게시 목록        | Post List       | 여러 객체를 소비해 Post 후보와 Control Decision을 계산하는 조회 정책 |
| 반응             | Reaction        | Profile이 Post에 남기는 이모지 반응 객체                             |
| 재게시           | Repost          | Post Kind 상태 값                                                    |
| 인용 게시        | Quote           | 자체 본문 또는 Media와 Source Post를 가진 Post Kind 상태 값          |
| 개인 저장        | Bookmark        | Profile이 Post를 개인적으로 저장한 객체                              |
| 내용 경고        | Content Warning | Post 본문과 Media를 접어 표시하는 속성                               |
| 민감한 미디어    | Sensitive Media | Post에 연결된 모든 Media 표시를 가리는 boolean 속성                  |

## 용어 규칙

- `Post`는 canonical 작성 단위다. `Note`, `Status`는 canonical domain term으로 사용하지 않는다.
- `Profile`은 공개 소셜 정체성과 소셜 행동 주체다. `Account`는 로그인과 Profile 운영 관계의 주체다.
- Local/Remote 구분은 [Profile](../objects/profile.md)의 Profile Origin과 [Instance](../objects/instance.md)의
  Instance Type 상태 차원이다. 모든 Profile은 같은 Local/Remote 값을 가진 Instance 하나와 연결된다.
- `Post Visibility`는 [Post](../objects/post.md)의 상태 차원이다. Post List는 이를 재정의하지 않는다.
- `Post Eligibility`는 데이터 속성이나 값 객체가 아니라 Post가 소유한 조회 후보성 정책이다.
- `Post List`는 durable 객체가 아니다. Home, Profile, Hashtag Post List 규칙은
  [Post List Policy](../policies/post-list.md)에 둔다.
- `Repost`와 `Quote`는 별도 durable 객체가 아니라 Post Kind 값이다.
- `Reaction`과 `Bookmark`는 별도 durable 객체다.
- `Audience`, `Feed`, `Post List Item`, `좋아요`, `부스트`는 canonical domain term으로 사용하지 않는다.
- Account가 주체인 행동은 인증, Profile Owner/Member 관계, 운영자 행동에 한정한다.
- Messaging, Collection, Follow Pack은 현재 범위에서 제외한다.

## Post Visibility 값

| 값                 | 의미                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| Public             | 모든 viewer가 볼 수 있고 검색/Hashtag Post List 후보가 된다          |
| Unlisted           | 모든 viewer가 볼 수 있지만 검색/Hashtag Post List 후보가 되지 않는다 |
| Followers Only     | 작성자, 작성자를 팔로우한 Profile, 멘션된 Profile이 볼 수 있다       |
| Mentioned Profiles | 작성자와 멘션된 Profile만 볼 수 있다                                 |

## 문서 반영

- [Post](../objects/post.md)는 Post Kind, Post Visibility, Repost, Quote, Post Eligibility를 소유한다.
- [Profile](../objects/profile.md)은 Local/Remote 상태와 기본 소셜 행동 주체를 정의한다.
- [Post List Policy](../policies/post-list.md)는 목록 후보와 Control Decision을 정의한다.
- [Reaction](../objects/reaction.md)과 [Bookmark](../objects/bookmark.md)은 독립 객체로 유지한다.
