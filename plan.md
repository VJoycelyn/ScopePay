# ScopePay — approved solo project

## Product and scope

ScopePay helps independent designers, developers, and other service providers turn an ambiguous client brief into an editable scope and convert out-of-scope requests into reviewed, paid change orders. The user approved this concept on October 20, 2026. It is a brand-new PayPal AI Hackathon project; it does not use Island Tales code or data. The existing fresh starter directory is reused rather than creating another project.

The core demonstration starts with a fictional designer and a landing-page brief. AI drafts explicit deliverables, exclusions, questions, and estimated hours using the freelancer's chosen rate. The freelancer edits prices and scope before publishing a client review link. The client explicitly accepts the exact published document. PayPal sandbox creates and captures an order using the server-stored accepted amount, and the server records paid status only after checking PayPal's completed capture. A later client request is compared with the approved scope. AI labels it included, out of scope, or unclear, cites relevant scope items, proposes additional deliverables and estimated effort, and drafts a professional reply. The freelancer decides whether to create and price a change order. The client reviews and accepts it before paying.

AI suggestions are not legal advice, factual guarantees, binding prices, or permission to move money. The product does not provide escrow, automated collection, autonomous purchases, or production financial services. The checkout remains sandbox-only. This prototype tracks work/payment status; it does not block files, execute contracts, or guarantee payment collection.

## Technical approach

Use the installed React/TypeScript frontend, Express backend, and managed MySQL database. REST endpoints under `/api/scopepay` connect the browser to service modules. Preserve existing platform routes and server conventions. Add persistent, isolated workspaces with a cryptographically random browser-held bearer capability, stored only as a hash on the server. This offers an account-free judge demo, not verified user identity or production authentication. Warn users not to enter sensitive client information. Public client-review links are separate high-entropy bearer capabilities, reveal only published terms, and do not expose the freelancer workspace credential or unpublished drafts. Changing a document after publication invalidates its acceptance and payment references.

Use the provided project LLM runtime from server code, select an available model from the live catalog, validate structured responses, and return actionable errors instead of substituting canned output for failed AI calls. Quote totals and budget arithmetic use integer cents; client-entered totals are never trusted. Limit input sizes, request rates, and expensive AI calls. Return trace metadata with generated analysis so real model results can be distinguished from sample material.

Use PayPal Orders v2 with OAuth credentials held server-side and the PayPal JS SDK for buyer approval. Force the sandbox API domain. Reject captures for unrelated, unaccepted, mismatched, or already superseded documents. Use stable PayPal-Request-ID values, serialize state changes, verify amount/currency/order/capture status, and make retry behavior idempotent. Do not mark completed captures as failed merely because a UI refresh fails. Include a status/configuration endpoint exposing only service readiness and browser-safe client ID. Keep checkout disabled with a helpful setup notice when credentials are missing; never show simulated payment success.

Workspaces and audit events survive reloads and server restarts in MySQL. The prototype is intentionally not a multi-merchant production marketplace: all payments go to the configured sandbox merchant. No real customer money or live PayPal credentials are used.

## Main user experience

The freelancer workspace contains a project list, a selected project's agreed scope and deliverables, quote review/edit controls, a client-request analysis panel, change-order review controls, a payments view, and an activity trail. A new-project dialog accepts brief, client/project names, rate, and optional budget. A sample-project action loads clearly fictional sample terms so the interface is understandable immediately; pressing AI analysis still makes a real model call.

The public client-review screen shows the published scope or change order, deliverables, total in USD, explicit acceptance control, and PayPal sandbox checkout. It explains what the client is agreeing to and shows recoverable cancel, pending, failure, and success states. A setup/status screen explains configuration. All routes and copy work on phones and desktop, with visible focus, labels, keyboard access, reduced-motion support, and loading/error states that preserve input.

## Project structure

- `client/src/pages` holds the freelancer workspace and client review routes.
- `client/src/components/scopepay` holds project lists, quote editing, change analysis, checkout, and activity components.
- `client/src/lib/scopepay-api.ts` owns typed API calls and browser workspace credential handling.
- `shared/scopepay.ts` owns shared DTOs and API request/response definitions.
- `server/scopepay` contains REST routes, MySQL persistence, structured AI analysis, PayPal OAuth/orders, input validation, and payment invariants.
- `scripts` contains deterministic database migration and evaluation commands where needed.
- `docs` contains architecture, privacy/security limits, evaluation notes, Devpost copy, and the under-three-minute demo script.
- `client/public/manus-routes.json` declares every current UI route.
- Root README, LICENSE, `.env.example`, Dockerfile, and package scripts provide a reproducible open-source-ready build.

## Design

Considered styles: Swiss editorial ledger (0.07), warm workshop notebook (0.05), and high-contrast terminal studio (0.03). Choose **Swiss editorial ledger**.

**Design Movement:** contemporary Swiss editorial typography translated into a quiet payments workspace.

**Core Principles:** readable numbers; strong typographic hierarchy; generous negative space; status explanations adjacent to the relevant action.

**Color Philosophy:** warm off-white surfaces soften financial/admin work; graphite communicates precision; vivid cobalt marks actions and approved decisions; muted sage and amber distinguish paid and pending states without relying on color alone.

**Layout Paradigm:** a narrow left rail, an editorial project header, a broad working column, and a compact right-side scope/payment summary; phone layout turns the rail into compact navigation and stacks the working areas. Avoid a generic wall of centered cards.

**Signature Elements:** a bracket-shaped scope mark, fine ledger rules, and a numbered scope-to-payment progression.

**Interaction Philosophy:** disclose before committing; preserve draft input; show the exact scope and price before client acceptance or checkout. Primary actions describe their result.

**Animation:** short 160–220 ms opacity/translate transitions for panels and status updates; restrained AI-loading indicators; no autoplay motion; respect prefers-reduced-motion.

**Typography System:** Manrope for UI and headlines, and IBM Plex Mono for amounts, references, and small ledger labels; use system fallbacks. Headlines 30–44 px desktop, 26–32 px mobile; body 14–16 px; adequate line height for long scope text.

**Brand Essence:** an AI scope-to-payment workspace for independent service providers who need extra work to be explicit before it is paid. Personality: clear, fair, composed.

**Brand Voice:** direct and collaborative, never accusatory or overconfident. Example lines: “Good work starts with clear scope.” and “Extra work. Explicit approval.”

**Wordmark & Logo:** ScopePay set tightly with a bracket/check symbol suggesting bounded scope and explicit acceptance; no imitation of PayPal branding.

**Signature Brand Color:** ledger cobalt `#3155F5`.

## Build and delivery workflow

Implement backend and frontend in parallel against the shared API contract, configure the managed database, connect real AI, and add sandbox checkout. Run type checking, application tests, a production build, focused live AI/API checks, and one read-only integration review. Record only measured results. Save the tested version as a Manus checkpoint. The project is not automatically published; public deployment/repository publication and Devpost submission require the user's subsequent approval. Deliver the app in Preview together with a complete source archive and submission materials. A public YouTube video still requires recording/uploading the actual working application and the entrant's approval; a script alone is not the required video.
