# ScopePay Sandbox mock-company scenarios

ScopePay now offers selectable draft-only mock scenarios for Northline Coffee and Caribbean Scribbles Publishing, alongside Harbor & Pine. These are separate projects in the same freelancer workspace. The Northline mock is version 1 with an editable USD 12.50 demo total; it is distinct from—and does not alter, delete, supersede, revoke, or reissue—the existing accepted Northline Coffee version 2 USD 12.50 record. The Caribbean Scribbles Publishing mock starts with an editable USD 18.75 demo total. These are test values, not commercial quotes.

## Run a mock buyer checkout

1. In the ScopePay owner workspace, select **Sandbox test scenarios**, then choose the company scenario. ScopePay creates a new draft only; no client link, acceptance, PayPal order, or capture is made.
2. Review the scenario draft and edit the exact scope and amount. Publish only when you intentionally want to test a client review. Open the resulting link in a separate/private browser session.
3. As the client, verify the published company, scope, version, and amount; explicitly accept that version; then continue to PayPal Sandbox and sign in with a Sandbox Personal buyer test account to approve. Use the [PayPal Developer Dashboard](https://developer.paypal.com/) only to manage test accounts; the Developer Dashboard account itself is not the checkout buyer.
4. Wait for ScopePay's server-verified completed capture before treating it as paid. A draft, published link, accepted scope, new order, or buyer approval alone is not a completed payment.

## Merchant versus client company

The selected company is the mock **ScopePay client**, not a separate PayPal receiving merchant. The Personal Sandbox profile is the buyer. ScopePay remains configured for one Sandbox Business merchant, and all test orders use that merchant. This UI does not create or route to multiple PayPal merchant accounts and does not use real-money accounts. No AI call, acceptance, order, or payment occurs when merely loading a scenario. ScopePay never asks for or stores Developer Dashboard or buyer passwords. Do not use an original/live PayPal account to approve a Sandbox test payment.

When testing Northline, choose the separate mock draft from the scenario picker rather than editing or recovering the existing accepted version 2 record. The current v2 terms remain exactly USD 12.50 and its payment state must be handled through the existing owner Activity/recovery rules.

## Validation receipt — October 26, 2026

TypeScript checking, **113 mocked tests across 12 files**, production build, and whitespace checks passed. The focused read-only review found no functional blocker. Tests cover both requested company scenarios, separate draft-only records, preservation of an accepted Northline v2 USD 12.50 fixture and saved order, owner-only access, legacy empty-body compatibility, strict rejection of unknown IDs/extra fields, selector disclosures, and the Dashboard/Sandbox login boundary.

The PayPal app configuration and protected credentials were not changed. This implementation makes no live-account API calls and initiates no live workspace draft, client acceptance, PayPal order, buyer approval, or capture during validation. The genuine existing Northline v2 completed capture remains unverified; a successful mocked capture is not a real Sandbox payment receipt.
