# Kosmo PostgreSQL primary unavailable

Owner: Platform/SRE.

The `KosmoDatabasePrimaryUnavailable` Grafana-managed rule is provisioned from the app-owned `kosmo-database-alerts` ConfigMap. It queries the Prometheus datasource UID `prometheus`, in Grafana organization `1` and folder `KOSMO`, with rule UID `kosmo-db-primary`. The group evaluates every 30 seconds. A healthy result is `0`; it becomes `1` when Prometheus has no fresh sample showing a primary in `kosmo-prod/kosmo-postgres` with `cnpg_pg_replication_in_recovery = 0`, a healthy CNPG collector and scrape, and a sample less than 60 seconds old. It fires after 2 minutes. The CNPG metrics scrape every 30 seconds, so the freshness window allows two scrape intervals. Grafana query errors and no-data results are also configured to alert after 2 minutes.

This is a primary observability signal. Missing or stale metrics can indicate a scrape or exporter problem as well as a database primary problem, and a query error can indicate a datasource or expression problem. The rule does not verify application database transactions and does not detect a Pooler-only failure. If Grafana itself is unavailable, this rule cannot evaluate or notify.

The rule sends to the platform-provisioned Grafana contact point `platform-slack-monitoring`, whose configuration and delivery troubleshooting are platform-owned. See the infrastructure [Grafana Alerting provisioning operations](https://github.com/byulmaru/kubernetes/blob/main/docs/operations.md#grafana-alerting-provisioning). The app-owned ConfigMap is read by the Grafana provisioning sidecar at Pod startup; deploy the ConfigMap before the Grafana platform rollout. Later ConfigMap edits require a Grafana restart to load and evaluate the updated rule.

Inspect the `kosmo-db-primary` rule in the `KOSMO` folder using [Grafana](https://grafana-aws.tail1fdd55.ts.net/), including its state and query evaluation. To check the source metrics, use the [Prometheus UI](https://prometheus-aws.tail1fdd55.ts.net):

```promql
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
