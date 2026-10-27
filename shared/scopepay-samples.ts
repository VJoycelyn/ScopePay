export const SANDBOX_SAMPLE_SCENARIOS = {
  "harbor-pine": {
    companyName: "Harbor & Pine",
    projectName: "Harbor & Pine landing page (fictional sample)",
    clientName: "Harbor & Pine",
    description:
      "A design-studio landing page sample for general workflow exploration.",
    brief:
      "Sandbox mock scenario only: create a landing page for the fictional Harbor & Pine studio brand, with a brief summary, deliverables, and a clear signup action. This is not a real engagement, endorsement, or commercial quote.",
    scopeSummary:
      "A fictional sample scope showing how a small studio landing page can move from brief to explicit deliverables.",
    exclusions: [
      "Brand naming or trademark clearance",
      "Paid media management",
      "Production hosting charges",
    ],
    timeline: "Fictional sample: two weeks from kickoff",
    revisionLimit: "One review pass per deliverable",
    hourlyRateCents: 15000,
    budgetCents: 270000,
    deliverables: [
      {
        title: "Fictional landing page direction",
        description:
          "Wireframe and visual direction for the fictional Harbor & Pine studio landing page.",
        hours: 6,
        priceCents: 90000,
      },
      {
        title: "Fictional responsive build",
        description:
          "A responsive front-end implementation for the fictional sample brand.",
        hours: 10,
        priceCents: 150000,
      },
      {
        title: "Fictional handoff review",
        description: "One review pass and a clearly labeled handoff checklist.",
        hours: 2,
        priceCents: 30000,
      },
    ],
  },
  "northline-coffee": {
    companyName: "Northline Coffee",
    projectName: "Northline Coffee — separate Sandbox mock draft",
    clientName: "Northline Coffee",
    description:
      "A separate mock quote draft; it does not change the accepted Northline Coffee version 2 record.",
    brief:
      "Sandbox mock scenario only for Northline Coffee: prepare a one-page coffee menu and local signup landing-page concept. This new draft is separate from the existing accepted Northline Coffee version 2 USD 12.50 record. It is not a real engagement, endorsement, or commercial quote.",
    scopeSummary:
      "Separate Sandbox test draft for a simple coffee menu launch page. This new version-1 mock project does not edit, replace, or reissue the existing accepted Northline Coffee version 2 USD 12.50 record.",
    exclusions: [
      "Real ecommerce, payment collection, or order processing",
      "Inventory or menu database work",
      "Production hosting charges",
    ],
    timeline: "Mock estimate only: one week after assets are supplied",
    revisionLimit: "One headline and color review pass",
    hourlyRateCents: 12500,
    budgetCents: 1250,
    deliverables: [
      {
        title: "Coffee menu launch-page mock",
        description:
          "A single responsive menu and local signup-page draft for sandbox workflow testing only.",
        hours: 1,
        priceCents: 1250,
      },
    ],
  },
  "caribbean-scribbles": {
    companyName: "Caribbean Scribbles Publishing",
    projectName: "Caribbean Scribbles Publishing — Sandbox mock draft",
    clientName: "Caribbean Scribbles Publishing",
    description:
      "A synthetic book-launch landing-page draft with a distinct editable Sandbox test total.",
    brief:
      "Sandbox mock scenario only for Caribbean Scribbles Publishing: draft a landing-page concept for a made-up Caribbean storybook release, with a short book summary, a caregiver reading-guide signup, and a simple launch announcement. Use no real book text or customer information. This is not a real engagement, endorsement, or commercial quote.",
    scopeSummary:
      "Synthetic Sandbox test draft for a made-up Caribbean storybook launch page and reading-guide signup. Review and edit the sample terms and test-only price before any client review.",
    exclusions: [
      "Real book manuscript or copyrighted text",
      "Payment, ecommerce, or order processing",
      "Production hosting or mailing-list service charges",
    ],
    timeline: "Mock estimate only: two weeks after content is approved",
    revisionLimit: "One review pass on the sample landing-page draft",
    hourlyRateCents: 15000,
    budgetCents: 1875,
    deliverables: [
      {
        title: "Storybook launch-page mock",
        description:
          "A synthetic single-page book-launch concept with a caregiver reading-guide signup.",
        hours: 1.25,
        priceCents: 1875,
      },
    ],
  },
} as const;

export type SampleScenarioId = keyof typeof SANDBOX_SAMPLE_SCENARIOS;
