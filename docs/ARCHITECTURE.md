# Architecture and safety notes

## Request flow

`client/src` is the React/TypeScript interface. `/api/scopepay` is handled by explicit Express routes in `server/scopepay`; the browser calls it through `client/src/lib/scopepay-api.ts`. Shared response types live in `shared/scopepay.ts`.

A new freelancer receives an unguessable owner capability once. The browser holds that capability; MySQL stores a cryptographic hash for later verification. A separate random client-review token is issued for a particular published document version. The client route returns only the published terms and payment-safe information, never the owner's token, private brief, or unsubmitted draft.

The MySQL database stores the workspace, drafts, published versions, AI analysis, client acceptance, PayPal order/capture references, and append-only activity entries. Money uses integer cents and USD. Totals are derived on the server from editable deliverable line items. Document version changes invalidate old acceptance/payment references.

## AI boundaries

The server invokes the platform LLM with a structured schema and the minimum brief/scope context needed for the task. Model output is validated before it enters the workspace. It can draft or classify; it cannot set binding prices, publish terms, accept a document, create or capture a PayPal order, or mark a record paid. The human-editable scope and the client acceptance are explicit state transitions outside the model.

AI-generated effort and scope language are suggestions, not researched facts, legal advice, or a guarantee of effort or payment. Evaluation claims are recorded only after actual tests are run. Sample records are marked as fictional and distinct from live model output.

## PayPal sandbox state machine

1. A freelancer edits and publishes a document. The server stores its exact amount, version, and client token.
2. The client opens the scoped link, reviews the complete document, and explicitly accepts that version.
3. The PayPal JS SDK asks the client to approve a sandbox order. ScopePay sends an order-creation request to its server; the browser cannot choose the price.
4. The server authenticates with server-only sandbox credentials and creates an Orders v2 order for the accepted amount.
5. After the PayPal SDK reports buyer approval, the browser asks the server to capture. The server revalidates document, version, order association, currency, and amount, then calls PayPal's sandbox capture endpoint.
6. Only a completed, matching capture is recorded as paid. The server retains order/capture IDs and emits an audit event. Retry and reconciliation paths preserve a completed capture if the browser disconnects.

No live endpoint or live credential is used. A missing sandbox configuration produces a disabled checkout and setup guidance; the interface must not claim a simulated capture succeeded. ScopePay does not offer escrow or hold funds.

## Limitations and threat model

Workspace and share URLs function as bearer capabilities. Anyone with a link may access the limited page that link grants, so do not publish a real client review link. The initial prototype is not production authentication, identity proofing, malware review, legal contracting, or financial compliance. It is a hackathon demonstration for fictional or non-sensitive records.

The public submission must not include database credentials, PayPal secrets, Manus API credentials, real client information, or private logs. Its repo contains `.env.example` names only. Remove test browser state from screen recordings and show sandbox labels.
