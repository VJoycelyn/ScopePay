# Proposed Devpost submission — ScopePay

## Tagline

Turn scope creep into approved, paid work.

## Inspiration

Independent service providers often agree on work in informal briefs, then have to decide what to do when a client asks for one more deliverable. ScopePay explores how AI can help make that boundary easier to explain without taking away either person’s control. It puts the initial scope, the new request, the client’s explicit approval, and sandbox payment status in one clear workspace.

## What it does

A freelancer enters a project brief, client name, hourly rate, and optional budget. ScopePay uses AI to draft a scope, exclusions, deliverables, and estimated effort. The freelancer can edit all terms and prices before publishing a client-review link.

When the client asks for extra work, ScopePay compares the request with the published scope. Its AI classifies each part as included, out of scope, or unclear, cites relevant scope language, suggests effort, and drafts a reply the freelancer can edit. Suggestions never set a binding price or send money. If the freelancer chooses to propose extra work, they review the proposed change order and set its final price before publishing it. The client sees the exact terms, accepts the specific version, and can then check out through PayPal sandbox. The server verifies the capture before recording payment status.

## How we built it

The application uses React, TypeScript, Express, MySQL, the Manus-provided LLM runtime, and the PayPal developer platform in sandbox mode. The backend keeps payment credentials private, calculates the amount from stored line items, checks document version and acceptance, and confirms the sandbox capture before marking anything paid. Distinct freelancer and client-review capabilities keep an anonymous demo account simple while limiting what a public review link exposes.

## What makes it different

ScopePay treats control as part of agentic commerce: AI can analyze and explain, but people own the terms and every money-moving transition. A lightweight scope ledger makes the proposed work, exclusions, version accepted, and verified sandbox status visible together. The goal is not an autonomous negotiator or escrow product; it is a transparent approval path that can be demonstrated end to end.

## Challenges and lessons

The important design challenge is to keep model output separate from financial state. A confident AI suggestion is not a contract, price, client acceptance, or payment. ScopePay uses human editing and approval for those transitions and verifies sandbox capture server-side. It also needs to be clear that a share link is a bearer capability and that demo data must not contain sensitive client details.

## Tools used

- PayPal Developer Platform: the configured Sandbox app passed OAuth with HTTP 200, and an earlier active client review rendered the PayPal JavaScript SDK checkout buttons. Orders v2 creation, buyer approval, server capture verification, and recovery UI are implemented; a browser buyer-approval/completed-capture walkthrough remains to be demonstrated. The later review link used for same-order verification is revoked, so the application's client-token-scoped GET cannot currently run.
- Manus built-in LLM: server-side structured scope drafting and scope/request analysis were exercised with live model calls on fictional inputs.
- React, TypeScript, Express, MySQL, Vite, and the MIT license.
- Manus AI coding assistance helped generate and edit the code. An original brand icon was generated using Manus image generation. Third-party open-source libraries retain their own licenses.

## Testing and impact

The current source passes `pnpm check`, its production build, and **134 automated tests across 13 files**, including mocked checkout-route, transport, UI-recovery, and company-scenario coverage. These tests do not prove a real payment. The configured Sandbox app returned HTTP 200 from OAuth, and an earlier active review rendered PayPal and debit/card checkout buttons; this confirms configuration and SDK readiness only. A separate read-only Sandbox GET on October 27 returned provider status `APPROVED`, but no matching completed capture; the local record remains pending. The application's same-order GET remains blocked by the revoked review capability. No completed capture was verified during this review.

The earlier 11 API smoke checks were run before later changes and have not been repeated; they are not evidence of an end-to-end buyer payment. The saved Northline version 2 USD 12.50 provider order was previously read as `404 / INVALID_RESOURCE_ID`; the workspace owner must check PayPal Sandbox Business merchant Activity before using recovery. The separate currently saved order returned `APPROVED` without a completed capture and remains pending; do not create a replacement while status is unresolved. Three developer-authored synthetic AI scenarios were evaluated: the initial run had two valid matching classifications and one validation failure; after fixing the advisory-effort validator, only the affected scenario was rerun successfully. This is a development check, not a general accuracy benchmark or user study. See `docs/VALIDATION.md`, `docs/PAYPAL_SETUP_AUDIT.md`, and `docs/DEVPOST_READINESS_REVIEW.md` for exact evidence boundaries. No customer savings, revenue, production readiness, or guaranteed outcome is claimed.

## Links and remaining submission steps

- Hosted demo: [ScopePay on Manus](https://scopepay.manus.space) is live at its verified ScopePay-branded hostname.
- Public source repository: https://github.com/VJoycelyn/ScopePay (public; root MIT license detected by GitHub).
- Public YouTube demo under 3 minutes: pending recording after the end-to-end Sandbox capture walkthrough.
