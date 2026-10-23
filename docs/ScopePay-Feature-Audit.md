# ScopePay feature and hackathon audit

**Review date:** October 23, 2026

**Scope:** Read-only review of the current source and the official PayPal AI Hackathon rules. This is not a penetration test, legal opinion, judging decision, or guarantee of eligibility or winning.

## Bottom line

The code review found no required core product feature missing from the hackathon theme. ScopePay meaningfully connects PayPal Sandbox and AI in an approval-controlled freelancer workflow. The official rules do **not** require a specific business feature set, sponsor tool, paid hosting, multi-merchant onboarding, escrow, live-money transactions, user research, a production security audit, or a guaranteed level of AI accuracy.

That does **not** make the submission complete: the exact public-delivery requirements and the user's personal eligibility/ownership attestations still apply. In particular, the PayPal buyer-approved completed capture must be genuinely demonstrated before it is claimed as done.

## Official-rule mapping to actual features

| Official criterion                          | What ScopePay implements or provides                                                                                                                                                                                                                                                                        | Evidence boundary / next action                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stage One: theme fit and PayPal/SDK use** | PayPal Orders v2 Sandbox creates orders on the server. The PayPal JavaScript SDK presents buyer approval. The repaired source now checks provider order identity, accepted version, exact USD cents, and capture response before marking a document paid, with explicit recovery and direct approval links. | The active Sandbox pair passed OAuth, and the live page renders the SDK. However, the existing Northline version-2 USD 12.50 provider order returns `404 / INVALID_RESOURCE_ID`. Confirm deployment of the repaired release; no buyer-approved capture is verified.                         |
| **Stage One: AI tool/model use**            | The server invokes the Manus-provided LLM for structured initial-scope drafts and later scope/request analysis. Output is schema-validated. Change analysis identifies included/out-of-scope/unclear requests, references relevant scope evidence, suggests advisory effort, and drafts an editable reply.  | Live AI scope drafting was exercised with fictional data; the project model was identified as `gpt-5.5`. Small synthetic scenario results are not an accuracy benchmark or user study.                                                                                                      |
| **Technology: human control over funds**    | AI output does not publish terms, create client acceptance, set the final change-order price, or initiate/capture money by itself. The freelancer reviews terms/prices. The client accepts the exact published version before PayPal checkout.                                                              | Demonstrate these transitions in the final screen recording. Keep the **Sandbox only** and advisory labels visible.                                                                                                                                                                         |
| **Persistence and sharing**                 | Managed MySQL stores project/scope/payment records. Workspace and client-review capabilities are high-entropy; only their hashes are stored. A share link exposes a published version, not the private project brief/owner credential.                                                                      | The deployed app has been reached without requiring a login for the initial fictional workspace. Test the final URL signed out and keep the service available without restriction through judging. Do not share the owner capability or use real client data.                               |
| **Design and presentation**                 | Separate freelancer and client-review experiences surface scope, exclusions, exact total, version, explicit acceptance, and sandbox payment state. The responsive web app and original icon are included in source.                                                                                         | The reviewer should be able to identify each transition immediately. The final public YouTube demo must show the actual functional flow and stay strictly under three minutes.                                                                                                              |
| **Originality, rights, and disclosure**     | The new project was created during the submission period. The root repository license is MIT; dependency licenses remain their own. Devpost copy discloses Manus AI coding and generated branding assistance.                                                                                               | The entrant personally must verify sole ownership, age/residence/eligibility, conflicts, third-party permissions, and the required terms. The agent cannot attest for the entrant.                                                                                                          |
| **Required public source and demo**         | The full source, assets, environment-name example, README, tests, architecture, demo script, and MIT license are public at https://github.com/VJoycelyn/ScopePay. GitHub's license API recognizes the root `LICENSE`. The hosted app is live at https://kindred-vj2hs3rd.manus.space.                       | Repository and hosting are complete, but the under-three-minute public YouTube video is not. The full build also uses managed database and AI runtime services, so the repository alone is not a standalone judge environment. Verify unrestricted judge access through the judging period. |
| **English and truthful description**        | UI, run instructions, proposed submission copy, and demo script are in English. The copy identifies the sandbox, AI advisory boundary, and measured evaluation limits.                                                                                                                                      | Recheck every Devpost field and video captions/translation before final submission. Do not claim live-money collection, escrow, contractual enforceability, measured customer impact, or representative model accuracy.                                                                     |

## Source-review findings to handle honestly

- **Clarifying questions are guidance, not a publication gate.** AI questions are included in the editable scope summary; the app does not block publication until each is formally marked resolved. Edit or answer/remove them in a demo quote; describe them as prompts, not enforced workflow.
- **AI never sets a binding change-order price.** New change line items start at `$0.00`; a freelancer must review and enter the actual amount before publishing. Show that edit in the demo.
- **Payment recovery status polish (updated):** the working source now includes pending/unknown handling, provider-state checks, an owner-confirmed recovery panel, a direct PayPal Sandbox link, and monotonic capture guards. Mocked quote/change-order route coverage passes. The code changes pass the full 53-test suite; a live buyer walkthrough remains open.
- **The activity log is an application audit trail, not tamper-proof evidence.** Database rows are updated inside the service; never call it immutable or compliance-grade logging.
- **Public source hygiene:** the Manus debug collector under `client/public/__manus__/` is not referenced by the page source and was not loaded/requested by the inspected live page. It is unnecessary to run ScopePay; omit this platform artifact from the public source snapshot. No debug-log requests were observed in that browser session.
- **Readiness indicator:** the API reports whether credential variables exist, not a real-time provider health guarantee. The active pair passed a Sandbox OAuth check, but the saved Northline order is unavailable under it. The new source detects that condition; only a fresh owner-confirmed Sandbox order followed by an actual buyer-approved capture can complete the live proof.

## Submission must-haves and status

This is the hackathon package—not a checklist of invented app requirements:

- [x] New project; PayPal Sandbox and AI used meaningfully.
- [x] Functional live hosted application available at the current address in `README.md`.
- [ ] Complete the user's sandbox personal-buyer approval and verify the completed capture in the client UI, freelancer workspace, and PayPal Sandbox activity.
- [x] Publish a public source repository with complete source/assets/instructions and a detected MIT license: https://github.com/VJoycelyn/ScopePay.
- [ ] Record the actual functioning app and upload a public YouTube video strictly under three minutes.
- [ ] Test judge access without a paywall/login and keep it working free of charge and without restriction through the official judging end time.
- [ ] Entrant confirms eligibility, ownership/original work, rights/permissions, and disclosures; submit all required Devpost fields and save the receipt.

The October 23 source repair passed TypeScript, 53 tests across 6 files, the production build, and whitespace checks. Deployment and source synchronization have separate release receipts. The buyer must still verify the single Northline v2 USD 12.50 payment end to end; order preparation or recovery alone is not enough.

The official judging criteria—Technological Implementation, Design, Potential Impact, Innovation/Idea, and Presentation—are **equally weighted**. A strong PayPal+AI fit is positioning only; only judges can determine awards.

## Official references

- [PayPal AI Hackathon Official Rules](https://paypalaihackathon.devpost.com/rules)
- [PayPal AI Hackathon official homepage](https://paypalaihackathon.devpost.com/)
- [Official FAQ](https://paypalaihackathon.devpost.com/details/faqs)
- [Official dates](https://paypalaihackathon.devpost.com/details/dates)
