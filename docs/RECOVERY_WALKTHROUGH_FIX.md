# ScopePay visible Sandbox recovery repair

## What was corrected

The unavailable-order paragraph is now a concise status beside a numbered guide. The client review, owner Payments ledger, and Setup page explain which person must act, which account to use, what must remain unchanged, and when to stop. The guide uses each document's exact server-stored USD total and accepted version, so it applies to quotes and change orders rather than a hard-coded Northline-only scenario.

The owner checks the configured Sandbox Business merchant's Activity first. A missing provider order is not proof that no payment completed. Completed, pending, and unclear payment states block another attempt. Only after checking Activity and explicitly confirming no payment does the owner use Payments → matching document/version → Show recovery options → Create replacement Sandbox order. This preserves the accepted terms and review link and prepares an order only. The owner privately sends the fresh continuation link to a Sandbox Personal buyer, who explicitly approves and returns to ScopePay. Only a server-verified completed capture is paid.

## Functional corrections

- Direct PayPal-return errors now propagate into the checkout's missing-order gate. The error no longer sits above enabled purchase controls as a disconnected notice.
- **Check for owner recovery** performs user-clicked GET requests only. It requires the same document/version/amount/currency and a changed nonempty order reference, then verifies the new saved order before unlocking continuation. Same/absent references, mismatch, pending state, and failed gateway/network checks do not unlock checkout. The guide remains after Dismiss.
- Owner recovery uses a synchronous in-flight guard, resets confirmation after an attempt, disables repetition after success, and pauses recovery after failed/uncertain responses. A timeout is never called proof that no order was created.
- The paid-review serializer now includes the stored verified capture reference only for paid documents, matching the existing client validation. Previously, a genuinely paid review would fail client validation on reload because that required field was omitted. Workspace capabilities, unpublished drafts, and audit data remain excluded.
- The direct-return path also checks the successful capture result's amount and currency against the accepted review before updating the UI.
- Setup now distinguishes configured credentials from proof of a completed payment and exposes recovery help without requiring an error first.

## Validation and delivery boundary

The source is validated with TypeScript, mocked API/provider/React tests, production build, and whitespace checks. Final measured results are appended after the complete pass. Tests use fictional in-memory data and do not create or capture a live Sandbox payment. A live UI check after publication is separate.

Northline Coffee version 2 remains USD 12.50. No replacement order, buyer approval, or capture was initiated during this repair. A completed exact buyer-approved capture, actual public demo video, entrant eligibility/rights attestations, and Devpost submission remain open until independently completed. Do not submit or claim these milestones merely because the recovery interface works.

The focused integration review also identified stale PayPal SDK callbacks after cleanup. Checkout now invalidates each obsolete SDK generation, rejects old preparation/approval callbacks, and ignores an old in-flight response or error before it can update the current review. Regression tests exercise gate changes, successful and failed stale capture responses, old preparation responses, and unmount cleanup. This does not alter the server's capture authority or create a live payment.

## Measured source validation — October 26, 2026

- `pnpm check`: passed.
- `pnpm test --reporter=dot`: **102 tests across 11 files passed**.
- `pnpm build`: passed.
- `git diff --check`: passed.
- Focused read-only integration review found the stale-SDK blocker described above; it was corrected and covered by five additional mocked regressions.

These are source/mocked test results. The published page was checked for the normal accepted review, same-order control, and help disclosure. The click-driven owner-recovery path was not activated in the live browser; its behavior is covered by mocked tests. These checks do not prove a successful real buyer-approved Sandbox capture.
