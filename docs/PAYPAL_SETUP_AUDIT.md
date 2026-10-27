# ScopePay PayPal setup and checkout audit

**Reviewed:** October 23, 2026. No new Sandbox order was created and no payment was approved or captured during this audit.

## Verified live state

- Both protected PayPal Sandbox keys are present in the WebDev runtime. Their values were not read or changed. The pair passed a direct Sandbox OAuth request. I corrected the stale key descriptions that claimed the pair had failed `invalid_client`; both stored values and their revisions were retained.
- The live buyer page at `https://scopepay.manus.space` reports PayPal, the database, and AI configured. A read-only browser check confirms the PayPal Buttons SDK and PayPal frame load and the direct-link action is visible; no order was created.
- Northline Coffee is still **scope version 2**, accepted, and exactly **USD 12.50**, with no recorded capture ID. The read-only order reconciliation found that PayPal returns **404 / `INVALID_RESOURCE_ID`** for the previously saved provider order under the currently configured Sandbox app. A local `CREATED` state does not prove the provider order still exists and never means paid.
- The original same-version buyer review link remains valid. The previous published source used the former Kindred hostname as its PayPal return/cancel default; the current source now defaults to `https://scopepay.manus.space` and has a regression assertion for that origin. Confirm the newest release is active before inviting a buyer. Do not retry capture on the unavailable provider ID or silently issue another order.
- This checkout uses synchronous Orders API capture: after explicit buyer approval, the ScopePay server captures and verifies the provider response before recording `paid`. A webhook is not required to confirm this synchronous capture; it may be added later for asynchronous event reconciliation, but it cannot substitute for approval/capture verification.

## Source repair and release boundary

- Reuse a saved PayPal order only after retrieving it and matching the provider order ID, project/document/version reference, single purchase unit, USD currency, and exact server-calculated amount. A provider-missing order fails closed instead of sending the buyer to a dead checkout.
- The owner Payments panel offers explicit Sandbox recovery for an unavailable or terminal order. The owner must affirm that Sandbox Activity has no completed payment. Recovery preserves the accepted document, version, and exact amount; it does not capture. Local pending/creating/capturing states and active, approved, pending, completed, or unknown provider states block replacement. Both workspace locks recheck the same attempt so recovery cannot replace a concurrent capture or creation. The existing same-version buyer link remains active, and a fresh continuation/review link is returned for PayPal's redirect back to ScopePay.
- The browser validates the provider approval URL and exposes it only for HTTPS on `www.sandbox.paypal.com`. A visible **Continue to PayPal** link supports the secure-window/popup-blocked case. Return and cancel URLs point back to the same client capability on the configured HTTPS site origin.
- The capture path fails closed on mismatched version, order, currency, amount, reference, missing/empty identifiers, or unexpected multiple purchase units. Pending/retry transitions cannot regress an already captured state. Pending and unknown states do not create another order or trigger a second capture.
- Capture verifies the full retrieved provider order before calling PayPal. A supplied purchase-unit total must agree with the nested capture total; capture responses that omit the optional unit total still require the exact completed capture amount/currency.
- Clipboard success is shown only after the browser confirms the copy; a selectable manual-copy fallback appears if clipboard permission is blocked.
- Validation for the working source passed: TypeScript check, **53 tests across 6 files** (including 30 mocked route scenarios for accepted quotes and change orders and a Sandbox URL allowlist test), production build, and `git diff --check`. Tests made no live PayPal calls or database writes. The source is validated; check the active deployment before using the repaired return flow. A browser-approved capture remains unverified.

## Safe next steps

1. Before any reissue, check the merchant's PayPal Developer **Sandbox Activity** for Northline version 2. If a completed USD 12.50 payment exists, do **not** reissue; refresh ScopePay and verify/reconcile it.
2. Only if Sandbox Activity has no completed payment, open the freelancer workspace and choose **Payments → Northline Coffee v2 → Show recovery options**. Check the no-capture confirmation and click **Create replacement Sandbox order**. This creates only a Sandbox order: it does not approve or capture. It retains exactly version 2 and USD 12.50.
3. Use **Continue to PayPal** if the secure popup does not proceed, or copy/send the additional fresh client review link. On the buyer page, verify **Sandbox**, **Northline Coffee version 2**, and **USD 12.50** before approval.
4. A Sandbox personal buyer must sign in privately and explicitly approve. On PayPal's return, ScopePay verifies the matching completed capture. Confirm **Payment recorded by the sandbox**, refresh the owner ledger, and cross-check Sandbox Activity. If status is pending/unknown or an error appears, stop and verify—do not create another order.

## Official PayPal references

- [Orders v2 — Create order](https://docs.paypal.ai/reference/api/rest/orders/create-order) documents PayPal approval and `experience_context` return/cancel URLs.
- [Orders v2 — Capture payment for order](https://docs.paypal.ai/reference/api/rest/orders/capture-payment-for-order) documents the capture request and approval-required cases.
- [PayPal JavaScript SDK setup](https://developer.paypal.com/sdk/js/set-up)
- [PayPal JavaScript SDK reference](https://developer.paypal.com/sdk/js/reference)
- [Orders API integration](https://developer.paypal.com/api/rest/integration/orders-api)
- [Webhooks overview](https://developer.paypal.com/api/rest/webhooks)
