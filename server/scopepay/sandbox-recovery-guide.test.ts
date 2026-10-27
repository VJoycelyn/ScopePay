import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SandboxRecoveryGuide } from "../../client/src/components/scopepay/SandboxRecoveryGuide";

(globalThis as any).React = React;
const render = () =>
  renderToStaticMarkup(
    React.createElement(SandboxRecoveryGuide, {
      version: 2,
      totalCents: 1250,
      unavailable: true,
    })
  );

describe("visible Sandbox recovery walkthrough", () => {
  it("preserves the exact accepted USD amount and version without calling it paid", () => {
    const html = render();
    expect(html).toContain("USD $12.50 · accepted version 2");
    expect(html).toContain("not proof that no payment completed");
    expect(html).toContain("review link stay available");
    expect(html).not.toContain('class="paid-confirmation"');
  });
  it("shows owner Activity and no-payment gate before one recovery attempt", () => {
    const html = render();
    expect(html.indexOf("check merchant Activity first")).toBeLessThan(
      html.indexOf("Create replacement Sandbox order")
    );
    expect(html).toContain("completed, pending, or unclear");
    expect(html).toContain("Show recovery options");
    expect(html).toContain("no-completed-payment");
    expect(html).toContain("does not charge the buyer");
    expect(html).toContain("do not create another attempt");
  });
  it("separates private owner recovery from explicit Personal buyer approval and completed-capture proof", () => {
    const html = render();
    expect(html).toContain("Business merchant");
    expect(html).toContain("Sandbox Personal");
    expect(html).toContain("approve the test payment yourself");
    expect(html).toContain("Buyers cannot perform owner recovery");
    expect(html).toContain("verified");
    expect(html).toContain("approval");
  });
  it("is informational: all links are safe and no checkout mutation control exists", () => {
    const html = render();
    expect(html).toContain('href="https://www.sandbox.paypal.com/"');
    expect(html).toContain('href="/setup"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/orders/reissue");
  });
});
