import { describe, expect, it } from "vitest";
import { hashCapability } from "./db";
import {
  captureRequestId,
  completedCapture,
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
      purchase_units: [
        {
          reference_id: "project:document:1",
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

  it("derives a stable operation-scoped capture key from the persisted local order", () => {
    expect(captureRequestId("local-order-1")).toBe(
      captureRequestId("local-order-1")
    );
    expect(captureRequestId("local-order-1")).toHaveLength(38);
    expect(captureRequestId("local-order-1")).not.toBe(
      captureRequestId("local-order-2")
    );
  });

  it("distinguishes completed, pending, approved, and unrecoverable provider states", () => {
    expect(paypalPaymentStatus({ status: "PENDING" })).toBe("PENDING");
    expect(recoveryStatus({ status: "PENDING" })).toBe("pending");
    expect(paypalPaymentStatus({ status: "APPROVED" })).toBe("APPROVED");
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
    expect(
      completedCapture(payload, {
        amountCents: 1234,
        reference: "project:document:1",
        paypalOrderId: "PAYPAL-1",
      })
    ).toEqual({ captureId: "CAP-1" });
  });
});
