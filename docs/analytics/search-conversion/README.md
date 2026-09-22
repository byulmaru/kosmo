# 검색에서 Profile 행동까지의 전환

계산 계약은 [Search Conversion Analytics Policy](../../domain/policies/search-conversion-analytics.md)가
소유한다. 이 문서는 PROD-557의 구현·재현 증거다.

## 집계와 보고서

[canonical.sql](canonical.sql)은 각 `search_profile_journey_id`를 한 행으로 묶고, 최초 선택 후 30분 이내
같은 SDK session에서 발생한 조회·Follow 성공을 합집합으로 센다.
앱은 시작·성공 판정과 SDK timestamp에 같은 시각 표본을 사용해 정확히 30분의 성공을 보존한다. person·Account별 집계가 아니다.
시작·성공 중복 전송과 시작 없는 성공을 제거한다. 같은 대상 재선택 중복 제거는 같은 journey의 수명 안에서만 적용한다.
Account·선택 Profile·인증 상태·PostHog session 변경으로 귀속이 종료된 뒤 같은 검색 결과에서 같은 대상을 다시 명시적으로
선택하면 새 `search_profile_journey_id`를 만들고, 종료만 발생한 경우에는 새 journey를 만들지 않는다. 귀속 종료 이후 응답은
클라이언트에서 이벤트를 만들지 않는다.
쿼리에서 인증 변경이나 새 검색을 사후 추론하지 않는다.

- [운영 데이터 기준 집계](https://us.posthog.com/project/563575/insights/apNWWNxN)
- [6개 journey acceptance fixture](https://us.posthog.com/project/563575/insights/88vK3cV4)

운영 보고서의 초기 기간은 2026-09-22 00:00 이상, 2026-09-23 00:00 미만(Asia/Seoul)이다.
다른 기간은 SQL 상단의 `period_start`·`period_end`를 편집한다. `observed_at`은 실행 시각이다.
기간 끝 뒤 30분까지 성공을 읽고, 결과는 시작일에 귀속한다. 마지막 journey의 30분 window가 아직 끝나지
않으면 `provisional`, 끝나면 `final`, 분모가 0이면 `no_data`와 null 전환율을 반환한다.
30분 경과만으로 같은 검색·대상의 새 journey를 시작하거나 최초 선택 시각을 연장하지 않는다. pagehide·전체 reload 뒤 journey를 복원하지 않는 동작도 유지한다.

## 실제 HogQL 검증

검증 기록 시각은 2026-09-22 18:56 KST다. Kosmo PostHog 프로젝트 563575(Asia/Seoul)에서 `execute-sql`로 검증했다.
저장한 두 insight도 `insight-query`로 다시 실행했다. fixture는 상수 SELECT만 사용하며 운영 이벤트를
주입하지 않는다. Funnel이나 별도 dashboard는 사용하지 않았다.

| 입력                   | 기대/실제 분모·전체·조회·Follow | 기대/실제 상태               |
| ---------------------- | ------------------------------- | ---------------------------- |
| acceptance             | 6 / 4 / 3 / 2                   | final                        |
| boundaries             | 6 / 4 / 3 / 2                   | final                        |
| provisional            | 6 / 3 / 2 / 2                   | provisional                  |
| no-data                | 0 / 0 / 0 / 0                   | no_data, 모든 전환율 null    |
| 운영 이벤트, 초기 기간 | 0 / 0 / 0 / 0                   | no_data, 신규 이벤트 배포 전 |

acceptance 전환율은 전체 2/3, 조회 1/2, Follow 1/3이다. 각 값은 실제 결과와 일치했다.
J1은 조회+Follow, J2는 Request·실패로 성공 없음, J3은 Follow만, J4는 새 검색 전 조회만,
J5는 정확히 30분의 조회, J6는 30분+1ms의 조회다. 모든 시작은 9월 1일 23:50이고 J5의 성공은 다음 날이다.
J2의 실패·Request와 J4의 종료 후 응답은 성공 이벤트를 만들지 않는 앱 검증의 책임이다.

`boundaries`는 같은 시작·조회·Follow의 중복, 다른 SDK session의 성공, 시작 없는 성공, 시작 전 성공을
추가한다. `provisional`은 관측 시각을 자정으로 제한한다. `no-data`는 시작일보다 앞선 기간을 조회한다.
fixture의 ID는 실사용자와 무관한 임의 UUID다.

재현하려면 저장소 루트에서 아래 명령으로 SQL을 만든 뒤 Kosmo PostHog SQL editor에서 실행한다.
집계 부분은 항상 `canonical.sql`에서 가져오므로 fixture와 운영 쿼리가 같은 식을 사용한다.

```sh
node docs/analytics/search-conversion/fixture.mjs acceptance
node docs/analytics/search-conversion/fixture.mjs boundaries
node docs/analytics/search-conversion/fixture.mjs provisional
node docs/analytics/search-conversion/fixture.mjs no-data
```

## 앱 검증과 남은 책임

`searchProfileJourneys.test.ts`는 fake clock과 이벤트 출력으로 같은 journey 안의 중복·대상·30분·종료·새 메모리 경계를 검증한다.
Account·선택 Profile·인증 상태·PostHog session 각 종료 경계 뒤 같은 대상 재선택이 새 journey를 만들고, 재선택 없이 경계만
발생한 경우 새 journey가 생기지 않는지 함께 검증한다.
`AnalyticsSessionBridge.test.ts`는 실제 React effect에서 Account·선택 Profile·인증·SDK session·pagehide·route
변경을 연결한다. `client.test.ts`는 SDK 경계에서 세션 회전 후 성공 payload 제거와 기존 이벤트 보존을,
`client.native.test.ts`는 Native no-op을 검증한다.

`SearchConversion.tests.stories.tsx`는 Chromium에서 실제 검색 화면·Profile layout·FollowButton과 Relay 응답을
사용한다. adapter 출력만 관찰하며 유효 Profile 표시, 로딩·없음·오류, 같은 journey 재선택, 선택 없는 Follow,
modifier click, optimistic 상태·Request·오류, pagehide·새 검색 뒤 늦은 응답을 다룬다.
`SessionRotatesOnReselection`은 기존 일반 `search_result_selected` capture를 먼저 발생시켜 SDK lazy session callback이 선택보다
먼저 실행되는 실제 경로를 재현하고, 첫 재선택이 새 journey를 시작하는지 검증한다.

Implement 단계에서는 테스트 코드를 작성하고 Relay compiler·TypeScript·ESLint·Prettier 정적 검증을 수행한다.
동작 테스트 실행은 GitHub CI `Test (App)`의 unit·Storybook이 담당한다. `Lint`는 workspace 정적 검증,
`Web E2E`는 기존 웹 회귀와 dev analytics 비활성화를 담당한다. CI 성공은 Test 단계에서 최신 PR head로 확인한다.
HogQL fixture 성공은 앱 배포나 실제 사용자 전환의 검증 결과가 아니다.
공통 production acceptance는 PROD-575, Replay 검증은 PROD-741의 책임이다.
