# ScopePay validation and remaining steps

## Verified on October 20–21, 2026

TypeScript checks and the production Vite/server build passed. The automated suite passed **12 tests across 3 files**, including six ScopePay-specific payment/capability helper cases and the starter's six platform/authentication cases. The code received one read-only end-to-end integration review. Confirmed issues with input state, exact-cent display, review-link recovery, scope-version binding, duplicate change-order creation, payment recovery, and operation-specific idempotency were corrected.

The ScopePay service served a successful health response, its actual route manifest, and database/AI/PayPal configuration status. A real live AI call produced and validated a scope draft from a fictional brief. A follow-up check of the approved clarifying-question feature returned five deliverables and four questions; its one-input receipt is retained in `AI_QUOTE_RESULTS.json`. The securely supplied sandbox credentials passed a real PayPal sandbox OAuth request.

The reproducible API smoke test passed **11 checks**, including owner access enforcement, fictional sample labeling, exact integer-cent totals, private-data redaction, acceptance/version gating, link revocation, accepted-document immutability, actual PayPal sandbox order creation, repeated-order idempotency, and avoiding a false paid state for an unapproved order. The smoke test never approved or captured a transaction; it removed only the synthetic workspace it created. See `API_SMOKE_RESULTS.json` for the measured receipt and `scripts/smoke-scopepay.ts` to rerun it in the configured project.

## AI evaluation limits

Three developer-authored synthetic change requests were run once each: a clearly included headline revision, a clearly excluded ecommerce addition, and an ambiguous revision allowance. The initial run returned valid matching labels for two cases; the ecommerce case returned zero advisory hours and failed the original strictly-positive deliverable-hours validator. The initial evidence, including the error, is retained in `SYNTHETIC_AI_RESULTS_INITIAL.json`.

The validator was corrected to permit an explicit unknown effort estimate of zero for advisory change analysis, while initial scope drafting still requires positive effort. Only the affected ecommerce case was rerun and returned a valid matching out-of-scope classification, with its result recorded separately in `SYNTHETIC_AI_RESULTS.json`. This is a tiny synthetic development check, not a representative accuracy benchmark, user study, or proof of business impact. The AI can still be wrong; human scope/price review remains required.

## PayPal setup repair — October 23–26

The live browser reported PayPal Sandbox configured and the Northline Coffee document still accepted at **version 2, USD 12.50**, with no recorded capture. The existing saved provider order returned `404 / INVALID_RESOURCE_ID` from PayPal Sandbox, so it is not safe to reuse. The active Client ID/Secret pair separately passed Sandbox OAuth; secret values were not read, and only their outdated descriptions were corrected. No fresh order or capture was created during this audit.

The published source checks provider order identity and status before reuse; offers explicit owner-confirmed recovery for missing/terminal Sandbox orders; preserves the exact accepted version and amount; provides a vetted PayPal continuation link plus same-review return/cancel handling; and rejects mismatched, incomplete, or non-monotonic capture states. The existing same-version review link remains active while recovery returns an additional link. `pnpm check`, `pnpm test` (**53 tests across 6 files, including 30 mocked quote/change-order checkout route tests and the Sandbox URL allowlist test**), `pnpm build`, and `git diff --check` passed. Tests made no provider calls or payment/database writes. Checkpoint `0f9d33cf3b1068d5d3414905bab75a63ff6b9df1` is published at `https://scopepay.manus.space`; its health check is OK, PayPal/AI/database readiness flags are true, and the browser confirms the SDK and direct-link preparation control load. Full buyer approval/capture remains unverified.

## Not yet claimed

A full PayPal sandbox buyer approval and completed capture has **not** yet been exercised in the browser. Server verification/retry helpers are covered by automated tests, but those tests do not replace the actual client-side sandbox walkthrough. Complete it using the sandbox **personal buyer** account, not the sandbox business merchant account.

The public demo is live at https://scopepay.manus.space. The requested public source repository, https://github.com/VJoycelyn/ScopePay, is public; GitHub's license endpoint recognizes the root MIT license. A clean copy of public GitHub commit `b61e6f4` passed `pnpm install --frozen-lockfile`, `pnpm check`, 53 tests across 6 files, `pnpm build`, and `git diff --check`; the refreshed source archive was verified as complete and credential-free. The snapshot excludes credentials, internal Manus workspace metadata, and the unused debug-collector artifact. No public YouTube recording or Devpost submission has been made; the demo script is not a submitted video. No winning outcome, production-security certification, legal enforceability, customer savings, revenue, or real-money collection is claimed.


## Current Sandbox configuration and live-button check — October 26, 2026

The protected Sandbox Client ID and Secret remained configured; their values were not printed, changed, or copied. A direct OAuth request to the PayPal Sandbox endpoint returned HTTP 200 and a nonempty access token; the token itself was not logged. A read-only live status request returned Sandbox environment with PayPal, AI, and database configuration flags set. The supplied accepted review loaded, and the PayPal and debit/card checkout buttons rendered after page load. No acceptance, order preparation, same-order verification, buyer login, order reconciliation, or capture control was activated. This confirms configuration and SDK rendering only, not a completed transaction. The accepted review's stored provider-order state was not reconciled during this check. The separate previously saved Northline Coffee version 2 USD 12.50 order remains documented as a Sandbox 404 and must not be replaced before the owner checks merchant Activity. The current readiness summary is in `DEVPOST_READINESS_REVIEW.md`.

## Review-link 404 diagnosis and safeguards — October 27, 2026

The user-approved same-order GET on the supplied Caribbean Scribbles Publishing review returned HTTP 404. A fresh review GET returned `CLIENT_LINK_NOT_FOUND`; a SELECT-only database check confirmed the capability is revoked, while its accepted document and saved order remain present. No live order creation, reissue, approval, capture, link rotation, or document write occurred. Missing review access does not establish the provider's payment status, and the revoked capability was not restored.

The repair distinguishes genuine unavailable capabilities from database/service failures, pauses checkout and stale callbacks for invalid links, and retains the separate PayPal missing-order recovery path. `pnpm check`, **132 mocked tests across 13 files**, `pnpm build`, and `git diff --check` passed. Full live same-order checkout remains blocked on the owner supplying a current valid review link. No completed capture is claimed. Details: `REVIEW_LINK_404_FIX.md`.


Published checkpoint `35242fc2fc4aa38257866cd704594c93e42741ae` successfully to `https://scopepay.manus.space`. A plain GET reload of the revoked review link displayed the specific unavailable-link guidance and no payment controls. This confirms the published invalid-link UI fix only; same-order PayPal availability and completed-capture status remain unverified until the owner supplies a valid current client-review link for the same accepted document.
