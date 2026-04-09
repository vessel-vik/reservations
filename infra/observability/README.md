# Self-hosted Observability (Prometheus + Grafana)

This stack provides immediate visibility into settlement throughput and failures.

## Start

```bash
cd infra/observability
docker compose -f docker-compose.observability.yml up -d
```

## Endpoints

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Worker metrics: `http://localhost:9464/metrics`

## Alerts (built-in)

Prometheus alert rules are preloaded from `infra/observability/alerts.yml`:

- `SettlementQueueBacklogHigh` (`settlement_queue_depth > 20` for 5m)
- `SettlementDeadLetterDetected` (dead-letter increments in last 5m)
- `SettlementWorkerFailuresSpike` (>5 worker failures in 10m)
- `JengaDriftTicketsDetected` (`jenga_unresolved_drift_count > 0` for 5m)
- `JengaUnresolvedOverSla` (`jenga_unresolved_over_sla_count > 0` for 5m)

## Required env

- `SETTLEMENT_WORKER_TOKEN` must be set for `settlement-worker`.
- Ensure the Next.js app has matching `SETTLEMENT_WORKER_TOKEN`.
- Optional: `WORKER_JENGA_RECONCILE_EVERY_LOOPS` (default `20`) controls how often the worker calls `/api/cron/jenga-reconcile`.
- Optional: `WORKER_JENGA_DRIFT_CHECK_EVERY_LOOPS` (default `40`) controls how often the worker calls `/api/cron/jenga-drift`.
- Optional: `JENGA_DRIFT_SLA_MINUTES` (default `5`) controls the age threshold for creating drift tickets (`provider confirmed` but order still unpaid).

## Production note

- Replace default Grafana admin password.
- Put Prometheus/Grafana behind private network or reverse proxy auth.
- Add persistent volumes and offsite backup for Grafana dashboards.
- Configure Alertmanager routing (Slack/email) before production rollout.

