# 2026-06-29 결정 반영 기록

## 배경

DDD 도메인 명세의 남은 질문에 대해 제품 방향이 추가로 확정되었다. 확정된 결정은
[ADR 0001](../decisions/0001-core-ubiquitous-language.md)과 각 컨텍스트 문서에 반영한다.

## 확정된 결정

- `Quote`는 현재 도메인 범위에서 제외한다.
- `Reaction`은 Post 하나에 Profile당 여러 개를 허용한다.
- `Bookmark`의 한국어 표현은 `북마크`다.
- `Collection`은 현재 Engagement 범위에서 제외한다.
- `Content Warning`의 한국어 표현은 `내용 경고`다.
- `Sensitive Media`의 한국어 표현은 `민감한 미디어`다.
- Block 발생 시 Feed Item을 제외한 기존 Follow, Engagement, Notification은 삭제 또는 무효화
  방향으로 본다.
- Block 이후 Feed Item 처리 방식은 도메인 결정사항으로 보지 않는다.
- Post 수정, 삭제, Post Visibility 변경의 컨텍스트 간 전파 순서는 도메인 명세 범위가 아니다.
- Account가 주체인 행동은 인증, 보안, Profile 소유, 운영자 권한에 한정하고, 그 외 소셜 행동의
  기본 주체는 Profile이다.
- Media는 Account와 Profile이 동시에 소유한다.
- Feed에는 전역 기본 정책을 두지 않는다. 답글, Repost, 새 Post 삽입, 로컬/연합 노출 같은 정책은
  Feed Definition별로 정한다.
- Messaging은 현재 도메인 범위에서 제외한다.
- Saved Search를 Feed로 승격할지 여부는 현재 도메인 결정사항으로 보지 않는다.
- `Follow Pack`은 현재 도메인 범위에서 제외한다.

## 문서 반영 원칙

- 확정 결정은 `decisions/`에 남긴다.
- 결정이 바꾼 컨텍스트 경계와 정책은 `contexts/` 문서에 반영한다.
- 이 기록은 어떤 질문이 어떤 방향으로 닫혔는지 추적하기 위해 보관한다.

## 다음 질문 후보

1. Account-Profile 관계의 role, 권한, 생성/편집/삭제/전환 불변 조건은 어떻게 둘까?
2. Feed별 답글, Repost, 새 Post 삽입, 로컬/연합 노출 정책을 어디서부터 확정할까?
