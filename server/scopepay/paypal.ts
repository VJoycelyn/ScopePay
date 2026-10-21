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
    if (!response.ok) throw new Error("PAYPAL_PROVIDER_REJECTED");
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message === "PAYPAL_PROVIDER_REJECTED")
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
    if (error instanceof Error && error.message === "PAYPAL_PROVIDER_REJECTED")
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
}): Promise<string> {
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
      application_context: {
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  if (typeof body.id !== "string" || !body.id)
    throw new Error("PAYPAL_PROVIDER_REJECTED");
  return body.id;
}

export function captureRequestId(localOrderId: string): string {
  return crypto
    .createHash("sha256")
    .update(`scopepay:capture:${localOrderId}`, "utf8")
    .digest("hex")
    .slice(0, 38);
}

export async function capturePaypalOrder(
  paypalOrderId: string,
  localOrderId: string
): Promise<Record<string, unknown>> {
  const token = await accessToken();
  return paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        ...authHeaders(token, captureRequestId(localOrderId)),
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
    typeof payload.id === "string" &&
    payload.id !== expected.paypalOrderId
  )
    return null;
  if (normalizedStatus(payload.status) !== "COMPLETED") return null;
  const units = Array.isArray(payload.purchase_units)
    ? (payload.purchase_units as Array<Record<string, unknown>>)
    : [];
  const matchingUnit = units.find(
    unit =>
      unit.reference_id === expected.reference ||
      unit.custom_id === expected.reference
  );
  if (!matchingUnit) return null;
  const payments = matchingUnit.payments as Record<string, unknown> | undefined;
  const captures = Array.isArray(payments?.captures)
    ? (payments.captures as Array<Record<string, unknown>>)
    : [];
  const capture = captures.find(item => item.status === "COMPLETED");
  if (!capture || typeof capture.id !== "string") return null;
  const amount = capture.amount as Record<string, unknown> | undefined;
  if (amount?.currency_code !== "USD") return null;
  const cents = amountCents(amount?.value);
  if (cents === null || cents !== expected.amountCents) return null;
  return { captureId: capture.id };
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
