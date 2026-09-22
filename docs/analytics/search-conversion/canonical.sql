-- Canonical search conversion: edit the reporting interval, keep Asia/Seoul.
-- The interval includes its start and excludes its end; successes can cross midnight.
WITH
    toDateTime64('2026-09-22 00:00:00.000', 3, 'Asia/Seoul') AS period_start,
    toDateTime64('2026-09-23 00:00:00.000', 3, 'Asia/Seoul') AS period_end,
    now() AS observed_at,
    source_events AS (
        SELECT
            event,
            timestamp,
            toString(properties.search_profile_journey_id) AS journey_id,
            toString(properties.$session_id) AS session_id,
            toFloat(properties.elapsed_ms) AS elapsed_ms
        FROM events
        WHERE event IN (
            'search_profile_journey_started',
            'search_profile_view_succeeded',
            'search_profile_follow_succeeded'
        )
          AND properties.source = 'search_people'
          AND timestamp >= period_start
          AND timestamp < period_end + toIntervalMinute(30)
          AND timestamp <= observed_at
    ),
    grouped AS (
        SELECT
            journey_id,
            minIf(timestamp, event = 'search_profile_journey_started') AS started_at,
            argMinIf(session_id, timestamp, event = 'search_profile_journey_started') AS start_session,
            countIf(event = 'search_profile_journey_started') AS starts,
            groupArray(tuple(event, timestamp, session_id, elapsed_ms)) AS observations
        FROM source_events
        WHERE journey_id != '' AND session_id != ''
        GROUP BY journey_id
    ),
    journeys AS (
        SELECT
            started_at,
            arrayExists(x ->
                x.1 = 'search_profile_view_succeeded'
                AND x.3 = start_session
                AND x.2 >= started_at AND x.2 <= started_at + toIntervalMinute(30)
                AND x.4 >= 0 AND x.4 <= 1800000,
                observations
            ) AS viewed,
            arrayExists(x ->
                x.1 = 'search_profile_follow_succeeded'
                AND x.3 = start_session
                AND x.2 >= started_at AND x.2 <= started_at + toIntervalMinute(30)
                AND x.4 >= 0 AND x.4 <= 1800000,
                observations
            ) AS followed
        FROM grouped
        WHERE starts > 0 AND started_at >= period_start AND started_at < period_end
    )
SELECT
    count() AS denominator,
    countIf(viewed OR followed) AS converted,
    countIf(viewed) AS profile_views,
    countIf(followed) AS follows,
    converted / nullIf(denominator, 0) AS conversion_rate,
    profile_views / nullIf(denominator, 0) AS profile_view_rate,
    follows / nullIf(denominator, 0) AS follow_rate,
    multiIf(
        denominator = 0, 'no_data',
        observed_at <= max(started_at) + toIntervalMinute(30), 'provisional',
        'final'
    ) AS status
FROM journeys
