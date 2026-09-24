# 검색 결과 선택 후 Profile 행동 전환

현재 계산 계약은 [Search Conversion Analytics Policy](../../domain/policies/search-conversion-analytics.md)에 있다. 2026-09-23 사용자 결정으로 대상별 journey와 전용 HogQL 집계는 person 단위 PostHog Funnel로 대체됐다. 이전 6-journey fixture 및 운영 insight는 과거 계약의 검증 자료이며 현 지표의 acceptance 증거가 아니다.

[운영 Funnel](https://us.posthog.com/project/563575/insights/bZ8Irumb)은 `search_result_selected`의 `tab = people`을 첫 단계로, `profile_view_succeeded` 또는 `follow_succeeded`의 `result = follow`를 두 번째 OR 단계로 사용한다. person 수, 순차 순서, 30분 conversion window, Asia/Seoul 기간을 적용한다. 새 표시 이벤트 배포 전에 나온 조회는 소급 측정할 수 없다. 2026-09-23 설정 검증 쿼리는 기존 선택자 1명·전환 0명으로 반환됐으며, 신규 이벤트가 아직 배포되지 않았으므로 제품 지표의 acceptance 결과가 아니다.

웹 Storybook `SearchConversion.tests.stories.tsx`는 실제 검색·Profile layout·FollowButton 경로에서 선택, 실제 표시, 로딩·대상 없음, Follow Relationship·Request의 이벤트를 확인한다. PR 최신 head CI와 PostHog Funnel 설정·결과 URL은 검증 뒤 여기에 기록한다.
