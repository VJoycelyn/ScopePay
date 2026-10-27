import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ScopePayApiError,
  scopepayApi,
} from "../../client/src/lib/scopepay-api";

const CLIENT_TOKEN = "client-token-must-not-leak";
const LOCAL_ORDER_ID = "local-order-1";
const PROVIDER_ORDER_ID = "paypal-order-1";
const CAPTURE_ID = "capture-1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function expectApiError(error: unknown): ScopePayApiError {
  expect(error).toBeInstanceOf(ScopePayApiError);
  return error as ScopePayApiError;
}

async function rejected(promise: Promise<unknown>): Promise<ScopePayApiError> {
  const error = await promise.then(
    () => new Error("expected the request to reject"),
    reason => reason
  );
  return expectApiError(error);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScopePay client payment API response safety", () => {
  it("accepts a valid create-order response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: PROVIDER_ORDER_ID,
          approvalUrl:
            "https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-1",
        },
        201
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(scopepayApi.createOrder(CLIENT_TOKEN, 3)).resolves.toEqual({
      id: PROVIDER_ORDER_ID,
      approvalUrl:
        "https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/scopepay/client/client-token-must-not-leak/orders"
    );
  });

  it.each([
    ["HTML 200", htmlResponse("<html>proxy failure with secret-token</html>")],
    [
      "HTML 502",
      htmlResponse("<html>upstream failure with secret-token</html>", 502),
    ],
  ])("rejects %s without exposing the body", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const error = await rejected(scopepayApi.createOrder(CLIENT_TOKEN, 3));
    expect(error.code).toBe(
      response.status === 502 ? "SERVICE_UNAVAILABLE" : "INVALID_RESPONSE"
    );
    expect(error.status).toBe(response.status);
    expect(error.message).not.toContain("secret-token");
    expect(error.message).not.toContain("<html>");
  });

  it("rejects malformed JSON and incomplete reissue responses safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("{not-json", {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({ project: {}, approvalUrl: null }, 200)
        )
    );

    const malformed = await rejected(scopepayApi.createOrder(CLIENT_TOKEN, 3));
    expect(malformed.code).toBe("INVALID_RESPONSE");
    expect(malformed.message).not.toContain("not-json");

    const incompleteReissue = await rejected(
      scopepayApi.reissueOrder("project-1", "document-1", 3)
    );
    expect(incompleteReissue.code).toBe("INVALID_RESPONSE");
  });

  it("rejects an incomplete paid response and marks capture status unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "paid",
          orderId: PROVIDER_ORDER_ID,
          captureId: "",
          amountCents: 12500,
          currency: "USD",
        })
      )
    );

    const error = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(error.code).toBe("PAYMENT_UNKNOWN");
    expect(error.message).toContain("verify payment");
    expect(error.message).not.toContain("retry");
  });

  it("accepts a valid paid result even when the requested id is local", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "paid",
          orderId: PROVIDER_ORDER_ID,
          captureId: CAPTURE_ID,
          amountCents: 12500,
          currency: "USD",
        })
      )
    );

    await expect(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    ).resolves.toEqual({
      status: "paid",
      orderId: PROVIDER_ORDER_ID,
      captureId: CAPTURE_ID,
      amountCents: 12500,
      currency: "USD",
    });
  });

  it("turns capture network and non-JSON gateway failures into verify-first uncertainty", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network contains client-token"))
      .mockResolvedValueOnce(htmlResponse("<html>gateway body</html>", 502));
    vi.stubGlobal("fetch", fetchMock);

    const networkError = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(networkError.code).toBe("PAYMENT_UNKNOWN");
    expect(networkError.status).toBe(503);
    expect(networkError.message).toContain("verify payment");
    expect(networkError.message).not.toContain("retry");
    expect(networkError.message).not.toContain("client-token");

    const gatewayError = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(gatewayError.code).toBe("PAYMENT_UNKNOWN");
    expect(gatewayError.status).toBe(502);
    expect(gatewayError.message).not.toContain("gateway body");
  });

  it("preserves a safe backend code without trusting its error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "provider HTML and client-token must never reach the UI",
            code: "PAYMENT_PENDING",
          },
          409
        )
      )
    );

    const error = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(error.code).toBe("PAYMENT_PENDING");
    expect(error.status).toBe(409);
    expect(error.message).toBe(
      "Payment is pending verification; verify payment before trying again."
    );
    expect(error.message).not.toContain("provider HTML");
    expect(error.message).not.toContain("client-token");
  });

  it("recognizes an upstream gateway body as unavailable, not a PayPal rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            cloudflare_error: true,
            error_name: "origin_bad_gateway",
            detail: "private-origin-details-must-not-leak",
            ray_id: "private-ray-id",
          },
          502
        )
      )
    );
    const error = await rejected(
      scopepayApi.reconcileOrder(CLIENT_TOKEN, PROVIDER_ORDER_ID)
    );
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.status).toBe(502);
    expect(error.message).not.toContain("private-origin");
    expect(error.message).not.toContain("private-ray");
  });

  it("rejects a paid review without a verified capture identifier", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          projectName: "Fictional project",
          clientName: "Fictional buyer",
          sandbox: true,
          document: {
            id: "doc-1",
            version: 2,
            totalCents: 1250,
            currency: "USD",
            status: "paid",
            deliverables: [],
            exclusions: [],
            paypalOrderId: "saved-order-1",
          },
        })
      )
    );
    const error = await rejected(
      scopepayApi.reconcileOrder(CLIENT_TOKEN, PROVIDER_ORDER_ID)
    );
    expect(error.code).toBe("PAYMENT_UNKNOWN");
  });

  it("accepts a complete verified paid review from the server after a refresh", async () => {
    const review = {
      projectName: "Fictional project",
      clientName: "Fictional buyer",
      sandbox: true,
      document: {
        id: "doc-1",
        version: 2,
        totalCents: 1250,
        currency: "USD",
        status: "paid",
        deliverables: [],
        exclusions: [],
        paypalOrderId: "saved-order-1",
        paypalCaptureId: "verified-capture-1",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(review)));
    await expect(scopepayApi.clientReview(CLIENT_TOKEN)).resolves.toEqual(
      review
    );
  });

  it("accepts a coherent accepted review without claiming payment", async () => {
    const review = {
      projectName: "Fictional project",
      clientName: "Fictional buyer",
      sandbox: true,
      document: {
        id: "doc-1",
        version: 2,
        totalCents: 1250,
        currency: "USD",
        status: "accepted",
        deliverables: [],
        exclusions: [],
        paypalOrderId: "saved-order-1",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(review)));
    await expect(scopepayApi.clientReview(CLIENT_TOKEN)).resolves.toEqual(
      review
    );
  });
});
