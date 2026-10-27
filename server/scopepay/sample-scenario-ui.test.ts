import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SampleScenarioDialog } from "../../client/src/components/scopepay/Dialogs";
import type { SampleScenarioId } from "../../shared/scopepay";

(globalThis as any).React = React;

function render() {
  return renderToStaticMarkup(
    React.createElement(SampleScenarioDialog, {
      onClose: vi.fn(),
      onSelect: vi.fn<(scenario: SampleScenarioId) => void>(),
      loadingScenario: null,
    })
  );
}

describe("Sandbox mock-company scenario picker", () => {
  it("offers both requested companies plus the retained Harbor & Pine scenario", () => {
    const html = render();
    expect(html).toContain("Northline Coffee");
    expect(html).toContain("Caribbean Scribbles Publishing");
    expect(html).toContain("Harbor &amp; Pine");
    expect(html).toContain("$12.50");
    expect(html).toContain("$18.75");
  });

  it("says all choices create draft-only mock clients and use one receiving merchant", () => {
    const html = render();
    expect(html).toContain(
      "No review link, acceptance, PayPal order, or capture"
    );
    expect(html).toContain("Sandbox Personal account is the buyer");
    expect(html).toContain("one configured Sandbox Business merchant");
    expect(html).toContain('href="https://developer.paypal.com/"');
    expect(html).toContain('href="https://www.sandbox.paypal.com/"');
    expect(html).toContain(
      "Never use a live account to approve a test payment"
    );
    expect(html).toContain(
      "never asks for or stores Developer Dashboard or buyer passwords"
    );
    expect(html).toContain(
      "accepted Northline Coffee version 2 USD 12.50 record"
    );
    expect(html).toContain("No AI call · no payment action");
    expect(html).not.toContain("checkout/orders");
    expect(html).not.toContain("/capture");
  });

  it("provides a modal heading and identifiable close button", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="sample-scenario-title"');
    expect(html).toContain('aria-label="Close test scenario picker"');
    expect(html).toContain("Choose a test scenario.");
  });
});
