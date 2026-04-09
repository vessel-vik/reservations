# Vercel Microfrontends + Multi-Tenant Redefinition

## New operating model

The system now follows a domain-composed architecture on Vercel:

- `reservations-pos-core` (default app): waiter workflows, settlement, print queue, passkey/session controls
- `reservations-admin-ops`: print approvals, queue health, drift/reconciliation operations
- `reservations-customer-touchpoints`: digital receipt and customer-facing post-payment surfaces

Routing is defined in `microfrontends.json` and composed by Vercel under one shared domain.

## Why this model

- Keeps POS critical path stable and independently deployable
- Moves high-change operational tooling into an isolated app
- Preserves multi-tenant isolation with existing `businessId` scoping in APIs and collections
- Matches queue-first print governance (tablet submits -> admin approves -> print bridge executes)

## CLI execution runbook

1. Create and link projects in Vercel:
   - `reservations-pos-core`
   - `reservations-admin-ops`
   - `reservations-customer-touchpoints`
2. From this repository root:
   - `vercel microfrontends create-group`
   - choose `reservations-pos-core` as default app
3. Add each project to the group:
   - `vercel microfrontends add-to-group`
4. Pull group config to verify alignment:
   - `vercel microfrontends pull`
5. Validate locally:
   - run default app dev server
   - run `microfrontends proxy --local-apps reservations-pos-core`
6. Deploy preview:
   - `vercel deploy`
7. Validate routing:
   - `/admin/*` resolves to admin ops app
   - `/pos/receipt/*` and `/pos/receipts/*` resolve to customer touchpoints app
8. Promote:
   - `vercel deploy --prod`

## Multi-tenant guardrails

- Keep tenant context at request boundary (host/path -> tenant -> `businessId`)
- Every data access remains filtered by `businessId`
- Never share print jobs or audit rows across tenants
- Keep domain mapping as a first-class tenant resolver concern in middleware

## Rollout flags (must remain enabled/disabled as below)

- `NEXT_PUBLIC_CENTRAL_POS_MODE_ENABLED=true`
- `NEXT_PUBLIC_TABLET_QUEUE_ONLY=true`
- `NEXT_PUBLIC_PRINT_PARALLEL_MODE_ENABLED=false`

This ensures tablet submissions remain approval-gated and queue-first.
