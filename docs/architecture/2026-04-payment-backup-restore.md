# Payment Backup and Restore Runbook

## Scope

This runbook covers backup and restore for payment-critical Appwrite collections:

- `payment_settlement_jobs`
- `payment_idempotency`
- `payment_ledger`

Retention target remains 12 months for live data (`PAYMENT_RETENTION_DAYS=365`).

## Backup Procedure

1. Ensure `.env.local` has valid Appwrite admin credentials:
   - `NEXT_PUBLIC_ENDPOINT`
   - `PROJECT_ID` (or `NEXT_PUBLIC_PROJECT_ID`)
   - `API_KEY`
   - `DATABASE_ID`
2. Run:

```bash
npm run backup-payments
```

3. Verify output under:

```bash
backups/payments/<timestamp>/
```

Expected files:

- `jobs.json`
- `idempotency.json`
- `ledger.json`
- `manifest.json`

## Restore Strategy (Safe and Auditable)

Use staged restore instead of direct overwrite:

1. **Create temporary collections** (or a temporary environment) with the same schema.
2. **Import JSON dump** documents in batches.
3. **Run validation checks**:
   - document counts match backup manifest
   - settlement totals per method match accounting reports
   - random sample of order-level ledger lines match receipts
4. **Switch read path** to restored collections only after checks pass.
5. Keep original collections read-only until confidence is confirmed.

## Validation Checklist

- `payment_ledger` totals by day match historical reports.
- Closed orders have consistent payment method breakdowns.
- Idempotency keys still replay for retained windows.
- Dead-letter jobs remain queryable and replayable.

## Operational Recommendations

- Run backup daily via cron on the worker host.
- Encrypt and copy backup artifacts to offsite object storage.
- Keep at least 35 daily backups and 12 monthly snapshots.
- Run quarterly restore drills and document recovery time.

