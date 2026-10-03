# PROD-556 v2 저장 분석 정의

현재 계약은 [canonical](../../domain/policies/profile-hashtag-exploration-analytics.md)이다.
[Dashboard](https://us.posthog.com/project/563575/dashboard/2122242)의 정의를 2026-10-03 변경·read-back했다.
[definitions.json](./definitions.json)은 저장 query의 검토용 snapshot이다.

- 사용자 Funnel: ordered TagChip 선택 → 실제 visible nonempty 목록 → Profile 선택, **30분**.
  반복 탐색은 별도 사용자 분모가 아니다. 모든 단계에 같은 `hashtag_id`를 요구한다.
- Empty: 최초 meaningful state가 Empty인 **화면 진입 / 전체 화면 진입**.
  loading/skeleton은 meaningful state가 아니다. 오류·loading 이탈·notFound 진입도 분모에 남는다.
  Empty 이후 목록·선택은 가능하며 최초 Empty 경험은 유지한다.
- 요청 품질: 완료 요청별 success / partial / failure. GraphQL errors와 사용 가능한 connection(Empty 포함)은
  partial, 사용 가능한 결과를 제공하지 못하면 failure. failure율은 failure / 전체 완료 요청이다.
- 탐색 session 선택률·종료 기반 Final Error는 폐기/대체됐다. 과거 수치와 연속성이 없다.

| 저장 Insight                                                        | 의미                            |
| ------------------------------------------------------------------- | ------------------------------- |
| [4wGUwUxz](https://us.posthog.com/project/563575/insights/4wGUwUxz) | 주간 사용자 합집합 Funnel, SQL  |
| [gKEb8z5P](https://us.posthog.com/project/563575/insights/gKEb8z5P) | Hashtag별 사용자 Funnel 단계    |
| [FbAXya72](https://us.posthog.com/project/563575/insights/FbAXya72) | Hashtag별 주간 사용자 전환 추세 |
| [fZtdaHRP](https://us.posthog.com/project/563575/insights/fZtdaHRP) | 최초 Empty / 전체 화면 진입     |
| [hBs6mB4z](https://us.posthog.com/project/563575/insights/hBs6mB4z) | 요청 품질과 완전 실패율         |

Hashtag native Funnel은 event breakdown + `all_events` attribution을 사용한다. 단계·주간 추세가
별도 표시되며 session aggregation은 사용하지 않는다. 전체값은 동일 태그 경로의 사용자 합집합 SQL이다.
태그별 사용자 수를 더하거나 태그 일치 조건을 잃은 전체 Funnel로 대체하지 않는다.
전체 Funnel SQL은 person_id+Hashtag+시작 주의 `windowFunnel(1800)` 뒤 person_id+주로 합친다.
Asia/Seoul 월요일 주차, 시작 주에 완료를 귀속하고 다음 주 30분까지 관측한다.
진행 중 주는 잠정이며 완료된 직전 주를 검토한다.

## 검증과 남은 운영 인수

합성 SQL(실제 이벤트 ingestion 없음) 결과: 반복 시도·여러 태그·태그 간 혼합·30분 초과 자료에서
클릭 사용자 4 / 목록 사용자 2 / 선택 사용자 2, 사용자 전환 50%.
Empty는 미확정 진입을 분모에 포함해 2/4, 요청 품질은 success 2 / partial 1 / failure 2, failure율 40%.
주 경계 합성 자료는 직전 주 클릭 2 / 목록 2 / 선택 1, 다음 주 1/1/1로 시작 주 귀속·30분 제한을 확인했다.
실제 Relay 렌더 테스트는 cache/noncache와 후속 목록/Empty/error의 6경로, Empty→목록→선택을 검증한다.

정의 read-back·합성 SQL·렌더 테스트는 production payload acceptance가 아니다.
새 이벤트는 아직 production taxonomy에 없으므로 native Funnel 실행·배포 후 수집과 누락·운영 제외
(PROD-795)·production 주 경계 대조는 pending이다. Project timezone Asia/Seoul·월요일 주 시작은 확인했다. 정의에서 host/lib/인증/bot/traffic
필터와 현재 project test-account cohort 493482 not_in을 적용한다. SQL은 문서화된 `{filters}`
placeholder와 source.filters.properties, Dashboard도 동일한 cohort property filter를 사용한다.
Native는 filterTestAccounts=true다. 운영 제외 cohort 변경 시 SQL snapshot과 Dashboard를 함께 갱신한다.
실제 제외 효과·누락은 배포 후 production 인수에서 대조한다.
빈 기간은 0% 성공/실패로 해석하지 않는다. 리뷰 답글·resolve·merge·배포·Linear Done은 보류한다.
