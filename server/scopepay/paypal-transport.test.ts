import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPaypalOrder } from "./paypal";

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
});
