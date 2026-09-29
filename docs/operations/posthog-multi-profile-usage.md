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

| 이벤트                   | 허용 custom property                                                     | WAA              | 사용 Profile                             |
| ------------------------ | ------------------------------------------------------------------------ | ---------------- | ---------------------------------------- |
| SDK `$pageview`          | 인증 화면이면 `selected_profile_id`                                      | 화면 조회로 포함 | 선택 Profile이 있으면 포함               |
| SDK `$identify` / `$set` | Person `available_profile_count` 갱신. event property가 아님             | 단독으로 제외    | 단독으로 제외                            |
| `profile_created`        | `selected_profile_id`                                                    | 포함             | 제외. 생성 성공만으로 사용으로 세지 않음 |
| `profile_selected`       | `selected_profile_id`, 선택적인 `selection_cause`, `previous_profile_id` | 포함             | 선택한 Profile 포함                      |
| `post_created`           | `selected_profile_id`, `visibility`                                      | 포함             | 행동 주체 Profile 포함                   |
| `follow_succeeded`       | `selected_profile_id`, `result` (`follow`/`request`)                     | 포함             | 행동 주체 Profile 포함                   |
| `search_submitted`       | `tab`, `source`                                                          | 포함             | 해당 없음                                |
| `search_results_loaded`  | `tab`, `has_results`                                                     | 포함             | 해당 없음                                |
| `search_result_selected` | `tab`                                                                    | 포함             | 해당 없음                                |

`available_profile_count`는 해당 Account가 관측 당시 **동시에 선택할 수 있는** Profile의 수를 나타내는
Person 속성이다. 기존
`me.profiles` 조회와 `selectProfile`이 공유하는 조건대로 Account-Profile Membership이 있고, Profile이
`ACTIVE`이며 Instance가 `SUSPENDED`가 아닌 Profile을 센다. Owner/Member와 Local/Remote를 모두
포함한다. `UniversalShell`의 기존 `me.profiles` Relay 조회에서 인증 Account의 목록이 처음 확인되거나
count가 달라질 때 기존 `identify` 경로로 갱신한다. 알려진 `0`은 그대로 보내고 목록을 알 수 없으면
갱신하지 않는다. Relay `store-and-network`는 캐시 결과를 먼저 줄 수 있으므로 이 값은 강한 서버 시점
snapshot이 아니다. Profile ID 목록과 Membership 상태는 별도 분석 속성으로 보내지 않는다.
PostHog SDK의 Person 갱신 `$set` 및 최초 `$identify`와 이후 이벤트의 과거 Person 속성을 자격 관측에
사용한다. SDK의 `$pageview`에는 인증 Account의 조회 당시 선택 Profile ID만 공통 analytics 경계에서
붙인다. 앱은 `>= 2` 판정이나 주간 중복 제거를 하지 않는다.

`profile_selected`는 기존 성공 이벤트다. 직접 선택에는 `selection_cause=direct`를, 생성 직후 자동
선택에는 `selection_cause=auto`를 붙인다. 선택 직전 Profile이 있으면 `previous_profile_id`를 붙인다.
HogQL은 `direct`이고 이전 ID가 있으며 성공한 도착 ID와 다를 때만 직접 전환으로 센다. 기존
`post_created`와 `follow_succeeded`도 성공 이벤트의 행동 Profile ID를 그대로 재사용한다.

`uuid`와 capture 시각은 PostHog SDK가 생성한다. 성공 행동은 기존 main의 이벤트를 그대로 사용한다.
Native client는 typed no-op이다. PostHog SDK가 관리하는 URL·referrer 같은 standard metadata는 이 계약
때문에 제거하거나 필터링하지 않는다.

## 집계 규칙

1. 입력에서 production Web, 이벤트 당시 인증된 Account, 운영 제외 목록을 먼저 적용한다. 유효한 행동 시각이 없는 행은 주차에 귀속하지 않는다.
2. `Account × event × uuid`로 deduplicate하고, 같은 키가 여러 번 들어오면 가장 이른 행동 시각을 사용한다.
3. 행동 시각을 KST 주차로 변환한다. 수신 시각이나 집계 실행 시각으로 주차를 바꾸지 않는다.
4. Person 갱신 `$identify`/`$set`만 있는 Account는 WAA가 아니다. 인증 `$pageview`와 승인된 행동
   이벤트만 WAA를 만든다.
5. 대상 WAA는 같은 주의 WAA 중 이벤트에 보존된 과거 Person `available_profile_count >= 2`가 한 번
   이상 관측된 Account다. Person 갱신 이벤트도 자격 관측에 포함하며 threshold는 HogQL에서만 적용한다.
6. 사용 Profile은 `$pageview`의 선택 Profile, 성공한 `profile_selected`, Post·Follow 행동 주체만
   세고, 같은 Account·Profile 조합은 한 번만 센다.
7. 활성 Account는 대상 WAA이면서 같은 주에 서로 다른 사용 Profile이 2개 이상인 Account다.
8. 활성 사용률은 `활성 Account / 대상 WAA × 100`, 도달률은 `활성 Account / WAA × 100`이다. 분모 0은
   `null`(계산할 수 없음)로 표시한다.
9. Profile 생성은 성공 이벤트 횟수와 distinct 생성 Account 수를 모두 계산한다. 직접 전환은
   `profile_selected`의 `selection_cause=direct`, 존재하는 이전 ID와 서로 다른 도착 ID로 계산한다.
   활성 Account당 평균은 활성 집단의 전환 합계 / 활성
   Account 수로 계산해 전환 0회 활성 Account도 분모에 포함한다.
10. 기능 리텐션은 최초 활성 주차 cohort의 W+1/W+4 활성 재방문이고, 제품 리텐션은 기준 주의 대상 WAA가
    W+1/W+4에 WAA로 재방문한 비율이다. 도래하지 않은 주는 `not_due`, 분모 0은 `null`이다.

생성 직후 자동 선택, 첫 선택, 같은 Profile 재선택, 복원·재조회, 실패·취소는 직접 전환으로 세지 않는다.
SDK 차단이나 전송 실패로 빠진 행동은 추정하지 않는다.

## HogQL 저장 쿼리 형태

실제 Insight에는 아래 CTE 순서를 보존한 쿼리를 저장한다. 리텐션 조회의 `{from}`, `{to}`는 기준 주와
W+4 비교 주까지 포함한다. production Web 필터는 배포 환경의 표준 metadata에 맞춰 입력하며, 제외
Account 값은 접근 제한된 runtime 목록에서 주입한다. 실제 값과
Follow 대상 식별자는 저장소나 문서에 남기지 않는다.

```sql
WITH source AS (
    SELECT
        nullIf(toString(distinct_id), '') AS account_id,
        event,
        uuid,
        timestamp,
        properties,
        poe.properties.available_profile_count AS available_profile_count
    FROM events
    WHERE timestamp >= {from}
      AND timestamp < {to}
      AND event IN (
        '$pageview', '$identify', '$set', 'profile_created', 'profile_selected',
        'post_created', 'follow_succeeded', 'search_submitted',
        'search_results_loaded', 'search_result_selected'
      )
      AND {production_web_filter}
      AND account_id IS NOT NULL
      AND nullIf(toString(properties['$user_id']), '') = account_id
      AND account_id NOT IN {managed_exclusion_accounts}
), deduplicated AS (
    SELECT
        account_id,
        event,
        uuid,
        min(timestamp) AS occurred_at,
        argMin(properties, timestamp) AS properties,
        argMin(available_profile_count, timestamp) AS available_profile_count
    FROM source
    GROUP BY account_id, event, uuid
), weekly AS (
    SELECT
        toStartOfWeek(toTimeZone(occurred_at, 'Asia/Seoul'), 1) AS week_key,
        account_id,
        event,
        properties,
        available_profile_count
    FROM deduplicated
), waa AS (
    SELECT DISTINCT week_key, account_id
    FROM weekly
    WHERE event IN (
        '$pageview', 'profile_created', 'profile_selected', 'post_created',
        'follow_succeeded', 'search_submitted', 'search_results_loaded',
        'search_result_selected'
    )
), available AS (
    SELECT DISTINCT week_key, account_id
    FROM weekly
    WHERE toInt64OrNull(toString(available_profile_count)) >= 2
), used_profiles AS (
    SELECT DISTINCT week_key, account_id,
        properties['selected_profile_id'] AS profile_id
    FROM weekly
    WHERE event IN ('$pageview', 'profile_selected', 'post_created', 'follow_succeeded')
      AND nullIf(toString(properties['selected_profile_id']), '') IS NOT NULL
), target_waa AS (
    SELECT DISTINCT waa.week_key, waa.account_id
    FROM waa INNER JOIN available USING (week_key, account_id)
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

`used_profiles`에는 생성 성공만 포함하지 않으며, Profile 목록의 가용성은
Person 갱신 이벤트를 포함한 각 이벤트의 과거 Person 속성 관측으로만 판단한다.
`poe.properties.available_profile_count`는 수집 처리 당시 이벤트에 보존된 값이다. 현재 Person 값으로
과거 주차를 재분류하지 않는다. 앱 capture 시각과 서버 수집 시각이 다를 수 있으므로 주차 경계의 지연
수집은 운영 대조 대상이다. 최종 Insight는 위 집합과 동일한 제외 목록·dedup을 사용해야
한다. 현재 주는 `partial` badge를 표시하고, 과거 주 수치도 지연 도착 이벤트나 제외 목록 변경 시 다시
계산한다. 별도 영속 DB, materialized table, 새 Account 생성 이벤트는 추가하지 않는다.

위 CTE의 `waa`, `target_waa`, `active`를 각각 전체 WAA, 대상 WAA, 실제 다중 Profile 사용 Account의
원천 집합으로 사용한다. 활성 사용률은 `countDistinct(active.account_id) /
countDistinct(target_waa.account_id)`, 도달률은 `countDistinct(active.account_id) /
countDistinct(waa.account_id)`다. 두 분모가 0이면 `null`이다. `used_profiles`를
`week_key, profile_id`로 묶어 distinct Account 수를 세면 Profile별 사용량이 된다. Post와 Follow의
Profile별 성공 횟수는 `weekly`에서 해당 event와 `selected_profile_id`로 별도 묶는다.

직접 전환 총횟수는 중복 제거된 `weekly` 중 아래 조건을 충족하는 `profile_selected` 행 수다. 활성
Account당 평균은 이 조건을 만족하는 **활성 Account의** 행 수를 `active`의 Account 수로 나눈다.
전환 0회인 활성 Account도 분모에 포함된다.

```sql
event = 'profile_selected'
AND properties['selection_cause'] = 'direct'
AND nullIf(toString(properties['previous_profile_id']), '') IS NOT NULL
AND properties['previous_profile_id'] != properties['selected_profile_id']
```

기능 리텐션의 기준 집단은 각 Account가 `active`에 처음 나타난 `week_key`다. 기준 주에서 1주 또는 4주
뒤 `active`에 다시 나타난 Account를 분자로 센다. 제품 리텐션의 기준 집단은 **매주** `target_waa`이고,
기준 주에서 1주 또는 4주 뒤 `waa`에 나타난 Account를 분자로 센다. 두 리텐션 모두 기준 집단의
distinct Account 수가 분모다. 비교 주가 아직 완료되지 않았다면 `not_due`, 분모가 0이면 `null`을
표시한다. KST 주차 키를 기준으로 1주·4주를 더하며, 수신 시각으로 cohort를 옮기지 않는다.

## Dashboard / Insight 필드

주 지표는 활성 사용률이고 도달률은 보조 지표로 표시한다. 같은 화면에 다음을 함께 표시한다.

- WAA, 대상 WAA, 활성 Account의 절대 수
- 활성 사용률, 도달률
- Profile 생성 총횟수, 생성 distinct Account 수
- 직접 전환 총횟수, 활성 Account당 평균 전환
- Post 생성, Follow 성공·Relationship·Request 수
- 기능 리텐션 W+1/W+4, 대상 Account 제품 리텐션 W+1/W+4
- 관측 기간, 집계 실행 시각, `multi-profile-usage.v1`, 제외 목록 버전, `complete`/`partial` 상태

## 합성 대조 기준

기존 앱 집계 fixture의 기준 주 기대값을 HogQL 대조 기준으로 유지한다. 앱 집계 모듈과 그 전용 테스트는
제거했다. 저장 쿼리에 같은 raw observation을 주입한 read-back 전에는 아래 값이 실제 HogQL 실행 결과와
같다고 주장하지 않는다.

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

같은 UUID 재전송, Person 갱신 이벤트만 있는 Account, Profile 생성 뒤 사용 제외, 전환 0회 활성 Account, 분모 0,
KST 월요일 경계와 W+1/W+4 미도래를 함께 검증한다. 이 결과는 production 수집 인수나 대시보드 공개의
증거가 아니다.

Person 속성 방식의 합성 대조에는 다음 시간 순서를 포함한다. 이는 저장 쿼리의 read-back 전까지 기대
사례이며, 특히 `$set` 이벤트에 갱신 후 count가 보존되는지는 실제 PostHog 수집으로 확인해야 한다.

| 관측 순서                                                 | WAA  | 대상 WAA |
| --------------------------------------------------------- | ---- | -------- |
| 같은 주 count `1 → 2 → 1` 갱신 후 인증 화면 조회          | 포함 | 포함     |
| 이전 주 count `2`, 이번 주 count 변화 없이 인증 화면 조회 | 포함 | 포함     |
| count를 알 수 없는 상태에서 인증 화면만 조회              | 포함 | 제외     |
| count `2` 갱신 이벤트만 있고 승인된 화면·행동 관측은 없음 | 제외 | 제외     |

## 주간 점검과 인수 gate

완료된 직전 주를 점검할 때 담당자는 다음을 기록한다.

1. 관측 기간과 집계 실행 시각, 규칙 버전, 최신 제외 목록 버전을 고정한다.
2. 저장 쿼리의 중복 제거·KST 변환·Person 갱신 이벤트만 있는 Account 제외를 합성 기대표와 대조한다.
3. 지연 이벤트가 이전 주에 반영됐는지와 부분 집계가 아닌지 확인한다.
4. 개인정보 없는 PostHog schema/payload 증거에서 Account identity, 선택·행동 주체 Profile, 관측된 count,
   직접 전환, Post visibility, Follow result만 대조한다.
5. 실제 두 Profile 사용·직접 전환·생성·Post·Follow 흐름을 대시보드와 대조하고, SDK 차단·전송 실패로
   알 수 없는 누락은 한계로 기록한다.

운영 목록 담당은 `Product Analytics Owner`, 개인정보 계약 검토는 `Privacy/Trust Reviewer`, 주간 실행은
`Analytics On-call` 역할로 분리한다. 실제 이름과 Account 목록은 접근 제한된 운영 시스템에서 관리한다.

현재 PROD-795는 선행 dependency로 확인되었지만, 이 작업에는 production PostHog payload·집계 비교·완료된
직전 주 보고가 없다. 따라서 production 관측 시작, 대시보드 공개, 주간 운영 인수는 명시적으로 pending이며
합성 테스트만으로 완료 처리하지 않는다.
