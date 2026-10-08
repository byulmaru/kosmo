# PROD-556 최초 결과 계측 단순화 메모

목표: 사용자 결정에 따라 [canonical](../../../docs/domain/policies/profile-hashtag-exploration-analytics.md)의
v3를 코드·Linear·저장 분석에 맞춘다. 30분 동일 Hashtag 사용자 Funnel과 최초 첫 페이지 result_count만
남기고 요청 품질·화면 진입·entered_at·셸 Provider를 제거한다.

검증: 최초 Empty 뒤 목록 갱신에도 0 유지, cache 최초 표시, 실패 후 retry 최초 표시, pagination 중복 없음,
계측 없는 오류 경로, 저장 query의 result_count 필터와 Empty 분모, 현재 PR head 전체 CI와 충돌 여부.
제외: 탐색 UX·Replay·Native SDK·배포·merge. 이 메모는 추가 제품 계약이나 완료 gate가 아니다.
