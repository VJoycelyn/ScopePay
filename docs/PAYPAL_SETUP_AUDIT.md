# ScopePay PayPal setup and checkout audit

**Reviewed:** October 23–26, 2026. No new Sandbox order was created and no payment was approved or captured during this review.

## Verified live state

- Both protected PayPal Sandbox keys are present in the WebDev runtime. Their values were not read or changed. The pair passed a direct Sandbox OAuth request. I corrected the stale key descriptions that claimed the pair had failed `invalid_client`; both stored values and their revisions were retained.
- Checkpoint `0f9d33cf3b1068d5d3414905bab75a63ff6b9df1` is published at `https://scopepay.manus.space`. `/api/health` returns OK; the sanitized live status reports PayPal, AI, and the database configured. The browser confirmed the PayPal Buttons SDK, one PayPal frame, and Northline version 2 on that earlier release. The current action label is **Prepare PayPal Sandbox checkout**. No checkout action was taken during that earlier review.
- Northline Coffee is still **scope version 2**, accepted, and exactly **USD 12.50**, with no recorded capture ID. The read-only order reconciliation found that PayPal returns **404 / `INVALID_RESOURCE_ID`** for the previously saved provider order under the currently configured Sandbox app. A local `CREATED` state does not prove the provider order still exists and never means paid.
- The original same-version buyer review link remains valid. The published checkpoint now defaults PayPal return/cancel URLs to `https://scopepay.manus.space`; the source regression test asserts that origin. The old provider order is still unavailable, so do not retry capture on it or silently create a replacement.
- This checkout uses synchronous Orders API capture: after explicit buyer approval, the ScopePay server captures and verifies the provider response before recording `paid`. A webhook is not required to confirm this synchronous capture; it may be added later for asynchronous event reconciliation, but it cannot substitute for approval/capture verification.

## Source repair and release boundary

- Reuse a saved PayPal order only after retrieving it and matching the provider order ID, project/document/version reference, single purchase unit, USD currency, and exact server-calculated amount. A provider-missing order fails closed instead of sending the buyer to a dead checkout.
- The owner Payments panel offers explicit Sandbox recovery for an unavailable or terminal order. The owner must affirm that Sandbox Activity has no completed payment. Recovery preserves the accepted document, version, and exact amount; it does not capture. Local pending/creating/capturing states and active, approved, pending, completed, or unknown provider states block replacement. Both workspace locks recheck the same attempt so recovery cannot replace a concurrent capture or creation. The existing same-version buyer link remains active, and a fresh continuation/review link is returned for PayPal's redirect back to ScopePay.
- The server and browser validate the provider approval URL and expose it only for HTTPS on `www.sandbox.paypal.com`. The client review and owner Payments ledger show an **Open PayPal Sandbox checkout** link for the secure-window/popup-blocked case; it opens in a new tab with no referrer. Return and cancel URLs point back to the same client capability on the configured HTTPS site origin.
- The capture path fails closed on mismatched version, order, currency, amount, reference, missing/empty identifiers, or unexpected multiple purchase units. Pending/retry transitions cannot regress an already captured state. Pending and unknown states do not create another order or trigger a second capture.
- Capture verifies the full retrieved provider order before calling PayPal. A supplied purchase-unit total must agree with the nested capture total; capture responses that omit the optional unit total still require the exact completed capture amount/currency.
- Clipboard success is shown only after the browser confirms the copy; a selectable manual-copy fallback appears if clipboard permission is blocked.
- Validation passed: TypeScript check, **53 tests across 6 files** (including 30 mocked route scenarios for accepted quotes and change orders and a Sandbox URL allowlist test), production build, and `git diff --check`. Tests made no live PayPal calls or database writes. Checkpoint `0f9d33cf3b1068d5d3414905bab75a63ff6b9df1` is published at the ScopePay URL. A browser-approved capture remains unverified.

## Safe next steps

1. Before any reissue, check the merchant's PayPal Developer **Sandbox Activity** for Northline version 2. The read-only provider lookup returning 404 is not proof that no transaction exists in the merchant account. If a completed USD 12.50 payment exists, do **not** reissue; refresh ScopePay and verify/reconcile it.
2. Only if Sandbox Activity has no completed payment, open the freelancer workspace and choose **Payments → Northline Coffee v2 → Show recovery options**. Check the no-capture confirmation and click **Create replacement Sandbox order**. This creates only a Sandbox order: it does not approve or capture. It retains exactly version 2 and USD 12.50.
3. Use **Open PayPal Sandbox checkout** if the secure popup does not proceed, or copy/send the additional fresh client review link. The direct link opens `www.sandbox.paypal.com` in a new tab. On the buyer page, verify **Sandbox**, **Northline Coffee version 2**, and **USD 12.50** before approval.
4. A Sandbox personal buyer must sign in privately and explicitly approve. On PayPal's return, ScopePay verifies the matching completed capture. Confirm **Payment recorded by the sandbox**, refresh the owner ledger, and cross-check Sandbox Activity. If status is pending/unknown or an error appears, stop and verify—do not create another order.

## Official PayPal references

- [Orders v2 — Create order](https://docs.paypal.ai/reference/api/rest/orders/create-order) documents PayPal approval and `experience_context` return/cancel URLs.
- [Orders v2 — Capture payment for order](https://docs.paypal.ai/reference/api/rest/orders/capture-payment-for-order) documents the capture request and approval-required cases.
- [PayPal JavaScript SDK setup](https://developer.paypal.com/sdk/js/set-up)
- [PayPal JavaScript SDK reference](https://developer.paypal.com/sdk/js/reference)
- [Orders API integration](https://developer.paypal.com/api/rest/integration/orders-api)
- [Webhooks overview](https://developer.paypal.com/api/rest/webhooks)
