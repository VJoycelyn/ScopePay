import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeSandboxApprovalUrl } from "../../client/src/lib/paypal-safety";
import {
  capturePaypalOrder,
  extractApprovalUrl,
  extractPayerActionUrl,
  getPaypalOrder,
  paypalPaymentStatus,
  recoveryStatus,
  verifyPaypalWebhookSignature,
} from "./paypal";

describe("PayPal Sandbox approval URL allowlist", () => {
  const safeUrl =
    "https://www.sandbox.paypal.com/checkoutnow?token=fictional-order";

  it.each(["approve", "payer-action"])(
    "accepts a provider %s link on the official Sandbox host",
    rel => {
      const payload = { links: [{ rel, href: safeUrl }] };
      expect(extractApprovalUrl(payload)).toBe(safeUrl);
      expect(safeSandboxApprovalUrl(safeUrl)).toBe(safeUrl);
    }
  );

  it.each([
    "http://www.sandbox.paypal.com/checkoutnow",
    "https://www.paypal.com/checkoutnow",
    "https://www.sandbox.paypal.com.attacker.example/checkoutnow",
    "https://user@www.sandbox.paypal.com/checkoutnow",
    "https://www.sandbox.paypal.com:8443/checkoutnow",
    "https://www.sandbox.paypal.com/checkoutnow#untrusted",
  ])("rejects non-Sandbox or unsafe approval URL %s", url => {
    expect(
      extractApprovalUrl({ links: [{ rel: "approve", href: url }] })
    ).toBeNull();
    expect(safeSandboxApprovalUrl(url)).toBeNull();
  });

  it("does not expose a provider link with an unrelated relation", () => {
    const payload = { links: [{ rel: "self", href: safeUrl }] };
    expect(extractApprovalUrl(payload)).toBeNull();
  });

  it("requires an explicit payer-action relation and safe official origin", () => {
    expect(
      extractPayerActionUrl({ links: [{ rel: "approve", href: safeUrl }] })
    ).toBeNull();
    expect(
      extractPayerActionUrl({ links: [{ rel: "payer-action", href: safeUrl }] })
    ).toBe(safeUrl);
    for (const href of [
      "https://www.paypal.com/action",
      "https://www.sandbox.paypal.com:8443/action",
      `${safeUrl}#unsafe`,
      "https://user@www.sandbox.paypal.com/action",
    ])
      expect(
        extractPayerActionUrl({ links: [{ rel: "payer-action", href }] })
      ).toBeNull();
  });
});

describe("PayPal saved-order error classification", () => {
  beforeEach(() => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "fictional-sandbox-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "fictional-sandbox-client-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockLookup(status: number, name: string) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fictional-token" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name }), { status })
      );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each(["RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID"])(
    "recognizes PayPal 404 %s as missing, without creating or capturing",
    async name => {
      const fetchMock = mockLookup(404, name);
      await expect(getPaypalOrder("FICTIONAL-SAVED-ORDER")).rejects.toThrow(
        "PAYPAL_ORDER_NOT_FOUND"
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, options] = fetchMock.mock.calls[1];
      expect(url).toBe(
        "https://api-m.sandbox.paypal.com/v2/checkout/orders/FICTIONAL-SAVED-ORDER"
      );
      expect(options.method).toBe("GET");
    }
  );

  it("does not treat an unknown 404 response as confirmed missing", async () => {
    mockLookup(404, "UNEXPECTED_GATEWAY_BODY");
    await expect(getPaypalOrder("FICTIONAL-SAVED-ORDER")).rejects.toThrow(
      "PAYPAL_PROVIDER_REJECTED"
    );
  });

  it("does not treat a 500 RESOURCE_NOT_FOUND as permission to reissue", async () => {
    mockLookup(500, "RESOURCE_NOT_FOUND");
    await expect(getPaypalOrder("FICTIONAL-SAVED-ORDER")).rejects.toThrow(
      "PAYPAL_PROVIDER_REJECTED"
    );
  });

  it("keeps a transport failure uncertain and does not leak raw errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fictional-token" }), {
          status: 200,
        })
      )
      .mockRejectedValueOnce(
        new Error("network trace with private provider details")
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPaypalOrder("FICTIONAL-SAVED-ORDER")).rejects.toThrow(
      /^PAYPAL_UNAVAILABLE$/
    );
  });

  it("classifies only an exact PayPal 422 payer-action issue without leaking its payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fictional-token" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "UNPROCESSABLE_ENTITY",
            details: [
              {
                issue: "PAYER_ACTION_REQUIRED",
                description: "private provider detail",
                links: [{ href: "https://attacker.example/action" }],
              },
            ],
          }),
          { status: 422 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(capturePaypalOrder("FICTIONAL-SAVED-ORDER")).rejects.toThrow(
      /^PAYPAL_PAYER_ACTION_REQUIRED$/
    );
    expect(paypalPaymentStatus({ status: "PAYER_ACTION_REQUIRED" })).toBe(
      "PAYER_ACTION_REQUIRED"
    );
    expect(recoveryStatus({ status: "PAYER_ACTION_REQUIRED" })).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unrecognized provider status unknown rather than retryable or paid", () => {
    expect(paypalPaymentStatus({ status: "SOMETHING_NEW" })).toBe("UNKNOWN");
    expect(recoveryStatus({ status: "SOMETHING_NEW" })).toBe("unknown");
  });

  it.each([
    ["SUCCESS", true],
    ["FAILURE", false],
    ["", false],
  ] as const)(
    "verifies webhook signature only from PayPal status %s",
    async (verificationStatus, expected) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "fictional-token" }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ verification_status: verificationStatus }),
            {
              status: 200,
            }
          )
        );
      vi.stubGlobal("fetch", fetchMock);
      const event = { id: "event-1", resource: { status: "COMPLETED" } };
      const eventJson = JSON.stringify(event, null, 2);

      await expect(
        verifyPaypalWebhookSignature({
          authAlgo: "SHA256withRSA",
          certUrl: "https://api-m.sandbox.paypal.com/cert",
          transmissionId: "transmission-1",
          transmissionSig: "signature-1",
          transmissionTime: "2026-11-03T00:00:00Z",
          webhookId: "webhook-1",
          eventJson,
        })
      ).resolves.toBe(expected);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, options] = fetchMock.mock.calls[1];
      expect(url).toBe(
        "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature"
      );
      expect(options.method).toBe("POST");
      expect(String(options.body)).toContain(`"webhook_event":${eventJson}}`);
      expect(JSON.parse(String(options.body))).toEqual({
        auth_algo: "SHA256withRSA",
        cert_url: "https://api-m.sandbox.paypal.com/cert",
        transmission_id: "transmission-1",
        transmission_sig: "signature-1",
        transmission_time: "2026-11-03T00:00:00Z",
        webhook_id: "webhook-1",
        webhook_event: event,
      });
    }
  );

  it.each([
    "http://api.sandbox.paypal.com/cert",
    "https://api-m.paypal.com/cert",
    "https://api.sandbox.paypal.com.attacker.example/cert",
    "https://api.sandbox.paypal.com:8443/cert",
    "https://user@api.sandbox.paypal.com/cert",
  ])(
    "rejects unsafe webhook cert %s before requesting OAuth",
    async certUrl => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        verifyPaypalWebhookSignature({
          authAlgo: "SHA256withRSA",
          certUrl,
          transmissionId: "test",
          transmissionSig: "test",
          transmissionTime: "2026-11-03T00:00:00Z",
          webhookId: "webhook-1",
          eventJson: "{}",
        })
      ).rejects.toThrow("PAYPAL_INVALID_WEBHOOK_CERT");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("does not leak verification provider errors or treat them as successful", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fictional-token" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "PRIVATE_PROVIDER_DETAIL" }), {
          status: 500,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      verifyPaypalWebhookSignature({
        authAlgo: "SHA256withRSA",
        certUrl: "https://api.sandbox.paypal.com/cert",
        transmissionId: "test",
        transmissionSig: "test",
        transmissionTime: "2026-11-03T00:00:00Z",
        webhookId: "webhook-1",
        eventJson: "{}",
      })
    ).rejects.toThrow(/^PAYPAL_PROVIDER_REJECTED$/);
  });
});
