# ScopePay checkout error repair

## Reported symptom

“PayPal checkout could not complete. No payment was recorded; verify the order before trying again.”

## Findings — October 26, 2026

1. The SDK `onError` callback overwrote the server's more useful error with a generic string. The accepted quote also lacked a visible verification control despite asking the buyer to verify.
2. Direct, read-only PayPal verification authenticated successfully (`OAuth HTTP 200`) and found exactly one Northline Coffee v2 local order for **USD 12.50**, with no recorded local capture. The provider returned **HTTP 404 / RESOURCE_NOT_FOUND** for that saved order. The old transport recognized only `INVALID_RESOURCE_ID`, so it incorrectly mapped this missing order to a generic provider failure.
3. The live order-verification path returned a retryable origin **502 Bad Gateway** during the investigation. The response was sometimes HTML and sometimes a structured gateway error, not a verified PayPal payment result. A network or proxy failure is not evidence that a payment failed.

## Repairs

- Recognize both confirmed PayPal 404 names (`RESOURCE_NOT_FOUND` and `INVALID_RESOURCE_ID`) as `PAYPAL_ORDER_NOT_FOUND`. Other status codes and unknown errors do not qualify for missing-order recovery.
- Preserve the authoritative server error when the SDK later invokes `onError`; add safe diagnostic logging without raw messages, credentials, IDs or URLs.
- Add **Verify this same order** to an accepted quote with a saved order. Verification is GET-only and does not create or capture a payment.
- Show owner recovery guidance and remove purchase/retry controls for a confirmed missing order. Dismissing an error hides its text but does not bypass the safety gate.
- Keep the checkout container mounted during verification; do not destroy/re-render the SDK when `createOrder` returns an order ID. Clean up SDK buttons when checkout eligibility changes.
- Reject HTML, malformed or incomplete successful API responses instead of returning `{}`. A successful-looking but invalid capture response never marks the review paid.
- Treat upstream 502/503/504 failures as service-unavailable/unknown status. Never infer that no payment occurred, and never retry or create replacement orders automatically.
- Prevent a late SDK error from downgrading a verified paid result.

## Safe completion

A code repair cannot restore a PayPal order the provider no longer recognizes. Before a replacement order is created, the owner must check the merchant's **PayPal Sandbox Activity** for a completed USD 12.50 payment and explicitly confirm that none exists. The existing confirmation-gated owner recovery can then reissue an order while preserving Northline Coffee v2's exact accepted terms and price. The buyer must approve in PayPal, and the server must verify a completed capture before ScopePay becomes paid.

No replacement order, buyer approval or capture was issued during this investigation. Test results and release state are appended below after validation; automated mocked tests do not constitute a real buyer-approved payment.

## Validation receipt

- `pnpm check`: passed.
- `pnpm test --reporter=dot`: **76 tests across 9 files passed**.
- `pnpm build`: passed.
- `git diff --check`: passed.
- New coverage includes both PayPal 404 error names, unknown provider/transport failures, HTML and malformed gateway responses, incomplete paid results, review-shape validation, retained server errors, same-order manual verification, Dismiss safety, stable SDK rendering during order preparation, exact accepted amount checks and monotonic paid state.

These are source and mocked regression results, not a completed real Sandbox capture. The live deployment and same-order GET verification are checked separately after publication.
