# ADR 0001: Core Ubiquitous Language

## 상태

Accepted

## 날짜

2026-06-28

## 결정

Kosmo DDD 명세의 핵심 보편 언어를 다음과 같이 확정한다.

| 개념                | 확정 용어       | 한국어 설명   | 사용 범위                                                       |
| ------------------- | --------------- | ------------- | --------------------------------------------------------------- |
| 짧은 게시 단위      | Post            | 게시          | Profile이 작성하고 배포하는 단문 콘텐츠의 canonical domain term |
| 공개 소셜 정체성    | Profile         | 프로필        | 게시, 팔로우, 상호작용, 알림의 기본 행동 주체                   |
| 로그인/보안 주체    | Account         | 계정          | 인증, 보안 설정, Profile 소유 관계의 주체                       |
| 게시 접근/노출 범위 | Post Visibility | 공개 범위     | Post를 누가 볼 수 있고 어디에 노출될 수 있는지 나타내는 값 객체 |
| 게시 목록           | Feed            | 피드          | Post 목록과 해당 목록의 후보 선택, 제어, 정렬 규칙              |
| 반응                | Reaction        | 반응          | Profile이 Post에 남기는 반응 행동                               |
| 재게시              | Repost          | 재게시        | Profile이 원본 Post를 자신의 관계망에 다시 노출하는 행동        |
| 북마크              | Bookmark        | 북마크        | Profile이 Post를 개인적으로 저장하는 행동                       |
| 내용 경고           | Content Warning | 내용 경고     | Post 본문과 미디어를 접어서 보여주기 위한 표시 정책             |
| 민감한 미디어       | Sensitive Media | 민감한 미디어 | Profile 또는 정책이 민감한 것으로 표시한 Media                  |

## 용어 규칙

- `Post`는 Kosmo의 canonical 작성 단위다.
- `Note`와 `Status`는 Kosmo의 canonical domain term으로 사용하지 않는다.
- `Profile`은 공개 소셜 정체성과 행동 주체를 뜻한다.
- `Account`는 로그인과 보안 설정의 주체로만 사용한다.
- 프로토콜 행위자 용어와 일반 행위 주체 용어는 Kosmo의 canonical domain term으로 사용하지 않는다.
- 원격 프로토콜에서 행위자를 나타내는 개념도 도메인 문서에서는 `Remote Profile`로 표현한다.
- `Post Visibility`는 domain/value-object 용어로 사용하고, 화면 표시용 한국어 문구는 `공개 범위`로
  쓴다.
- `Post Visibility`는 Post의 속성이고 Publishing이 소유한다. Feed는 Post Visibility를 Feed Control로
  재정의하지 않는다.
- `Post Visibility`는 viewer Profile별 접근 가능 대상을 먼저 결정한다. `Post Eligibility`는 Post
  Visibility가 허용한 viewer-visible Post 안에서 읽기/전파 후보성을 제한한다.
- `Feed`는 Post 목록을 뜻하는 핵심 도메인 용어다. 시간순 게시 목록 계열 용어는 canonical domain
  term으로 사용하지 않는다.
- `Reaction`과 `Repost`를 canonical domain term으로 사용한다. 좋아요, 부스트, 확산 계열 표현은
  canonical domain term으로 사용하지 않는다.
- `Reaction`은 Post 하나에 Profile당 여러 개를 허용한다.
- `Bookmark`의 한국어 표현은 `북마크`로 쓴다.
- `Quote`는 현재 도메인 범위에서 제외한다.
- `Collection`은 현재 Engagement 범위에서 제외한다.
- `Follow Pack`은 현재 도메인 범위에서 제외한다.
- `Content Warning`의 한국어 표현은 `내용 경고`로 쓴다.
- `Sensitive Media`의 한국어 표현은 `민감한 미디어`로 쓴다.
- `Audience`와 `공개 설정`은 canonical domain term으로 쓰지 않는다. 필요하면 UI 설명 문구로만
  제한한다.
- Messaging은 현재 도메인 범위에서 제외한다. `멘션한 프로필만`은 Publishing의 Post Visibility 값으로
  다룬다.
- Account가 주체인 행동은 인증, 보안, Profile 소유, 운영자 권한에 한정한다. 그 외 소셜 행동의
  기본 주체는 Profile이다.
- Account-Profile 관계는 역할 기반 소유 모델로 둔다. 하나의 Account는 여러 Profile과 연결될 수
  있고, 하나의 Profile도 여러 Account와 역할 기반으로 연결될 수 있다.
- Feed 정책은 Home Feed와 Profile Feed부터 확정한다. Local Feed, Federated Feed, Hashtag Feed,
  List Feed의 세부 정책은 이후 결정한다.

## Post Visibility 값

`Post Visibility`는 다음 네 값으로 확정한다.

| 값                 | 한국어 설명     | 의미                                                              |
| ------------------ | --------------- | ----------------------------------------------------------------- |
| Public             | 공개            | 모든 viewer가 볼 수 있고 검색/해시태그 목록 후보가 된다           |
| Quiet Public       | 조용한 공개     | 모든 viewer가 볼 수 있지만 검색/해시태그 목록에는 노출하지 않는다 |
| Followers Only     | 팔로워 공개     | 작성자와 작성자를 수락된 상태로 팔로우한 Profile만 볼 수 있다     |
| Mentioned Profiles | 멘션한 프로필만 | 작성자와 Post에서 멘션한 Profile만 볼 수 있다                     |

## 근거

- 현재 Publishing 컨텍스트의 핵심 모델이 이미 `Post` 중심이다.
- `Note`는 Kosmo의 작성 단위나 도메인 상태를 설명하기에 모호하다.
- `Status`는 제품 도메인 용어로는 덜 자연스럽다.
- Kosmo는 계정과 프로필을 분리하므로 행동 주체를 `Profile`로 확정해야 다른 컨텍스트의 소유권이
  명확해진다.
- `Post Visibility`는 `조용한 공개`처럼 단순 수신자 목록을 넘는 노출 정책까지 포함한다.

## 문서 반영

- [Publishing 컨텍스트](../contexts/publishing.md)는 `Post`와 `Post Visibility`를 canonical term으로
  사용한다.
- [Feed 컨텍스트](../contexts/feed.md)는 Publishing이 제공한 visible eligible Post를 소비하고,
  viewer/feed 수준 제어만 `Feed Control`로 정의한다.
- [Identity 컨텍스트](../contexts/identity.md)는 `Account`, `Profile`, `Remote Profile`을 canonical
  term으로 사용한다.
- [Engagement 컨텍스트](../contexts/engagement.md)는 `Reaction`과 `Repost`를 canonical term으로
  사용한다.
- 컨텍스트 문서는 `Post`, `Profile`, `Account`, `Post Visibility`, `Feed`, `Reaction`, `Repost`를
  확정 용어로 분리하고 남은 미결정 용어만
  별도로 유지한다.

## 남은 결정

- Account-Profile 관계의 역할 이름, 권한 매트릭스, 초대/양도/마지막 소유자 제약을 어떻게 둘지.
- Home Feed와 Profile Feed의 답글, Repost, 새 Post 삽입 정책을 어떻게 둘지.
