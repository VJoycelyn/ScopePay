# PayPal AI Hackathon: ScopePay readiness review

**Official rules rechecked October 26; project state checked October 27, 2026.** ScopePay has strong evidence for the core PayPal-plus-AI project requirements, but it is not submission-complete yet. The hosted app, public source, Sandbox configuration, and browser checkout controls are present. The public YouTube demonstration, Devpost submission, entrant attestations, and a genuine end-to-end completed capture remain open.

## What currently checks out

ScopePay is documented as a new project, separate from Island Tales. It uses PayPal Orders v2 in Sandbox as a core part of a freelancer scope and payment workflow. The server calculates and checks the exact accepted version, amount, currency, and provider capture before recording payment. Its Manus-provided LLM drafts scopes and compares new requests against recorded scope terms. That is meaningful PayPal and AI use; the hackathon does not prescribe a particular problem track or require an optional sponsor tool. [1] [2]

The live hosted app is available at [scopepay.manus.space](https://scopepay.manus.space) [8]. The public source is at [github.com/VJoycelyn/ScopePay](https://github.com/VJoycelyn/ScopePay) [7] with a root MIT license. The README includes the hosted demo, setup instructions, sandbox workflow, privacy boundaries, and disclosure that a fresh clone needs managed database/AI services and Sandbox app credentials. The project’s current validation record reports TypeScript and production-build success and 143 mocked tests across 13 files. Those automated checks support code quality, but they are not proof of a real payment. See [the validation history](VALIDATION.md) and [the proposed Devpost text](HACKATHON_SUBMISSION.md).

I checked the PayPal setup without changing credentials. The protected Sandbox Client ID and Secret remain configured, and a direct request to the PayPal Sandbox OAuth endpoint returned HTTP 200. The live read-only status endpoint reports Sandbox enabled, and an earlier active client review rendered PayPal and debit/card checkout buttons. The later review link supplied for same-order verification is revoked; this was distinguished from a missing PayPal order. One separate read-only Sandbox order GET returned `APPROVED` with the accepted reference, amount, and USD currency, but no matching completed capture; the local record remains pending. Both direct-link entry points are explicitly labeled for PayPal Sandbox and are constrained to HTTPS on `www.sandbox.paypal.com`; unit tests verify the safe new-tab behavior. No new order or capture was initiated, and this is not proof of payment.

PayPal’s current documentation distinguishes Sandbox roles: a Personal account represents the buyer and a Business account represents the merchant. The Developer Dashboard is used to manage those Sandbox accounts. PayPal describes Sandbox as an isolated test environment using fictitious test accounts, so test transactions do not touch live PayPal accounts. The mock-company choices in ScopePay create separate client-project drafts, not separate receiving merchants; all approved test orders still use the one configured Sandbox Business merchant. Use the configured Sandbox app credentials for server API access and a Sandbox Personal buyer at checkout. The Developer Dashboard password is not a checkout password and must not be entered into ScopePay. [5] [6]

## Requirements that still need completion

**A genuine payment demonstration is still open.** The site and SDK controls render, but a completed capture has not been verified. The earlier Northline Coffee version 2 order for USD 12.50 was found missing at PayPal Sandbox with a 404 response. A separate saved order is currently `APPROVED` but has no matching completed capture; its local ScopePay state remains pending. The same-order application GET is unavailable through the revoked review link, even though a separate read-only provider GET was performed. These order-specific states are not evidence that the configured Sandbox app credentials are invalid. Before any recovery, the workspace owner must check Sandbox Business merchant Activity for an existing completed or pending payment. Do not create a replacement when payment status is pending or unclear. No payment should be described as completed until PayPal and ScopePay both show the server-verified capture.

**The required public video is not done.** Record a working demo under three minutes, upload it publicly to YouTube, and include its URL in the Devpost entry. Show the actual application functioning on its intended device. The current demo script is a recording plan, not a video. Use fictional data and avoid unauthorized third-party music, marks, or media. [1] [2]

**Devpost is still a draft, not a submission.** Finalize the text description and identify the AI model/service and what it does. The current English draft identifies the Manus LLM and PayPal Sandbox. Recheck that all facts match the current build, then submit before the deadline and save the receipt. Do not claim a completed capture or measured customer impact without evidence. [1] [2]

**Judge access needs a future commitment.** The app is reachable now, but the entrant must ensure the working project remains free and unrestricted for testing through the end of judging. The official judging window ends December 15, 2026 at 8:00 a.m. Pacific Standard Time, or 4:00 p.m. UTC. Include clear setup, sandbox-account, and special-access instructions, without publishing secrets. [1]

**Eligibility and rights require the entrant’s own confirmation.** Before submitting, confirm age-of-majority and permitted residence, no disqualifying employment or conflict, and authority to enter as the individual or team representative. Confirm the project and its components are original and properly owned or licensed, that any third-party SDK/API/data/assets are authorized, and that no disqualifying prior sponsor support applies. The rules also include legal, publicity, and post-award verification terms. Code review cannot make these personal attestations for the entrant. [1] [4]

The official rules describe a pass/fail first judging stage for theme and technical fit. Submissions passing that stage are scored equally on Technological Implementation, Design, Potential Impact, Innovation/Idea, and Presentation. No technical audit can predict a judging score or guarantee an award. [1]

## Dates to keep visible

The submission deadline is November 12, 2026 at 12:00 noon Pacific Standard Time, which is 8:00 p.m. UTC. Judging runs from December 1 at 2:00 p.m. Pacific Standard Time through December 15 at 8:00 a.m. Pacific Standard Time. The official schedule expresses those judging times as 10:00 p.m. UTC and 4:00 p.m. UTC, respectively. Use the Official Rules if any event material conflicts. [1] [3]

## Recommended next steps

1. Keep the existing Sandbox Client ID and Secret unchanged. Use the existing Developer Dashboard only to manage test accounts; use a Sandbox Personal buyer—not a live buyer—to approve any test checkout.
2. For Northline v2, have the workspace owner check Sandbox Business merchant Activity before using confirmation-gated recovery. Treat the separate accepted review supplied for this audit independently; its saved order was not reconciled here.
3. Complete one deliberate Sandbox checkout with the buyer’s explicit approval, then verify the completed capture in ScopePay and merchant Activity. Do not simulate or assert success.
4. Record and publish the public YouTube demo, complete the Devpost fields, confirm eligibility and rights, and maintain free judge access through the end of judging.

## References

[1]: https://paypalaihackathon.devpost.com/rules "PayPal AI Hackathon Official Rules"
[2]: https://paypalaihackathon.devpost.com/ "PayPal AI Hackathon official homepage"
[3]: https://paypalaihackathon.devpost.com/details/dates "PayPal AI Hackathon official schedule"
[4]: https://paypalaihackathon.devpost.com/details/faqs "PayPal AI Hackathon official FAQ"
[5]: https://developer.paypal.com/sandbox-testing/overview "PayPal Sandbox testing guide"
[6]: https://developer.paypal.com/sandbox-testing/accounts "PayPal Sandbox accounts"
[7]: https://github.com/VJoycelyn/ScopePay "ScopePay public source repository"
[8]: https://scopepay.manus.space "ScopePay hosted demo"
