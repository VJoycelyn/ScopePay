import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const CLIENT_TOKEN = "c".repeat(40);
const OWNER_TOKEN = "o".repeat(40);

const mocks = vi.hoisted(() => {
  const state: any = {
    workspaceRow: null,
    token: null,
    orders: new Map<string, any>(),
    providers: new Map<string, Record<string, unknown>>(),
    providerErrors: new Map<string, string>(),
    createCalls: [] as Array<Record<string, unknown>>,
    captureCalls: [] as string[],
    idCounter: 0,
    capabilityCounter: 0,
    capturePayload: null as Record<string, unknown> | null,
  };

  const refFor = (docId: string, version: number) =>
    `project-1:${docId}:${version}`;

  const documentFor = (
    kind: "quote" | "change",
    status = "accepted",
    version = 1
  ) => ({
    id: `${kind}-1`,
    kind,
    title: kind === "quote" ? "Website quote" : "Website change order",
    scopeSummary: "A bounded deliverable",
    deliverables: [
      {
        id: `${kind}-deliverable-1`,
        title: "Implementation",
        description: "Implementation work",
        hours: 10,
        priceCents: 125000,
      },
    ],
    exclusions: [],
    timeline: "Two weeks",
    revisionLimit: "One pass",
    currency: "USD",
    totalCents: 125000,
    status,
    version,
    acceptedAt: status === "accepted" ? "2026-01-01T00:00:00.000Z" : undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: kind === "quote" ? "manual" : "manual",
  });

  const reset = (
    kind: "quote" | "change" = "quote",
    status = "accepted",
    version = 1
  ) => {
    const document = documentFor(kind, status, version);
    const quote =
      kind === "quote" ? document : documentFor("quote", "published", 1);
    const project = {
      id: "project-1",
      name: "Test project",
      clientName: "Test client",
      brief: "Test brief",
      hourlyRateCents: 12500,
      budgetCents: null,
      quote,
      changes: kind === "change" ? [document] : [],
      analyses: [],
      audit: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      isSample: false,
    };
    state.workspaceRow = {
      id: "workspace-1",
      token_hash: `hash:${OWNER_TOKEN}`,
      documents: { projects: [project] },
    };
    state.token = {
      token_hash: `hash:${CLIENT_TOKEN}`,
      workspace_id: "workspace-1",
      project_id: "project-1",
      document_id: document.id,
      document_version: version,
      revoked: 0,
    };
    state.orders.clear();
    state.providers.clear();
    state.providerErrors.clear();
    state.createCalls.length = 0;
    state.captureCalls.length = 0;
    state.capturePayload = null;
    state.idCounter = 0;
    state.capabilityCounter = 0;
    db.withTokenLock.mockClear();
    db.withWorkspaceLock.mockClear();
    db.insertClientToken.mockClear();
    db.updateOrder.mockClear();
    paypal.createPaypalOrder.mockClear();
    paypal.getPaypalOrder.mockClear();
    paypal.capturePaypalOrder.mockClear();
  };

  const seedOrder = (overrides: Record<string, unknown> = {}) => {
    const documentId = state.token.document_id;
    const version = state.token.document_version;
    const order = {
      id: "local-order-1",
      workspace_id: "workspace-1",
      project_id: "project-1",
      document_id: documentId,
      document_version: version,
      amount_cents: 125000,
      currency: "USD",
      paypal_order_id: "paypal-order-1",
      request_id: "request-1",
      capture_id: null,
      status: "created",
      updated_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
    state.orders.set(order.id, order);
    return order;
  };

  const providerPayload = (
    id: string,
    status: string,
    documentId = state.token?.document_id,
    version = state.token?.document_version,
    amountCents = 125000,
    captureStatus?: string,
    captureId = "capture-1"
  ): Record<string, unknown> => {
    const unit: Record<string, unknown> = {
      reference_id: refFor(documentId, version),
      custom_id: refFor(documentId, version),
      amount: { currency_code: "USD", value: (amountCents / 100).toFixed(2) },
    };
    if (captureStatus) {
      unit.payments = {
        captures: [
          {
            id: captureId,
            status: captureStatus,
            amount: {
              currency_code: "USD",
              value: (amountCents / 100).toFixed(2),
            },
          },
        ],
      };
    }
    return { id, status, purchase_units: [unit] };
  };

  const paymentStatus = (payload: Record<string, unknown>) => {
    const units = Array.isArray(payload.purchase_units)
      ? payload.purchase_units
      : [];
    const captures = units.flatMap((unit: any) =>
      Array.isArray(unit?.payments?.captures) ? unit.payments.captures : []
    );
    const statuses = captures.map((capture: any) =>
      String(capture.status || "").toUpperCase()
    );
    const status = String(payload.status || "").toUpperCase();
    if (statuses.includes("COMPLETED") || status === "COMPLETED")
      return "COMPLETED";
    if (statuses.includes("PENDING") || status === "PENDING") return "PENDING";
    if (["VOIDED", "DENIED", "FAILED"].includes(status)) return status;
    if (["APPROVED", "CREATED"].includes(status)) return status;
    return "UNKNOWN";
  };

  const paypal = {
    paypalConfigured: vi.fn(() => true),
    paypalClientId: vi.fn(() => "test-client"),
    createPaypalOrder: vi.fn(async (args: any) => {
      state.createCalls.push(args);
      const id = `paypal-created-${state.createCalls.length}`;
      state.providers.set(
        id,
        providerPayload(
          id,
          "CREATED",
          args.localReference.split(":")[1],
          Number(args.localReference.split(":")[2]),
          args.amountCents
        )
      );
      return {
        id,
        approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
      };
    }),
    getPaypalOrder: vi.fn(async (id: string) => {
      const error = state.providerErrors.get(id);
      if (error) throw new Error(error);
      const payload = state.providers.get(id);
      if (!payload) throw new Error("PAYPAL_ORDER_NOT_FOUND");
      return payload;
    }),
    capturePaypalOrder: vi.fn(async (id: string) => {
      state.captureCalls.push(id);
      if (!state.capturePayload) throw new Error("PAYPAL_PROVIDER_REJECTED");
      return state.capturePayload;
    }),
    extractApprovalUrl: vi.fn((payload: Record<string, unknown>) =>
      typeof payload.id === "string"
        ? `https://www.sandbox.paypal.com/checkoutnow?token=${payload.id}`
        : null
    ),
    paypalOrderMatches: vi.fn((payload: Record<string, any>, expected: any) => {
      if (payload.id !== expected.paypalOrderId) return false;
      const units = Array.isArray(payload.purchase_units)
        ? payload.purchase_units
        : [];
      if (units.length !== 1) return false;
      return units.some((unit: any) => {
        const refs = [unit.reference_id, unit.custom_id].filter(Boolean);
        return (
          refs.length > 0 &&
          refs.every(ref => ref === expected.reference) &&
          unit.amount?.currency_code === "USD" &&
          Number(unit.amount?.value) * 100 === expected.amountCents
        );
      });
    }),
    paypalPaymentStatus: vi.fn(paymentStatus),
    completedCapture: vi.fn((payload: Record<string, any>, expected: any) => {
      if (
        payload.id !== expected.paypalOrderId ||
        payload.status !== "COMPLETED"
      )
        return null;
      const units = Array.isArray(payload.purchase_units)
        ? payload.purchase_units
        : [];
      const unit = units.find(
        (item: any) =>
          item.reference_id === expected.reference ||
          item.custom_id === expected.reference
      );
      const capture = unit?.payments?.captures?.find(
        (item: any) => item.status === "COMPLETED"
      );
      if (
        !capture ||
        typeof capture.id !== "string" ||
        capture.amount?.currency_code !== "USD"
      )
        return null;
      if (Number(capture.amount.value) * 100 !== expected.amountCents)
        return null;
      return { captureId: capture.id };
    }),
    recoveryStatus: vi.fn((payload: Record<string, unknown>) => {
      const status = paymentStatus(payload);
      if (status === "COMPLETED") return "completed";
      if (status === "PENDING") return "pending";
      if (["VOIDED", "DENIED", "FAILED"].includes(status)) return "retryable";
      return "unknown";
    }),
  };

  const connection = {
    execute: vi.fn(async (sql: string, params?: any[]) => {
      if (sql.startsWith("INSERT INTO scopepay_orders")) {
        const [
          id,
          workspaceId,
          projectId,
          documentId,
          version,
          amountCents,
          requestId,
        ] = params || [];
        state.orders.set(id, {
          id,
          workspace_id: workspaceId,
          project_id: projectId,
          document_id: documentId,
          document_version: version,
          amount_cents: amountCents,
          currency: "USD",
          paypal_order_id: null,
          request_id: requestId,
          capture_id: null,
          status: "creating",
          updated_at: "2026-01-01T00:00:00.000Z",
        });
      }
      return [[], []];
    }),
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(() => undefined),
  };

  const db = {
    databaseReady: vi.fn(async () => false),
    getClientToken: vi.fn(async (hash: string) =>
      hash === state.token?.token_hash ? state.token : null
    ),
    getScopePayPool: vi.fn(() => ({ getConnection: async () => connection })),
    hashCapability: vi.fn((value: string) => `hash:${value}`),
    insertClientToken: vi.fn(async () => undefined),
    insertWorkspace: vi.fn(async () => undefined),
    loadWorkspaceById: vi.fn(async (id: string) =>
      id === state.workspaceRow?.id ? state.workspaceRow : null
    ),
    loadWorkspaceByTokenHash: vi.fn(async (hash: string) =>
      hash === state.workspaceRow?.token_hash ? state.workspaceRow : null
    ),
    newCapability: vi.fn(() => `n${++state.capabilityCounter}`.padEnd(40, "x")),
    newId: vi.fn(() => `generated-${++state.idCounter}`),
    parseWorkspace: vi.fn((value: unknown) =>
      typeof value === "string" ? JSON.parse(value) : value
    ),
    projectById: vi.fn((workspace: any, id: string) => {
      const project = workspace.projects.find((item: any) => item.id === id);
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      return project;
    }),
    revokeDocumentTokens: vi.fn(async () => undefined),
    withTokenLock: vi.fn(async (hash: string, work: any) => {
      if (hash !== state.token?.token_hash)
        throw new Error("CLIENT_TOKEN_NOT_FOUND");
      const result = await work(
        connection,
        state.workspaceRow,
        state.workspaceRow.documents,
        state.token
      );
      if (result.workspace) state.workspaceRow.documents = result.workspace;
      return result.value;
    }),
    withWorkspaceLock: vi.fn(async (id: string, work: any) => {
      if (id !== state.workspaceRow?.id) throw new Error("WORKSPACE_NOT_FOUND");
      const result = await work(connection, state.workspaceRow.documents);
      if (result.workspace) state.workspaceRow.documents = result.workspace;
      return result.value;
    }),
    findDocumentOrder: vi.fn(
      async (
        _connection: unknown,
        workspaceId: string,
        documentId: string,
        version: number
      ) =>
        [...state.orders.values()].find(
          (order: any) =>
            order.workspace_id === workspaceId &&
            order.document_id === documentId &&
            order.document_version === version
        ) || null
    ),
    findOrder: vi.fn(
      async (_connection: unknown, workspaceId: string, orderId: string) =>
        [...state.orders.values()].find(
          (order: any) =>
            order.workspace_id === workspaceId &&
            (order.id === orderId || order.paypal_order_id === orderId)
        ) || null
    ),
    updateOrder: vi.fn(
      async (_connection: unknown, orderId: string, values: any) => {
        const order = state.orders.get(orderId);
        if (!order) throw new Error("ORDER_NOT_FOUND");
        if (values.status) order.status = values.status;
        if (values.paypalOrderId !== undefined)
          order.paypal_order_id = values.paypalOrderId;
        if (values.captureId !== undefined) order.capture_id = values.captureId;
        if (values.requestId) order.request_id = values.requestId;
      }
    ),
  };

  return { state, db, paypal, reset, seedOrder, providerPayload };
});

vi.mock("./db", () => mocks.db);
vi.mock("./paypal", () => mocks.paypal);

import { registerScopePayRoutes } from "./routes";

let server: any;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerScopePayRoutes(app);
  server = await new Promise<any>(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function post(path: string, body: unknown, owner = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(owner ? { "x-workspace-token": OWNER_TOKEN } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function documentFromState(): any {
  const project = mocks.state.workspaceRow.documents.projects[0];
  return project.quote.id === mocks.state.token.document_id
    ? project.quote
    : project.changes.find(
        (item: any) => item.id === mocks.state.token.document_id
      );
}

function snapshot() {
  return {
    workspace: JSON.stringify(mocks.state.workspaceRow.documents),
    orders: JSON.stringify([...mocks.state.orders.values()]),
  };
}

describe("ScopePay accepted-version checkout routes", () => {
  it.each(["quote", "change"] as const)(
    "creates and reuses one exact USD 1250 order for an accepted %s",
    async kind => {
      mocks.reset(kind);
      const first = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
        version: 1,
      });
      expect(first.status).toBe(201);
      expect(first.body.id).toBe("paypal-created-1");
      expect(first.body.approvalUrl).toContain("paypal-created-1");
      expect(mocks.state.createCalls).toHaveLength(1);
      expect(mocks.state.createCalls[0].amountCents).toBe(125000);
      const returnUrl = new URL(mocks.state.createCalls[0].returnUrl);
      const cancelUrl = new URL(mocks.state.createCalls[0].cancelUrl);
      expect(returnUrl.protocol).toBe("https:");
      expect(returnUrl.origin).toBe(
        process.env.SCOPEPAY_PUBLIC_ORIGIN
          ? new URL(process.env.SCOPEPAY_PUBLIC_ORIGIN).origin
          : "https://scopepay.manus.space"
      );
      expect(returnUrl.pathname).toBe(`/client/${CLIENT_TOKEN}`);
      expect(returnUrl.searchParams.get("paypal")).toBe("return");
      expect(cancelUrl.origin).toBe(returnUrl.origin);
      expect(cancelUrl.pathname).toBe(`/client/${CLIENT_TOKEN}`);
      expect(cancelUrl.searchParams.get("paypal")).toBe("cancel");
      expect(mocks.state.orders.values().next().value.amount_cents).toBe(
        125000
      );

      const second = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
        version: 1,
      });
      expect(second.status).toBe(201);
      expect(second.body.id).toBe("paypal-created-1");
      expect(mocks.state.createCalls).toHaveLength(1);
      expect(mocks.paypal.getPaypalOrder).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects unaccepted documents before creating an order", async () => {
    mocks.reset("quote", "published");
    const result = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
      version: 1,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("ACCEPTANCE_REQUIRED");
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(mocks.state.orders).toHaveLength(0);
  });

  it("rejects a superseded review version", async () => {
    mocks.reset("quote", "accepted", 2);
    mocks.state.token.document_version = 1;
    const result = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
      version: 1,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("VERSION_MISMATCH");
    expect(mocks.state.createCalls).toHaveLength(0);
  });

  it("rejects an existing order whose stored amount is wrong", async () => {
    mocks.reset();
    const order = mocks.seedOrder({ amount_cents: 124900 });
    const before = snapshot();
    const result = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
      version: 1,
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("PAYMENT_MISMATCH");
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(order.amount_cents).toBe(124900);
    expect(snapshot()).toEqual(before);
  });

  it("returns PAYPAL_ORDER_NOT_FOUND for a missing provider order without reissuing", async () => {
    mocks.reset();
    const order = mocks.seedOrder({ paypal_order_id: "paypal-missing" });
    mocks.state.providerErrors.set("paypal-missing", "PAYPAL_ORDER_NOT_FOUND");
    const result = await post(`/api/scopepay/client/${CLIENT_TOKEN}/orders`, {
      version: 1,
    });
    expect(result.status).toBe(404);
    expect(result.body.code).toBe("PAYPAL_ORDER_NOT_FOUND");
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(order.paypal_order_id).toBe("paypal-missing");
    expect(order.status).toBe("created");
  });

  it("captures an APPROVED matching order once and finalizes only a verified response", async () => {
    mocks.reset();
    const order = mocks.seedOrder({ paypal_order_id: "paypal-approved" });
    mocks.state.providers.set(
      "paypal-approved",
      mocks.providerPayload("paypal-approved", "APPROVED")
    );
    mocks.state.capturePayload = mocks.providerPayload(
      "paypal-approved",
      "COMPLETED",
      order.document_id,
      order.document_version,
      125000,
      "COMPLETED",
      "capture-approved"
    );
    const result = await post(
      `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
      {}
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: "paid",
      captureId: "capture-approved",
      amountCents: 125000,
    });
    expect(mocks.state.captureCalls).toEqual(["paypal-approved"]);
    expect(order.status).toBe("captured");
    expect(order.capture_id).toBe("capture-approved");
    expect(documentFromState().status).toBe("paid");
  });

  it("finalizes an existing COMPLETED response without POSTing capture", async () => {
    mocks.reset();
    const order = mocks.seedOrder({ paypal_order_id: "paypal-completed" });
    mocks.state.providers.set(
      "paypal-completed",
      mocks.providerPayload(
        "paypal-completed",
        "COMPLETED",
        order.document_id,
        order.document_version,
        125000,
        "COMPLETED",
        "capture-existing"
      )
    );
    const result = await post(
      `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
      {}
    );
    expect(result.status).toBe(200);
    expect(result.body.captureId).toBe("capture-existing");
    expect(mocks.state.captureCalls).toHaveLength(0);
    expect(order.status).toBe("captured");
    expect(documentFromState().status).toBe("paid");
  });

  it.each(["quote", "change"] as const)(
    "reloads a verified paid %s review with capture proof, without another capture or private fields",
    async kind => {
      mocks.reset(kind);
      const order = mocks.seedOrder({ paypal_order_id: "paypal-paid-review" });
      mocks.state.providers.set(
        "paypal-paid-review",
        mocks.providerPayload(
          "paypal-paid-review",
          "COMPLETED",
          order.document_id,
          order.document_version,
          order.amount_cents,
          "COMPLETED",
          "capture-paid-review"
        )
      );
      const reconciled = await fetch(
        `${baseUrl}/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}`
      );
      expect(reconciled.status).toBe(200);
      const first = await reconciled.json();
      expect(first.document).toMatchObject({
        status: "paid",
        paypalOrderId: "paypal-paid-review",
        paypalCaptureId: "capture-paid-review",
      });
      const reloaded = await fetch(
        `${baseUrl}/api/scopepay/client/${CLIENT_TOKEN}`
      );
      expect(reloaded.status).toBe(200);
      const next = await reloaded.json();
      expect(next.document).toMatchObject({
        status: "paid",
        paypalOrderId: "paypal-paid-review",
        paypalCaptureId: "capture-paid-review",
      });
      expect(next.document.clientToken).toBeUndefined();
      expect(next.audit).toBeUndefined();
      expect(next.brief).toBeUndefined();
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.state.createCalls).toHaveLength(0);
    }
  );

  it.each([
    ["PENDING", "PAYMENT_PENDING"],
    ["UNKNOWN", "PAYMENT_UNKNOWN"],
  ] as const)(
    "does not capture or reissue when provider state is %s",
    async (providerState, code) => {
      mocks.reset();
      const order = mocks.seedOrder({
        paypal_order_id: `paypal-${providerState.toLowerCase()}`,
      });
      mocks.state.providers.set(
        order.paypal_order_id,
        mocks.providerPayload(order.paypal_order_id, providerState)
      );
      const result = await post(
        `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
        {}
      );
      expect(result.body.code).toBe(code);
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(order.status).toBe("pending");
    }
  );

  it("does not issue a second capture while a fresh capture lease is active", async () => {
    mocks.reset();
    const order = mocks.seedOrder({
      status: "capturing",
      updated_at: new Date().toISOString(),
    });
    mocks.state.providers.set(
      order.paypal_order_id,
      mocks.providerPayload(order.paypal_order_id, "APPROVED")
    );
    const result = await post(
      `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
      {}
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("ORDER_PENDING");
    expect(mocks.state.captureCalls).toHaveLength(0);
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(order.status).toBe("capturing");
  });

  it.each([
    ["project_id", "other-project"],
    ["document_version", 99],
  ] as const)(
    "rejects capture when stored order %s does not match the client version",
    async (field, value) => {
      mocks.reset();
      const order = mocks.seedOrder({ [field]: value });
      const before = snapshot();
      const result = await post(
        `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
        {}
      );
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("ORDER_NOT_FOUND");
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(snapshot()).toEqual(before);
    }
  );

  it("requires explicit owner confirmation and recovery never captures", async () => {
    mocks.reset();
    const order = mocks.seedOrder({ paypal_order_id: "paypal-recover" });
    mocks.state.providers.set(
      "paypal-recover",
      mocks.providerPayload("paypal-recover", "VOIDED")
    );
    const missingConfirmation = await post(
      "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
      { version: 1 },
      true
    );
    expect(missingConfirmation.status).toBe(400);
    expect(missingConfirmation.body.code).toBe("INVALID_INPUT");
    expect(mocks.state.createCalls).toHaveLength(0);

    const recovered = await post(
      "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
      { version: 1, confirmedNoPayment: true },
      true
    );
    expect(recovered.status).toBe(201);
    expect(recovered.body.approvalUrl).toContain("paypal-created-1");
    expect(mocks.state.createCalls).toHaveLength(1);
    expect(mocks.state.captureCalls).toHaveLength(0);
    expect(order.status).toBe("created");
    expect(order.paypal_order_id).toBe("paypal-created-1");
  });

  it("does not replace an owner order while the provider reports pending", async () => {
    mocks.reset();
    const order = mocks.seedOrder({
      paypal_order_id: "paypal-pending-recovery",
    });
    mocks.state.providers.set(
      "paypal-pending-recovery",
      mocks.providerPayload("paypal-pending-recovery", "PENDING")
    );
    const before = snapshot();
    const result = await post(
      "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
      { version: 1, confirmedNoPayment: true },
      true
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("PAYMENT_PENDING");
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(mocks.state.captureCalls).toHaveLength(0);
    expect(snapshot()).toEqual(before);
    expect(order.paypal_order_id).toBe("paypal-pending-recovery");
  });

  it.each(["pending", "creating", "capturing"] as const)(
    "blocks owner reissue when the local order is already %s",
    async status => {
      vi.setSystemTime(new Date(Date.now() + 60_000));
      mocks.reset();
      const order = mocks.seedOrder({ status });
      const before = snapshot();
      const result = await post(
        "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
        { version: 1, confirmedNoPayment: true },
        true
      );
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("PAYMENT_PENDING");
      expect(mocks.paypal.getPaypalOrder).toHaveBeenCalledTimes(0);
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.db.insertClientToken).toHaveBeenCalledTimes(0);
      expect(snapshot()).toEqual(before);
      expect(order.status).toBe(status);
      expect(order.paypal_order_id).toBe("paypal-order-1");
    }
  );

  it("does not reissue a created local order without a provider id", async () => {
    vi.setSystemTime(new Date(Date.now() + 60_000));
    mocks.reset();
    const order = mocks.seedOrder({ paypal_order_id: null });
    const before = snapshot();
    const result = await post(
      "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
      { version: 1, confirmedNoPayment: true },
      true
    );
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("ORDER_PENDING");
    expect(mocks.paypal.getPaypalOrder).toHaveBeenCalledTimes(0);
    expect(mocks.state.createCalls).toHaveLength(0);
    expect(mocks.state.captureCalls).toHaveLength(0);
    expect(snapshot()).toEqual(before);
    expect(order.paypal_order_id).toBeNull();
  });

  it.each(["pending", "creating", "capturing"] as const)(
    "blocks owner reissue when the local order changes to %s during provider lookup",
    async status => {
      vi.setSystemTime(new Date(Date.now() + 60_000));
      mocks.reset();
      const order = mocks.seedOrder();
      const workspaceBefore = JSON.stringify(
        mocks.state.workspaceRow.documents
      );
      const requestIdBefore = order.request_id;
      mocks.paypal.getPaypalOrder.mockImplementationOnce(async id => {
        order.status = status;
        return mocks.providerPayload(
          id,
          "VOIDED",
          order.document_id,
          order.document_version,
          order.amount_cents
        );
      });
      const result = await post(
        "/api/scopepay/projects/project-1/documents/quote-1/orders/reissue",
        { version: 1, confirmedNoPayment: true },
        true
      );
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("ORDER_PENDING");
      expect(mocks.paypal.getPaypalOrder).toHaveBeenCalledTimes(1);
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.db.insertClientToken).toHaveBeenCalledTimes(0);
      expect(JSON.stringify(mocks.state.workspaceRow.documents)).toBe(
        workspaceBefore
      );
      expect(order.status).toBe(status);
      expect(order.request_id).toBe(requestIdBefore);
      expect(order.paypal_order_id).toBe("paypal-order-1");
    }
  );

  it.each([
    ["amount", "quote"],
    ["currency", "quote"],
    ["reference", "quote"],
    ["id", "quote"],
    ["amount", "change"],
    ["currency", "change"],
    ["reference", "change"],
    ["id", "change"],
  ] as const)(
    "rejects an approved %s-mismatched PayPal order before capture for a %s",
    async (mismatch, kind) => {
      vi.setSystemTime(new Date(Date.now() + 60_000));
      mocks.reset(kind);
      const order = mocks.seedOrder();
      const provider = mocks.providerPayload(
        order.paypal_order_id,
        "APPROVED",
        order.document_id,
        order.document_version,
        order.amount_cents
      ) as any;
      const unit = provider.purchase_units[0];
      if (mismatch === "amount") unit.amount.value = "1249.99";
      if (mismatch === "currency") unit.amount.currency_code = "EUR";
      if (mismatch === "reference") unit.reference_id = "other:document:1";
      if (mismatch === "id") provider.id = "paypal-other";
      mocks.state.providers.set(order.paypal_order_id, provider);
      const before = snapshot();
      const result = await post(
        `/api/scopepay/client/${CLIENT_TOKEN}/orders/${order.id}/capture`,
        {}
      );
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("PAYMENT_MISMATCH");
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(snapshot()).toEqual(before);
      expect(order.status).toBe("created");
      expect(order.capture_id).toBeNull();
    }
  );
});

describe("ScopePay Sandbox mock-company scenarios", () => {
  it.each([
    ["northline-coffee", "Northline Coffee", 1250],
    ["caribbean-scribbles", "Caribbean Scribbles Publishing", 1875],
  ] as const)(
    "creates a separate draft for %s and preserves existing Northline version 2",
    async (scenario, clientName, expectedCents) => {
      mocks.reset();
      const existing = mocks.state.workspaceRow.documents.projects[0];
      existing.id = "existing-northline-project";
      existing.name = "Northline Coffee launch page";
      existing.clientName = "Northline Coffee";
      existing.quote.id = "northline-v2-document";
      existing.quote.version = 2;
      existing.quote.status = "accepted";
      existing.quote.totalCents = 1250;
      existing.quote.deliverables[0].priceCents = 1250;
      existing.quote.acceptedAt = "2026-10-20T00:00:00.000Z";
      existing.quote.paypalOrderId = "saved-northline-v2-order";
      const existingSnapshot = JSON.stringify(existing);
      mocks.state.orders.set("northline-v2-local-order", {
        id: "northline-v2-local-order",
        workspace_id: "workspace-1",
        project_id: existing.id,
        document_id: existing.quote.id,
        document_version: 2,
        amount_cents: 1250,
        currency: "USD",
        paypal_order_id: "saved-northline-v2-order",
        request_id: "northline-v2-request",
        capture_id: null,
        status: "created",
        updated_at: "2026-10-20T00:00:00.000Z",
      });
      const existingOrders = JSON.stringify([...mocks.state.orders.values()]);

      const result = await post(
        "/api/scopepay/projects/sample",
        { scenario },
        true
      );

      expect(result.status).toBe(201);
      expect(result.body.clientName).toBe(clientName);
      expect(result.body.id).not.toBe(existing.id);
      expect(result.body.isSample).toBe(true);
      expect(result.body.quote).toMatchObject({
        status: "draft",
        source: "sample",
        version: 1,
        currency: "USD",
        totalCents: expectedCents,
      });
      expect(result.body.quote.acceptedAt).toBeUndefined();
      expect(result.body.quote.clientToken).toBeUndefined();
      expect(result.body.quote.paypalOrderId).toBeUndefined();
      expect(result.body.quote.paypalCaptureId).toBeUndefined();
      expect(result.body.audit[0].message).toContain(
        "no acceptance or payment"
      );
      expect(
        mocks.state.workspaceRow.documents.projects.find(
          (item: any) => item.id === existing.id
        )
      ).toEqual(JSON.parse(existingSnapshot));
      expect(JSON.stringify([...mocks.state.orders.values()])).toBe(
        existingOrders
      );
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(mocks.state.captureCalls).toHaveLength(0);
      expect(mocks.db.insertClientToken).not.toHaveBeenCalled();
      expect(mocks.paypal.createPaypalOrder).not.toHaveBeenCalled();
      expect(mocks.paypal.capturePaypalOrder).not.toHaveBeenCalled();
    }
  );

  it("keeps the legacy empty-body Harbor & Pine sample working as a draft", async () => {
    mocks.reset();
    const result = await post("/api/scopepay/projects/sample", undefined, true);
    expect(result.status).toBe(201);
    expect(result.body.clientName).toBe("Harbor & Pine");
    expect(result.body.quote.status).toBe("draft");
    expect(result.body.quote.totalCents).toBe(270000);
    expect(mocks.state.createCalls).toHaveLength(0);
  });

  it.each([
    ["unknown scenario IDs", { scenario: "another-merchant" }],
    [
      "unexpected request fields",
      { scenario: "northline-coffee", merchant: "separate-account" },
    ],
  ])(
    "rejects %s without changing workspace or payment state",
    async (_label, body) => {
      mocks.reset();
      const before = snapshot();
      const result = await post("/api/scopepay/projects/sample", body, true);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("INVALID_INPUT");
      expect(snapshot()).toEqual(before);
      expect(mocks.state.createCalls).toHaveLength(0);
      expect(mocks.state.captureCalls).toHaveLength(0);
    }
  );

  it("requires owner workspace access before creating any mock company draft", async () => {
    mocks.reset();
    const before = snapshot();
    const result = await post(
      "/api/scopepay/projects/sample",
      { scenario: "caribbean-scribbles" },
      false
    );
    expect(result.status).toBe(401);
    expect(snapshot()).toEqual(before);
  });
});
