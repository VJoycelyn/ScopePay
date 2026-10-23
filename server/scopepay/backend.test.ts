import { describe, expect, it } from "vitest";
import { hashCapability } from "./db";
import {
  captureRequestId,
  completedCapture,
  extractApprovalUrl,
  paypalOrderMatches,
  paypalPaymentStatus,
  recoveryStatus,
} from "./paypal";

describe("ScopePay backend security primitives", () => {
  it("hashes bearer capabilities deterministically without retaining the raw value", () => {
    const raw = "a".repeat(43);
    const hashed = hashCapability(raw);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toContain(raw);
    expect(hashCapability(raw)).toBe(hashed);
  });

  it("accepts only a completed capture matching the saved USD amount and reference", () => {
    const payload = {
      status: "COMPLETED",
      id: "ORDER-1",
      purchase_units: [
        {
          reference_id: "project:document:1",
          custom_id: "project:document:1",
          payments: {
            captures: [
              {
                id: "CAP-1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "12.34" },
              },
            ],
          },
        },
      ],
    };
    expect(
      completedCapture(payload, {
        amountCents: 1234,
        reference: "project:document:1",
      })
    ).toEqual({ captureId: "CAP-1" });
    expect(
      completedCapture(payload, {
        amountCents: 1235,
        reference: "project:document:1",
      })
    ).toBeNull();
    expect(
      completedCapture(payload, { amountCents: 1234, reference: "other" })
    ).toBeNull();
  });

  it("rejects a supplied unit total that is wrong, while allowing it to be absent", () => {
    const payload = {
      status: "COMPLETED",
      id: "ORDER-1",
      purchase_units: [
        {
          reference_id: "project:document:1",
          custom_id: "project:document:1",
          payments: {
            captures: [
              {
                id: "CAP-1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "12.34" },
              },
            ],
          },
        },
      ],
    };
    const expected = {
      amountCents: 1234,
      reference: "project:document:1",
      paypalOrderId: "ORDER-1",
    };
    expect(completedCapture(payload, expected)).toEqual({ captureId: "CAP-1" });
    expect(
      completedCapture(
        {
          ...payload,
          purchase_units: [
            {
              ...payload.purchase_units[0],
              amount: { currency_code: "USD", value: "12.35" },
            },
          ],
        },
        expected
      )
    ).toBeNull();
    expect(
      completedCapture(
        {
          ...payload,
          purchase_units: [
            {
              ...payload.purchase_units[0],
              amount: { currency_code: "EUR", value: "12.34" },
            },
          ],
        },
        expected
      )
    ).toBeNull();
  });

  it("rejects non-completed or non-USD captures", () => {
    const payload = {
      purchase_units: [
        {
          custom_id: "p:d:1",
          payments: {
            captures: [
              {
                id: "CAP-2",
                status: "PENDING",
                amount: { currency_code: "EUR", value: "10.00" },
              },
            ],
          },
        },
      ],
    };
    expect(
      completedCapture(payload, { amountCents: 1000, reference: "p:d:1" })
    ).toBeNull();
  });

  it("rejects missing or mismatched order ids and empty capture ids", () => {
    const payload = {
      id: "PAYPAL-1",
      status: "COMPLETED",
      purchase_units: [
        {
          reference_id: "project:document:1",
          custom_id: "project:document:1",
          payments: {
            captures: [
              {
                id: "CAP-1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "12.34" },
              },
            ],
          },
        },
      ],
    };
    const expected = {
      amountCents: 1234,
      reference: "project:document:1",
      paypalOrderId: "PAYPAL-1",
    };
    expect(
      completedCapture({ ...payload, id: undefined }, expected)
    ).toBeNull();
    expect(completedCapture({ ...payload, id: "OTHER" }, expected)).toBeNull();
    expect(
      completedCapture(
        {
          ...payload,
          purchase_units: [
            {
              ...payload.purchase_units[0],
              payments: {
                captures: [
                  {
                    ...payload.purchase_units[0].payments.captures[0],
                    id: "  ",
                  },
                ],
              },
            },
          ],
        },
        expected
      )
    ).toBeNull();
    expect(
      completedCapture(
        {
          ...payload,
          purchase_units: [
            {
              ...payload.purchase_units[0],
              payments: {
                captures: [
                  {
                    ...payload.purchase_units[0].payments.captures[0],
                    id: " CAP-1 ",
                  },
                ],
              },
            },
          ],
        },
        expected
      )
    ).toBeNull();
  });

  it("derives a stable capture key per provider order attempt", () => {
    expect(captureRequestId("paypal-order-a")).toBe(
      captureRequestId("paypal-order-a")
    );
    expect(captureRequestId("paypal-order-a")).toHaveLength(38);
    // A reissued provider order can share its local document row, but not the
    // previous PayPal order's capture idempotency key.
    expect(captureRequestId("paypal-order-a")).not.toBe(
      captureRequestId("paypal-order-b")
    );
  });

  it("distinguishes completed, pending, approved, and unrecoverable provider states", () => {
    expect(paypalPaymentStatus({ status: "PENDING" })).toBe("PENDING");
    expect(recoveryStatus({ status: "PENDING" })).toBe("pending");
    expect(paypalPaymentStatus({ status: "APPROVED" })).toBe("APPROVED");
    expect(recoveryStatus({ status: "APPROVED" })).toBe("unknown");
    expect(paypalPaymentStatus({ status: "CREATED" })).toBe("CREATED");
    expect(paypalPaymentStatus({ status: "VOIDED" })).toBe("VOIDED");
    expect(recoveryStatus({ status: "DENIED" })).toBe("retryable");
    expect(recoveryStatus({ status: "FAILED" })).toBe("retryable");
  });

  it("requires the expected PayPal order id when the representation supplies one", () => {
    const payload = {
      id: "PAYPAL-1",
      status: "COMPLETED",
      purchase_units: [
        {
          reference_id: "project:document:1",
          custom_id: "project:document:1",
          payments: {
            captures: [
              {
                id: "CAP-1",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "12.34" },
              },
            ],
          },
        },
      ],
    };
    expect(
      completedCapture(payload, {
        amountCents: 1234,
        reference: "project:document:1",
        paypalOrderId: "PAYPAL-1",
      })
    ).toEqual({ captureId: "CAP-1" });
    expect(
      completedCapture(
        { ...payload, id: "OTHER" },
        {
          amountCents: 1234,
          reference: "project:document:1",
          paypalOrderId: "PAYPAL-1",
        }
      )
    ).toBeNull();
  });

  it("requires every supplied order reference to match", () => {
    const base = {
      id: "PAYPAL-1",
      purchase_units: [
        {
          reference_id: "project:document:1",
          custom_id: "project:document:1",
          amount: { currency_code: "USD", value: "12.34" },
        },
      ],
    };
    const expected = {
      amountCents: 1234,
      reference: "project:document:1",
      paypalOrderId: "PAYPAL-1",
    };
    expect(paypalOrderMatches(base, expected)).toBe(true);
    expect(
      paypalOrderMatches(
        {
          ...base,
          purchase_units: [
            {
              ...base.purchase_units[0],
              custom_id: "different-reference",
            },
          ],
        },
        expected
      )
    ).toBe(false);
  });

  it("rejects inconsistent capture references and multiple purchase units", () => {
    const unit = {
      reference_id: "p:d:2",
      custom_id: "p:d:2",
      amount: { currency_code: "USD", value: "12.50" },
      payments: {
        captures: [
          {
            id: "CAP-1",
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "12.50" },
          },
        ],
      },
    };
    const payload = {
      id: "PAYPAL-1",
      status: "COMPLETED",
      purchase_units: [unit],
    };
    const expected = {
      paypalOrderId: "PAYPAL-1",
      reference: "p:d:2",
      amountCents: 1250,
    };
    expect(completedCapture(payload, expected)).toEqual({ captureId: "CAP-1" });
    expect(
      completedCapture(
        { ...payload, purchase_units: [{ ...unit, custom_id: "other" }] },
        expected
      )
    ).toBeNull();
    expect(
      completedCapture({ ...payload, purchase_units: [unit, unit] }, expected)
    ).toBeNull();
    expect(
      paypalOrderMatches({ ...payload, purchase_units: [unit, unit] }, expected)
    ).toBe(false);
  });

  it("only exposes HTTPS PayPal Sandbox approval links", () => {
    const approved = "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1";
    expect(
      extractApprovalUrl({ links: [{ rel: "payer-action", href: approved }] })
    ).toBe(approved);
    expect(
      extractApprovalUrl({
        links: [{ rel: "approve", href: "http://www.sandbox.paypal.com/x" }],
      })
    ).toBeNull();
    expect(
      extractApprovalUrl({
        links: [{ rel: "approve", href: "https://www.paypal.com/x" }],
      })
    ).toBeNull();
    expect(
      extractApprovalUrl({
        links: [
          {
            rel: "approve",
            href: "https://user:secret@www.sandbox.paypal.com/x",
          },
        ],
      })
    ).toBeNull();
  });
});
