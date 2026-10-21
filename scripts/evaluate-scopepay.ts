import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { analyzeChange, SCOPEPAY_MODEL } from "../server/scopepay/ai";

const scope = {
  title: "Synthetic one-page launch website",
  scopeSummary:
    "One responsive launch landing page; one round of copy and color revisions; no integrations beyond a local signup form.",
  deliverables: [
    {
      title: "One landing page",
      description:
        "One responsive page with hero, menu, and local signup form. No other pages.",
      hours: 12,
    },
    {
      title: "One revision round",
      description:
        "One round of headline and color changes only, before acceptance.",
      hours: 2,
    },
  ],
  exclusions: [
    "Additional pages",
    "Ecommerce or payment integrations",
    "Third-party email/newsletter integrations",
  ],
  timeline: "Five working days after receiving assets",
  revisionLimit:
    "One headline/color revision round; number of revisions already used is not supplied",
};
const cases = [
  {
    name: "Included headline revision",
    request:
      "Please change the headline during our first and only revision round.",
    expected: "included",
  },
  {
    name: "Excluded ecommerce integration",
    request: "Can you add an ecommerce checkout and product catalog?",
    expected: "out_of_scope",
  },
  {
    name: "Ambiguous used revision allowance",
    request:
      "Can we have another round of edits? I do not remember how many rounds we have already used.",
    expected: "unclear",
  },
];

const selectedCases = process.argv[2]
  ? cases.filter(scenario => scenario.name === process.argv[2])
  : cases;
if (!selectedCases.length) throw new Error("Unknown synthetic case name");
const results = [];
for (const scenario of selectedCases) {
  const started = Date.now();
  try {
    const output = await analyzeChange(scenario.request, scope);
    const result = {
      name: scenario.name,
      expected: scenario.expected,
      actual: output.verdict,
      matched: output.verdict === scenario.expected,
      schemaValid: true,
      latencyMs: Date.now() - started,
      evidence: output.items.map(item => item.evidence),
      source: "live_ai" as const,
    };
    results.push(result);
    console.log(
      `${scenario.name}: ${output.verdict}; expected ${scenario.expected}; ${result.latencyMs}ms`
    );
  } catch (error) {
    results.push({
      name: scenario.name,
      expected: scenario.expected,
      actual: null,
      matched: false,
      schemaValid: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Evaluation failed",
    });
    console.log(`${scenario.name}: failed`);
  }
}
const record = {
  testedAt: new Date().toISOString(),
  model: SCOPEPAY_MODEL,
  sampleSize: selectedCases.length,
  context:
    "Developer-authored synthetic cases, run once each against the actual app AI helper. Not an independent benchmark or real-user study. Initial three-case results, including their failure, are preserved separately.",
  matchedCount: results.filter(result => result.matched).length,
  results,
};
await writeFile(
  "docs/SYNTHETIC_AI_RESULTS.json",
  `${JSON.stringify(record, null, 2)}\n`,
  "utf8"
);
if (results.some(result => !result.schemaValid)) process.exitCode = 1;
