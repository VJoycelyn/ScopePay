import express from "express";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifier = vi.hoisted(() => ({
  verify: vi.fn(),
}));
const paypal = vi.hoisted(() => ({
  configured: vi.fn(),
  getOrder: vi.fn(),
  orderMatches: vi.fn(),
  completed: vi.fn(),
}));
const database = vi.hoisted(() => ({
  execute: vi.fn(),
  findOrder: vi.fn(),
  lock: vi.fn(),
  newId: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock("./paypal", () => ({
  paypalConfigured: paypal.configured,
  getPaypalOrder: paypal.getOrder,
  paypalOrderMatches: paypal.orderMatches,
  completedCapture: paypal.completed,
  verifyPaypalWebhookSignature: verifier.verify,
}));
vi.mock("./db", () => ({
  getScopePayPool: () => ({ execute: database.execute }),
  findOrder: database.findOrder,
  withWorkspaceLock: database.lock,
  newId: database.newId,
  updateOrder: database.updateOrder,
}));

import { registerPaypalWebhookRoutes } from "./paypal-webhook";

type TestDocument = {
  id: string;
  kind: "quote" | "change";
  version: number;
  totalCents: number;
  currency: "USD";
  status: "accepted" | "payment_pending" | "paid";
  acceptedAt?: string;
  paidAt?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
};

type TestState = {
  order: Record<string, unknown>;
  workspace: {
    projects: Array<{
      id: string;
      quote: TestDocument;
      changes: TestDocument[];
      audit: Array<Record<string, string>>;
    }>;
  };
  provider: Record<string, unknown>;
  event: Record<string, unknown>;
};

const orderId = "ORDER-ABC-123";
const captureId = "CAPTURE-ABC-123";
const workspaceId = "workspace-1";
const projectId = "project-1";
const documentId = "document-1";
const reference = `${projectId}:${documentId}:2`;

function makeDocument(
  status: TestDocument["status"] = "payment_pending",
  kind: "quote" | "change" = "quote"
): TestDocument {
  return {
    id: documentId,
    kind,
    version: 2,
    totalCents: 1250,
    currency: "USD",
    status,
    acceptedAt: "2026-11-03T00:00:00.000Z",
    paypalOrderId: orderId,
    ...(status === "paid"
      ? { paypalCaptureId: captureId, paidAt: "2026-11-03T00:01:00.000Z" }
      : {}),
  };
}

function makeState(
  status: TestDocument["status"] = "payment_pending",
  kind: "quote" | "change" = "quote"
): TestState {
  const document = makeDocument(status, kind);
  const project = {
    id: projectId,
    quote:
      kind === "change"
        ? { ...makeDocument("paid"), id: "base-quote" }
        : document,
    changes: kind === "change" ? [document] : [],
    audit: [],
  };
  return {
    order: {
      id: "local-order-1",
      workspace_id: workspaceId,
      project_id: projectId,
      document_id: documentId,
      document_version: 2,
      amount_cents: 1250,
      currency: "USD",
      paypal_order_id: orderId,
      request_id: "request-1",
      capture_id: status === "paid" ? captureId : null,
      status: status === "paid" ? "captured" : "pending",
    },
    workspace: { projects: [project] },
    provider: {
      id: orderId,
      status: "COMPLETED",
      purchase_units: [
        {
          reference_id: reference,
          custom_id: reference,
          amount: { currency_code: "USD", value: "12.50" },
          payments: {
            captures: [
              {
                id: captureId,
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "12.50" },
              },
            ],
          },
        },
      ],
    },
    event: {
      id: "WH-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: captureId,
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "12.50" },
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    },
  };
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url":
      "https://api-m.sandbox.paypal.com/v1/notifications/certs/test",
    "paypal-transmission-id": "transmission-1",
    "paypal-transmission-sig": "signature-1",
    "paypal-transmission-time": "2026-11-03T01:00:00Z",
  };
}

function request(
  body: unknown,
  options: { raw?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  return new Promise((resolve, reject) => {
    const app = express();
    registerPaypalWebhookRoutes(app);
    // Match boot order: the route-local cap must win over the global parser.
    app.use(express.json({ limit: "50mb" }));
    const server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("no address"));
      const payload = options.raw ?? JSON.stringify(body);
      const req = http.request(
        {
          port: address.port,
          method: "POST",
          path: "/api/scopepay/paypal/webhook",
          headers: {
            ...headers(),
            ...(options.headers ?? {}),
            "content-length": Buffer.byteLength(payload),
          },
        },
        response => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", chunk => (text += chunk));
          response.on("end", () => {
            server.close();
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(text) as Record<string, unknown>;
            } catch {
              /* Keep parser-error assertions generic. */
            }
            resolve({ status: response.statusCode ?? 0, body: parsed, text });
          });
        }
      );
      req.on("error", reject);
      req.end(payload);
    });
  });
}

let state: TestState;
let lockTail: Promise<void>;

beforeEach(() => {
  process.env.PAYPAL_WEBHOOK_ID = "webhook-1";
  process.env.PAYPAL_CLIENT_ID = "client-1";
  process.env.PAYPAL_CLIENT_SECRET = "secret-1";
  state = makeState();
  lockTail = Promise.resolve();
  paypal.configured.mockReturnValue(true);
  verifier.verify.mockResolvedValue(true);
  paypal.getOrder.mockImplementation(async () => state.provider);
  paypal.orderMatches.mockReturnValue(true);
  paypal.completed.mockReturnValue({ captureId });
  database.execute.mockResolvedValue([[state.order], []]);
  database.findOrder.mockImplementation(async () => ({ ...state.order }));
  database.newId.mockReturnValue("audit-id-1");
  database.updateOrder.mockImplementation(
    async (
      _connection: unknown,
      _id: string,
      values: Record<string, unknown>
    ) => {
      state.order = {
        ...state.order,
        ...(values.status ? { status: values.status } : {}),
        ...(values.captureId ? { capture_id: values.captureId } : {}),
      };
    }
  );
  database.lock.mockImplementation(
    async (_workspaceId: string, work: Function) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>(resolve => (release = resolve));
      await previous;
      try {
        const result = await work({}, state.workspace);
        state.workspace = result.workspace;
        return result.value;
      } finally {
        release();
      }
    }
  );
});

afterEach(() => {
  delete process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  vi.clearAllMocks();
});

describe("ScopePay PayPal webhook", () => {
  it("fails closed when the webhook id or PayPal configuration is missing", async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    const result = await request(state.event);
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("WEBHOOK_NOT_CONFIGURED");
    expect(verifier.verify).not.toHaveBeenCalled();

    process.env.PAYPAL_WEBHOOK_ID = "webhook-1";
    paypal.configured.mockReturnValue(false);
    const second = await request(state.event);
    expect(second.status).toBe(503);
    expect(second.body.code).toBe("WEBHOOK_NOT_CONFIGURED");
  });

  it("rejects malformed JSON and missing or unsafe verification headers generically", async () => {
    const malformed = await request({}, { raw: "{not-json" });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_JSON");
    expect(malformed.text).not.toContain("not-json");

    const missing = await request(state.event, {
      headers: { "paypal-transmission-sig": "" },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("INVALID_WEBHOOK");
    expect(verifier.verify).not.toHaveBeenCalled();

    const unsafe = await request(state.event, {
      headers: { "paypal-cert-url": "https://evil.example/cert" },
    });
    expect(unsafe.status).toBe(400);
    expect(unsafe.body.code).toBe("INVALID_WEBHOOK");
  });

  it("rejects oversized bodies before verification despite the later global parser", async () => {
    const oversized = await request({
      ...state.event,
      padding: "x".repeat(129 * 1024),
    });
    expect(oversized.status).toBe(413);
    expect(oversized.body.code).toBe("INVALID_JSON");
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("preserves raw JSON and accepts PayPal's documented alternative Sandbox cert host", async () => {
    const raw = JSON.stringify(state.event, null, 2);
    const result = await request(state.event, {
      raw,
      headers: {
        "paypal-cert-url":
          "https://api.sandbox.paypal.com/v1/notifications/certs/test",
      },
    });
    expect(result.status).toBe(200);
    expect(verifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({ eventJson: raw })
    );
  });

  it.each([
    "https://api-m.paypal.com/v1/notifications/certs/test",
    "https://api.sandbox.paypal.com:8443/cert",
    "https://user@api.sandbox.paypal.com/cert",
  ])(
    "rejects a non-Sandbox-origin cert URL %s without provider or DB calls",
    async certUrl => {
      const result = await request(state.event, {
        headers: { "paypal-cert-url": certUrl },
      });
      expect(result.status).toBe(400);
      expect(verifier.verify).not.toHaveBeenCalled();
      expect(database.execute).not.toHaveBeenCalled();
    }
  );

  it("distinguishes invalid signatures from unavailable verification", async () => {
    verifier.verify.mockResolvedValueOnce(false);
    const invalid = await request(state.event);
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(database.execute).not.toHaveBeenCalled();

    verifier.verify.mockRejectedValueOnce(new Error("provider unavailable"));
    const unavailable = await request(state.event);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe("WEBHOOK_VERIFICATION_UNAVAILABLE");
  });

  it("ignores authenticated unsupported events without reading or mutating payment state", async () => {
    const unsupported = {
      ...state.event,
      event_type: "PAYMENT.CAPTURE.PENDING",
      resource: {},
    };
    const result = await request(unsupported);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "ignored" });
    expect(database.execute).not.toHaveBeenCalled();
    expect(paypal.getOrder).not.toHaveBeenCalled();
  });

  it("ignores an authenticated completed event for an unknown saved order", async () => {
    database.execute.mockResolvedValueOnce([[], []]);
    const result = await request(state.event);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "ignored" });
    expect(paypal.getOrder).not.toHaveBeenCalled();
    expect(database.lock).not.toHaveBeenCalled();
  });

  it("returns safe conflicts for event/provider mismatches without mutation", async () => {
    const eventMismatch = {
      ...state.event,
      resource: {
        ...(state.event.resource as Record<string, unknown>),
        amount: { currency_code: "USD", value: "12.51" },
      },
    };
    const mismatch = await request(eventMismatch);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe("WEBHOOK_CONFLICT");
    expect(database.lock).not.toHaveBeenCalled();

    paypal.orderMatches.mockReturnValueOnce(false);
    const providerMismatch = await request(state.event);
    expect(providerMismatch.status).toBe(409);
    expect(providerMismatch.body.code).toBe("WEBHOOK_CONFLICT");
    expect(database.updateOrder).not.toHaveBeenCalled();
  });

  it("does not trust a signed completed event when independent GET has no completed capture", async () => {
    paypal.completed.mockReturnValueOnce(null);
    const result = await request(state.event);
    expect(result.status).toBe(409);
    expect(database.updateOrder).not.toHaveBeenCalled();
    expect(state.workspace.projects[0].quote.status).toBe("payment_pending");
  });

  it("rechecks immutable saved terms under lock before any payment mutation", async () => {
    database.findOrder.mockImplementationOnce(async () => ({
      ...state.order,
      document_version: 99,
    }));
    const result = await request(state.event);
    expect(result.status).toBe(409);
    expect(database.updateOrder).not.toHaveBeenCalled();
    expect(state.workspace.projects[0].audit).toHaveLength(0);
  });

  it("finalizes an independently verified quote and records exactly one audit event", async () => {
    const result = await request(state.event);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "processed" });
    expect(state.workspace.projects[0].quote.status).toBe("paid");
    expect(state.workspace.projects[0].quote.paypalCaptureId).toBe(captureId);
    expect(state.order.status).toBe("captured");
    expect(state.order.capture_id).toBe(captureId);
    expect(state.workspace.projects[0].audit).toHaveLength(1);
    expect(state.workspace.projects[0].audit[0].type).toBe("payment_captured");
  });

  it("preserves change orders and treats the same capture as an idempotent duplicate", async () => {
    state = makeState("payment_pending", "change");
    database.execute.mockResolvedValue([[state.order], []]);
    const first = await request(state.event);
    expect(first.status).toBe(200);
    expect(state.workspace.projects[0].changes[0].status).toBe("paid");
    expect(state.workspace.projects[0].quote.id).toBe("base-quote");
    expect(state.workspace.projects[0].quote.status).toBe("paid");
    const auditCount = state.workspace.projects[0].audit.length;

    const duplicate = await request(state.event);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual({ status: "ignored" });
    expect(state.workspace.projects[0].audit).toHaveLength(auditCount);
    expect(state.order.capture_id).toBe(captureId);
  });

  it("serializes concurrent deliveries so only one transition and audit are committed", async () => {
    const [first, second] = await Promise.all([
      request(state.event),
      request(state.event),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    expect([first.body.status, second.body.status].sort()).toEqual([
      "ignored",
      "processed",
    ]);
    expect(state.workspace.projects[0].audit).toHaveLength(1);
    expect(state.order.status).toBe("captured");
  });
});
