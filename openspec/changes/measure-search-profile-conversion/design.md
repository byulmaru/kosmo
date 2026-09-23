# Session design note

기존 `search_result_selected(tab=people)`와 `follow_succeeded(result=follow)`를 사용한다. 유효 Profile chrome이 실제 표시된 시점에 속성 없는 `profile_view_succeeded`를 수집한다. PostHog Funnel의 첫 단계는 선택, 두 번째 단계는 표시 또는 Follow 성공의 OR이며 person·순차·30분을 설정한다. 대상별 client attribution 상태와 전용 HogQL 집계는 제거한다.
