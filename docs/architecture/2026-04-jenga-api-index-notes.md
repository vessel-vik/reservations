# Jenga API Index Notes (Initial Research)

## Context

Goal: accept Equity paybill payments and reflect transaction status on waiter tablets in near real time.

Paybill information currently captured:

- M-Pesa/Airtel Paybill: `247247`
- Account number: `555045`
- Equity/Equitel business number: `555045`
- Account name: `AMTOPM LOUNGE`

## Documentation Indexed

- Jenga developer quickstart (merchant auth/token)
- Jenga receive-money callback patterns (STK/USSD + callback URL)
- Jenga transaction status query endpoints
- Jenga API error response catalog
- Jenga PGW instant payment notification (IPN) format

## Key Technical Findings

1. Jenga APIs commonly require:
   - Bearer token from merchant auth endpoint
   - `signature` header for signed requests on many APIs
2. Jenga/Finserve callbacks include status-style updates that can arrive asynchronously.
3. Provider callbacks may be delayed or retried; our endpoint must be idempotent.
4. A status-query endpoint exists for transaction/order reconciliation when callback is missing.

## Endpoint Contract Matrix (Indexed)

### 1) Merchant authentication

- **UAT:** `POST https://uat.finserve.africa/authentication/api/v3/authenticate/merchant`
- **Live:** `POST https://api.finserve.africa/authentication/api/v3/authenticate/merchant`
- **Headers:** `Content-Type`, `Api-Key`
- **Body:** `merchantCode`, `consumerSecret`
- **Output:** `accessToken`, `refreshToken`, `expiresIn`

### 2) Callback-driven payment initiation (example flow from docs)

- **UAT:** `POST https://uat.finserve.africa/v3-apis/payment-api/v3.0/stkussdpush/initiate`
- **Live:** `POST https://api.finserve.africa/v3-apis/payment-api/v3.0/stkussdpush/initiate`
- **Required signature formula:**
  - `merchant.accountNumber+payment.ref+payment.mobileNumber+payment.telco+payment.amount+payment.currency`
- **Payment ref rule in docs:** 6-12 alphanumeric chars.
- **Callback statuses observed:** `PENDING(0)`, `FAILED(1)`, `AWAITING_THIRD_PARTY_SETTLEMENT(2)`, `COMPLETED(3)`, etc.

### 3) Transaction status query (reconciliation)

- **UAT:** `GET https://uat.finserve.africa/v3-apis/transaction-api/v3.0/transactions/details/{ref}`
- **Live:** `GET https://api.finserve.africa/v3-apis/transaction-api/v3.0/transactions/details/{ref}`
- **Headers:** `Authorization: Bearer`, `Signature`
- **State mapping:** `stateCode=2 Success`, `stateCode=1 Failed`, `stateCode=-1 Awaiting callback`

### 4) IPN callback format (PGW)

- Callback URL configured in Jenga dashboard IPN settings.
- Jenga expects callback endpoint guarded by **Basic Auth** credentials configured on dashboard.
- Payload includes:
  - `transaction.reference`
  - `transaction.paymentMode`
  - `transaction.amount`
  - `transaction.status`
  - `transaction.billNumber`
  - `bank.reference`

### 5) Error classes to map in app

- Signature errors: `900100`, `900101`, `900102`
- Authorization/subscription errors: `401101`, `401201`, `401202`
- Duplicate reference: `400101`
- Query not found: `111102`

## Proposed Integration Model

1. **Waiter starts bank-paybill flow**
   - POS marks order `awaiting_bank_confirmation`.
   - UI shows prompt with paybill + account reference (order number).
2. **Customer pays via paybill**
   - Jenga callback posts transaction details to our callback endpoint.
3. **Callback processor validates + writes**
   - Verify source/auth.
   - Deduplicate callback events.
   - Append `payment_ledger` line with method `bank_paybill`.
   - Mark order as settled when amount coverage is complete.
4. **Tablet updates in real time**
   - waiter sees status chip transition from pending to confirmed.
5. **Fallback reconciliation**
   - if callback not received in SLA window, query provider by reference and reconcile.

## Data Contract Additions (Draft)

- `payment method`: `bank_paybill`
- `reference`: provider transaction reference
- `provider`: `jenga`
- `providerStatus`: `pending|confirmed|failed|expired|unknown`
- `callbackReceivedAt`
- `reconciledAt`
- `reconciliationSource`: `callback|query`
- `providerPayloadJson`: raw callback/query payload for audit

## Security and Reliability Recommendations

- Keep Jenga credentials server-side only (never expose to client).
- Verify callback authenticity (basic auth/signature/IP allowlist as supported).
- Use strict idempotency key on provider reference + amount + terminal/order context.
- Implement retry with exponential backoff for provider status queries.
- Trigger alerts for callback failure spikes and aged pending bank transactions.
- Add strict duplicate guard when provider returns `400101` (treat as potential replay and query final status by reference).

## UX Recommendations for Waiters

- Single "Bank Paybill (Equity)" option in settle UI with clear steps:
  1) share paybill details
  2) ask customer to pay using order reference
  3) watch live status chip
- Show a 60-second auto-refresh timer and a manual "Check now" button.
- Surface exact payment evidence on tablet:
  - amount
  - provider reference
  - payment time
- If payment is partial, keep split-payment editor active to complete balance using other methods.

## Open Gaps Before Build

- Confirm which Jenga product will drive paybill confirmations in production (`Jenga API` vs `Jenga PGW` route for your merchant profile).
- Confirm callback verification mode for your account (basic auth only vs additional signature controls).
- Merchant account subscription/permission scope must be verified in Jenga dashboard.

