# ScopePay review-link 404 diagnosis and repair

## Confirmed cause

On October 27, 2026 (UTC), the user-authorized same-order verification for the Caribbean Scribbles Publishing accepted version 1 (USD 1,470.00) returned HTTP 404. A fresh review GET returned JSON `CLIENT_LINK_NOT_FOUND`, not `PAYPAL_ORDER_NOT_FOUND`.

A SELECT-only database inspection confirmed that the client capability exists but is revoked. Its workspace, project, and accepted document still exist; the document version matches, a saved order remains attached, and no local capture reference was present. The initially visible accepted quote was stale browser state, not proof that the current review capability was still usable. This result does not establish the current provider payment status.

The revoked capability must not be restored or silently replaced. No order, approval, capture, replacement attempt, or document mutation was initiated during this diagnosis. Northline Coffee version 2 USD 12.50 was not touched.

## Repair scope

- Map unavailable-client-link codes to a specific safe explanation, not generic request text or missing-PayPal-order recovery.
- Pause all payment controls after a client capability is rejected, including stale SDK and retained click handlers. A buyer cannot recover an owner capability or create another payment attempt from an invalid review link.
- Preserve an already server-verified paid state; a later link error cannot undo a genuine completed capture.
- Distinguish service/database failures from confirmed unavailable capabilities. Temporary loading failures should allow a page/review read retry, never an automatic order or capture retry.
- Preserve the backend's legitimate 404 response for a revoked, missing, or superseded review capability. HTTP 404 is correct for this link and is not hidden or converted into payment success.

## How to resume the same-order test

In the original private owner workspace, find the same accepted Caribbean Scribbles Publishing document and use its current client-review link if one exists. Do not edit the accepted terms, republish, or create/reissue a PayPal order just to retrieve a link. Send the current link privately for retesting. If there is no current client capability, creating one requires a separate explicit owner action; do not reactivate the revoked link.

First verify the same saved order. If the provider reports a completed payment, reconcile it without paying again. If the result is missing, pending, or unknown, check the configured Sandbox Business merchant's Activity before any recovery. Missing review access does not prove no payment completed.

An actual buyer-approved capture remains unverified. Mocked passing tests and visible checkout buttons are not a completed payment.

## Validation

TypeScript (`pnpm check`), all **132 mocked tests across 13 files**, the production build (`pnpm build`), and `git diff --check` passed. The backend-focused review verified legitimate revoked/missing/superseded contexts remain 404, while injected database lookup failures return `503 DATABASE_UNAVAILABLE` on both the review and same-order GETs. Checkout tests cover immediate link gating, stale callbacks/handlers, recovery refresh failures, and already verified paid-state preservation. Public-review tests cover the unavailable-link screen and read-only retry for a temporary database failure.

No live acceptance, order creation, reissue, approval, capture, or capability rotation was initiated. Live end-to-end retesting is still blocked on the owner supplying a valid current review link. See the published result and live UI check below.

A final read-only integration review found no blocking issues in initial/late unavailable-link gating, retained handlers, verified-paid preservation, temporary-service retry, or backend 404/503 classification. The reviewer made no live API or PayPal calls and changed no files. The current revoked link remains unavailable by design; this repair is not permission to resurrect it.

## Published result and live UI check

The repair was published successfully as checkpoint `35242fc2fc4aa38257866cd704594c93e42741ae` at [scopepay.manus.space](https://scopepay.manus.space). A plain page reload of the supplied, revoked review capability now displays the specific `CLIENT_LINK_NOT_FOUND` message: the saved PayPal order could not be checked, the owner must provide a current link, and this does not prove that no payment completed. No PayPal buttons, order preparation, or verification controls are shown for that link.

This live check verifies the invalid-link safety/UI path only. It does **not** retest PayPal availability for the saved order, and it does not determine whether a prior provider payment completed. The owner must supply a valid current client-review link for the same accepted document before the same-order GET can be tested again. No transaction action occurred during the live UI check.
