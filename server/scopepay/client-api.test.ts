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
  it.each([
    ["PAYPAL_INSTRUMENT_DECLINED", "funding method"],
    ["PAYPAL_PAYER_CANNOT_PAY", "buyer cannot pay this merchant"],
    ["PAYPAL_PAYEE_ACCOUNT_RESTRICTED", "merchant account is restricted"],
    ["PAYPAL_TRANSACTION_REFUSED", "refused the capture request"],
    ["PAYPAL_CAPTURE_REJECTED", "rejected the capture request"],
  ])(
    "keeps %s actionable without exposing provider payloads",
    async (code, expectedCopy) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              { code, error: "private provider body and account data" },
              409
            )
          )
      );
      const error = await rejected(
        scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
      );
      expect(error.code).toBe(code);
      expect(error.message).toContain(expectedCopy);
      expect(error.message).toMatch(/same (saved )?order/);
      expect(error.message).not.toContain("private provider");
    }
  );

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

  it.each(["CLIENT_LINK_NOT_FOUND", "CLIENT_TOKEN_NOT_FOUND"] as const)(
    "maps %s to unavailable-review guidance on both review load and same-order verification",
    async code => {
      const fetchMock = vi.fn().mockImplementation(async () =>
        jsonResponse(
          {
            error: "private client capability must not reach the UI",
            code,
          },
          404
        )
      );
      vi.stubGlobal("fetch", fetchMock);

      const reviewError = await rejected(
        scopepayApi.clientReview(CLIENT_TOKEN)
      );
      expect(reviewError.code).toBe(code);
      expect(reviewError.status).toBe(404);
      expect(reviewError.message).toContain("review link is unavailable");
      expect(reviewError.message).toContain(
        "saved PayPal order could not be checked"
      );
      expect(reviewError.message).toContain(
        "does not prove no payment completed"
      );
      expect(reviewError.message).not.toContain("private client capability");

      const orderError = await rejected(
        scopepayApi.reconcileOrder(CLIENT_TOKEN, PROVIDER_ORDER_ID)
      );
      expect(orderError.code).toBe(code);
      expect(orderError.status).toBe(404);
      expect(orderError.message).toBe(reviewError.message);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

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

describe("ScopePay mock-scenario API request", () => {
  it.each(["northline-coffee", "caribbean-scribbles"] as const)(
    "sends the selected %s company template to the existing sample endpoint",
    async scenario => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "sample-project" }));
      vi.stubGlobal("fetch", fetchMock);
      await scopepayApi.loadSampleProject(scenario);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/scopepay/projects/sample");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ scenario });
    }
  );
});

describe("PayPal same-order buyer-action response safety", () => {
  const actionUrl =
    "https://www.sandbox.paypal.com/checkoutnow?token=saved-order-1";
  const pendingReview = (approvalUrl: unknown = actionUrl) => ({
    projectName: "Fictional project",
    clientName: "Fictional buyer",
    sandbox: true,
    document: {
      id: "doc-1",
      version: 2,
      totalCents: 1250,
      currency: "USD",
      status: "payment_pending",
      deliverables: [],
      exclusions: [],
      paypalOrderId: "saved-order-1",
    },
    paymentAction: { kind: "payer_action_required", approvalUrl },
  });

  it("accepts a server-confirmed pending review returned by preparation", async () => {
    const result = {
      id: "saved-order-1",
      approvalUrl: actionUrl,
      review: pendingReview(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(result, 201))
    );
    await expect(scopepayApi.createOrder(CLIENT_TOKEN, 2)).resolves.toEqual(
      result
    );
  });

  it("rejects preparation review metadata for a different order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            id: "another-order",
            approvalUrl: actionUrl,
            review: pendingReview(),
          },
          201
        )
      )
    );
    const error = await rejected(scopepayApi.createOrder(CLIENT_TOKEN, 2));
    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it("preserves a safe action URL only for PAYER_ACTION_REQUIRED without trusting error text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: "PAYER_ACTION_REQUIRED",
          error: "private payload must not leak",
          approvalUrl: actionUrl,
        },
        409
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const error = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(error.code).toBe("PAYER_ACTION_REQUIRED");
    expect(error.approvalUrl).toBe(actionUrl);
    expect(error.message).toContain("buyer step on this same order");
    expect(error.message).not.toContain("private payload");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://www.paypal.com/checkoutnow",
    "https://www.sandbox.paypal.com.evil.example",
    "http://www.sandbox.paypal.com/checkoutnow",
  ])("strips unsafe action URL %s from an error", async approvalUrl => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: "PAYER_ACTION_REQUIRED", approvalUrl }, 409)
        )
    );
    const error = await rejected(
      scopepayApi.captureOrder(CLIENT_TOKEN, LOCAL_ORDER_ID)
    );
    expect(error.code).toBe("PAYER_ACTION_REQUIRED");
    expect(error.approvalUrl).toBeNull();
  });

  it("accepts a matched pending review's explicit action link through GET only", async () => {
    const review = pendingReview();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(review));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      scopepayApi.reconcileOrder(CLIENT_TOKEN, PROVIDER_ORDER_ID)
    ).resolves.toEqual(review);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["https://evil.example", 123, undefined])(
    "rejects malformed action data in a successful review: %s",
    async approvalUrl => {
      const review = pendingReview(approvalUrl);
      if (approvalUrl === undefined)
        (review.paymentAction as any).approvalUrl = undefined;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(review)));
      const error = await rejected(
        scopepayApi.reconcileOrder(CLIENT_TOKEN, PROVIDER_ORDER_ID)
      );
      expect(error.code).toBe("INVALID_RESPONSE");
    }
  );

  it("rejects an action hint attached to a paid review even with capture proof", async () => {
    const review = pendingReview() as any;
    review.document.status = "paid";
    review.document.paypalCaptureId = "verified-capture";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(review)));
    const error = await rejected(scopepayApi.clientReview(CLIENT_TOKEN));
    expect(error.code).toBe("INVALID_RESPONSE");
  });
});
