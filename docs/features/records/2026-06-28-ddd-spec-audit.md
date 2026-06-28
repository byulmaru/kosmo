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
- `Quote`는 현재 도메인 범위에서 제외한다.
- `Reaction`은 Post 하나에 Profile당 여러 개를 허용한다.
- `Bookmark`의 한국어 표현은 `북마크`다.
- `Collection`은 현재 Engagement 범위에서 제외한다.
- `Follow Pack`은 현재 도메인 범위에서 제외한다.
- `Content Warning`의 한국어 표현은 `내용 경고`다.
- `Sensitive Media`의 한국어 표현은 `민감한 미디어`다.
- Messaging은 현재 도메인 범위에서 제외한다.
- Account가 주체인 행동은 인증, 보안, Profile 소유, 운영자 권한에 한정하고, 그 외 소셜 행동의
  기본 주체는 Profile이다.
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
- 남은 용어 결정 후보는 bookmark의 화면 표현이다.

### 문서 간 불일치

- Trust & Safety는 판단 대상 컨텍스트를 `reference upstream`으로 참조하고, 정책 결과를
  `policy downstream`으로 제공한다.
- Social Graph와 Discovery, Feed와 Discovery의 관계 방향은 각 컨텍스트 문서의 `컨텍스트 관계`를
  기준으로 맞춘다.
- Media는 Account와 Profile이 동시에 소유하는 도메인으로 정리한다.
- README의 `주요 연결`은 도메인 지도의 축약 표현이며, 전체 관계는 개별 문서의 `컨텍스트 관계`를
  기준으로 본다.

### 불명확한 결정 사항

- Account-Profile 관계의 역할 이름, 권한 매트릭스, 초대/양도/마지막 소유자 제약.
- Home Feed와 Profile Feed의 답글, Repost, 새 Post 삽입 정책.

## 다음 인터랙티브 질문 후보

1. Account-Profile role 이름과 권한 매트릭스를 어떻게 둘까?
2. Profile을 여러 Account가 관리할 때 초대, 양도, 마지막 소유자 제거 제약을 어떻게 둘까?
3. Home Feed의 답글, Repost, 새 Post 삽입 정책을 어떻게 둘까?
4. Profile Feed의 답글, Repost, 탭 분리 정책을 어떻게 둘까?
