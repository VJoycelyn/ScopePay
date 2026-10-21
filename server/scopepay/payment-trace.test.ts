import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaymentTrace,
  safePaymentErrorCode,
  safePaymentTraceDetails,
  validPaymentTraceId,
} from "./payment-trace";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.restoreAllMocks());

describe("privacy-safe PayPal capture tracing", () => {
  it("accepts a valid correlation UUID and replaces unsafe header content", () => {
    expect(validPaymentTraceId(UUID.toUpperCase())).toBe(UUID);
    for (const raw of [
      "private-capability-do-not-log",
      "\r\nInjected",
      "",
      undefined,
    ]) {
      const result = validPaymentTraceId(raw);
      expect(result).toMatch(uuidPattern);
      expect(result).not.toBe(raw);
    }
  });

  it("allowlists useful metadata and drops identifiers or personal fields", () => {
    const dirty = {
      amountCents: 1250,
      version: 2,
      currency: "USD",
      hasOrderId: true,
      providerStatus: "APPROVED",
      recoveryStatus: "unknown",
      httpStatus: 409,
      token: "private-capability",
      orderId: "private-order",
      captureId: "private-capture",
      payer: "private-payer",
      authorization: "private-auth",
      secret: "private-secret",
    };
    const safe = safePaymentTraceDetails(dirty);
    expect(safe).toEqual({
      amountCents: 1250,
      version: 2,
      currency: "USD",
      hasOrderId: true,
      providerStatus: "APPROVED",
      recoveryStatus: "unknown",
      httpStatus: 409,
    });
    expect(JSON.stringify(safe)).not.toContain("private-");
  });

  it("never forwards an arbitrary error message or unrecognized provider status", () => {
    expect(
      safePaymentErrorCode(new Error("private-token-in-provider-error"))
    ).toBe("UNKNOWN_ERROR");
    expect(safePaymentErrorCode(new Error("PAYPAL_UNAVAILABLE"))).toBe(
      "PAYPAL_UNAVAILABLE"
    );
    expect(
      safePaymentTraceDetails({
        providerStatus: "private-payer",
        errorCode: "private-secret",
        amountCents: -1,
        version: 0,
        currency: "EUR",
        httpStatus: 999,
      })
    ).toEqual({ errorCode: "UNKNOWN_ERROR" });
  });

  it("correlates entry, failure stage, and final HTTP response without logging the route", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = Object.assign(new EventEmitter(), {
      statusCode: 409,
      writableFinished: true,
      setHeader: vi.fn(),
    });
    const request = {
      header: () => UUID,
      params: { token: "private-token", orderId: "private-order" },
    };
    const trace = createPaymentTrace(
      request as unknown as Request,
      response as unknown as Response
    );
    trace.info("capture.route_enter", { hasOrderId: true });
    trace.info("capture.provider_lookup");
    trace.error("capture.failed", { errorCode: "PAYPAL_UNAVAILABLE" });
    response.emit("finish");
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-ScopePay-Trace-Id",
      UUID
    );
    const failure = JSON.parse(String(error.mock.calls[0][1]));
    expect(failure).toMatchObject({
      traceId: UUID,
      stage: "capture.failed",
      previousStage: "capture.provider_lookup",
      errorCode: "PAYPAL_UNAVAILABLE",
      source: "server",
      environment: "sandbox",
    });
    const finish = JSON.parse(String(info.mock.calls.at(-1)?.[1]));
    expect(finish).toMatchObject({
      stage: "capture.response_sent",
      httpStatus: 409,
      traceId: UUID,
    });
    expect(
      JSON.stringify([...info.mock.calls, ...error.mock.calls])
    ).not.toContain("private-");
  });

  it("does not throw when console logging is unavailable", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("console unavailable");
    });
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: true,
      setHeader: vi.fn(),
    });
    const trace = createPaymentTrace(
      { header: () => UUID } as unknown as Request,
      response as unknown as Response
    );
    expect(() => trace.info("capture.route_enter")).not.toThrow();
    expect(() => response.emit("finish")).not.toThrow();
  });
});
