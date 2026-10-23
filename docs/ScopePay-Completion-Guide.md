# ScopePay: finish the entry and give it its strongest chance

**ScopePay is not yet submission-ready.** The live demo and public MIT source repository now exist, and real AI, sandbox authentication, and sandbox order creation have been exercised. Still open: the actual buyer-approved capture, a public YouTube video, verified free judge access through judging, your personal eligibility/ownership attestations, and the requested ScopePay-branded hostname change. No project can be guaranteed to win.

## 1. Resolve the ScopePay URL first

The application name, browser title, navigation, favicon, and source package use **ScopePay**. The live site is currently [https://kindred-vj2hs3rd.manus.space](https://kindred-vj2hs3rd.manus.space); that platform-assigned address is verified live, but it does not say ScopePay.

The official Manus help page says paid users can modify the subdomain of a deployed website. In the project's publishing/domain settings, request `scopepay` and let the service check availability; do not assume it is available. I have not changed the hostname because the current project tooling does not expose the account's website-address control. If the name is taken, choose and verify another ScopePay-branded subdomain. Do not create a replacement project, expose secrets, or buy a domain just to meet the hackathon. Hosting is optional under the rules. [1] [2] [5]

After a hostname change, update the live-demo links in `README.md`, `HACKATHON_SUBMISSION.md`, and Devpost. Create fresh client-review links on the final origin. Client links contain private review capabilities: do not put a review link, an owner's workspace capability, or any real client's link in a public submission. Test the final home and client-review pages signed out while keeping the same project and database.

## 2. Confirm your entrant eligibility and rights

Read the official rules while logged into your own Devpost account. Confirm that you are at least the age of majority where you reside, your residence is eligible, and none of the employment, household, organizer/judge, or conflict-of-interest exclusions apply. Solo entries are allowed. Registration or a working PayPal account does not by itself prove eligibility. [1] [3]

ScopePay was created during this task on October 20, within the October 1–November 12 submission period. Preserve its source history. Review your rights to the code and generated icon, retain dependency licenses, and accurately disclose Manus coding assistance, Manus image generation, and the runtime model/service. Do not describe AI-assisted development as entirely hand-coded. The official rules require entrant-owned original work and authorization for third-party components and assistance. [1] [2]

## 3. Complete the actual sandbox payment walkthrough

The current test uses only fictional data: **Northline Coffee**, accepted scope version **2**, exact amount **USD $12.50**, and a PayPal **Sandbox** personal buyer. The live page still shows the accepted version and no capture, but PayPal no longer recognizes the previously stored Sandbox order (`404 / INVALID_RESOURCE_ID`). A local `CREATED` status is not proof the order remains usable or that a payment occurred. The repair adds a safe owner recovery path; it must be published before using it.

1. Before recovery, check PayPal Developer Dashboard → **Sandbox Activity** for a completed USD $12.50 Northline transaction. If one exists, stop—do not create a replacement—and refresh ScopePay to verify/reconcile it.
2. If Sandbox Activity shows no completed payment, open the freelancer workspace → **Payments** → **Northline Coffee v2** → **Show recovery options**. Check the no-capture confirmation and select **Create replacement Sandbox order**. This creates an order only, performs no capture, and keeps the accepted terms, version 2, and exactly USD $12.50. The existing same-version review link remains valid; the owner also receives an additional fresh continuation link.
3. Open the review link and verify **Sandbox**, **Northline Coffee version 2**, and **USD $12.50**. Select PayPal; if the secure popup stops at **Click to Continue** or is blocked, use the visible **Continue to PayPal** link. Sign in with a Sandbox **personal buyer**, not the business merchant. For a test account, use Developer Dashboard → Sandbox → Accounts. Enter credentials only on PayPal's secure page; never send them in chat or put them into screenshots/recording.
4. Explicitly approve the test payment. PayPal returns to the same review capability, and ScopePay captures only after the server verifies the matching approved order and exact amount/currency/reference. Wait for **Payment recorded by the sandbox**, refresh the freelancer workspace, and cross-check the transaction in Sandbox Activity. Keep order/capture IDs redacted. Do not mark the milestone complete based on a button click or order-creation response alone.
5. If PayPal cancels or status is pending/unknown, stop; do not recover/reissue again. Use **Verify payment** and then **Retry capture** only when the provider has confirmed the existing approved order. Record only the non-sensitive error. The app must never label an unverified or cancelled attempt as paid.
6. After the basic capture succeeds, the stronger optional demo can analyze a new request against the fictional scope, have the freelancer create and price a change order, then repeat exact-version client approval and Sandbox checkout for the added work. Do not claim that second flow until it is separately demonstrated.

The server verifies completed capture against the stored accepted amount, currency, order, and reference. **The 53 automated tests are not a substitute for a buyer-approved browser capture.** See `VALIDATION.md` and `PAYPAL_SETUP_AUDIT.md` for the current evidence and boundary.

## 4. Close the judge-access requirement

The rules permit either a hosted working demo or complete runnable repository instructions; they do **not** require buying hosting or a domain. Judges must nevertheless be able to use the functional project free of charge and without restriction through the end of judging. [1] [2]

For this implementation, **a hosted demo is recommended** because its database and AI service rely on the managed project environment. The current public demo is [https://kindred-vj2hs3rd.manus.space](https://kindred-vj2hs3rd.manus.space). It opened signed out and allowed creation of a fictional workspace; verify the entire AI and buyer-payment path from a fresh visitor session before submission. A public source repository with empty environment variables is not, by itself, a turnkey functional installation for a judge who lacks the managed runtime services.

Keep the app, required runtime services, and test access working through **December 15, 2026**, including the official judging-end time. Do not delete test accounts, break review links, replace the submitted build with an unfinished version, add a paywall, or require judges to request permission. Save the release that the video and description actually demonstrate. [1]

## 5. Public source repository — completed

A public repository is mandatory even if the demo is hosted. This requirement is now met: **[VJoycelyn/ScopePay](https://github.com/VJoycelyn/ScopePay)**. GitHub recognizes the root `LICENSE` as MIT. The public snapshot includes the source, original icon, environment-name example, setup/architecture/validation notes, Devpost copy, and demo script. Its fresh lockfile install, TypeScript check, 12 tests, production build, and whitespace check passed.

The repository is separate from both Island Tales and the Manus-managed canonical source repository. The public-release scan excluded credentials, internal Manus workspace metadata, and an unused platform debug collector. A clean source checkout still depends on the managed database/AI environment for the hosted workflow; the README is explicit about that limitation. Do not put the client capability link or private buyer/merchant credentials in the repository.

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

Use project name **ScopePay** and tagline **“Turn scope creep into approved, paid work.”** Adapt `HACKATHON_SUBMISSION.md` to what the final release truly does. Add the public repository, working-demo/testing-access instructions, and public YouTube URL. List PayPal Orders v2 / JavaScript SDK sandbox, React, TypeScript, Express, MySQL, the actual AI runtime/model, and AI development assistance accurately. All materials must be English or have the required English translations. [1] [2]

Do not leave placeholder links or claim the buyer capture until it has been verified. Review permissions, originality, privacy, and the submission terms yourself. Click the final submission action—not merely Save draft—and keep its timestamped confirmation.

The official deadline is **November 12, 2026 at noon Pacific Standard Time / 8:00 p.m. UTC / 4:00 p.m. Atlantic Standard Time**. Aim to submit by **November 11**, leaving time for video visibility, link, and form problems. After the submission window closes, substantive edits are generally not allowed except the narrow organizer-authorized corrections described in the rules. [1] [4]

## Final completion checklist

- [x] New ScopePay application and source package exist.
- [x] Meaningful live AI drafting and change analysis have been exercised.
- [x] PayPal Sandbox credentials and real order creation have been verified.
- [x] Root MIT license, original asset, setup notes, and English submission/demo drafts exist.
- [x] Live hosted demo verified at https://kindred-vj2hs3rd.manus.space.
- [x] Public source repository and GitHub-detected MIT license verified: https://github.com/VJoycelyn/ScopePay.
- [ ] Complete the existing USD $12.50 sandbox personal-buyer approval and verify capture in ScopePay and PayPal Sandbox.
- [ ] Confirm your personal eligibility, ownership, and third-party permissions.
- [ ] Change the host to an available ScopePay-branded subdomain and update every link, if available in the website settings.
- [ ] Establish and test free functional judge access through the judging period.
- [ ] Upload and verify a Public YouTube demo strictly under three minutes.
- [ ] Replace every draft status with final evidence; submit all required Devpost fields and save confirmation.

## References

[1]: https://paypalaihackathon.devpost.com/rules "PayPal AI Hackathon Official Rules"
[2]: https://paypalaihackathon.devpost.com/ "PayPal AI Hackathon Overview and Submission Requirements"
[3]: https://paypalaihackathon.devpost.com/details/faqs "PayPal AI Hackathon FAQs"
[4]: https://paypalaihackathon.devpost.com/details/dates "PayPal AI Hackathon Official Dates"
[5]: https://help.manus.im/en/articles/11711203-how-can-i-connect-the-website-created-by-manus-to-my-custom-domain "Manus Help: Connect a website to a custom domain and edit a deployed subdomain"
