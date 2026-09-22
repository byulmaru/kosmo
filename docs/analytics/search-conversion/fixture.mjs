import { readFileSync } from 'node:fs';

// Render constant SELECT rows, never ingest test events into the production project.
const scenario = process.argv[2] ?? 'acceptance';
if (!['acceptance', 'boundaries', 'provisional', 'no-data'].includes(scenario)) {
  throw new Error('Usage: node fixture.mjs [acceptance|boundaries|provisional|no-data]');
}
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const rows =
  scenario === 'boundaries'
    ? [...fixtures.acceptance, ...fixtures.extraBoundaries]
    : fixtures.acceptance;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const selects = rows.map(
  ({ event, timestamp, journey_id, session_id, elapsed_ms }) =>
    `SELECT ${literal(event)} AS event, toDateTime64(${literal(timestamp)}, 3, 'Asia/Seoul') AS timestamp, ${literal(journey_id)} AS journey_id, ${literal(session_id)} AS session_id, ${elapsed_ms} AS elapsed_ms`,
);
const start = scenario === 'no-data' ? '2026-08-31' : '2026-09-01';
const end = scenario === 'no-data' ? '2026-09-01' : '2026-09-02';
const observed = scenario === 'provisional' ? '2026-09-02 00:00:00.000' : '2026-09-02 01:00:00.000';
const canonical = readFileSync(new URL('./canonical.sql', import.meta.url), 'utf8');
const query = canonical
  .replace("'2026-09-22 00:00:00.000'", `'${start} 00:00:00.000'`)
  .replace("'2026-09-23 00:00:00.000'", `'${end} 00:00:00.000'`)
  .replace('now() AS observed_at', `toDateTime64('${observed}', 3, 'Asia/Seoul') AS observed_at`)
  .replace(
    / {4}source_events AS \([\s\S]+?(?= {4}grouped AS \()/,
    `    fixture_events AS (
        ${selects.join('\n        UNION ALL\n        ')}
    ),
    source_events AS (
        SELECT * FROM fixture_events WHERE timestamp >= period_start
            AND timestamp < period_end + toIntervalMinute(30) AND timestamp <= observed_at
    ),
`,
  );
process.stdout.write(query);
