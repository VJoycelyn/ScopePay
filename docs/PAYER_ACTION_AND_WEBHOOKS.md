# PayPal buyer-action recovery and signed notifications

## Finish the same saved order

`PAYER_ACTION_REQUIRED` means PayPal needs the buyer to return and complete a requested action. It is not a completed payment and is not permission to create a replacement. ScopePay keeps the accepted version, exact USD amount, and saved provider order unchanged. Only an explicit `payer-action` link from a server-validated PayPal GET can be used as the action-required continuation. A generic `approve` relation is not substituted for it. [1]

On the client review, select **Verify payment**. If buyer action is required, follow the visible checklist and choose **Open PayPal Sandbox checkout**. Sign in privately with a Sandbox Personal buyer, not the configured merchant or a live account. Complete PayPal's requested action and allow it to return to ScopePay. The normal return or SDK approval flow then requests server capture; the server revalidates the accepted terms before capture and verifies its completed result. If using the original tab, verify the same order again and use **Retry capture** only after the buyer-action notice clears. Dismissing a message does not remove the action-required gate.

A missing or unsafe provider action URL is not replaced with a fabricated link. The same-order preparation button can re-read the existing saved order without creating another one. Pending or unknown status still prohibits replacement. The receipt appears only after the matching order, document/version reference, exact integer-cent amount, USD currency, and completed capture have been verified.

The November 3 read-only diagnosis identified the action-required state on a separate Northline mock order at USD 12.50. This must not be conflated with, or used to alter, the original accepted Northline Coffee version 2 USD 12.50 record. No buyer approval or completed capture is claimed by this source change.

## Optional webhook registration

Standard PayPal checkout already uses synchronous server capture and same-order GET reconciliation. Webhooks add independent notifications; they do not approve buyers or cure a `PAYER_ACTION_REQUIRED` state. [2] [3]

After this version is published, open PayPal Developer Dashboard privately and select **Sandbox → Apps & Credentials → the same REST app used by ScopePay**. Add this listener URL:

```text
https://scopepay.manus.space/api/scopepay/paypal/webhook
```

Subscribe to **PAYMENT.CAPTURE.COMPLETED**. Store the resulting listener's webhook ID as `PAYPAL_WEBHOOK_ID` through protected server environment settings, then redeploy. Do not paste credentials, buyer passwords, private review links, or event payloads into chat or source control. An ID configured flag indicates only local configuration—not that a subscription or signed delivery has been verified.

The endpoint returns a safe HTTP 503 while not configured. A configured listener rejects malformed/oversized JSON, missing or unsafe headers, and invalid signatures. It preserves the original event JSON for PayPal's postback verification and calls only the fixed Sandbox verification API using server OAuth. Certificate metadata is limited to the exact HTTPS `api.sandbox.paypal.com` and `api-m.sandbox.paypal.com` origins. ScopePay never fetches a URL supplied in an event. [3]

Only after signature success does the listener locate an existing saved order and independently GET it from PayPal. The order identity, accepted document/version reference, amount, USD currency, and completed capture must match both the saved state and notification. The workspace lock rechecks immutable terms before recording paid; repeated and concurrent deliveries cannot duplicate a completed transition or audit entry. Unsupported events and unknown orders are acknowledged without changing payment state. The endpoint never creates, replaces, approves, or captures an order.

For delivery evidence, use an actual Sandbox event from the same app and inspect its Webhooks Events delivery result privately. PayPal's Dashboard simulator sends mock events for which postback signature verification is not supported; it is not proof of a buyer-approved payment and this listener must not bypass signature verification to accept it. [3]

## Release and hosting boundary

Automated payment and webhook checks use mocked provider/database dependencies. They do not establish live delivery, buyer approval, or a completed Sandbox capture. Registration and `PAYPAL_WEBHOOK_ID` configuration remain owner steps until verified. The public source must not describe these milestones as completed.

The full app needs an HTTPS server for secrets, AI, durable database access, capture, and signature verification. Keep its existing Manus backend. GitHub Pages can host a separate static project page, not this Express backend. No hosting migration is part of this repair.

## References

[1]: https://developer.paypal.com/api/orders/v2/error-messages "PayPal Orders v2 error messages"
[2]: https://developer.paypal.com/checkout/integrate "PayPal Standard checkout integration"
[3]: https://developer.paypal.com/api/rest/webhooks/rest "PayPal webhook integration and verification"

## If the same order is approved but capture is rejected

Approval is not payment. A later November 3 read-only recheck of the screenshot's separate version-1 USD 12.50 mock found APPROVED with exact matching terms but no completed capture. This is newer than the action-required observation above. No buyer login, approval, capture or record mutation was performed by that check. The original Northline version-2 USD 12.50 record is separate and unchanged.

After the repaired backend is actually published, refresh the same private review page and use Verify payment. If the server has verified a matching completed capture, it records the receipt; do not pay again. If PayPal still reports only approval, a capture must still complete through the existing buyer-approved flow. A user may explicitly use Retry capture for this same order, but should not repeatedly retry a declined funding method or restricted account. A rejected capture is reconciled before any guidance is returned, and does not create a replacement.

| Safe code                                                 | What to check                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYPAL_INSTRUMENT_DECLINED`                              | PayPal rejected the buyer's funding instrument. Review eligible Sandbox Personal buyer funding options in PayPal before another explicit attempt.             |
| `PAYPAL_PAYER_CANNOT_PAY`                                 | The buyer/merchant settings combination prevents this payment. Review the Sandbox Personal buyer and Business merchant settings in Developer Dashboard.       |
| `PAYPAL_PAYEE_ACCOUNT_RESTRICTED`                         | The Sandbox Business merchant is restricted. The owner must resolve that restriction; application code cannot override it.                                    |
| `PAYPAL_TRANSACTION_REFUSED` or `PAYPAL_CAPTURE_REJECTED` | PayPal rejected capture without a more specific safely recognized reason. Check Sandbox Activity and buyer/merchant setup; no completed capture was verified. |

A timeout, unrecognized detail, failed GET or mismatch is never presented as proof of a funding decline or successful payment. Raw provider messages, account details and debug identifiers are not shown. The old generic error alone cannot identify which account/funding issue caused that earlier rejection. No automatic SDK restart, new order or capture is part of this guide.

Official references: [PayPal Orders error messages](https://developer.paypal.com/api/orders/v2/error-messages) and [capture endpoint reference](https://docs.paypal.ai/reference/api/rest/orders/capture-payment-for-order).

## GitHub Pages navigation

The public [GitHub Pages landing page](https://vjoycelyn.github.io/ScopePay/) links to the [live ScopePay app](https://scopepay.manus.space/) and [public source](https://github.com/VJoycelyn/ScopePay). GitHub Pages serves the static landing page only; AI, durable project records, server-side capture, secrets and webhook verification run in the server-backed app. A successful Pages update is not a backend deployment or payment confirmation.
