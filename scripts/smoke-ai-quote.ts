import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { generateQuote, SCOPEPAY_MODEL } from "../server/scopepay/ai";

const started = Date.now();
const quote = await generateQuote(
  "Synthetic, fictional brief: Aster Studio needs a one-page responsive landing page with an email signup form. We have not chosen the email provider, supplied the final copy, or agreed a launch date. Draft clear boundaries and identify important unresolved questions."
);
assert.ok(quote.deliverables.length > 0);
assert.ok(quote.questions.length > 0 && quote.questions.length <= 4);
assert.ok(quote.deliverables.every(item => item.hours > 0));
await writeFile(
  "docs/AI_QUOTE_RESULTS.json",
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      model: SCOPEPAY_MODEL,
      source: "live_ai",
      fictional: true,
      schemaValid: true,
      deliverableCount: quote.deliverables.length,
      clarifyingQuestionCount: quote.questions.length,
      latencyMs: Date.now() - started,
      boundary:
        "One synthetic development smoke check, not a quality benchmark. No workspace, acceptance, order, or payment is created.",
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify({
    schemaValid: true,
    deliverables: quote.deliverables.length,
    questions: quote.questions.length,
  })
);
