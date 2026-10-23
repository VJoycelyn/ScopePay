import crypto from "node:crypto";

const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

export function paypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );
}

export function paypalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID?.trim() || null;
}

function requireCredentials(): { id: string; secret: string } {
  const id = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("PAYPAL_NOT_CONFIGURED");
  return { id, secret };
}

async function paypalFetch(
  path: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${PAYPAL_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.status === 404 && payload.name === "INVALID_RESOURCE_ID")
      throw new Error("PAYPAL_ORDER_NOT_FOUND");
    if (!response.ok) throw new Error("PAYPAL_PROVIDER_REJECTED");
    return payload;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "PAYPAL_PROVIDER_REJECTED" ||
        error.message === "PAYPAL_ORDER_NOT_FOUND")
    )
      throw error;
    throw new Error("PAYPAL_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(): Promise<string> {
  const credentials = requireCredentials();
  const encoded = Buffer.from(
    `${credentials.id}:${credentials.secret}`
  ).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Basic ${encoded}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const token = body.access_token;
    if (!response.ok || typeof token !== "string" || !token)
      throw new Error("PAYPAL_PROVIDER_REJECTED");
    return token;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "PAYPAL_PROVIDER_REJECTED" ||
        error.message === "PAYPAL_ORDER_NOT_FOUND")
    )
      throw error;
    throw new Error("PAYPAL_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(
  token: string,
  requestId?: string
): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
  };
}

export async function createPaypalOrder(args: {
  amountCents: number;
  localReference: string;
  requestId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approvalUrl: string | null }> {
  const token = await accessToken();
  const body = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    headers: authHeaders(token, args.requestId),
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.localReference,
          custom_id: args.localReference,
          amount: {
            currency_code: "USD",
            value: (args.amountCents / 100).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
          },
        },
      },
    }),
  });
  if (typeof body.id !== "string" || !body.id)
    throw new Error("PAYPAL_PROVIDER_REJECTED");
  return { id: body.id, approvalUrl: extractApprovalUrl(body) };
}

/** Only hand the browser a PayPal Sandbox approval URL from the provider. */
export function extractApprovalUrl(
  payload: Record<string, unknown>
): string | null {
  const links = Array.isArray(payload.links)
    ? (payload.links as Array<Record<string, unknown>>)
    : [];
  for (const link of links) {
    const href = typeof link.href === "string" ? link.href : "";
    const rel = typeof link.rel === "string" ? link.rel : "";
    if (rel !== "approve" && rel !== "payer-action") continue;
    try {
      const url = new URL(href);
      if (
        url.protocol === "https:" &&
        url.hostname === "www.sandbox.paypal.com" &&
        !url.username &&
        !url.password
      )
        return url.toString();
    } catch {
      /* Ignore malformed or non-allowlisted provider links. */
    }
  }
  return null;
}

export function captureRequestId(paypalOrderId: string): string {
  return crypto
    .createHash("sha256")
    .update(`scopepay:capture:${paypalOrderId}`, "utf8")
    .digest("hex")
    .slice(0, 38);
}

export async function capturePaypalOrder(
  paypalOrderId: string
): Promise<Record<string, unknown>> {
  const token = await accessToken();
  return paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        ...authHeaders(token, captureRequestId(paypalOrderId)),
        prefer: "return=representation",
      },
      body: "{}",
    }
  );
}

export async function getPaypalOrder(
  paypalOrderId: string
): Promise<Record<string, unknown>> {
  const token = await accessToken();
  return paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    }
  );
}

export function paypalOrderMatches(
  payload: Record<string, unknown>,
  expected: { amountCents: number; reference: string; paypalOrderId: string }
): boolean {
  if (typeof payload.id !== "string" || !payload.id) return false;
  if (payload.id !== expected.paypalOrderId) return false;
  const units = Array.isArray(payload.purchase_units)
    ? (payload.purchase_units as Array<Record<string, unknown>>)
    : [];
  if (units.length !== 1) return false;
  return units.some(unit => {
    const references = [unit.reference_id, unit.custom_id].filter(
      value => value !== undefined && value !== null
    );
    if (
      references.length === 0 ||
      references.some(reference => reference !== expected.reference)
    )
      return false;
    const amount = unit.amount as Record<string, unknown> | undefined;
    return (
      amount?.currency_code === "USD" &&
      amountCents(amount.value) === expected.amountCents
    );
  });
}

export type PaypalPaymentStatus =
  | "COMPLETED"
  | "PENDING"
  | "APPROVED"
  | "CREATED"
  | "VOIDED"
  | "DENIED"
  | "FAILED"
  | "UNKNOWN";

function normalizedStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function paypalPaymentStatus(
  payload: Record<string, unknown>
): PaypalPaymentStatus {
  const units = Array.isArray(payload.purchase_units)
    ? (payload.purchase_units as Array<Record<string, unknown>>)
    : [];
  const captures = units.flatMap(unit => {
    const payments = unit.payments as Record<string, unknown> | undefined;
    return Array.isArray(payments?.captures)
      ? (payments.captures as Array<Record<string, unknown>>)
      : [];
  });
  const captureStatuses = captures.map(capture =>
    normalizedStatus(capture.status)
  );
  if (
    captureStatuses.includes("COMPLETED") ||
    normalizedStatus(payload.status) === "COMPLETED"
  )
    return "COMPLETED";
  if (
    captureStatuses.includes("PENDING") ||
    normalizedStatus(payload.status) === "PENDING"
  )
    return "PENDING";
  if (
    captureStatuses.includes("VOIDED") ||
    normalizedStatus(payload.status) === "VOIDED"
  )
    return "VOIDED";
  if (
    captureStatuses.includes("DENIED") ||
    captureStatuses.includes("DECLINED") ||
    normalizedStatus(payload.status) === "DENIED" ||
    normalizedStatus(payload.status) === "DECLINED"
  )
    return "DENIED";
  if (
    captureStatuses.includes("FAILED") ||
    normalizedStatus(payload.status) === "FAILED"
  )
    return "FAILED";
  const status = normalizedStatus(payload.status);
  if (status === "APPROVED") return "APPROVED";
  if (status === "CREATED") return "CREATED";
  return "UNKNOWN";
}

function amountCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(`${whole}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function completedCapture(
  payload: Record<string, unknown>,
  expected: { amountCents: number; reference: string; paypalOrderId?: string }
): { captureId: string } | null {
  if (
    expected.paypalOrderId &&
    (typeof payload.id !== "string" ||
      !payload.id ||
      payload.id !== expected.paypalOrderId)
  )
    return null;
  if (normalizedStatus(payload.status) !== "COMPLETED") return null;
  const units = Array.isArray(payload.purchase_units)
    ? (payload.purchase_units as Array<Record<string, unknown>>)
    : [];
  if (units.length !== 1) return null;
  const matchingUnit = units[0];
  const references = [matchingUnit.reference_id, matchingUnit.custom_id].filter(
    value => value !== undefined && value !== null
  );
  if (
    !references.length ||
    references.some(value => value !== expected.reference)
  )
    return null;
  // Orders GET supplies the unit total and is validated before capture.
  // Capture POST can omit that total; if supplied it must also match.
  if (matchingUnit.amount !== undefined) {
    const unitAmount = matchingUnit.amount as Record<string, unknown> | null;
    if (
      unitAmount?.currency_code !== "USD" ||
      amountCents(unitAmount?.value) !== expected.amountCents
    )
      return null;
  }
  const payments = matchingUnit.payments as Record<string, unknown> | undefined;
  const captures = Array.isArray(payments?.captures)
    ? (payments.captures as Array<Record<string, unknown>>)
    : [];
  const capture = captures.find(item => item.status === "COMPLETED");
  if (!capture || typeof capture.id !== "string") return null;
  const captureId = capture.id.trim();
  if (!captureId || captureId !== capture.id) return null;
  const amount = capture.amount as Record<string, unknown> | undefined;
  if (amount?.currency_code !== "USD") return null;
  const cents = amountCents(amount?.value);
  if (cents === null || cents !== expected.amountCents) return null;
  return { captureId };
}

export function recoveryStatus(
  payload: Record<string, unknown>
): "completed" | "pending" | "retryable" | "unknown" {
  const status = paypalPaymentStatus(payload);
  if (status === "COMPLETED") return "completed";
  if (status === "PENDING") return "pending";
  if (status === "VOIDED" || status === "DENIED" || status === "FAILED")
    return "retryable";
  return "unknown";
}
