# 2026-06-29 결정 반영 기록

## 배경

DDD 도메인 명세의 남은 질문에 대해 제품 방향이 추가로 확정되었다. 확정된 결정은
[ADR 0001](../decisions/0001-core-ubiquitous-language.md)과 각 컨텍스트 문서에 반영한다.

## 확정된 결정

- `Quote`는 `Repost`의 하위 유형이 아니라 별도 Post 작성 모델이다.
- `Reaction`은 Post 하나에 Profile당 여러 개를 허용한다.
- `Collection`은 현재 Engagement 범위에서 제외한다.
- `Content Warning`의 한국어 표현은 `내용 경고`다.
- `Sensitive Media`의 한국어 표현은 `민감한 미디어`다.
- Block 발생 시 Feed Item을 제외한 기존 Follow, Engagement, Notification은 삭제 또는 무효화
  방향으로 본다.
- Block 이후 Feed Item 처리 방식은 아직 결정하지 않는다.
- Post 수정, 삭제, Post Visibility 변경의 컨텍스트 간 전파 순서는 도메인 명세 범위가 아니다.
- Account가 주체인 행동은 인증, 보안, Profile 소유, 운영자 권한에 한정하고, 그 외 소셜 행동의
  기본 주체는 Profile이다.
- Media는 Account와 Profile이 동시에 소유한다.
- Feed에는 전역 기본 정책을 두지 않는다. 답글, Repost, 새 Post 삽입, 로컬/연합 노출 같은 정책은
  Feed Definition별로 정한다.
- Messaging은 현재 도메인 범위에서 제외한다.

## 문서 반영 원칙

- 확정 결정은 `decisions/`에 남긴다.
- 결정이 바꾼 컨텍스트 경계와 정책은 `contexts/` 문서에 반영한다.
- 이 기록은 어떤 질문이 어떤 방향으로 닫혔는지 추적하기 위해 보관한다.

## 다음 질문 후보

1. Quote는 제품 범위에 포함할까, 제외할까?
2. Bookmark의 한국어 화면 표현은 `북마크`, `저장`, 다른 표현 중 무엇으로 할까?
3. Block 이후 Feed Item은 삭제, 숨김, 재계산 중 무엇으로 처리할까?
4. Saved Search는 Discovery 내부 검색 저장으로만 둘까, 나중에 Feed로 승격 가능한 개념으로 남길까?
5. Follow Pack 적용 시 전체 일괄 Follow를 하나의 도메인 이벤트로 볼까, Profile별 Follow 이벤트 묶음으로 볼까?
