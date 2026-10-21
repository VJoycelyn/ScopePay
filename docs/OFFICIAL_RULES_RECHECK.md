# PayPal AI Hackathon — official rules recheck

**Status checked:** official pages available on October 20/21, 2026. This report uses only the official Devpost challenge pages and PayPal Developer Community blog. ScopePay status below is supplied project context; I did **not** inspect its code or independently verify execution.

## Deadline and schedule

- The **Submission Period** is **October 1, 2026 at 9:15 a.m. Pacific Time through November 12, 2026 at 12:00 p.m. Pacific Time**. The official Devpost schedule displays the deadline as **November 12 at 8:00 p.m. UTC**. [1] [4]
- The **Judging Period** is **December 1, 2026 at 2:00 p.m. Pacific Time through December 15, 2026 at 8:00 a.m. Pacific Time**. The rules say winners are announced **on or around December 21, 2026 at 2:00 p.m. Pacific Time**. [1]
- There is a small official-display discrepancy for the winner-announcement time: the Devpost dates page displays **5:00 p.m. UTC**, whereas the rules state 2:00 p.m. Pacific Time. The rules expressly say that if hackathon materials conflict, the **Official Rules prevail**. Treat the rules’ time as controlling and retain a timestamped submission receipt. [1] [4]

## Who may enter (must)

- An individual must be **at least the age of majority where they reside at the time of entry**. Teams of eligible individuals and qualifying organizations may also enter. There is **no maximum team size**; an individual may join multiple teams and may also submit individually. A team or organization must authorize one representative to submit on its behalf. [1] [3]
- Eligibility is not worldwide without exceptions. Residents of, or organizations domiciled in, places where U.S. or local law prohibits participation or prize receipt are excluded; the rules specifically list **Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea**, and other countries comprehensively sanctioned by OFAC. The exclusion applies to every team member. [1] [3]
- Also excluded are promotion entities and their employees, representatives, agents, immediate family/household; people involved in designing, promoting, producing, executing, or distributing the hackathon and their immediate family/household; judges and their employers; relevant parents, subsidiaries, affiliates; and anyone whose participation creates a real or apparent conflict of interest in the sponsor/administrator’s judgment. [1]
- Joining Devpost and being able to create a PayPal developer account are not the same as hackathon eligibility. PayPal says sandbox access uses an existing PayPal account or a free developer account, but account sign-up availability varies by country. [1] [3]

## Project requirements (must)

- Build or update an application that integrates the **PayPal developer platform using the free sandbox** with an **AI tool, model, or platform**. PayPal integration must be central; any AI tool is acceptable, and sponsor AI tools are optional. Covered PayPal services include PayPal and services such as Venmo, Braintree, Xoom, Honey, Zettle, Paidy, Hyperwallet, Simility, and Swift Financial. [1] [2]
- The project must be newly created, or—if it existed before October 1—**significantly updated after the Submission Period began**. Explain the significant update; the sponsor and administrator decide what counts as significant. [1]
- It must install/run consistently on its intended platform and function as shown in the video and described in the text. Any third-party SDK, API, or data must be used under the applicable authorization, terms, and licenses. [1]
- The homepage additionally asks the submission to identify the AI/model/service tools used and explain how they were used. [2]
- No prescribed problem statement or track exists. This is a recommendation rather than an extra requirement: the project should meaningfully use both PayPal and AI and demonstrate a working prototype/POC. [2] [5]

## Submission package (must)

1. **Text description:** explain features and functionality. [1] [2]
2. **Functional demo:** judges must be able to run or interact with a working build. A hosted/public deployment is **not required**. Either provide a hosted demo URL **or** put clear, complete setup and run instructions in the public repository so judges can build/run it. A mockup, static prototype, or non-functional demo does not qualify. [1] [2]
3. **Public source repository:** provide a GitHub, GitLab, or Bitbucket URL. It must contain all source code, assets, and instructions needed to make the project functional. It must be public/open source and have an open-source license file visible/detectable at the top of the repository page in the About section. [1] [2]
4. **Demo video:** upload it to **public YouTube** and link it in the submission. It must be **less than three minutes**—judges are not required to watch beyond three minutes—and must show the project functioning on the device/platform for which it was built. It may not include third-party trademarks or copyrighted music/material unless the entrant has permission. [1] [2]
5. **Testing access:** provide a website link, functioning demo, or test build. If private, include login credentials. The project must remain available **free of charge and without restriction** for sponsor, administrator, and judges through the end of the Judging Period. Repository instructions may include test accounts, API keys, sandbox login details, and clear instructions for any special access. Judges may elect not to test and may judge from the submitted description, images, and video alone. [1]
6. **Language:** all submission materials must be in English, or the entrant must provide English translations of the demo video, description, testing instructions, and all other submitted materials. [1]

## ScopePay readiness against the musts

The following is a gap check against the supplied status, **not an execution audit**:

- **Likely directionally aligned:** the new solo freelancer draft-scope workflow, AI change analysis, explicit client approval, and PayPal sandbox Orders fit the required PayPal-plus-AI concept if the PayPal integration remains central and the submission explains the AI tools and the meaningful work completed during the Submission Period. [1] [2]
- **Not yet demonstrated:** supplied status says 12 automated tests and 11 API smoke tests, real OAuth/order creation verified, but full buyer approval and capture has not been demoed. That is not enough to claim the required functional demo or video evidence. The final build/video must show the working behavior it claims, including the intended end-to-end payment flow if that is part of the described product. [1]
- **Still required:** public repository, all required source/assets/run instructions, and a visible open-source license are not done. [1] [2]
- **Deployment choice:** public hosting is optional. A complete local-run path in the repository is acceptable, but judges must actually be able to run/interact with it, and any credentials or sandbox details needed for testing must be documented. The no-charge/no-restriction testing obligation lasts through December 15, 2026 at 8:00 a.m. Pacific Time under the rules’ Judging Period. [1]
- **Still required:** a public YouTube demo video under three minutes is not done. It must be in English or accompanied by the required English translation and must show the project functioning on its intended device/platform. [1]
- **Originality and ownership:** the submission must be the entrant’s original work, solely owned by the entrant, and free of other parties’ IP/privacy/publicity/right conflicts. Open-source components are allowed only with license compliance and the entrant must create software that enhances/builds on the underlying open-source product. Third-party technical assistance is allowed only if the entrant owns the resulting work and it remains the entrant’s work product and ideas/creativity. [1]
- **Disqualifying support risk:** a project may not have been developed or derived from a project developed with financial or preferential support from PayPal or Devpost before the Submission Period ended, including their funding, investment, contract development, or commercial license. [1]

## Judging and prize fit (no guarantee)

- **Stage One is pass/fail:** the idea must reasonably fit the theme and reasonably apply the required APIs/SDKs. Stage Two uses five **equally weighted** criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, and Presentation. The Presentation criterion specifically asks whether the video demonstrates the project working end-to-end and communicates the problem, audience, and importance clearly. [1] [2]
- ScopePay’s strongest apparent narrative fit is **Best Use of PayPal + AI**, with possible relevance to impact, innovation, design, and presentation; this is only a positioning assessment, not an eligibility or winning prediction. All submissions remain subject to Stage One, the equally weighted criteria, and judges’ sole discretion. [1] [2]
- Sponsor tools are **optional**; using one is not required for the main hackathon. Sponsor-prize entries must meet that sponsor prize’s specific requirements. A project can win at most **one Grand Prize plus one Sponsor Prize, or one Honorable Mention Prize plus one Sponsor Prize**. [1] [3]
- Prizes are potential awards until identity, qualifications, and role are verified through required post-competition forms. The sponsor/administrator make the final winner decision; a prize need not be awarded if no eligible submission/entrant exists for that prize. Winners are responsible for applicable fees, taxes, foreign-exchange/banking compliance, and required tax forms. [1]
- Do not promise a single total-prize figure: the official pages are inconsistent (the homepage card says $67,500; the rules’ listed categories sum to $69,750; PayPal’s blog says $60,000+). The rules’ prize table and eligibility/verification clauses should control. [1] [2] [5]

## Material legal and disclosure clauses often omitted

- There is **no purchase or payment necessary** to enter or win; purchase does not improve odds. Entry constitutes agreement to the rules as a contract. Register through the hackathon site with a free Devpost account and complete all required submission fields during the Submission Period. [1]
- Draft submissions may be saved until the deadline. After the Submission Period ends, the entrant may not alter the submission, except that PayPal/Devpost may permit narrowly limited changes to remove third-party marks/rights, personally identifiable information, or inappropriate material while keeping the submission substantively the same. [1]
- Multiple submissions are allowed only when each is unique and substantially different, as determined by PayPal/Devpost. [1]
- Submitted work remains the entrant’s IP, but the entrant grants the sponsor a non-exclusive license for judging and agrees that PayPal/Devpost may promote the submission and use contributors’ name, likeness, voice, and image during the hackathon period and for three years afterward. Some submission components may be publicly displayed. Participation also consents to promotional use of personal information, including name, likeness, photograph, voice, opinions/comments, and hometown/country, worldwide where lawful, without additional payment or review. [1]
- The sponsor/administrator may use expert panels, peer review, automated AI analysis, or combinations; judges may be sponsor employees or third parties, may change, and may not be individually listed. Their decisions are binding/final under the rules. [1]
- PayPal/Devpost may cancel, suspend, modify, or disqualify for technical failure, fraud, tampering, rule/law violations, or conduct deemed inappropriate or contrary to the hackathon’s interests. The sponsor/administrator may amend the rules by posting amended rules, and the rules prevail over conflicting site, submission-form, advertising, or other hackathon statements. [1]
- The entrant must not include unauthorized third-party copyrighted, trademarked, proprietary, privacy, or publicity material, and submitted content must not contain malware or other disabling/harmful code. [1]

## References

[1]: https://paypalaihackathon.devpost.com/rules "PayPal AI Hackathon Official Rules"
[2]: https://paypalaihackathon.devpost.com/ "PayPal AI Hackathon official Devpost homepage"
[3]: https://paypalaihackathon.devpost.com/details/faqs "PayPal AI Hackathon official FAQs"
[4]: https://paypalaihackathon.devpost.com/details/dates "PayPal AI Hackathon official dates"
[5]: https://developer.paypal.com/community/blog/PayPal_AI_Hackathon/ "PayPal Developer Community: Hackathon: Build What's Next with PayPal and AI"
