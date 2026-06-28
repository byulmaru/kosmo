# 2026-06-28 DDD 명세 점검 기록

## 배경

`docs/features` 문서를 DDD 명세 문서로 발전시키기 위해 컨텍스트 구조, 보편 언어, 문서 간
불일치, 불명확한 결정 사항을 점검했다.

## 확정된 결정

- 짧은 게시 단위의 canonical term은 `Post`다.
- 공개 소셜 정체성과 행동 주체의 canonical term은 `Profile`이다.
- 로그인과 보안 설정의 canonical 주체는 `Account`다.
- 게시 접근/노출 범위의 canonical term은 `Post Visibility`다.
- 게시 목록의 canonical term은 `Feed`다.
- 반응의 canonical term은 `Reaction`이다.
- 재게시의 canonical term은 `Repost`다.
- `Post Visibility`와 `Post Eligibility`는 Feed 속성이 아니라 Publishing이 소유하는 Post 속성이다.
- `Post Visibility`가 viewer Profile별 접근 가능 대상을 먼저 결정하고, `Post Eligibility`는 그 안에서
  읽기/전파 후보성을 제한한다.
- `Post Visibility` 값은 공개, 조용한 공개, 팔로워 공개, 멘션한 프로필만 네 가지다.
- 조용한 공개는 모든 viewer가 볼 수 있지만 검색 결과와 해시태그 목록에는 노출되지 않는다.
- 멘션한 프로필만은 Publishing의 `Post Visibility` 값이며 별도 DM 기능으로 부르지 않는다.
- Feed는 Publishing이 제공한 visible eligible Post 집합에 viewer/feed 수준 `Feed Control`을 적용한다.
- 해시태그 피드는 Post Visibility가 공개인 Post만 대상으로 한다.
- Reply Post 생성과 thread 관계는 Publishing이 소유하고, Engagement는 답글 수 같은 읽기 지표만
  반영한다.
- Custom Feed와 개인 프로필 노트는 현재 도메인 범위에서 제외한다.
- 세부 결정은 [ADR 0001](../decisions/0001-core-ubiquitous-language.md)을 따른다.

## 서브에이전트 점검 요약

### 용어 불일치

- 짧은 게시 단위의 용어 후보가 여러 개 남아 있었으나 `Post`로 확정했다.
- 정체성 주체 용어가 섞여 있었으나 기본 행동 주체는 `Profile`, 로그인 주체는 `Account`로
  정리한다.
- 게시 접근/노출 범위 후보 용어가 섞여 있었으나 canonical term은 `Post Visibility`, 한국어 설명은
  `공개 범위`로 정리한다.
- 남은 용어 결정 후보는 quote, bookmark/collection, content warning, sensitive media다.

### 문서 간 불일치

- Trust & Safety가 여러 컨텍스트에서 upstream과 downstream으로 동시에 표현되어 관계 방향이
  흐려져 있다.
- Social Graph와 Discovery, Feed와 Discovery의 관계 방향이 문서마다 다르다.
- Attached Media 소유권이 Publishing과 Media 사이에서 겹친다.
- README의 `주요 연결`은 개별 문서의 전체 컨텍스트 관계와 완전히 같지 않다.

### 불명확한 결정 사항

- Saved Search를 Discovery 내부 검색 저장으로만 둘지, 나중에 별도 Feed로 승격할지.
- Quote를 MVP에서 제외할지, 작성자 통제 기반으로 포함할지.
- 긍정 반응을 단일 반응으로 갈지, 확장 가능한 반응 모델로 갈지.
- Block 발생 시 기존 follow, engagement, notification, feed item의 downstream 처리.
- Post 수정, 삭제, Post Visibility 변경이 Feed, Discovery, Notification, federation에 전파되는 방식.
- Media의 원본 파일, logical media, attachment, Profile media, library 경계.
- Follow Pack과 추천 팔로우의 소유권과 일괄 follow 이벤트.
- Account-Profile 관계의 role, 권한, 생성/편집/삭제/전환 불변 조건.

## 다음 인터랙티브 질문 후보

1. Quote는 Repost의 하위 유형으로 둘까, 별도 Post 작성 모델로 둘까?
2. Bookmark와 Collection은 어떻게 구분할까?
3. Content Warning의 canonical 한국어 표현을 무엇으로 둘까?
