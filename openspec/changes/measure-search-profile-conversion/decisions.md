# Session decisions

- 2026-09-03: 당시 승인 댓글은 대상별 journey·동일 대상 성공 귀속을 명시했다. 이 기록을 person 단위 승인으로 해석하지 않는다.
- 2026-09-22: 당시 구현에서는 `search_profile_journey_id`와 HogQL을 선택했다.
- 2026-09-23: 사용자가 PR #998 리뷰에 따라 person 단위 PostHog Funnel로 계산 계약을 변경했다. 현재 분석 질문·성공 조건은 canonical policy와 PROD-557에 기록한다. A/B/C 선택은 한 person이고 B의 성공도 person 전환으로 센다. 이전 대상별 결정은 superseded.
