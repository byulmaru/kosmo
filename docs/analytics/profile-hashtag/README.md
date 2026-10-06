# PROD-556 v3 저장 분석 정의

현재 계약은 [canonical](../../domain/policies/profile-hashtag-exploration-analytics.md)이다.
[Dashboard](https://us.posthog.com/project/563575/dashboard/2122242)와
[definitions.json](./definitions.json)은 최초 첫 페이지 결과 수 기반 정의를 사용한다.

- 사용자 Funnel: TagChip 선택 → 최초 결과 표시(result_count > 0) → Profile 선택, ordered **30분**.
  모든 단계의 hashtag_id가 같아야 하고 반복 시도는 distinct 사용자 분모에서 중복하지 않는다.
- 최초 결과 이벤트는 Empty도 포함한다. result_count는 실제 표시된 첫 페이지 개수(0~20)다.
  cache/network 출처를 구분하지 않고 background·pagination·retry 갱신은 최초 관측을 바꾸지 않는다.
  최초 Empty 후 목록을 보더라도 그 결과 이벤트는 0으로 남는다. 실패 후 처음 표시된 결과는 관측한다.
- Empty: result_count = 0인 결과 표시 / 전체 유효한 최초 결과 표시.
  결과 없는 loading 이탈·실패·notFound는 분모에서 제외한다. 분모 0은 계산할 수 없음이다.
- 요청 품질·실패율 Insight와 전체 화면 진입·entered_at 계측은 제거했다. 오류 진단은 기존 Sentry 경로다.
- result_count 없는 과거 목록 이벤트는 새 집계에서 제외한다. v2 Empty/요청 품질 및 과거 session
  선택률·Final Error와 수치 연속성이 없다.

| 저장 Insight                                                        | 의미                                            |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| [4wGUwUxz](https://us.posthog.com/project/563575/insights/4wGUwUxz) | 주간 동일 태그 경로의 사용자 합집합 Funnel, SQL |
| [gKEb8z5P](https://us.posthog.com/project/563575/insights/gKEb8z5P) | Hashtag별 사용자 Funnel 단계                    |
| [FbAXya72](https://us.posthog.com/project/563575/insights/FbAXya72) | Hashtag별 주간 사용자 전환 추세                 |
| [fZtdaHRP](https://us.posthog.com/project/563575/insights/fZtdaHRP) | 최초 결과 표시 기반 Empty 비율                  |

Hashtag native Funnel은 all_events attribution과 두 번째 step의 result_count > 0 필터를 사용한다.
전체값은 person_id+Hashtag+시작 주의 windowFunnel(1800)을 person_id+주로 합치는 SQL이다.
태그별 사용자 수를 더하거나 태그 일치 조건을 잃은 Funnel로 대체하지 않는다.
Asia/Seoul 월요일 주차, Funnel 시작 주·Empty 결과 표시 주에 귀속한다. 다음 주 30분까지 관측한다.
Production Web host/lib/인증/bot/traffic 제외와 test-account cohort 493482 not_in을 유지한다.
SQL은 {filters} placeholder와 source.filters.properties, native는 filterTestAccounts=true를 사용한다.

## 검증과 남은 인수

실제 Relay 렌더 회귀는 최초 cache/Empty/noncache/error·재시도·후속 갱신 및 첫 페이지 상한을 확인한다.
2026-10-06 저장 정의 read-back 및 합성 SQL: 클릭 사용자 4 / 목록 사용자 2 / 선택 사용자 1,
Empty 결과 1 / 전체 결과 4(25%). 반복 클릭·태그 혼합·Empty 후 선택·30분 초과·legacy 누락을 포함한다.
CI 결과는 이번 PR 대응 handoff에 기록한다.
production payload·수집률·운영 제외 효과(PROD-795) 인수는 배포 후 pending이다.
빈 기간의 query 결과를 0% 또는 production acceptance 통과로 해석하지 않는다.
