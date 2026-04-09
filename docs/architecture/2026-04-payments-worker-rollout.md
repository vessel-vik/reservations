# Payments Worker + Ledger Rollout (Phase 1)

## Objective

Deliver a high-throughput, auditable, split-payment settlement flow using:

- Containerized settlement worker microservice
- Idempotent settlement requests
- Payment ledger shadow writes
- Self-hosted observability stack + lightweight in-app metrics
- 12-month retention policies

## Recommended Architecture

1. **POS/API (Next.js)** accepts settlement requests and performs fast validation.
2. **Idempotency layer** ensures retries return the same result.
3. **Settlement jobs collection** stores asynchronous work for a worker.
4. **Settlement worker (container)** picks pending jobs and performs settlement.
5. **Payment ledger shadow writes** persist immutable payment lines.
6. **Read models** are updated for admin dashboards and order cards.
7. **Metrics** exported to Prometheus; dashboards in Grafana.

## Data Contracts (Phase 1)

### Payment reference policy

- `mpesa`: exactly 10 alphanumeric uppercase chars.
- `pdq`: 6 or 12 alphanumeric uppercase chars.
- `cash`: no external code required.
- `paystack/prompt`: provider reference from callback.

### Terminal identity

- A stable install id is generated in-browser and persisted locally.
- Included in settlement payload for audit and idempotency context.

## Appwrite Collections to Provision

- `payment_settlement_jobs`
  - `businessId`, `status`, `orderIdsJson`, `paymentSplitsJson`, `paymentMethod`
  - `idempotencyKey`, `terminalId`, `createdBy`, `createdAt`, `startedAt`, `completedAt`
  - `resultJson`, `errorMessage`, `attemptCount`
- `payment_idempotency`
  - `businessId`, `idempotencyKey`, `requestHash`, `status`, `responseJson`, `expiresAt`
- `payment_ledger`
  - `businessId`, `orderId`, `method`, `amount`, `reference`, `terminalId`
  - `settledAt`, `settlementGroupId`, `source` (`shadow|worker`)
- `payment_metrics_daily` (optional in phase 1, can be computed later)

## Retention and Backup Policy (12 months)

### Retention

- Keep `payment_ledger` and `payment_settlement_jobs` for 12 months minimum.
- Add a daily cleanup task that archives/deletes records older than 365 days.

### Backups (Appwrite self-hosted)

Appwrite self-host requires explicit backup automation. For this project:

1. Daily MariaDB backup
2. Daily Appwrite volume backup (uploads/functions/config where relevant)
3. Offsite encrypted copy (S3-compatible/object storage)
4. Quarterly restore drill
5. Follow 3-2-1 backup rule

## Observability

### Lightweight app-level metrics

- Log structured settlement events in API + worker:
  - `settlement.requested`
  - `settlement.idempotency_hit`
  - `settlement.processed`
  - `settlement.failed`

### Self-hosted stack

- Prometheus scraping worker `/metrics`
- Grafana dashboards:
  - Settlement latency p50/p95
  - Job queue depth
  - Failure rate by method
  - Idempotency hit ratio

### Chosen self-host target (zero-cost, reliable, fast)

For this implementation, use **Oracle Cloud Always Free ARM VM** as the default host target:

- VM profile: Ampere A1 (2 OCPU / 12 GB RAM)
- Host stack:
  - Prometheus
  - Grafana
  - Settlement worker
- App host remains your existing Next.js deployment.

Rationale:

- no monthly infra cost (Always Free tier)
- good enough compute for queue worker + metrics
- strong reliability if uptime checks and restart policies are configured
- simple Docker-based operations

## Task Breakdown (Updated)

### Epic A — Validation and payload hygiene (done/in progress)

- [x] Enforce `mpesa` and `pdq` reference rules.
- [x] Generate stable terminal install id.
- [x] Carry `terminalId` through settlement payloads.

### Epic B — Shadow ledger writes

- [x] Create `payment_ledger` collection and indexes.
- [x] Add shadow ledger writes in settlement path.
- [x] Add defensive fallback if collection not configured.

### Epic C — Idempotent settlement API

- [x] Add `POST /api/payments/settle` with idempotency key support.
- [x] Persist idempotency records.
- [x] Return replayed responses for duplicate keys.

### Epic D — Worker microservice

- [x] Build `services/settlement-worker` container.
- [x] Poll pending jobs and process one-by-one with retries.
- [x] Push Prometheus metrics.

### Epic E — Dashboard/read-model integration

- [x] Surface ledger-backed payment breakdown in admin cards/tables (`/api/pos/orders?status=closed` enrichment).
- [x] Add ledger-preferred accounting summary totals and payment method breakdown (`/api/reports/accounting`).
- [ ] Add daily summary model materialization for high-volume long-range reports.

### Epic F — Operations and resilience

- [x] Add cleanup/retention job (12 months) via `/api/cron/payments-retention`.
- [x] Add retry/backoff + dead-letter behavior in settlement worker endpoint.
- [x] Add dead-letter admin replay API (`GET/POST /api/payments/settlements/dead-letter`).
- [x] Add idempotency TTL + payload conflict handling.
- [x] Add backup scripts and restore docs.
- [x] Add Grafana/Prometheus alerts for failures/queue backlog (`infra/observability/alerts.yml`).

### Epic G — Bank paybill auto-reconciliation (Jenga/Equity)

- [x] Index Jenga documentation and map core contracts (auth, callback/IPN, status query, errors).
- [ ] Confirm Jenga API product scope enabled on merchant account:
  - collections/paybill callbacks
  - transaction status query
  - callback/IPN credentials and allowlist
- [x] Add `bank_paybill` settlement method to payment split model and UI labels.
- [ ] Add `bank_transaction_ref` policy:
  - uppercase alphanumeric
  - min/max length from Jenga specs once doc is available
  - strict uniqueness by `(businessId, reference, amount)` over a time window
- [x] Build inbound callback endpoint for Jenga with:
  - source auth verification
  - signature verification when supported by product
  - idempotency dedupe for callback retries
  - append-only write to `payment_ledger`
- [x] Build active reconciliation endpoint:
  - query transaction/order status by reference
  - resolve unknown/pending callbacks
  - exponential backoff retries
- [x] Add waiter-facing UX in tablet settle flow:
  - "Prompt customer to pay via Paybill"
  - live status chips: `awaiting_payment` -> `confirmed` -> `failed/expired`
  - one-tap "Check status now" fallback
- [ ] Add settlement job orchestration for bank method:
  - `awaiting_bank_confirmation` lifecycle
  - auto-timeout/expiry handling
  - manual replay trigger from dead-letter/admin page
- [x] Add real-time fanout:
  - on confirmed bank callback, push status update to table/order on waiter tablet
  - show amount/reference/time to waiter for quick confirmation
- [x] Add ops safeguards:
  - callback failure alert
  - pending bank payment SLA alert (e.g., >5 minutes)
  - reconciliation drift alert (`ledger != provider status`)

## Required Material (next step from owner)

1. Jenga API documentation file path in repo (or upload) for exact contract indexing.
2. Jenga credentials once approved:
   - `JENGA_API_KEY`
   - `JENGA_MERCHANT_CODE`
   - `JENGA_CONSUMER_SECRET`
   - signing private key / certificate details
3. Callback setup details:
   - callback URL allowlist target
   - IP restriction / auth mode expected by Jenga
4. Settlement operations policy:
   - max waiter hold time before fallback/manual override
   - acceptable reconciliation lag target (e.g., <= 60 seconds)

## Build Order (Jenga integration)

1. Add server-only Jenga client (`auth`, `sign`, `query status`) and env validation.
2. Add callback ingestion route with auth verification + idempotent dedupe.
3. Append ledger lines for confirmed callback/query results.
4. Add waiter tablet state (`awaiting -> confirmed/failed`) and split-flow completion.
5. Add periodic reconciliation worker path for pending references.
6. Add alerting and ops dashboards for callback/reconciliation drift.

### Phase G progress notes (current)

- Added `POST /api/payments/jenga/callback` (Basic Auth verification, callback parsing, idempotent queueing).
- Added `POST /api/payments/jenga/reconcile` (auth-protected provider status query by reference).
- Added `GET/POST /api/payments/jenga/unresolved` for unresolved callback review + admin re-queue/ignore.
- Added server Jenga client utilities (`lib/jenga-client.ts`) for token auth, RSA signature, and status mapping.
- Hardened worker settlement path to support non-user/system contexts (`authContextOverride`).
- Added waiter `Bank Paybill` flow in `PayNowModal` with:
  - paybill prompt details
  - `awaiting/checking/confirmed/failed` status feedback
  - one-tap `Check status now` via reconciliation endpoint
- Added waiter `Bank Paybill` support in `SettleTableTabModal` for selected/all tabs with:
  - paybill prompt details
  - provider amount visibility
  - one-tap `Check status now` and settlement completion
- Added `POST /api/cron/jenga-reconcile` and worker hook (`WORKER_JENGA_RECONCILE_EVERY_LOOPS`) for periodic auto-reconciliation.
- Added `GET /api/payments/jenga/summary` + `JengaOpsCenter` KPI cards:
  - unresolved count
  - pending bank jobs
  - avg unresolved age
  - avg callback-to-settle latency
- Added `POST /api/cron/jenga-drift` for provider-confirmed but locally-unsettled transactions (`unresolved_drift` ticketing).
- Extended unresolved admin APIs/UI to include both `unresolved_callback` and `unresolved_drift` with manual actions.
- Added unresolved drift KPIs (`unresolvedDriftCount`, `unresolvedOver5mCount`) in summary API + ops dashboard cards.
- Added settlement-worker drift sweep hook (`WORKER_JENGA_DRIFT_CHECK_EVERY_LOOPS`) and exposed drift gauges for Prometheus.
- Added Prometheus alerts for drift conditions (`JengaDriftTicketsDetected`, `JengaUnresolvedOverSla`).
- Hardened waiter confirmation UX with persistent tray actions:
  - copy payment reference
  - jump to matching closed order search
  - expiry progress indicator
- Improved ops triage UX with unresolved type filters and one-click prefill from detected drift order IDs.
- Added callback ingress hardening controls in `POST /api/payments/jenga/callback`:
  - optional callback IP allowlist (`JENGA_CALLBACK_IP_ALLOWLIST`)
  - replay window guard (`JENGA_CALLBACK_REPLAY_WINDOW_MINUTES`) with unresolved triage fallback
- Added callback credential rotation support:
  - primary pair: `JENGA_CALLBACK_USERNAME` + `JENGA_CALLBACK_PASSWORD`
  - next pair (grace period): `JENGA_CALLBACK_USERNAME_NEXT` + `JENGA_CALLBACK_PASSWORD_NEXT`
- Added canary rollout guardrails for bank paybill settlement requests in `POST /api/payments/settle`:
  - `BANK_PAYBILL_ROLLOUT_ENABLED`
  - `BANK_PAYBILL_CANARY_BUSINESS_IDS`
  - `BANK_PAYBILL_CANARY_TERMINAL_IDS`
  - `BANK_PAYBILL_CANARY_REQUIRE_TERMINAL`

## Appwrite backup and plan guidance

### Self-hosted Appwrite

- Backups are **manual/automated by you** (not automatic unless you build it).
- Recommended:
  - daily DB backups
  - daily volume backups
  - encrypted offsite copy
  - quarterly restore drills
- Retention for payment data is set to **12 months** (`PAYMENT_RETENTION_DAYS=365`).

### Appwrite Cloud Pro features useful for this roadmap

- self-managed backup policies and easier restore workflows
- reduced operational burden compared to self-hosted backup scripting
- useful if/when your team wants managed resilience over full infra control

