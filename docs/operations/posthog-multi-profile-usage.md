# PostHog 멀티 Profile 사용 운영 계약

이 문서는 PROD-555의 Web 분석 이벤트와 주간 집계 운영 계약이다. 기능의 production 수집 인수나
PostHog 대시보드 공개를 대신하지 않는다. 실제 수집 비교는 PROD-795가 Done인 것과 별도의 개인정보 없는
PostHog 증거를 확인한 뒤에만 시작한다.

## 버전과 범위

- 계산 규칙 버전: `multi-profile-usage.v1`
- 수집 범위: production Web의 인증 Account 이벤트
- 주차: `Asia/Seoul` 기준 월요일 00:00 이상, 다음 월요일 00:00 미만
- 중복 기준: `Account × event × capture UUID`; 같은 UUID의 재전송은 가장 이른 행동 시각 하나만 유지
- 집계 결과 metadata: 관측 기간, `calculated_at`, 계산 규칙 버전, 접근 제한 제외 목록 버전, 주차 상태
- 진행 중인 주의 상태는 `partial`이다. 완료된 주는 같은 입력과 최신 제외 목록으로 다시 계산할 수 있다.

익명·development·test 관측과 내부·테스트·알려진 봇/자동화 Account는 운영에서 제외한다. 실제 Account
목록은 접근 제한된 운영 시스템에만 두고 저장소나 이 문서에 복제하지 않는다. 이름·handle·IP로 자동화를
추정하거나, 하나의 Profile을 사용하는 다른 Account까지 함께 제외하지 않는다.

## 이벤트 계약

모든 앱 소유 custom property는 아래 허용 목록만 사용한다. Account identity는 기존 PostHog identity를
사용하며 custom property로 `account_id`를 복제하지 않는다. 화면 pathname, Profile 목록·이름·handle,
Post Content, 검색 원문, Follow 대상 Profile ID도 수집하지 않는다.

| 이벤트                                           | 허용 custom property                                                         | WAA              | 사용 Profile                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------- |
| `multi_profile_context_observed` (`screen`)      | `observation_kind`, `multi_profile_eligible`, 선택적인 `selected_profile_id` | 화면 조회로 포함 | 선택 Profile이 있으면 포함               |
| `multi_profile_context_observed` (`eligibility`) | `observation_kind`, `multi_profile_eligible`                                 | 단독으로 제외    | 단독으로 제외                            |
| `profile_created`                                | `selected_profile_id`                                                        | 포함             | 제외. 생성 성공만으로 사용으로 세지 않음 |
| `profile_selected`                               | `selected_profile_id`                                                        | 포함             | 선택한 Profile 포함                      |
| `profile_switched`                               | `previous_profile_id`, `selected_profile_id`                                 | 포함             | 도착 Profile 포함                        |
| `post_created`                                   | `selected_profile_id`, `visibility`                                          | 포함             | 행동 주체 Profile 포함                   |
| `follow_succeeded`                               | `selected_profile_id`, `result` (`follow`/`request`)                         | 포함             | 행동 주체 Profile 포함                   |
| `search_submitted`                               | `tab`, `source`                                                              | 포함             | 해당 없음                                |
| `search_results_loaded`                          | `tab`, `has_results`                                                         | 포함             | 해당 없음                                |
| `search_result_selected`                         | `tab`                                                                        | 포함             | 해당 없음                                |

`uuid`와 행동 시각은 custom property가 아니라 PostHog capture options로 전달한다. Web client는 capture
직전에 options의 Account identity가 현재 SDK identity와 다르면 이벤트를 생략하고, Native client는 항상
typed no-op이다. PostHog SDK가 관리하는 URL·referrer 같은 standard metadata는 이 계약 때문에 제거하거나
필터링하지 않는다.

## 집계 규칙

1. 입력에서 production Web, 인증된 Account, 운영 제외 목록을 먼저 적용한다.
2. `Account × event × uuid`로 deduplicate하고, 같은 키가 여러 번 들어오면 가장 이른 행동 시각을 사용한다.
3. 행동 시각을 KST 주차로 변환한다. 수신 시각이나 집계 실행 시각으로 주차를 바꾸지 않는다.
4. `eligibility` 관측만 있는 Account는 WAA가 아니다. `screen`과 승인된 행동 이벤트만 WAA를 만든다.
5. 대상 WAA는 같은 주의 WAA 중 `multi_profile_eligible=true` 관측이 한 번 이상 있는 Account다.
6. 사용 Profile은 `screen`의 선택 Profile, 성공한 `profile_selected`/`profile_switched`, Post·Follow 행동 주체만
   세고, 같은 Account·Profile 조합은 한 번만 센다.
7. 활성 Account는 대상 WAA이면서 같은 주에 서로 다른 사용 Profile이 2개 이상인 Account다.
8. 활성 사용률은 `활성 Account / 대상 WAA × 100`, 도달률은 `활성 Account / WAA × 100`이다. 분모 0은
   `null`(계산할 수 없음)로 표시한다.
9. Profile 생성은 성공 이벤트 횟수와 distinct 생성 Account 수를 모두 계산한다. 직접 전환은
   `profile_switched` 성공 이벤트 횟수를 계산하고, 활성 Account당 평균은 활성 집단의 전환 합계 / 활성
   Account 수로 계산해 전환 0회 활성 Account도 분모에 포함한다.
10. 기능 리텐션은 최초 활성 주차 cohort의 W+1/W+4 활성 재방문이고, 제품 리텐션은 기준 주의 대상 WAA가
    W+1/W+4에 WAA로 재방문한 비율이다. 도래하지 않은 주는 `not_due`, 분모 0은 `null`이다.

생성 직후 자동 선택, 첫 선택, 같은 Profile 재선택, 복원·재조회, 실패·취소는 직접 전환으로 세지 않는다.
SDK 차단이나 전송 실패로 빠진 행동은 추정하지 않는다.

## HogQL 저장 쿼리 형태

실제 Insight에는 아래 CTE 순서를 보존한 쿼리를 저장한다. `{from}`, `{to}`와 production Web 필터는 배포
환경의 표준 metadata에 맞춰 입력하며, 제외 Account 값은 접근 제한된 runtime 목록에서 주입한다. 실제 값과
Follow 대상 식별자는 저장소나 문서에 남기지 않는다.

```sql
WITH source AS (
    SELECT
        nullIf(toString(properties['$user_id']), '') AS account_id,
        event,
        uuid,
        timestamp,
        properties
    FROM events
    WHERE timestamp >= {from}
      AND timestamp < {to}
      AND event IN (
        'multi_profile_context_observed', 'profile_created', 'profile_selected',
        'profile_switched', 'post_created', 'follow_succeeded', 'search_submitted',
        'search_results_loaded', 'search_result_selected'
      )
      AND {production_web_filter}
      AND account_id IS NOT NULL
      AND account_id NOT IN {managed_exclusion_accounts}
), deduplicated AS (
    SELECT
        account_id,
        event,
        uuid,
        min(timestamp) AS occurred_at,
        argMin(properties, timestamp) AS properties
    FROM source
    GROUP BY account_id, event, uuid
), weekly AS (
    SELECT
        toStartOfWeek(toTimeZone(occurred_at, 'Asia/Seoul'), 1) AS week_key,
        account_id,
        event,
        properties
    FROM deduplicated
), waa AS (
    SELECT DISTINCT week_key, account_id
    FROM weekly
    WHERE event != 'multi_profile_context_observed'
       OR properties['observation_kind'] = 'screen'
), eligible AS (
    SELECT DISTINCT week_key, account_id
    FROM weekly
    WHERE event = 'multi_profile_context_observed'
      AND properties['multi_profile_eligible'] = true
), used_profiles AS (
    SELECT DISTINCT week_key, account_id,
        properties['selected_profile_id'] AS profile_id
    FROM weekly
    WHERE (event = 'multi_profile_context_observed'
           AND properties['observation_kind'] = 'screen')
       OR event IN ('profile_selected', 'profile_switched', 'post_created', 'follow_succeeded')
), target_waa AS (
    SELECT DISTINCT waa.week_key, waa.account_id
    FROM waa INNER JOIN eligible USING (week_key, account_id)
), active AS (
    SELECT target_waa.week_key, target_waa.account_id
    FROM target_waa
    INNER JOIN used_profiles USING (week_key, account_id)
    GROUP BY target_waa.week_key, target_waa.account_id
    HAVING countDistinct(used_profiles.profile_id) >= 2
)
SELECT
    week_key,
    countDistinct(waa.account_id) AS waa_count,
    countDistinct(target_waa.account_id) AS target_waa_count,
    countDistinct(active.account_id) AS active_account_count
    -- 생성·전환·Post·Follow count, 비율, cohort retention을 같은 CTE 집합에서 결합한다.
FROM waa
LEFT JOIN target_waa USING (week_key, account_id)
LEFT JOIN active USING (week_key, account_id)
GROUP BY week_key
ORDER BY week_key;
```

`used_profiles`에는 생성 성공만 포함하지 않으며, Profile 목록의 가용성은 이벤트의
`multi_profile_eligible` 관측으로만 판단한다. 최종 Insight는 위 집합과 동일한 제외 목록·dedup을 사용해야
한다. 현재 주는 `partial` badge를 표시하고, 과거 주 수치도 지연 도착 이벤트나 제외 목록 변경 시 다시
계산한다. 별도 영속 DB, materialized table, 새 Account 생성 이벤트는 추가하지 않는다.

## Dashboard / Insight 필드

주 지표는 활성 사용률이고 도달률은 보조 지표로 표시한다. 같은 화면에 다음을 함께 표시한다.

- WAA, 대상 WAA, 활성 Account의 절대 수
- 활성 사용률, 도달률
- Profile 생성 총횟수, 생성 distinct Account 수
- 직접 전환 총횟수, 활성 Account당 평균 전환
- Post 생성, Follow 성공·Relationship·Request 수
- 기능 리텐션 W+1/W+4, 대상 Account 제품 리텐션 W+1/W+4
- 관측 기간, 집계 실행 시각, `multi-profile-usage.v1`, 제외 목록 버전, `complete`/`partial` 상태

## 합성 evidence

독립 계산 모듈의 합성 검증은 `apps/app/src/analytics/multiProfileUsage.test.ts`에 둔다. 기준 주의 기대값은
다음과 같다.

| 값                            | 기대값 |
| ----------------------------- | -----: |
| WAA                           |     10 |
| 대상 WAA                      |      4 |
| 활성 Account                  |      2 |
| 활성 사용률                   |    50% |
| 도달률                        |    20% |
| Profile 생성 총횟수           |      2 |
| 생성 distinct Account 수      |      1 |
| 직접 전환 총횟수              |      2 |
| 활성 Account당 평균 직접 전환 |      1 |

같은 UUID 재전송, eligibility-only Account, Profile 생성 뒤 사용 제외, 전환 0회 활성 Account, 분모 0,
KST 월요일 경계와 W+1/W+4 미도래를 함께 검증한다. 이 결과는 production 수집 인수나 대시보드 공개의
증거가 아니다.

## 주간 점검과 인수 gate

완료된 직전 주를 점검할 때 담당자는 다음을 기록한다.

1. 관측 기간과 집계 실행 시각, 규칙 버전, 최신 제외 목록 버전을 고정한다.
2. 저장 쿼리의 중복 제거·KST 변환·eligibility-only 제외를 합성 기대표와 대조한다.
3. 지연 이벤트가 이전 주에 반영됐는지와 부분 집계가 아닌지 확인한다.
4. 개인정보 없는 PostHog schema/payload 증거에서 Account identity, 선택·행동 주체 Profile, 자격,
   직접 전환, Post visibility, Follow result만 대조한다.
5. 실제 두 Profile 사용·직접 전환·생성·Post·Follow 흐름을 대시보드와 대조하고, SDK 차단·전송 실패로
   알 수 없는 누락은 한계로 기록한다.

운영 목록 담당은 `Product Analytics Owner`, 개인정보 계약 검토는 `Privacy/Trust Reviewer`, 주간 실행은
`Analytics On-call` 역할로 분리한다. 실제 이름과 Account 목록은 접근 제한된 운영 시스템에서 관리한다.

현재 PROD-795는 선행 dependency로 확인되었지만, 이 작업에는 production PostHog payload·집계 비교·완료된
직전 주 보고가 없다. 따라서 production 관측 시작, 대시보드 공개, 주간 운영 인수는 명시적으로 pending이며
합성 테스트만으로 완료 처리하지 않는다.
