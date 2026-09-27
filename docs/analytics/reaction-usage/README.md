# Reaction 종류별 사용 지표

이 문서는 PROD-986의 최소 재현 가능한 HogQL 분석을 제공한다. 앱은 기존 reaction_added·reaction_removed event를 재사용하며, 허용된 Unicode Reaction에만 emoji_kind = unicode와 reaction_emoji_key를 붙인다. key는 완전한 Unicode code point sequence를 나타낸다. 사용자 정의 이모지는 아직 개별 계측하지 않는다.

## 기준

- PostHog production Web project의 Asia/Seoul timezone을 사용한다.
- 관측 기간은 반개구간 [시작, 끝)이다. 아래 날짜는 실행 전에 비교할 동일한 기간으로 바꾼다.
- PostHog person_id는 앱이 immutable Account ID로 identify한 이벤트를 같은 Account로 합친 person identity다. distinct Account는 person_id로 센다.
- key가 있는 reaction_added가 한 번 이상 관측된 person_id만 사용 Account 수에 포함한다.
- 추가 횟수와 제거 횟수를 별도로 계산한다. 추가 - 제거는 현재 남은 Reaction 수가 아니다.
- 내부·테스트 Account와 bot을 식별하는 검증된 목록·규칙이 없어 제외하지 않는다. 결과에 이 조건을 그대로 표시한다.
- key 없는 과거 이벤트, 수집 비활성 기간, Native 동작은 이 결과에 넣거나 추정·backfill하지 않는다.

PostHog의 [HogQL 문서](https://posthog.com/docs/hogql)는 SQL editor 실행 방법을 설명한다. 아래 쿼리는 템플릿이며 이번 변경에서 실제 PostHog Cloud dataset에 실행하지 않았다. 새 Reaction 종류 key의 공개 고지와 시행일을 확정해 production에 배포한 뒤 관측 기간을 정하고 project에서 검증한다.

## Account 수와 이벤트 횟수

```sql
WITH account_usage AS (
    SELECT
        properties['reaction_emoji_key'] AS reaction_emoji_key,
        person_id,
        countIf(event = 'reaction_added') AS additions,
        countIf(event = 'reaction_removed') AS removals
    FROM events
    WHERE timestamp >= toDateTime('2026-09-01 00:00:00', 'Asia/Seoul')
      AND timestamp < toDateTime('2026-10-01 00:00:00', 'Asia/Seoul')
      AND event IN ('reaction_added', 'reaction_removed')
      AND properties['emoji_kind'] = 'unicode'
      AND properties['reaction_emoji_key'] != ''
      AND person_id IS NOT NULL
    GROUP BY reaction_emoji_key, person_id
)
SELECT
    reaction_emoji_key,
    countIf(additions > 0) AS accounts_used,
    sum(additions) AS addition_events,
    sum(removals) AS removal_events,
    countIf(additions > 1) AS accounts_with_repeated_additions,
    sumIf(additions, additions > 1) AS additions_from_repeating_accounts
FROM account_usage
GROUP BY reaction_emoji_key
ORDER BY accounts_used DESC, reaction_emoji_key;
```

## Account별 추가 횟수 분포

같은 관측 기간을 적용한다. 결과 행은 Reaction key와 해당 key를 정확히 N번 추가한 Account 수의 조합이다. Account 식별자를 결과로 반환하지 않는다.

```sql
WITH account_usage AS (
    SELECT
        properties['reaction_emoji_key'] AS reaction_emoji_key,
        person_id,
        countIf(event = 'reaction_added') AS additions,
        countIf(event = 'reaction_removed') AS removals
    FROM events
    WHERE timestamp >= toDateTime('2026-09-01 00:00:00', 'Asia/Seoul')
      AND timestamp < toDateTime('2026-10-01 00:00:00', 'Asia/Seoul')
      AND event IN ('reaction_added', 'reaction_removed')
      AND properties['emoji_kind'] = 'unicode'
      AND properties['reaction_emoji_key'] != ''
      AND person_id IS NOT NULL
    GROUP BY reaction_emoji_key, person_id
)
SELECT
    reaction_emoji_key,
    additions AS additions_per_account,
    count() AS account_count
FROM account_usage
WHERE additions > 0
GROUP BY reaction_emoji_key, additions_per_account
ORDER BY reaction_emoji_key, additions_per_account;
```

## 해석 한계

- accounts_used는 관측 기간에 해당 Unicode Reaction 추가 event가 한 번 이상 있는 identified PostHog person 수다. 앱의 Account identify contract에서 Account 수로 해석한다.
- addition_events와 removal_events는 성공 callback으로 기록된 Web event 수다. 이벤트 누락, 기간 이전의 상태와 멱등 요청 때문에 DB의 현재 Reaction 재고와 다를 수 있다.
- accounts_with_repeated_additions는 같은 기간 같은 key를 두 번 이상 추가한 identified Account 수다. 두 번째 쿼리는 그 추가 횟수별 Account 분포를 준다.
- 이번 쿼리는 내부·테스트 Account와 bot을 걸러내지 않는다. 분모가 없어 가입 Account 대비 비율이나 WAA를 산출하지 않는다.
- 수집 중단 기간과 key 도입 전 데이터는 포함되지 않으며 backfill하지 않는다. 이 결과는 계측된 Web 동작이며 Native를 포함한 제품 전반의 사용량이나 노출 조건을 통제한 선호도 주장이 아니다.
