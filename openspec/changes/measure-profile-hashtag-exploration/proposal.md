# PROD-556 사용자 Funnel 전환 메모

목표: [canonical](../../../docs/domain/policies/profile-hashtag-exploration-analytics.md)의 v2 계약을
코드·Linear·저장 Insight/dashboard에 맞춘다. 사용자 Funnel은 30분, Empty는 전체 화면 진입,
요청 품질은 success/partial/failure 요청 단위다. 이전 session 선택률/Final Error는 폐기한다.

제외: 탐색 UX·Replay·Native SDK·배포·merge·리뷰 답글 게시·thread resolve.

계측은 실제 표시된 meaningful state 기준이다. loading은 제외하며 최초 Empty 뒤 목록/선택은 가능하다.
Hashtag는 세 Funnel step에서 같아야 한다. 이 메모는 추가 제품 계약이나 완료 gate가 아니다.
