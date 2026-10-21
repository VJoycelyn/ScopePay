# ScopePay: finish the entry and give it its strongest chance

**ScopePay is not yet submission-ready.** The application and source package exist, and real AI, sandbox authentication, and sandbox order creation have been exercised. We still need the actual buyer-approved capture demonstration, a public repository, a public YouTube video, and verified free judge access. Your personal eligibility and ownership declarations must also be confirmed. No project can be guaranteed to win.

## 1. Resolve the ScopePay URL first

The application name, browser title, navigation, favicon, and source package already use **ScopePay**. Changing these does not change a hostname. The current development Preview address is platform-managed; the available project configuration does not expose a supported hostname-renaming operation. A public address has not been supplied or verified in this conversation.

Send the current website URL, or a screenshot of the app's Publish/Domain settings with no secrets visible. If the platform offers an editable published subdomain, request `scopepay` and let it check availability; do not assume that exact name is available. If it is taken, `scopepay-venetta` is a proposed fallback, not an allocated address. If the displayed address is only Preview, choose a stable published address when releasing the app rather than submitting a development Preview link. Do not purchase a domain just to meet the hackathon: hosting is optional under the rules. [1] [2]

After any hostname change, create fresh client links on the final origin. The links contain private review capabilities, so do not put an owner's workspace token or a real client's review link in the public submission. Test the final home, setup, and client-review pages from a signed-out browser. Keep the same working project and database; do not create a replacement project merely to rename it.

## 2. Confirm your entrant eligibility and rights

Read the official rules while logged into your own Devpost account. Confirm that you are at least the age of majority where you reside, your residence is eligible, and none of the employment, household, organizer/judge, or conflict-of-interest exclusions apply. Solo entries are allowed. Registration or a working PayPal account does not by itself prove eligibility. [1] [3]

ScopePay was created during this task on October 20, within the October 1–November 12 submission period. Preserve its source history. Review your rights to the code and generated icon, retain dependency licenses, and accurately disclose Manus coding assistance, Manus image generation, and the runtime model/service. Do not describe AI-assisted development as entirely hand-coded. The official rules require entrant-owned original work and authorization for third-party components and assistance. [1] [2]

## 3. Complete the actual sandbox payment walkthrough

This is the most important unfinished technical step. Automated tests do not replace this walkthrough. Use only fictional project details and a PayPal **sandbox personal buyer** account, never a real buyer or the sandbox business merchant that owns the app.

1. Open ScopePay in Preview or the eventual published app. Keep the freelancer workspace in one normal browser window. Open `/setup` and confirm the database, AI, and PayPal sandbox configuration are available.
2. Create a fictional project, or choose **Load sample project**. If you use the sample, keep its sample labeling visible; it is not proof of live AI drafting.
3. In **Scope**, review every deliverable, exclusion, timeline, revision allowance, question, and price. Resolve the “Clarify before publishing” questions in the editable summary. For an easy payment test, use one explicitly reviewed line at **USD $12.34** so exact-cent handling is visible. This is a fictional test amount, not an AI valuation.
4. Save the reviewed terms and publish the client-review link. Open it in a separate browser profile or private window. Confirm its total and version match what you published.
5. Select **I have reviewed and accept this scope and price**, then click **Accept this scope**. Checkout should not be available before this acceptance.
6. Click the PayPal sandbox checkout. Sign in with your sandbox **personal** buyer. Review the USD amount and approve inside PayPal. Hide all credentials from any recording.
7. Wait for **Payment recorded by the sandbox**. Return to the freelancer workspace and refresh it. Verify that the payment/activity state persists. Cross-check the matching completed sandbox transaction and amount in PayPal's sandbox activity; record a redacted order/capture reference as evidence. Do not mark this milestone complete based on the button click alone.
8. Test cancellation on a separate fictional document: cancel the PayPal popup and confirm the app does not become paid. If a payment is uncertain, use **Verify payment** before **Retry capture**. Do not create replacement orders blindly. If a browser error prevents the walkthrough, send the exact error with no passwords or API secrets, and fix that specific defect before recording.
9. Analyze a new request against the agreed scope, create a priced change order, publish it, and repeat client acceptance and sandbox checkout for the extra work. This is the clearest proof of ScopePay's actual value.

The server is implemented to verify completed capture against the stored accepted amount, currency, order, and reference. These controls have helper-test coverage, but the browser buyer approval/capture milestone remains open until the steps above actually succeed. See `VALIDATION.md` and the JSON receipts for the measured boundaries.

## 4. Close the judge-access requirement

The rules permit either a hosted working demo or complete runnable repository instructions; they do **not** require buying hosting or a domain. Judges must nevertheless be able to use the functional project free of charge and without restriction through the end of judging. [1] [2]

For this implementation, **a hosted demo is the recommended route**. Its database and AI service currently rely on the managed project environment. A public source ZIP with empty environment variables is not, by itself, a turnkey functional installation for a judge who lacks those runtime credentials. Keep the source setup instructions honest about that dependency.

Authorize publication of the tested app, then wait for a confirmed successful publication and its actual permanent URL. Test that URL in a fresh browser: no owner login should be required to create an independent fictional workspace, run live AI, publish a review link, and perform the sandbox flow. Supply a dedicated test-only buyer account through the submission's appropriate testing-access instructions where required; never expose merchant API secrets, AI tokens, real account passwords, or your owner workspace capability.

Keep the app, required runtime services, and test access working through **December 15, 2026**, including the official judging-end time. Do not delete test accounts, break review links, replace the submitted build with an unfinished version, add a paywall, or require judges to request permission. Save the release that the video and description actually demonstrate. [1]

## 5. Make the source repository public

A public GitHub, GitLab, or Bitbucket repository is mandatory, even if the demo is hosted. It must contain the necessary source, assets, instructions, and a detectable open-source license. The ScopePay package already has the source, original icon, environment-name example, setup documentation, and root MIT `LICENSE`; its public repository URL is still missing. [1] [2]

The proposed new repository is **VJoycelyn/ScopePay**, separate from Island Tales. Public creation has not been authorized or completed. Before releasing it, inspect the exact source release for credentials and personal data, retain the MIT license at the repository root, and ensure GitHub recognizes the license in About. Do not simply make Island Tales public or change its remote.

The README should identify the final hosted demo, explain the managed database/AI dependency, give sandbox-only testing instructions, and link the architecture, validation notes, and video. Check that a signed-out visitor can open the repository and see the complete source. A downloadable ZIP alone does not satisfy the public-repository requirement. [1]

## 6. Record the demo that matches the product promise

Use the accompanying `DEMO_SCRIPT.md`. Target **2 minutes 40 seconds**, safely under the strict three-minute requirement. Record the actual application operating on its intended web platform. Upload the final English video to YouTube with **Public** visibility, and verify it plays when signed out. Do not substitute an animated mockup or fabricated payment success. Avoid unrelated copyrighted music, stock clips, or third-party marks without permission. [1] [2]

The strongest story is: an agreed one-page project receives a request for a second page; AI points to the exact scope boundary; the freelancer reviews an extra-work price; the client accepts that version; PayPal sandbox captures it; the ledger records it. Show that complete chain rather than spending most of the video on a generic dashboard tour. If you trim real processing wait time, do not conceal failures or imply instant performance.

Do not expose passwords, Client Secret, AI tokens, personal messages, or browser account details. Keep **Sandbox** and **AI advisory** labels visible. Claim “verified sandbox payment,” not live revenue, escrow, guaranteed collection, or legal enforceability.

## 7. Strengthen all five equally weighted judging criteria

The official rules specify **equal weighting** for Technological Implementation, Design, Potential Impact, Innovation/Idea, and Presentation. Do not spend all remaining time on one criterion. [1]

**Technological Implementation:** show live scope drafting, evidence-based change analysis, version-specific approval, exact USD cents, an actual sandbox capture, and durable ledger state. Explain why AI output never changes money-moving state. The current evidence is 12 automated tests and 11 API smoke checks; only six of the automated tests are ScopePay-specific. Do not rebrand those counts as a large independent security audit.

**Design:** remove ambiguity in the happy path. A freelancer should understand when a draft becomes published; a client should understand exactly what they accept; neither should confuse estimated hours with a binding price or sample data with live AI. Check the intended desktop and phone layout, keyboard navigation, visible errors, readable prices, and PayPal popup behavior.

**Potential Impact:** choose one clear early audience—for example, independent web designers and small creative studios. Ask three to five people in that audience to use fictional tasks and explain what confused them. Record genuine task completion, time, errors, and consented feedback; report the sample size. This is a recommended improvement, not an already-conducted study. Do not invent quotes, savings, retention, or revenue.

**Innovation/Idea:** position ScopePay as an approval-to-payment workflow tied to scope evidence, not another chatbot. Removing AI would remove the contextual drafting and comparison. Removing PayPal would remove the verified payment transition. The distinctive claim is the connection between evidence, reviewed terms, exact accepted version, and verified sandbox capture—not autonomous spending.

**Presentation:** tell one short story and prove the core claim onscreen. Use this pitch: **“ScopePay helps freelancers turn extra requests into clearly scoped, client-approved, PayPal-paid work. AI explains the boundary; people control the terms and every payment.”** Add “sandbox demo” wherever a viewer could mistake the payment for real money.

**Best Use of PayPal + AI** is a strong positioning fit, but it is not an award prediction. Sponsor tools are optional for the main challenge; do not add Channel3, ElevenLabs, or another sponsor merely to claim integration. Enter a sponsor award only if its specific requirements are actually met and demonstrated. [1] [3]

## 8. Finish the Devpost form and submit early

Use project name **ScopePay** and tagline **“Turn scope creep into approved, paid work.”** Adapt `HACKATHON_SUBMISSION.md` to what the final release truly does. Add the actual public repository, working-demo/testing-access instructions, and public YouTube URL. List PayPal Orders v2 / JavaScript SDK sandbox, React, TypeScript, Express, MySQL, the actual AI runtime/model, and AI development assistance accurately. All materials must be English or have the required English translations. [1] [2]

Do not leave placeholder links or claims that buyer capture has been completed before it has. Review permissions, originality, privacy, and the submission terms yourself. Click the final submission action—not merely Save draft—and keep its timestamped confirmation.

The official deadline is **November 12, 2026 at noon Pacific Standard Time / 8:00 p.m. UTC / 4:00 p.m. Atlantic Standard Time**. Aim to submit by **November 11**, leaving time for video visibility, link, and form problems. After the submission window closes, substantive edits are generally not allowed except the narrow organizer-authorized corrections described in the rules. [1] [4]

## Final completion checklist

- [x] New ScopePay application and source package exist.
- [x] Meaningful live AI drafting and change analysis have been exercised.
- [x] PayPal sandbox credentials and real order creation have been verified.
- [x] Root MIT license, original asset, setup notes, and English submission/demo drafts exist.
- [ ] Confirm your personal eligibility, ownership, and third-party permissions.
- [ ] Provide the current URL; select and verify the ScopePay-branded published hostname if available.
- [ ] Demonstrate buyer-approved completed sandbox capture for the final workflow.
- [ ] Establish and test free functional judge access through the judging period.
- [ ] Publish the complete source repository and verify its detected license.
- [ ] Upload and verify a Public YouTube demo strictly under three minutes.
- [ ] Replace every draft link/status statement with the actual final evidence.
- [ ] Submit all required Devpost fields before the deadline and save confirmation.

## References

[1]: https://paypalaihackathon.devpost.com/rules "PayPal AI Hackathon Official Rules"
[2]: https://paypalaihackathon.devpost.com/ "PayPal AI Hackathon Overview and Submission Requirements"
[3]: https://paypalaihackathon.devpost.com/details/faqs "PayPal AI Hackathon FAQs"
[4]: https://paypalaihackathon.devpost.com/details/dates "PayPal AI Hackathon Official Dates"
