# Kosmo PostgreSQL primary unavailable

Owner: Platform/SRE.

`KosmoDatabasePrimaryUnavailable` fires when Prometheus has no observed primary in `kosmo-prod/kosmo-postgres` with `cnpg_pg_replication_in_recovery = 0`, a healthy CNPG collector and scrape, and a replication sample less than 60 seconds old for 2 minutes. The CNPG metrics scrape every 30 seconds, so the freshness window allows two scrape intervals.

This is a primary observability signal. Missing or stale metrics can indicate a scrape or exporter problem as well as a database primary problem. The rule does not verify application database transactions and does not detect a Pooler-only failure. If Prometheus itself is unavailable, this rule cannot evaluate or notify; check Prometheus and Alertmanager availability separately because in-cluster alerts may not cover a total outage.

The alert uses the existing `#monitoring` route. For shared receiver and delivery troubleshooting, see the [infrastructure Alertmanager Slack operations](https://github.com/byulmaru/kubernetes/blob/main/docs/operations.md#alertmanager-slack-notifications).

Check the alert and its source metrics in the [Prometheus UI](https://prometheus-aws.tail1fdd55.ts.net):

```promql
ALERTS{alertname="KosmoDatabasePrimaryUnavailable"}
cnpg_pg_replication_in_recovery{namespace="kosmo-prod", cnpg_cluster="kosmo-postgres", cnpg_role="primary"}
cnpg_collector_up{namespace="kosmo-prod", cnpg_cluster="kosmo-postgres"}
up{namespace="kosmo-prod", cnpg_cluster="kosmo-postgres"}
time() - timestamp(cnpg_pg_replication_in_recovery{namespace="kosmo-prod", cnpg_cluster="kosmo-postgres", cnpg_role="primary"})
```

Inspect the CNPG cluster, current primary, Pods, Services and endpoints, recent events, and operator logs:

```bash
kubectl -n kosmo-prod get clusters.postgresql.cnpg.io kosmo-postgres -o jsonpath='{.status.currentPrimary}{"\t"}{.status.phase}{"\n"}'
kubectl -n kosmo-prod describe clusters.postgresql.cnpg.io kosmo-postgres
kubectl -n kosmo-prod get pods -l cnpg.io/cluster=kosmo-postgres -o wide
kubectl -n kosmo-prod get services,endpoints -o wide | grep kosmo-postgres
kubectl -n kosmo-prod get events --sort-by=.lastTimestamp
kubectl -n cnpg-system get events --sort-by=.lastTimestamp
kubectl -n cnpg-system logs deployment/cloudnative-pg --all-containers --since=15m
```

If the primary is visible but application connectivity fails, inspect Pooler Pods and their recent logs. A Pooler-only incident does not trigger this alert:

```bash
kubectl -n kosmo-prod get pods -o wide
kubectl -n kosmo-prod get pods -o name | grep -Ei 'pooler|pgbouncer' | while IFS= read -r pod; do kubectl -n kosmo-prod logs "$pod" --all-containers --since=15m; done
```

Verify a read-only query such as `SELECT 1` through the application's normal database-backed path; the public `/health` endpoint does not establish database connectivity. Use the existing approved credential path without printing the DSN or credential values. If no primary is reported, a required metric is absent or stale, or the read-only query fails, escalate to Platform/SRE with the alert state, cluster status, relevant Pods and endpoints, events, and redacted logs. Do not restart database Pods, force a failover, or change data or credentials without the incident owner following the approved recovery procedure.
