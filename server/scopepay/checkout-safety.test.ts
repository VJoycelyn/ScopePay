import { describe, expect, it } from "vitest";
import { safeSandboxApprovalUrl } from "../../client/src/lib/paypal-safety";

describe("buyer and owner PayPal continuation URL safety", () => {
  it("accepts only HTTPS PayPal Sandbox navigation without embedded credentials", () => {
    const safe = "https://www.sandbox.paypal.com/checkoutnow?token=TEST-ORDER";
    expect(safeSandboxApprovalUrl(safe)).toBe(safe);
    for (const unsafe of [
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "https://www.paypal.com/checkoutnow",
      "http://www.sandbox.paypal.com/checkoutnow",
      "https://www.sandbox.paypal.com.attacker.invalid/x",
      "https://user:password@www.sandbox.paypal.com/x",
      "/checkoutnow",
    ]) {
      expect(safeSandboxApprovalUrl(unsafe)).toBeNull();
    }
  });
});
